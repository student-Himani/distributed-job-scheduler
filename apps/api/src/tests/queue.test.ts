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
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
  checkDatabaseHealth: jest.fn().mockResolvedValue({ connected: true }),
}));

describe('Queue Management API (/api/v1/projects/:projectId/queues, /api/v1/queues)', () => {
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
    name: 'Payment Processing',
    slug: 'payment-processing',
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
    name: 'high-priority-webhooks',
    description: 'Processes Stripe webhooks',
    priority: 'HIGH',
    concurrencyLimit: 25,
    isPaused: false,
    projectId: mockProjectA.id,
    retryPolicyId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    project: mockProjectA,
    _count: { jobs: 5 },
  };

  describe('POST /api/v1/projects/:projectId/queues', () => {
    it('should create a queue successfully under a project', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProjectA);
      (prisma.queue.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.queue.create as jest.Mock).mockResolvedValue(mockQueue);

      const response = await request(app)
        .post(`/api/v1/projects/${mockProjectA.id}/queues`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          name: 'high-priority-webhooks',
          priority: 'HIGH',
          concurrencyLimit: 25,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('high-priority-webhooks');
      expect(response.body.data.priority).toBe('HIGH');
    });

    it('should return 409 DUPLICATE_QUEUE when creating a queue with an existing name in project', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProjectA);
      (prisma.queue.findUnique as jest.Mock).mockResolvedValue(mockQueue);

      const response = await request(app)
        .post(`/api/v1/projects/${mockProjectA.id}/queues`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          name: 'high-priority-webhooks',
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('DUPLICATE_QUEUE');
    });

    it('should return 400 INVALID_INPUT for negative or excessive concurrency limit', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${mockProjectA.id}/queues`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          name: 'invalid-queue',
          concurrencyLimit: 500,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('GET /api/v1/projects/:projectId/queues', () => {
    it('should list queues for a project with pagination', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProjectA);
      (prisma.queue.findMany as jest.Mock).mockResolvedValue([mockQueue]);
      (prisma.queue.count as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .get(`/api/v1/projects/${mockProjectA.id}/queues?page=1&limit=10`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta.totalCount).toBe(1);
    });
  });

  describe('GET /api/v1/queues/:id', () => {
    it('should retrieve queue details for authorized user', async () => {
      (prisma.queue.findUnique as jest.Mock).mockResolvedValue(mockQueue);

      const response = await request(app)
        .get(`/api/v1/queues/${mockQueue.id}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(mockQueue.id);
    });

    it('should reject cross-organization queue access with 403 FORBIDDEN', async () => {
      const foreignQueue = { ...mockQueue, project: mockProjectB };
      (prisma.queue.findUnique as jest.Mock).mockResolvedValue(foreignQueue);

      const response = await request(app)
        .get(`/api/v1/queues/${foreignQueue.id}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('PATCH /api/v1/queues/:id', () => {
    it('should update queue priority and concurrency limit', async () => {
      (prisma.queue.findUnique as jest.Mock).mockResolvedValue(mockQueue);
      (prisma.queue.update as jest.Mock).mockResolvedValue({
        ...mockQueue,
        priority: 'CRITICAL',
        concurrencyLimit: 50,
      });

      const response = await request(app)
        .patch(`/api/v1/queues/${mockQueue.id}`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          priority: 'CRITICAL',
          concurrencyLimit: 50,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.priority).toBe('CRITICAL');
      expect(response.body.data.concurrencyLimit).toBe(50);
    });
  });

  describe('POST /api/v1/queues/:id/pause and /resume', () => {
    it('should pause a queue successfully', async () => {
      (prisma.queue.findUnique as jest.Mock).mockResolvedValue(mockQueue);
      (prisma.queue.update as jest.Mock).mockResolvedValue({
        ...mockQueue,
        isPaused: true,
      });

      const response = await request(app)
        .post(`/api/v1/queues/${mockQueue.id}/pause`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isPaused).toBe(true);
    });

    it('should resume a queue successfully', async () => {
      (prisma.queue.findUnique as jest.Mock).mockResolvedValue({ ...mockQueue, isPaused: true });
      (prisma.queue.update as jest.Mock).mockResolvedValue({
        ...mockQueue,
        isPaused: false,
      });

      const response = await request(app)
        .post(`/api/v1/queues/${mockQueue.id}/resume`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isPaused).toBe(false);
    });
  });

  describe('DELETE /api/v1/queues/:id', () => {
    it('should delete a queue successfully', async () => {
      (prisma.queue.findUnique as jest.Mock).mockResolvedValue(mockQueue);
      (prisma.queue.delete as jest.Mock).mockResolvedValue(mockQueue);

      const response = await request(app)
        .delete(`/api/v1/queues/${mockQueue.id}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.deleted).toBe(true);
    });
  });
});
