import request from 'supertest';
import { app } from '../app';
import { prisma } from '../db/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

// Mock Prisma Client
jest.mock('../db/client', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    organization: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(prisma)),
  },
  checkDatabaseHealth: jest.fn().mockResolvedValue({ connected: true }),
}));

describe('Module 3 Authentication API (/api/v1/auth)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockOrg = {
    id: 'org-123-uuid',
    name: "Alex Dev's Organization",
    slug: 'alex-dev-s-organization',
  };

  const mockUser = {
    id: 'user-123-uuid',
    email: 'engineer@example.com',
    name: 'Alex Dev',
    role: 'ADMIN',
    organizationId: mockOrg.id,
    organization: mockOrg,
    passwordHash: '',
  };

  beforeAll(async () => {
    mockUser.passwordHash = await bcrypt.hash('Password123!', 10);
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user, create organization, and return JWT access token', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.organization.create as jest.Mock).mockResolvedValue(mockOrg);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'engineer@example.com',
          password: 'Password123!',
          name: 'Alex Dev',
          organizationName: "Alex Dev's Organization",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.user.email).toBe('engineer@example.com');
      expect(response.body.data.user.passwordHash).toBeUndefined();
    });

    it('should return 400 INVALID_INPUT for short password or missing fields', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'invalid-email',
          password: '123',
          name: 'A',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_INPUT');
      expect(response.body.error.details).toBeDefined();
    });

    it('should return 409 DUPLICATE_EMAIL when email already exists', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'engineer@example.com',
          password: 'Password123!',
          name: 'Alex Dev',
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('DUPLICATE_EMAIL');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should authenticate user with valid credentials and return JWT token', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'engineer@example.com',
          password: 'Password123!',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.user.email).toBe('engineer@example.com');
    });

    it('should return 401 INVALID_CREDENTIALS for wrong password', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'engineer@example.com',
          password: 'WrongPassword!',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('Google OAuth 2.0 Endpoints', () => {
    it('should redirect to Google OAuth authorization endpoint', async () => {
      const response = await request(app).get('/api/v1/auth/google');
      expect(response.status).toBe(302);
      expect(response.header.location).toContain('accounts.google.com');
    });

    it('should handle callback error when authorization code is missing', async () => {
      const response = await request(app).get('/api/v1/auth/google/callback');
      expect(response.status).toBe(302);
      expect(response.header.location).toContain('localhost:5173/?error=');
    });

    it('should handle callback error parameter returned from Google', async () => {
      const response = await request(app).get('/api/v1/auth/google/callback?error=access_denied');
      expect(response.status).toBe(302);
      expect(response.header.location).toContain('localhost:5173/?error=access_denied');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current authenticated user profile for valid Bearer token', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const token = jwt.sign(
        { userId: mockUser.id, email: mockUser.email, role: mockUser.role, organizationId: mockUser.organizationId },
        env.JWT_SECRET
      );

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(mockUser.id);
    });

    it('should return 401 UNAUTHORIZED when token is missing', async () => {
      const response = await request(app).get('/api/v1/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
