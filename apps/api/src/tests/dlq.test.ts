import request from 'supertest';
import { app } from '../app';
import { prisma } from '../db/client';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { RetryService } from '../modules/retries/retry.service';

// Mock Prisma Client
jest.mock('../db/client', () => ({
  prisma: {
    job: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    jobExecution: {
      updateMany: jest.fn(),
    },
    worker: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    scheduledJob: {
      upsert: jest.fn(),
    },
    jobLog: {
      create: jest.fn(),
    },
    retryPolicy: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    deadLetterQueueEntry: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(prisma)),
  },
  checkDatabaseHealth: jest.fn().mockResolvedValue({ connected: true }),
}));

describe('Retry Policies & Dead-Letter Queue (DLQ) Engine (/api/v1/dlq, /api/v1/retry-policies)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const orgA = { id: 'org-a-123', name: 'Acme Corp', slug: 'acme-corp' };
  const orgB = { id: 'org-b-456', name: 'Stark Industries', slug: 'stark-ind' };

  const tokenUserA = jwt.sign(
    { userId: 'user-a-1', email: 'user@acme.com', role: 'ADMIN', organizationId: orgA.id },
    env.JWT_SECRET
  );

  const mockProjectA = {
    id: 'proj-a-123',
    name: 'Checkout Service',
    organizationId: orgA.id,
  };

  const mockProjectB = {
    id: 'proj-b-456',
    name: 'Foreign Project',
    organizationId: orgB.id,
  };

  const mockJobA = {
    id: 'job-failing-123',
    name: 'Charge Credit Card',
    status: 'RUNNING',
    retryCount: 0,
    maxRetries: 3,
    projectId: mockProjectA.id,
    project: mockProjectA,
    retryPolicy: {
      strategy: 'EXPONENTIAL' as const,
      initialIntervalMs: 1000,
      maxIntervalMs: 3600000,
      backoffFactor: 2.0,
    },
  };

  const mockDlqEntry = {
    id: 'dlq-123-uuid',
    jobId: mockJobA.id,
    reason: 'Gateway Timeout 504',
    failedAtAttempts: 3,
    lastError: 'Gateway Timeout 504',
    errorStack: null,
    status: 'PENDING',
    reviewedById: null,
    reviewedAt: null,
    resolutionNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    job: {
      ...mockJobA,
      status: 'DEAD_LETTER',
      retryCount: 3,
      queueId: 'queue-1',
    },
  };

  describe('Backoff Calculation Logic', () => {
    it('should calculate FIXED backoff delay accurately', () => {
      const delay1 = RetryService.calculateBackoffDelay('FIXED', 1, 1000, 3600000, 2.0);
      const delay2 = RetryService.calculateBackoffDelay('FIXED', 3, 1000, 3600000, 2.0);
      expect(delay1).toBe(1000);
      expect(delay2).toBe(1000);
    });

    it('should calculate LINEAR backoff delay accurately', () => {
      const delay1 = RetryService.calculateBackoffDelay('LINEAR', 1, 1000, 3600000, 2.0);
      const delay2 = RetryService.calculateBackoffDelay('LINEAR', 3, 1000, 3600000, 2.0);
      expect(delay1).toBe(1000);
      expect(delay2).toBe(3000);
    });

    it('should calculate EXPONENTIAL backoff delay accurately with max interval cap', () => {
      const delay1 = RetryService.calculateBackoffDelay('EXPONENTIAL', 1, 1000, 3600000, 2.0);
      const delay2 = RetryService.calculateBackoffDelay('EXPONENTIAL', 3, 1000, 3600000, 2.0);
      const delayCapped = RetryService.calculateBackoffDelay('EXPONENTIAL', 10, 1000, 5000, 2.0);
      expect(delay1).toBe(1000);
      expect(delay2).toBe(4000); // 1000 * 2^(3-1) = 4000
      expect(delayCapped).toBe(5000); // Capped at maxInterval
    });
  });

  describe('Automatic Retry & DLQ Transition Logic', () => {
    it('should re-schedule job to SCHEDULED when retryCount < maxRetries', async () => {
      (prisma.job.findUnique as jest.Mock).mockResolvedValue(mockJobA);
      (prisma.jobExecution.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.worker.findUnique as jest.Mock).mockResolvedValue({ id: 'worker-1', currentConcurrency: 1, status: 'BUSY' });
      (prisma.worker.update as jest.Mock).mockResolvedValue({ id: 'worker-1', currentConcurrency: 0, status: 'ONLINE' });
      (prisma.job.update as jest.Mock).mockResolvedValue({ ...mockJobA, status: 'SCHEDULED', retryCount: 1 });
      (prisma.scheduledJob.upsert as jest.Mock).mockResolvedValue({ id: 'sched-1' });
      (prisma.jobLog.create as jest.Mock).mockResolvedValue({ id: 'log-1' });

      const response = await request(app)
        .post(`/api/v1/jobs/${mockJobA.id}/fail`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          workerId: 'worker-1',
          errorDetails: { message: 'Connection reset by peer' },
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('SCHEDULED');
      expect(prisma.job.update).toHaveBeenCalledWith({
        where: { id: mockJobA.id },
        data: expect.objectContaining({
          status: 'SCHEDULED',
          retryCount: 1,
        }),
      });
    });

    it('should transition job to DEAD_LETTER and create DeadLetterQueueEntry when retries are exhausted', async () => {
      const exhaustedJob = {
        ...mockJobA,
        retryCount: 2, // 2 failures already, 3rd failure hits maxRetries = 3
      };

      (prisma.job.findUnique as jest.Mock).mockResolvedValue(exhaustedJob);
      (prisma.jobExecution.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.worker.findUnique as jest.Mock).mockResolvedValue({ id: 'worker-1', currentConcurrency: 1, status: 'BUSY' });
      (prisma.worker.update as jest.Mock).mockResolvedValue({ id: 'worker-1', currentConcurrency: 0, status: 'ONLINE' });
      (prisma.job.update as jest.Mock).mockResolvedValue({ ...exhaustedJob, status: 'DEAD_LETTER', retryCount: 3 });
      (prisma.deadLetterQueueEntry.create as jest.Mock).mockResolvedValue(mockDlqEntry);
      (prisma.jobLog.create as jest.Mock).mockResolvedValue({ id: 'log-dlq' });

      const response = await request(app)
        .post(`/api/v1/jobs/${exhaustedJob.id}/fail`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          workerId: 'worker-1',
          errorDetails: { message: 'Fatal payment token expired' },
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('DEAD_LETTER');
      expect(prisma.deadLetterQueueEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          jobId: exhaustedJob.id,
          reason: 'Fatal payment token expired',
        }),
      });
    });
  });

  describe('DLQ Management APIs', () => {
    it('GET /api/v1/projects/:projectId/dlq - should list DLQ entries with pagination', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProjectA);
      (prisma.deadLetterQueueEntry.findMany as jest.Mock).mockResolvedValue([mockDlqEntry]);
      (prisma.deadLetterQueueEntry.count as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .get(`/api/v1/projects/${mockProjectA.id}/dlq?page=1&limit=10`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta.totalCount).toBe(1);
    });

    it('POST /api/v1/dlq/:id/retry - should re-enqueue DLQ job back to QUEUED', async () => {
      (prisma.deadLetterQueueEntry.findUnique as jest.Mock).mockResolvedValue(mockDlqEntry);
      (prisma.deadLetterQueueEntry.update as jest.Mock).mockResolvedValue({
        ...mockDlqEntry,
        status: 'RETRIED',
      });
      (prisma.job.update as jest.Mock).mockResolvedValue({
        ...mockJobA,
        status: 'QUEUED',
        retryCount: 0,
      });
      (prisma.jobLog.create as jest.Mock).mockResolvedValue({ id: 'log-retry' });

      const response = await request(app)
        .post(`/api/v1/dlq/${mockDlqEntry.id}/retry`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.job.status).toBe('QUEUED');
      expect(response.body.data.job.retryCount).toBe(0);
      expect(response.body.data.dlqEntry.status).toBe('RETRIED');
    });

    it('DELETE /api/v1/dlq/:id - should discard DLQ entry', async () => {
      (prisma.deadLetterQueueEntry.findUnique as jest.Mock).mockResolvedValue(mockDlqEntry);
      (prisma.deadLetterQueueEntry.delete as jest.Mock).mockResolvedValue(mockDlqEntry);

      const response = await request(app)
        .delete(`/api/v1/dlq/${mockDlqEntry.id}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(prisma.deadLetterQueueEntry.delete).toHaveBeenCalledWith({
        where: { id: mockDlqEntry.id },
      });
    });

    it('should reject cross-organization DLQ access with 403 FORBIDDEN', async () => {
      const foreignDlq = {
        ...mockDlqEntry,
        job: {
          ...mockDlqEntry.job,
          project: mockProjectB,
        },
      };

      (prisma.deadLetterQueueEntry.findUnique as jest.Mock).mockResolvedValue(foreignDlq);

      const response = await request(app)
        .get(`/api/v1/dlq/${foreignDlq.id}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/v1/retry-policies', () => {
    it('should create a configurable retry policy', async () => {
      const mockPolicy = {
        id: 'pol-123-uuid',
        name: 'Exponential Backoff Standard',
        strategy: 'EXPONENTIAL',
        maxRetries: 5,
        initialIntervalMs: 2000,
        maxIntervalMs: 7200000,
        backoffFactor: 2.0,
      };

      (prisma.retryPolicy.create as jest.Mock).mockResolvedValue(mockPolicy);

      const response = await request(app)
        .post('/api/v1/retry-policies')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          name: 'Exponential Backoff Standard',
          strategy: 'EXPONENTIAL',
          maxRetries: 5,
          initialIntervalMs: 2000,
          maxIntervalMs: 7200000,
          backoffFactor: 2.0,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Exponential Backoff Standard');
    });
  });
});
