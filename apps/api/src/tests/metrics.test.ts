import request from 'supertest';
import { app } from '../app';
import { prisma, checkDatabaseHealth } from '../db/client';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

// Mock Prisma Client & Health check
jest.mock('../db/client', () => ({
  prisma: {
    project: {
      findUnique: jest.fn(),
    },
    job: {
      count: jest.fn(),
    },
    queue: {
      count: jest.fn(),
    },
    worker: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    deadLetterQueueEntry: {
      count: jest.fn(),
    },
    jobExecution: {
      aggregate: jest.fn(),
    },
  },
  checkDatabaseHealth: jest.fn().mockResolvedValue({ connected: true }),
}));

describe('Monitoring & Observability Metrics API (/api/v1/metrics)', () => {
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
    name: 'Analytics Service',
    organizationId: orgA.id,
  };

  const mockProjectB = {
    id: 'proj-b-456',
    name: 'Foreign Project',
    organizationId: orgB.id,
  };

  describe('GET /api/v1/metrics/health', () => {
    it('should return system health report with 200 status', async () => {
      (prisma.worker.count as jest.Mock).mockResolvedValue(2);
      (prisma.deadLetterQueueEntry.count as jest.Mock).mockResolvedValue(0);

      const response = await request(app).get('/api/v1/metrics/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
      expect(response.body.data.database.connected).toBe(true);
    });
  });

  describe('GET /api/v1/projects/:projectId/metrics/overview', () => {
    it('should return aggregated project metrics for jobs, queues, workers, and DLQ', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProjectA);
      (prisma.job.count as jest.Mock).mockImplementation(({ where }: { where: { status: string } }) => {
        if (where.status === 'QUEUED') return Promise.resolve(5);
        if (where.status === 'RUNNING') return Promise.resolve(2);
        if (where.status === 'COMPLETED') return Promise.resolve(100);
        if (where.status === 'FAILED') return Promise.resolve(5);
        return Promise.resolve(0);
      });
      (prisma.queue.count as jest.Mock).mockImplementation(({ where }: { where: { isPaused?: boolean } }) => {
        if (where.isPaused) return Promise.resolve(1);
        return Promise.resolve(3); // total
      });
      (prisma.worker.findMany as jest.Mock).mockResolvedValue([
        { id: 'w1', status: 'ONLINE', maxConcurrency: 5, currentConcurrency: 0 },
        { id: 'w2', status: 'BUSY', maxConcurrency: 5, currentConcurrency: 2 },
      ]);
      (prisma.deadLetterQueueEntry.count as jest.Mock).mockResolvedValue(1);
      (prisma.jobExecution.aggregate as jest.Mock).mockResolvedValue({
        _avg: { durationMs: 450 },
        _count: { id: 105 },
      });

      const response = await request(app)
        .get(`/api/v1/projects/${mockProjectA.id}/metrics/overview`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.jobs.queued).toBe(5);
      expect(response.body.data.jobs.completed).toBe(100);
      expect(response.body.data.queues.total).toBe(3);
      expect(response.body.data.workers.totalCapacity).toBe(10);
      expect(response.body.data.workers.currentActiveConcurrency).toBe(2);
      expect(response.body.data.dlq.pending).toBe(1);
      expect(response.body.data.executionMetrics.avgDurationMs).toBe(450);
    });

    it('should reject unauthenticated request with 401 UNAUTHORIZED', async () => {
      const response = await request(app).get(`/api/v1/projects/${mockProjectA.id}/metrics/overview`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject cross-organization metrics request with 403 FORBIDDEN', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProjectB);

      const response = await request(app)
        .get(`/api/v1/projects/${mockProjectB.id}/metrics/overview`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });
});
