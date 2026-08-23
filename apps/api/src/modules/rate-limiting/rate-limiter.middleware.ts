import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { RateLimiterService } from './rate-limiter.service';
import { prisma } from '../../db/client';
import { ApiResponse } from '@job-scheduler/shared';

export interface RateLimitMiddlewareOptions {
  level: 'project' | 'queue' | 'api';
  defaultLimitRpm?: number;
}

export const rateLimiterMiddleware = (options: RateLimitMiddlewareOptions) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { projectId, queueId } = req.params;
      let limit = options.defaultLimitRpm || 60;
      let key = `api:${req.ip || 'global'}`;

      if (options.level === 'queue' && queueId) {
        key = `queue:${queueId}`;
        const queue = await prisma.queue.findUnique({
          where: { id: queueId },
          select: { rateLimitRpm: true },
        });
        if (queue && queue.rateLimitRpm) {
          limit = queue.rateLimitRpm;
        }
      } else if (options.level === 'project' && projectId) {
        key = `project:${projectId}`;
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: { rateLimitRpm: true },
        });
        if (project && project.rateLimitRpm) {
          limit = project.rateLimitRpm;
        }
      }

      const result = await RateLimiterService.checkAndIncrement(key, limit);

      res.setHeader('X-RateLimit-Limit', result.limit.toString());
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader('X-RateLimit-Reset', result.retryAfterSeconds.toString());

      if (!result.allowed) {
        res.setHeader('Retry-After', result.retryAfterSeconds.toString());
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Limit exceeded. Retry available in ${result.retryAfterSeconds} seconds.`,
            details: {
              limit: result.limit,
              currentUsage: result.currentUsage,
              remaining: 0,
              retryAfterSeconds: result.retryAfterSeconds,
            },
          },
        };
        return res.status(429).json(response);
      }

      next();
    } catch (err) {
      next();
    }
  };
};
