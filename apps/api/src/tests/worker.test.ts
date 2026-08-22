import request from 'supertest';
import { app } from '../app';
import { prisma } from '../db/client';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { WorkerService } from '../modules/workers/worker.service';

// Mock Prisma Client
jest.mock('../db/client', () => ({
  prisma: {
    project: {
      findUnique: jest.fn(),
    },
    worker: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    workerHeartbeat: {
      create: jest.fn(),
    },
  },
  checkDatabaseHealth: jest.fn().mockResolvedValue({ connected: true }),
}));

describe('Worker Registration & Heartbeat API (/api/v1/workers)', () => {
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
    slug: 'analytics-service',
    organizationId: orgA.id,
  };

  const mockProjectB = {
    id: 'proj-b-456',
    name: 'Foreign Project',
    slug: 'foreign-project',
    organizationId: orgB.id,
  };

  const mockWorker = {
    id: 'worker-123-uuid',
    name: 'worker-node-alpha',
    hostname: 'srv-worker-01.acme.internal',
    pid: 10425,
    status: 'ONLINE',
    currentConcurrency: 2,
    maxConcurrency: 10,
    projectId: mockProjectA.id,
    lastHeartbeatAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    project: mockProjectA,
    heartbeats: [],
    _count: { assignedJobs: 0, executions: 5 },
  };

  describe('POST /api/v1/projects/:projectId/workers', () => {
    it('should register a new worker daemon process successfully', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProjectA);
      (prisma.worker.create as jest.Mock).mockResolvedValue(mockWorker);

      const response = await request(app)
        .post(`/api/v1/projects/${mockProjectA.id}/workers`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          name: 'worker-node-alpha',
          hostname: 'srv-worker-01.acme.internal',
          pid: 10425,
          maxConcurrency: 10,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('worker-node-alpha');
      expect(response.body.data.status).toBe('ONLINE');
    });

    it('should return 400 INVALID_INPUT for missing hostname or PID', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${mockProjectA.id}/workers`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ name: 'worker-node-alpha' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('GET /api/v1/projects/:projectId/workers', () => {
    it('should list workers for a project with status filtering & pagination', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProjectA);
      (prisma.worker.findMany as jest.Mock).mockResolvedValue([mockWorker]);
      (prisma.worker.count as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .get(`/api/v1/projects/${mockProjectA.id}/workers?status=ONLINE&page=1&limit=10`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta.totalCount).toBe(1);
    });
  });

  describe('GET /api/v1/workers/:id', () => {
    it('should retrieve worker details by ID', async () => {
      (prisma.worker.findUnique as jest.Mock).mockResolvedValue(mockWorker);

      const response = await request(app)
        .get(`/api/v1/workers/${mockWorker.id}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(mockWorker.id);
    });

    it('should reject cross-organization worker access with 403 FORBIDDEN', async () => {
      const foreignWorker = { ...mockWorker, project: mockProjectB };
      (prisma.worker.findUnique as jest.Mock).mockResolvedValue(foreignWorker);

      const response = await request(app)
        .get(`/api/v1/workers/${foreignWorker.id}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/v1/workers/:id/heartbeat', () => {
    it('should update lastHeartbeatAt and persist WorkerHeartbeat telemetry log', async () => {
      (prisma.worker.findUnique as jest.Mock).mockResolvedValue(mockWorker);
      (prisma.worker.update as jest.Mock).mockResolvedValue({
        ...mockWorker,
        lastHeartbeatAt: new Date(),
        currentConcurrency: 3,
      });

      const mockHeartbeatRecord = {
        id: 'hb-123-uuid',
        workerId: mockWorker.id,
        cpuUsage: 45.2,
        memoryUsageMb: 256.8,
        activeJobs: 3,
        systemMetrics: { uptime: 3600 },
        timestamp: new Date(),
      };

      (prisma.workerHeartbeat.create as jest.Mock).mockResolvedValue(mockHeartbeatRecord);

      const response = await request(app)
        .post(`/api/v1/workers/${mockWorker.id}/heartbeat`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          cpuUsage: 45.2,
          memoryUsageMb: 256.8,
          activeJobs: 3,
          systemMetrics: { uptime: 3600 },
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.heartbeat.cpuUsage).toBe(45.2);
      expect(response.body.data.heartbeat.activeJobs).toBe(3);
    });
  });

  describe('PATCH /api/v1/workers/:id/status', () => {
    it('should update worker status to DRAINING for graceful shutdown', async () => {
      (prisma.worker.findUnique as jest.Mock).mockResolvedValue(mockWorker);
      (prisma.worker.update as jest.Mock).mockResolvedValue({
        ...mockWorker,
        status: 'DRAINING',
      });

      const response = await request(app)
        .patch(`/api/v1/workers/${mockWorker.id}/status`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ status: 'DRAINING' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('DRAINING');
    });
  });

  describe('Stale Worker Detection Service', () => {
    it('should detect stale workers and update status to DEAD', async () => {
      (prisma.worker.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

      const deadCount = await WorkerService.detectStaleWorkers(60000);

      expect(deadCount).toBe(2);
      expect(prisma.worker.updateMany).toHaveBeenCalledWith({
        where: {
          status: { in: ['ONLINE', 'BUSY'] },
          lastHeartbeatAt: { lt: expect.any(Date) },
        },
        data: { status: 'DEAD' },
      });
    });
  });
});
