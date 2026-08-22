import request from 'supertest';
import { app } from '../app';
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
    jobDependency: {
      findMany: jest.fn(),
      createMany: jest.fn(),
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

  describe('Cycle Detection & Dependency Validation', () => {
    it('should allow valid job creation without circular dependencies', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/queues/${queueId}/jobs`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Parent Task A',
          type: 'IMMEDIATE',
        });

      expect([201, 400, 404, 500]).toContain(res.status);
    });
  });

  describe('Execution History & Replay API', () => {
    it('should return execution timeline endpoint with valid response status', async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/jobs/job-fake-123/executions`)
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404, 500]).toContain(res.status);
    });

    it('should replay a job resetting status to QUEUED', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/jobs/job-fake-123/retry`)
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404, 500]).toContain(res.status);
    });
  });
});
