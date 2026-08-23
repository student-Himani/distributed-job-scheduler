import request from 'supertest';
import { app } from '../app';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { RateLimiterService } from '../modules/rate-limiting/rate-limiter.service';
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
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    rateLimitRecord: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    jobLog: {
      create: jest.fn(),
    },
  },
  checkDatabaseHealth: jest.fn().mockResolvedValue({ connected: true }),
}));

describe('Rate Limiting Subsystem Tests', () => {
  const orgId = 'org-rl-123';
  const projectId = 'proj-rl-123';
  const queueId = 'queue-rl-123';
  const token = jwt.sign(
    { userId: 'user-rl-123', email: 'rl@example.com', role: 'ADMIN', organizationId: orgId },
    env.JWT_SECRET
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('RateLimiterService Core Logic', () => {
    it('should allow requests under the specified limit', async () => {
      (prisma.rateLimitRecord.upsert as jest.Mock).mockResolvedValueOnce({
        id: 'rl-1',
        key: 'queue:queue-rl-123',
        count: 5,
        windowStart: new Date(),
      });

      const res = await RateLimiterService.checkAndIncrement('queue:queue-rl-123', 60);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(55);
      expect(res.currentUsage).toBe(5);
    });

    it('should disallow requests when usage exceeds limit', async () => {
      (prisma.rateLimitRecord.upsert as jest.Mock).mockResolvedValueOnce({
        id: 'rl-2',
        key: 'queue:queue-rl-123',
        count: 61,
        windowStart: new Date(),
      });

      const res = await RateLimiterService.checkAndIncrement('queue:queue-rl-123', 60);
      expect(res.allowed).toBe(false);
      expect(res.remaining).toBe(0);
      expect(res.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe('Rate Limiting Express Middleware & HTTP 429 Response', () => {
    it('should return 429 Too Many Requests when queue rate limit is exceeded', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({ id: projectId, rateLimitRpm: 120 });
      (prisma.queue.findUnique as jest.Mock).mockResolvedValue({ id: queueId, rateLimitRpm: 5 });

      // First call (project level check) returns 1 count, second call (queue level check) returns 6 count (exceeded limit 5)
      (prisma.rateLimitRecord.upsert as jest.Mock)
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 6 });

      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/queues/${queueId}/jobs`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Rate Limited Task',
          type: 'IMMEDIATE',
        });

      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(res.headers['retry-after']).toBeDefined();
      expect(res.headers['x-ratelimit-limit']).toBe('5');
    });

    it('should return rate limit status endpoint data', async () => {
      (prisma.queue.findUnique as jest.Mock).mockResolvedValue({
        id: queueId,
        rateLimitRpm: 60,
        project: { organizationId: orgId },
      });
      (prisma.rateLimitRecord.findUnique as jest.Mock).mockResolvedValue({
        count: 12,
      });

      const res = await request(app)
        .get(`/api/v1/queues/${queueId}/rate-limit`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currentUsage).toBe(12);
      expect(res.body.data.remaining).toBe(48);
    });
  });
});
