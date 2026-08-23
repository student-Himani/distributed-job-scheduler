import { prisma } from '../../db/client';
import { Logger } from '@job-scheduler/shared';

const logger = new Logger('RateLimiter:Service');

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  currentUsage: number;
  remaining: number;
  retryAfterSeconds: number;
  windowStart: Date;
}

export class RateLimiterService {
  /**
   * Atomic PostgreSQL sliding/fixed window rate-limit check and increment.
   */
  static async checkAndIncrement(
    key: string,
    limit: number,
    windowSeconds: number = 60
  ): Promise<RateLimitResult> {
    const now = new Date();
    const windowMs = windowSeconds * 1000;
    const currentWindowStartMs = Math.floor(now.getTime() / windowMs) * windowMs;
    const windowStart = new Date(currentWindowStartMs);

    let count = 1;
    try {
      if (prisma && prisma.rateLimitRecord && typeof prisma.rateLimitRecord.upsert === 'function') {
        const record = await prisma.rateLimitRecord.upsert({
          where: {
            key_windowStart: {
              key,
              windowStart,
            },
          },
          update: {
            count: { increment: 1 },
          },
          create: {
            key,
            windowStart,
            count: 1,
          },
        });

        count = record.count;
      }
    } catch (err) {
      logger.warn(`Rate limit record upsert warning for key [${key}]`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const remaining = Math.max(0, limit - count);
    const allowed = count <= limit;
    const resetTimeMs = currentWindowStartMs + windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetTimeMs - now.getTime()) / 1000));

    if (!allowed) {
      logger.warn(`Rate limit exceeded for key [${key}]: ${count}/${limit} RPM (retry in ${retryAfterSeconds}s)`);
    }

    return {
      allowed,
      limit,
      currentUsage: count,
      remaining,
      retryAfterSeconds,
      windowStart,
    };
  }

  /**
   * Get current rate limit usage without incrementing counter.
   */
  static async getStatus(
    key: string,
    limit: number,
    windowSeconds: number = 60
  ): Promise<RateLimitResult> {
    const now = new Date();
    const windowMs = windowSeconds * 1000;
    const currentWindowStartMs = Math.floor(now.getTime() / windowMs) * windowMs;
    const windowStart = new Date(currentWindowStartMs);

    const record =
      prisma && prisma.rateLimitRecord && typeof prisma.rateLimitRecord.findUnique === 'function'
        ? await prisma.rateLimitRecord.findUnique({
            where: {
              key_windowStart: {
                key,
                windowStart,
              },
            },
          })
        : null;

    const count = record ? record.count : 0;
    const remaining = Math.max(0, limit - count);
    const allowed = count <= limit;
    const resetTimeMs = currentWindowStartMs + windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetTimeMs - now.getTime()) / 1000));

    return {
      allowed,
      limit,
      currentUsage: count,
      remaining,
      retryAfterSeconds,
      windowStart,
    };
  }
}
