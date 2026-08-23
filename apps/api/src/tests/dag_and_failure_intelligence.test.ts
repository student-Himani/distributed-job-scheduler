import request from 'supertest';
import { app } from '../app';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { JobService } from '../modules/jobs/job.service';
import { prisma } from '../db/client';

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
      updateMany: jest.fn(),
    },
    jobDependency: {
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
    rateLimitRecord: {
      upsert: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ count: 1 }),
    },
    jobExecution: {
      findMany: jest.fn(),
    },
    deadLetterQueueEntry: {
      deleteMany: jest.fn(),
    },
    jobLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(prisma)),
  },
  checkDatabaseHealth: jest.fn().mockResolvedValue({ connected: true }),
}));

describe('Job Dependency Workflows (DAG) & Failure Intelligence API', () => {
  const orgId = 'org-dag-123';
  const projectId = 'proj-dag-123';
  const queueId = 'queue-dag-123';
  const token = jwt.sign(
    { userId: 'user-dag-123', email: 'dag@example.com', role: 'ADMIN', organizationId: orgId },
    env.JWT_SECRET
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.jobDependency.findMany as jest.Mock).mockResolvedValue([]);
  });

  describe('Cycle Detection & Dependency Validation', () => {
    it('should validate single valid dependency', async () => {
      (prisma.job.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'job-parent-a', status: 'COMPLETED' },
      ]);

      await expect(
        JobService.validateDependenciesAndCycles(projectId, 'job-child-b', ['job-parent-a'])
      ).resolves.not.toThrow();
    });

    it('should validate multiple valid dependencies', async () => {
      (prisma.job.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'job-parent-a', status: 'COMPLETED' },
        { id: 'job-parent-b', status: 'COMPLETED' },
      ]);
      (prisma.jobDependency.findMany as jest.Mock).mockResolvedValue([]);

      await expect(
        JobService.validateDependenciesAndCycles(projectId, 'job-child-c', ['job-parent-a', 'job-parent-b'])
      ).resolves.not.toThrow();
    });

    it('should reject self-dependency (A -> A)', async () => {
      (prisma.job.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'job-a', status: 'QUEUED' },
      ]);

      await expect(
        JobService.validateDependenciesAndCycles(projectId, 'job-a', ['job-a'])
      ).rejects.toThrow('A job cannot depend on itself.');
    });

    it('should reject 2-node cycle (A -> B -> A)', async () => {
      (prisma.job.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'job-b', status: 'QUEUED' },
      ]);
      // job-b depends on job-a
      (prisma.jobDependency.findMany as jest.Mock).mockImplementation(({ where }: { where: { jobId: string } }) => {
        if (where.jobId === 'job-b') {
          return Promise.resolve([{ dependsOnJobId: 'job-a' }]);
        }
        return Promise.resolve([]);
      });

      await expect(
        JobService.validateDependenciesAndCycles(projectId, 'job-a', ['job-b'])
      ).rejects.toThrow('Circular dependency detected');
    });

    it('should reject 3-node cycle (A -> B -> C -> A)', async () => {
      (prisma.job.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'job-c', status: 'QUEUED' },
      ]);
      // job-c depends on job-b, job-b depends on job-a
      (prisma.jobDependency.findMany as jest.Mock).mockImplementation(({ where }: { where: { jobId: string } }) => {
        if (where.jobId === 'job-c') {
          return Promise.resolve([{ dependsOnJobId: 'job-b' }]);
        }
        if (where.jobId === 'job-b') {
          return Promise.resolve([{ dependsOnJobId: 'job-a' }]);
        }
        return Promise.resolve([]);
      });

      await expect(
        JobService.validateDependenciesAndCycles(projectId, 'job-a', ['job-c'])
      ).rejects.toThrow('Circular dependency detected');
    });
  });

  describe('BLOCKED State & Job Creation', () => {
    it('should set job status to BLOCKED if parent is not COMPLETED', async () => {
      (prisma.queue.findUnique as jest.Mock).mockResolvedValue({ id: queueId, projectId, isPaused: false, project: { id: projectId, organizationId: orgId } });
      (prisma.job.findMany as jest.Mock)
        .mockResolvedValueOnce([{ id: 'job-parent', status: 'RUNNING' }]) // validateDependenciesAndCycles
        .mockResolvedValueOnce([{ status: 'RUNNING' }]); // parent status check

      (prisma.job.create as jest.Mock).mockResolvedValue({
        id: 'job-child',
        name: 'Child Task',
        status: 'BLOCKED',
        projectId,
        queueId,
        queue: { id: queueId, name: 'default', priority: 'DEFAULT', isPaused: false },
        project: { id: projectId, name: 'Proj', slug: 'proj', organizationId: orgId },
      });
      (prisma.jobDependency.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      const job = await JobService.create(orgId, projectId, queueId, 'user-123', {
        name: 'Child Task',
        type: 'IMMEDIATE',
        priority: 0,
        payload: {},
        maxRetries: 3,
        dependsOnJobIds: ['job-parent'],
      });

      expect(job.status).toBe('BLOCKED');
    });
  });

  describe('DAG Graph API', () => {
    it('should return job DAG node relationships', async () => {
      (prisma.job.findUnique as jest.Mock).mockResolvedValue({
        id: 'job-center',
        name: 'Center Job',
        status: 'RUNNING',
        type: 'IMMEDIATE',
        project: { organizationId: orgId },
        dependencies: [{ dependsOnJob: { id: 'parent-1', name: 'Parent 1', status: 'COMPLETED', type: 'IMMEDIATE' } }],
        dependents: [{ job: { id: 'child-1', name: 'Child 1', status: 'BLOCKED', type: 'IMMEDIATE' } }],
      });

      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/jobs/job-center/dag`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.parents).toHaveLength(1);
      expect(res.body.data.children).toHaveLength(1);
    });
  });
});
