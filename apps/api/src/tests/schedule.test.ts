import request from 'supertest';
import { app } from '../app';
import { prisma } from '../db/client';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { CronUtils } from '../modules/scheduling/cron.utils';

// Mock Prisma Client
jest.mock('../db/client', () => ({
  prisma: {
    queue: {
      findUnique: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
    },
    job: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    scheduledJob: {
      create: jest.fn(),
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
    },
    $transaction: jest.fn((callback) => callback(prisma)),
  },
  checkDatabaseHealth: jest.fn().mockResolvedValue({ connected: true }),
}));

describe('Scheduling & Recurring Jobs Engine (/api/v1/schedules)', () => {
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
    name: 'Report Service',
    organizationId: orgA.id,
  };

  const mockProjectB = {
    id: 'proj-b-456',
    name: 'Foreign Project',
    organizationId: orgB.id,
  };

  const mockQueue = {
    id: 'queue-cron-123',
    name: 'nightly-reports',
    projectId: mockProjectA.id,
    project: mockProjectA,
    retryPolicyId: null,
  };

  const mockRecurringJob = {
    id: 'job-rec-123',
    name: 'Nightly Database Backup',
    type: 'RECURRING',
    status: 'SCHEDULED',
    priority: 0,
    projectId: mockProjectA.id,
    queueId: mockQueue.id,
    scheduledAt: new Date(Date.now() + 3600000),
    project: mockProjectA,
    queue: mockQueue,
    scheduledJob: {
      id: 'sched-rec-123',
      jobId: 'job-rec-123',
      cronExpression: '0 0 * * *',
      timezone: 'UTC',
      nextRunAt: new Date(Date.now() + 3600000),
      lastRunAt: null,
      isRecurring: true,
      totalRuns: 0,
    },
  };

  describe('Cron Utils & Next Run Time Evaluation', () => {
    it('should validate 5-field cron expressions correctly', () => {
      expect(CronUtils.isValidCron('*/5 * * * *')).toBe(true);
      expect(CronUtils.isValidCron('0 0 * * *')).toBe(true);
      expect(CronUtils.isValidCron('invalid cron')).toBe(false);
      expect(CronUtils.isValidCron('0 0 * *')).toBe(false);
    });

    it('should calculate nextRunAt in future correctly', () => {
      const now = new Date();
      const nextRun = CronUtils.getNextRunAt('*/5 * * * *', now, 'UTC');
      expect(nextRun.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe('POST /api/v1/projects/:projectId/queues/:queueId/schedules', () => {
    it('should create a recurring schedule with valid cron expression', async () => {
      (prisma.queue.findUnique as jest.Mock).mockResolvedValue(mockQueue);
      (prisma.job.create as jest.Mock).mockResolvedValue(mockRecurringJob);
      (prisma.scheduledJob.create as jest.Mock).mockResolvedValue(mockRecurringJob.scheduledJob);
      (prisma.jobLog.create as jest.Mock).mockResolvedValue({ id: 'log-1' });

      const response = await request(app)
        .post(`/api/v1/projects/${mockProjectA.id}/queues/${mockQueue.id}/schedules`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          name: 'Nightly Database Backup',
          cronExpression: '0 0 * * *',
          timezone: 'UTC',
          priority: 0,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.job.type).toBe('RECURRING');
      expect(response.body.data.scheduledJob.cronExpression).toBe('0 0 * * *');
    });

    it('should return 400 INVALID_INPUT for bad cron expression', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${mockProjectA.id}/queues/${mockQueue.id}/schedules`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          name: 'Nightly Backup',
          cronExpression: 'not a cron',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('Automatic Recurring Job Re-generation on Completion', () => {
    it('should automatically re-schedule recurring job for next run cycle when completed', async () => {
      (prisma.job.findUnique as jest.Mock).mockResolvedValue(mockRecurringJob);
      (prisma.job.update as jest.Mock).mockResolvedValue({ ...mockRecurringJob, status: 'SCHEDULED' });
      (prisma.jobExecution.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.worker.findUnique as jest.Mock).mockResolvedValue({ id: 'worker-1', currentConcurrency: 1, status: 'BUSY' });
      (prisma.worker.update as jest.Mock).mockResolvedValue({ id: 'worker-1', currentConcurrency: 0, status: 'ONLINE' });
      (prisma.scheduledJob.update as jest.Mock).mockResolvedValue({ ...mockRecurringJob.scheduledJob, totalRuns: 1 });
      (prisma.jobLog.create as jest.Mock).mockResolvedValue({ id: 'log-rec-resched' });

      const response = await request(app)
        .post(`/api/v1/jobs/${mockRecurringJob.id}/complete`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          workerId: 'worker-1',
          result: { backupSizeMb: 1024 },
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(prisma.scheduledJob.update).toHaveBeenCalledWith({
        where: { jobId: mockRecurringJob.id },
        data: expect.objectContaining({
          totalRuns: { increment: 1 },
          nextRunAt: expect.any(Date),
        }),
      });
    });
  });

  describe('Direct Schedule Management APIs', () => {
    it('GET /api/v1/projects/:projectId/schedules - should list recurring schedules for project', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProjectA);
      (prisma.job.findMany as jest.Mock).mockResolvedValue([mockRecurringJob]);
      (prisma.job.count as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .get(`/api/v1/projects/${mockProjectA.id}/schedules?page=1&limit=10`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });

    it('POST /api/v1/schedules/:id/pause - should pause recurring schedule', async () => {
      (prisma.job.findUnique as jest.Mock).mockResolvedValue(mockRecurringJob);
      (prisma.job.update as jest.Mock).mockResolvedValue({ ...mockRecurringJob, status: 'CANCELLED' });

      const response = await request(app)
        .post(`/api/v1/schedules/${mockRecurringJob.id}/pause`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('CANCELLED');
    });

    it('POST /api/v1/schedules/:id/resume - should resume recurring schedule and update nextRunAt', async () => {
      const pausedJob = { ...mockRecurringJob, status: 'CANCELLED' };
      (prisma.job.findUnique as jest.Mock).mockResolvedValue(pausedJob);
      (prisma.job.update as jest.Mock).mockResolvedValue({ ...mockRecurringJob, status: 'SCHEDULED' });
      (prisma.scheduledJob.update as jest.Mock).mockResolvedValue({ ...mockRecurringJob.scheduledJob });

      const response = await request(app)
        .post(`/api/v1/schedules/${pausedJob.id}/resume`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('SCHEDULED');
    });

    it('DELETE /api/v1/schedules/:id - should delete recurring schedule', async () => {
      (prisma.job.findUnique as jest.Mock).mockResolvedValue(mockRecurringJob);
      (prisma.job.delete as jest.Mock).mockResolvedValue(mockRecurringJob);

      const response = await request(app)
        .delete(`/api/v1/schedules/${mockRecurringJob.id}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(prisma.job.delete).toHaveBeenCalledWith({ where: { id: mockRecurringJob.id } });
    });

    it('should reject cross-organization schedule access with 403 FORBIDDEN', async () => {
      const foreignSchedule = { ...mockRecurringJob, project: mockProjectB };
      (prisma.job.findUnique as jest.Mock).mockResolvedValue(foreignSchedule);

      const response = await request(app)
        .get(`/api/v1/schedules/${foreignSchedule.id}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });
});
