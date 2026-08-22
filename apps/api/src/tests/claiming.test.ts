import request from 'supertest';
import { app } from '../app';
import { prisma } from '../db/client';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

// Mock Prisma Client
jest.mock('../db/client', () => ({
  prisma: {
    worker: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    queue: {
      findMany: jest.fn(),
    },
    job: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    jobExecution: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(prisma)),
  },
  checkDatabaseHealth: jest.fn().mockResolvedValue({ connected: true }),
}));

describe('Atomic Job Claiming & Concurrency Engine API (/api/v1/workers/:id/claim)', () => {
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
    name: 'Payment Service',
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
    status: 'ONLINE',
    currentConcurrency: 0,
    maxConcurrency: 5,
    projectId: mockProjectA.id,
    project: mockProjectA,
  };

  const mockQueueCritical = {
    id: 'queue-critical-id',
    name: 'critical-billing',
    priority: 'CRITICAL',
    concurrencyLimit: 10,
    isPaused: false,
    projectId: mockProjectA.id,
  };

  const mockQueueDefault = {
    id: 'queue-default-id',
    name: 'default-reports',
    priority: 'DEFAULT',
    concurrencyLimit: 10,
    isPaused: false,
    projectId: mockProjectA.id,
  };

  const mockJob = {
    id: 'job-critical-123',
    name: 'Process Urgent Billing',
    status: 'QUEUED',
    priority: 10,
    projectId: mockProjectA.id,
    queueId: mockQueueCritical.id,
    scheduledAt: null,
    createdAt: new Date(),
    queue: mockQueueCritical,
    project: mockProjectA,
  };

  describe('POST /api/v1/workers/:id/claim', () => {
    it('should claim an eligible job atomically', async () => {
      (prisma.worker.findUnique as jest.Mock).mockResolvedValue(mockWorkerA);
      (prisma.queue.findMany as jest.Mock).mockResolvedValue([mockQueueCritical]);
      (prisma.job.count as jest.Mock).mockResolvedValue(0); // 0 active jobs in queue
      (prisma.job.findMany as jest.Mock).mockResolvedValue([mockJob]);
      (prisma.job.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.worker.update as jest.Mock).mockResolvedValue({ ...mockWorkerA, currentConcurrency: 1 });
      (prisma.jobExecution.create as jest.Mock).mockResolvedValue({ id: 'exec-1' });
      (prisma.job.findUnique as jest.Mock).mockResolvedValue({
        ...mockJob,
        status: 'CLAIMED',
        assignedWorkerId: mockWorkerA.id,
      });

      const response = await request(app)
        .post(`/api/v1/workers/${mockWorkerA.id}/claim`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.claimed).toBe(true);
      expect(response.body.data.job.id).toBe(mockJob.id);
      expect(prisma.job.updateMany).toHaveBeenCalledWith({
        where: {
          id: mockJob.id,
          status: { in: ['QUEUED', 'SCHEDULED'] },
        },
        data: expect.objectContaining({
          status: 'CLAIMED',
          assignedWorkerId: mockWorkerA.id,
        }),
      });
    });

    it('should prioritize CRITICAL queues over DEFAULT queues', async () => {
      const mockJobDefault = {
        id: 'job-default-456',
        name: 'Generate Weekly CSV',
        status: 'QUEUED',
        priority: 10,
        projectId: mockProjectA.id,
        queueId: mockQueueDefault.id,
        scheduledAt: null,
        createdAt: new Date(Date.now() - 10000), // created earlier
        queue: mockQueueDefault,
      };

      (prisma.worker.findUnique as jest.Mock).mockResolvedValue(mockWorkerA);
      (prisma.queue.findMany as jest.Mock).mockResolvedValue([mockQueueDefault, mockQueueCritical]);
      (prisma.job.count as jest.Mock).mockResolvedValue(0);
      (prisma.job.findMany as jest.Mock).mockResolvedValue([mockJobDefault, mockJob]);
      (prisma.job.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.jobExecution.create as jest.Mock).mockResolvedValue({ id: 'exec-1' });
      (prisma.job.findUnique as jest.Mock).mockResolvedValue({
        ...mockJob, // CRITICAL job
        status: 'CLAIMED',
      });

      const response = await request(app)
        .post(`/api/v1/workers/${mockWorkerA.id}/claim`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(prisma.job.updateMany).toHaveBeenNthCalledWith(1, {
        where: {
          id: mockJob.id,
          status: { in: ['QUEUED', 'SCHEDULED'] },
        },
        data: expect.anything(),
      });
    });

    it('should return 400 WORKER_FULL if worker is at maxConcurrency', async () => {
      const fullWorker = { ...mockWorkerA, currentConcurrency: 5, maxConcurrency: 5 };
      (prisma.worker.findUnique as jest.Mock).mockResolvedValue(fullWorker);

      const response = await request(app)
        .post(`/api/v1/workers/${fullWorker.id}/claim`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('WORKER_FULL');
    });

    it('should return 400 WORKER_INELIGIBLE if worker is in DRAINING or DEAD state', async () => {
      const drainingWorker = { ...mockWorkerA, status: 'DRAINING' };
      (prisma.worker.findUnique as jest.Mock).mockResolvedValue(drainingWorker);

      const response = await request(app)
        .post(`/api/v1/workers/${drainingWorker.id}/claim`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('WORKER_INELIGIBLE');
    });

    it('should skip queues that have reached concurrencyLimit', async () => {
      (prisma.worker.findUnique as jest.Mock).mockResolvedValue(mockWorkerA);
      (prisma.queue.findMany as jest.Mock).mockResolvedValue([mockQueueCritical]);
      (prisma.job.count as jest.Mock).mockResolvedValue(10);

      const response = await request(app)
        .post(`/api/v1/workers/${mockWorkerA.id}/claim`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.claimed).toBe(false);
      expect(response.body.data.message).toContain('concurrency limits');
    });

    it('should return claimed: false when no eligible jobs exist', async () => {
      (prisma.worker.findUnique as jest.Mock).mockResolvedValue(mockWorkerA);
      (prisma.queue.findMany as jest.Mock).mockResolvedValue([mockQueueCritical]);
      (prisma.job.count as jest.Mock).mockResolvedValue(0);
      (prisma.job.findMany as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .post(`/api/v1/workers/${mockWorkerA.id}/claim`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.claimed).toBe(false);
      expect(response.body.data.job).toBeNull();
    });

    it('should reject cross-organization claim requests with 403 FORBIDDEN', async () => {
      const foreignWorker = { ...mockWorkerA, project: mockProjectB };
      (prisma.worker.findUnique as jest.Mock).mockResolvedValue(foreignWorker);

      const response = await request(app)
        .post(`/api/v1/workers/${foreignWorker.id}/claim`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });
});
