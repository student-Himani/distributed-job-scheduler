import request from 'supertest';
import { app } from '../app';
import { prisma } from '../db/client';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

// Mock Prisma Client
jest.mock('../db/client', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    organization: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(prisma)),
  },
  checkDatabaseHealth: jest.fn().mockResolvedValue({ connected: true }),
}));

describe('Organization API Endpoints (/api/v1/organizations)', () => {
  const mockUserId = 'user-123-uuid';
  const mockOrgId = 'org-123-uuid';

  const token = jwt.sign(
    { userId: mockUserId, email: 'admin@example.com', role: 'ADMIN', organizationId: mockOrgId },
    env.JWT_SECRET
  );

  const mockOrg = {
    id: mockOrgId,
    name: 'Stark Enterprise',
    slug: 'stark-enterprise-123',
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/organizations', () => {
    it('should create a new organization, associate it with user, and return 201 Created', async () => {
      (prisma.organization.create as jest.Mock).mockResolvedValue(mockOrg);
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: mockUserId, organizationId: mockOrgId });

      const response = await request(app)
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Stark Enterprise',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Stark Enterprise');
      expect(prisma.organization.create).toHaveBeenCalled();
    });

    it('should return 400 INVALID_INPUT if organization name is missing or too short', async () => {
      const response = await request(app)
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'A',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('GET /api/v1/organizations', () => {
    it('should return list of all organizations for authenticated user', async () => {
      (prisma.organization.findMany as jest.Mock).mockResolvedValue([mockOrg]);

      const response = await request(app)
        .get('/api/v1/organizations')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(1);
    });
  });
});
