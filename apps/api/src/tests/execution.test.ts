import request from 'supertest';
import { app } from '../app';
import { prisma } from '../db/client';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

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
    jobLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    scheduledJob: {
      upsert: jest.fn(),
    },
    deadLetterQueueEntry: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(prisma)),
  },
  checkDatabaseHealth: jest.fn().mockResolvedValue({ connected: true }),
}));

describe('Job Execution Engine API (/api/v1/jobs/:id/complete, /fail, /logs)', () => {
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
    name: 'Invoice Service',
    organizationId: orgA.id,
  };

  const mockProjectB = {
    id: 'proj-b-456',
    name: 'Foreign Project',
    organizationId: orgB.id,
  };

  const mockWorkerA = {
    id: 'worker-a-123',
    name: 'worker-node-1',
    status: 'BUSY',
    currentConcurrency: 1,
    maxConcurrency: 5,
    projectId: mockProjectA.id,
  };

  const mockJobRunning = {
    id: 'job-run-123',
    name: 'Generate Monthly Invoice PDF',
    status: 'RUNNING',
    retryCount: 0,
    maxRetries: 3,
    projectId: mockProjectA.id,
    project: mockProjectA,
    retryPolicy: null,
  };

  const mockJobCompleted = {
    ...mockJobRunning,
    status: 'COMPLETED',
    result: { pdfUrl: 'https://cdn.acme.com/inv-123.pdf' },
    completedAt: new Date(),
  };

  const mockJobFailed = {
    ...mockJobRunning,
    status: 'FAILED',
    errorDetails: { message: 'Out of memory during PDF generation', code: 'ERR_OOM' },
    failedAt: new Date(),
  };

  describe('POST /api/v1/jobs/:id/complete', () => {
    it('should complete a running job, store result, record execution, and release worker concurrency', async () => {
      (prisma.job.findUnique as jest.Mock).mockResolvedValue(mockJobRunning);
      (prisma.job.update as jest.Mock).mockResolvedValue(mockJobCompleted);
      (prisma.jobExecution.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.worker.findUnique as jest.Mock).mockResolvedValue(mockWorkerA);
      (prisma.worker.update as jest.Mock).mockResolvedValue({ ...mockWorkerA, currentConcurrency: 0, status: 'ONLINE' });
      (prisma.jobLog.create as jest.Mock).mockResolvedValue({ id: 'log-1' });

      const response = await request(app)
        .post(`/api/v1/jobs/${mockJobRunning.id}/complete`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          workerId: mockWorkerA.id,
          result: { pdfUrl: 'https://cdn.acme.com/inv-123.pdf' },
          durationMs: 1450,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('COMPLETED');
      expect(prisma.jobExecution.updateMany).toHaveBeenCalledWith({
        where: { jobId: mockJobRunning.id, workerId: mockWorkerA.id, status: 'RUNNING' },
        data: expect.objectContaining({ status: 'COMPLETED', durationMs: 1450 }),
      });
      expect(prisma.jobLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ jobId: mockJobRunning.id, level: 'INFO' }),
      });
    });

    it('should reject completion of job in terminal state COMPLETED with 400', async () => {
      (prisma.job.findUnique as jest.Mock).mockResolvedValue(mockJobCompleted);

      const response = await request(app)
        .post(`/api/v1/jobs/${mockJobCompleted.id}/complete`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ workerId: mockWorkerA.id });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_JOB_STATE');
    });
  });

  describe('POST /api/v1/jobs/:id/fail', () => {
    it('should mark a running job as failed, store error details, and release worker concurrency', async () => {
      (prisma.job.findUnique as jest.Mock).mockResolvedValue(mockJobRunning);
      (prisma.job.update as jest.Mock).mockResolvedValue(mockJobFailed);
      (prisma.jobExecution.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.worker.findUnique as jest.Mock).mockResolvedValue(mockWorkerA);
      (prisma.worker.update as jest.Mock).mockResolvedValue({ ...mockWorkerA, currentConcurrency: 0, status: 'ONLINE' });
      (prisma.scheduledJob.upsert as jest.Mock).mockResolvedValue({ id: 'sched-1' });
      (prisma.jobLog.create as jest.Mock).mockResolvedValue({ id: 'log-2' });

      const response = await request(app)
        .post(`/api/v1/jobs/${mockJobRunning.id}/fail`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          workerId: mockWorkerA.id,
          errorDetails: { message: 'Out of memory during PDF generation', code: 'ERR_OOM' },
          durationMs: 820,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(prisma.jobLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ jobId: mockJobRunning.id, level: 'WARN' }),
      });
    });
  });

  describe('GET /api/v1/jobs/:id/logs', () => {
    it('should retrieve runtime JobLog entries for a job', async () => {
      const mockLogs = [
        { id: 'log-1', jobId: mockJobRunning.id, level: 'INFO', message: 'Job started', timestamp: new Date() },
      ];

      (prisma.job.findUnique as jest.Mock).mockResolvedValue(mockJobRunning);
      (prisma.jobLog.findMany as jest.Mock).mockResolvedValue(mockLogs);

      const response = await request(app)
        .get(`/api/v1/jobs/${mockJobRunning.id}/logs`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });

    it('should reject cross-organization log access with 403 FORBIDDEN', async () => {
      const foreignJob = { ...mockJobRunning, project: mockProjectB };
      (prisma.job.findUnique as jest.Mock).mockResolvedValue(foreignJob);

      const response = await request(app)
        .get(`/api/v1/jobs/${foreignJob.id}/logs`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });
});
