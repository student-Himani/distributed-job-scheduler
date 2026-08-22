import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../db/client';
import { env } from '../../config/env';
import { RegisterInput, LoginInput } from './auth.schema';
import { Logger } from '@job-scheduler/shared';

const logger = new Logger('Auth:Service');

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  organizationId: string;
}

export class AuthService {
  static async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
  }

  static verifyToken(token: string): TokenPayload {
    return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  }

  static async register(input: RegisterInput) {
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      const err = new Error('A user with this email address already exists');
      (err as unknown as { code: string }).code = 'DUPLICATE_EMAIL';
      throw err;
    }

    const passwordHash = await this.hashPassword(input.password);
    const orgName = input.organizationName || `${input.name}'s Organization`;
    const orgSlug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '-' + Date.now().toString(36);

    // Create Organization and User
    const result = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: orgName,
          slug: orgSlug,
        },
      });

      const user = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash,
          role: 'ADMIN',
          organizationId: organization.id,
        },
        include: {
          organization: {
            select: { id: true, name: true, slug: true },
          },
        },
      });

      return user;
    });

    const tokenPayload: TokenPayload = {
      userId: result.id,
      email: result.email,
      role: result.role,
      organizationId: result.organizationId,
    };

    const token = this.generateToken(tokenPayload);

    logger.info(`User registered successfully`, { userId: result.id, email: result.email });

    // Exclude passwordHash from returned payload
    const { passwordHash: _, ...safeUser } = result;

    return {
      user: safeUser,
      accessToken: token,
    };
  }

  static async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!user || !user.passwordHash) {
      const err = new Error('Invalid email or password credentials');
      (err as unknown as { code: string }).code = 'INVALID_CREDENTIALS';
      throw err;
    }

    const isMatch = await this.comparePassword(input.password, user.passwordHash);

    if (!isMatch) {
      const err = new Error('Invalid email or password credentials');
      (err as unknown as { code: string }).code = 'INVALID_CREDENTIALS';
      throw err;
    }

    const tokenPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };

    const token = this.generateToken(tokenPayload);

    logger.info(`User logged in successfully`, { userId: user.id, email: user.email });

    const { passwordHash: _, ...safeUser } = user;

    return {
      user: safeUser,
      accessToken: token,
    };
  }

  static async handleGoogleAuth(googleUser: { email: string; name: string; id?: string }) {
    let user = await prisma.user.findUnique({
      where: { email: googleUser.email },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!user) {
      const orgName = `${googleUser.name}'s Organization`;
      const orgSlug = orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') + '-' + Date.now().toString(36);

      const randomPassword = await this.hashPassword(`google-auth-${Date.now()}-${Math.random()}`);

      user = await prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: {
            name: orgName,
            slug: orgSlug,
          },
        });

        return tx.user.create({
          data: {
            email: googleUser.email,
            name: googleUser.name,
            passwordHash: randomPassword,
            role: 'ADMIN',
            organizationId: organization.id,
          },
          include: {
            organization: {
              select: { id: true, name: true, slug: true },
            },
          },
        });
      });
    }

    const tokenPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };

    const token = this.generateToken(tokenPayload);

    logger.info(`User authenticated via Google OAuth`, { userId: user.id, email: user.email });

    const { passwordHash: _, ...safeUser } = user;

    return {
      user: safeUser,
      accessToken: token,
    };
  }

  static async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: {
          select: { id: true, name: true, slug: true, createdAt: true },
        },
      },
    });

    if (!user) {
      const err = new Error('Authenticated user profile not found');
      (err as unknown as { code: string }).code = 'USER_NOT_FOUND';
      throw err;
    }

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }
}
