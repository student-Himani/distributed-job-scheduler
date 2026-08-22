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
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
  checkDatabaseHealth: jest.fn().mockResolvedValue({ connected: true }),
}));

describe('Organization & Project Management API (/api/v1/projects, /api/v1/organizations)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const orgA = { id: 'org-a-123', name: 'Acme Corp', slug: 'acme-corp' };
  const orgB = { id: 'org-b-456', name: 'Stark Industries', slug: 'stark-ind' };

  const tokenUserA = jwt.sign(
    { userId: 'user-a-1', email: 'user@acme.com', role: 'ADMIN', organizationId: orgA.id },
    env.JWT_SECRET
  );

  const mockProject = {
    id: 'proj-123-uuid',
    name: 'Payment Gateway Async Jobs',
    slug: 'payment-gateway-async-jobs',
    description: 'Processes credit card webhooks asynchronously',
    apiKey: 'proj-api-key-123',
    organizationId: orgA.id,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { queues: 2, jobs: 10, workers: 3 },
  };

  describe('POST /api/v1/projects', () => {
    it('should create a new project under the authenticated user organization', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.project.create as jest.Mock).mockResolvedValue(mockProject);

      const response = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          name: 'Payment Gateway Async Jobs',
          description: 'Processes credit card webhooks asynchronously',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Payment Gateway Async Jobs');
      expect(response.body.data.organizationId).toBe(orgA.id);
    });

    it('should return 400 INVALID_INPUT for short project name', async () => {
      const response = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ name: 'A' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });

    it('should return 401 UNAUTHORIZED when no token is provided', async () => {
      const response = await request(app).post('/api/v1/projects').send({
        name: 'Payment Gateway Async Jobs',
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/v1/projects', () => {
    it('should list projects belonging to user organization with pagination metadata', async () => {
      (prisma.project.findMany as jest.Mock).mockResolvedValue([mockProject]);
      (prisma.project.count as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .get('/api/v1/projects?page=1&limit=10')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta.page).toBe(1);
      expect(response.body.meta.totalCount).toBe(1);
    });
  });

  describe('GET /api/v1/projects/:id', () => {
    it('should retrieve project details for organization owner', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProject);

      const response = await request(app)
        .get(`/api/v1/projects/${mockProject.id}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(mockProject.id);
    });

    it('should reject cross-organization access with 403 FORBIDDEN', async () => {
      // Project belongs to Org B, but User A belongs to Org A
      const foreignProject = { ...mockProject, organizationId: orgB.id };
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(foreignProject);

      const response = await request(app)
        .get(`/api/v1/projects/${foreignProject.id}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('PATCH /api/v1/projects/:id', () => {
    it('should update project successfully', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProject);
      (prisma.project.update as jest.Mock).mockResolvedValue({
        ...mockProject,
        name: 'Updated Payment Service',
      });

      const response = await request(app)
        .patch(`/api/v1/projects/${mockProject.id}`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ name: 'Updated Payment Service' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Payment Service');
    });
  });

  describe('DELETE /api/v1/projects/:id', () => {
    it('should delete project successfully', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProject);
      (prisma.project.delete as jest.Mock).mockResolvedValue(mockProject);

      const response = await request(app)
        .delete(`/api/v1/projects/${mockProject.id}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.deleted).toBe(true);
    });
  });
});
