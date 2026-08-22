import request from 'supertest';
import { app } from '../app';
import { prisma } from '../db/client';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

// Mock Prisma Client
jest.mock('../db/client', () => ({
  prisma: {
    project: {
      findUnique: jest.fn(),
    },
    queue: {
      findUnique: jest.fn(),
    },
    job: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    scheduledJob: {
      create: jest.fn(),
    },
  },
  checkDatabaseHealth: jest.fn().mockResolvedValue({ connected: true }),
}));

describe('Job Management & Job Lifecycle API (/api/v1/jobs)', () => {
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
    name: 'Order Service',
    slug: 'order-service',
    organizationId: orgA.id,
  };

  const mockProjectB = {
    id: 'proj-b-456',
    name: 'Foreign Project',
    slug: 'foreign-project',
    organizationId: orgB.id,
  };

  const mockQueue = {
    id: 'queue-123-uuid',
    name: 'order-processing',
    priority: 'HIGH',
    isPaused: false,
    projectId: mockProjectA.id,
    retryPolicyId: null,
    project: mockProjectA,
  };

  const mockImmediateJob = {
    id: 'job-111-uuid',
    name: 'Process Receipt PDF',
    type: 'IMMEDIATE',
    status: 'QUEUED',
    priority: 5,
    payload: { orderId: 'ord-999', amount: 150.0 },
    result: null,
    errorDetails: null,
    maxRetries: 3,
    scheduledAt: null,
    projectId: mockProjectA.id,
    queueId: mockQueue.id,
    createdById: 'user-a-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    queue: mockQueue,
    project: mockProjectA,
    assignedWorker: null,
    scheduledJob: null,
    executions: [],
    dlqEntry: null,
  };

  const mockDelayedJob = {
    ...mockImmediateJob,
    id: 'job-222-uuid',
    name: 'Send Follow-up Email',
    type: 'DELAYED',
    status: 'SCHEDULED',
    scheduledAt: new Date(Date.now() + 3600 * 1000),
  };

  describe('POST /api/v1/projects/:projectId/queues/:queueId/jobs', () => {
    it('should create an immediate job successfully (status QUEUED)', async () => {
      (prisma.queue.findUnique as jest.Mock).mockResolvedValue(mockQueue);
      (prisma.job.create as jest.Mock).mockResolvedValue(mockImmediateJob);

      const response = await request(app)
        .post(`/api/v1/projects/${mockProjectA.id}/queues/${mockQueue.id}/jobs`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          name: 'Process Receipt PDF',
          type: 'IMMEDIATE',
          priority: 5,
          payload: { orderId: 'ord-999', amount: 150.0 },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Process Receipt PDF');
      expect(response.body.data.status).toBe('QUEUED');
    });

    it('should create a delayed job with delaySeconds (status SCHEDULED)', async () => {
      (prisma.queue.findUnique as jest.Mock).mockResolvedValue(mockQueue);
      (prisma.job.create as jest.Mock).mockResolvedValue(mockDelayedJob);
      (prisma.scheduledJob.create as jest.Mock).mockResolvedValue({ id: 'sched-123' });

      const response = await request(app)
        .post(`/api/v1/projects/${mockProjectA.id}/queues/${mockQueue.id}/jobs`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          name: 'Send Follow-up Email',
          type: 'DELAYED',
          delaySeconds: 3600,
          payload: { email: 'customer@example.com' },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.type).toBe('DELAYED');
      expect(response.body.data.status).toBe('SCHEDULED');
    });

    it('should return 400 INVALID_INPUT for short job name', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${mockProjectA.id}/queues/${mockQueue.id}/jobs`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ name: 'A' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('GET /api/v1/jobs/:id', () => {
    it('should retrieve job details by ID', async () => {
      (prisma.job.findUnique as jest.Mock).mockResolvedValue(mockImmediateJob);

      const response = await request(app)
        .get(`/api/v1/jobs/${mockImmediateJob.id}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(mockImmediateJob.id);
    });

    it('should reject cross-organization job access with 403 FORBIDDEN', async () => {
      const foreignJob = {
        ...mockImmediateJob,
        project: mockProjectB,
      };

      (prisma.job.findUnique as jest.Mock).mockResolvedValue(foreignJob);

      const response = await request(app)
        .get(`/api/v1/jobs/${foreignJob.id}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/v1/projects/:projectId/jobs', () => {
    it('should list jobs for a project with status filtering & pagination', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProjectA);
      (prisma.job.findMany as jest.Mock).mockResolvedValue([mockImmediateJob]);
      (prisma.job.count as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .get(`/api/v1/projects/${mockProjectA.id}/jobs?status=QUEUED&page=1&limit=10`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta.totalCount).toBe(1);
    });
  });

  describe('POST /api/v1/jobs/:id/cancel', () => {
    it('should cancel a QUEUED job successfully', async () => {
      (prisma.job.findUnique as jest.Mock).mockResolvedValue(mockImmediateJob);
      (prisma.job.update as jest.Mock).mockResolvedValue({
        ...mockImmediateJob,
        status: 'CANCELLED',
      });

      const response = await request(app)
        .post(`/api/v1/jobs/${mockImmediateJob.id}/cancel`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('CANCELLED');
    });
  });
});
