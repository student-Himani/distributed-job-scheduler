import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { releaseClaimSchema } from './claiming.schema';
import { ClaimingService } from './claiming.service';
import { ApiResponse } from '@job-scheduler/shared';

export class ClaimingController {
  static async claim(req: AuthenticatedRequest, res: Response) {
    try {
      const organizationId = req.user?.organizationId;
      const workerId = req.params.id;

      if (!organizationId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication context is missing.',
          },
        };
        return res.status(401).json(response);
      }

      const result = await ClaimingService.claimNextJob(organizationId, workerId);
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const errorCode = (err as { code?: string })?.code;

      if (errorCode === 'CROSS_ORG_ACCESS') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied. Worker belongs to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'WORKER_INELIGIBLE' || errorCode === 'WORKER_FULL') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: errorCode,
            message: err instanceof Error ? err.message : 'Worker cannot claim jobs in current state.',
          },
        };
        return res.status(400).json(response);
      }

      if (errorCode === 'WORKER_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'WORKER_NOT_FOUND',
            message: 'Worker not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to claim job.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async release(req: AuthenticatedRequest, res: Response) {
    const parseResult = releaseClaimSchema.safeParse(req.body);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for release claim payload.',
          details: parseResult.error.flatten().fieldErrors,
        },
      };
      return res.status(400).json(response);
    }

    try {
      const organizationId = req.user?.organizationId;
      const workerId = req.params.id;

      if (!organizationId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication context is missing.',
          },
        };
        return res.status(401).json(response);
      }

      const updatedWorker = await ClaimingService.releaseClaim(organizationId, workerId, parseResult.data.jobId);
      const response: ApiResponse<typeof updatedWorker> = {
        success: true,
        data: updatedWorker,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const errorCode = (err as { code?: string })?.code;
      if (errorCode === 'CROSS_ORG_ACCESS') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied. Worker belongs to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to release claim.',
        },
      };
      return res.status(500).json(response);
    }
  }
}
