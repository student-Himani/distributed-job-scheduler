import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { completeJobSchema, failJobSchema } from './execution.schema';
import { ExecutionService } from './execution.service';
import { ApiResponse } from '@job-scheduler/shared';

export class ExecutionController {
  static async complete(req: AuthenticatedRequest, res: Response) {
    const parseResult = completeJobSchema.safeParse(req.body);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for complete job payload.',
          details: parseResult.error.flatten().fieldErrors,
        },
      };
      return res.status(400).json(response);
    }

    try {
      const organizationId = req.user?.organizationId;
      const { id } = req.params;

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

      const completedJob = await ExecutionService.completeJob(organizationId, id, parseResult.data);
      const response: ApiResponse<typeof completedJob> = {
        success: true,
        data: completedJob,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const errorCode = (err as { code?: string })?.code;

      if (errorCode === 'CROSS_ORG_ACCESS') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied. Job belongs to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'INVALID_JOB_STATE') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_JOB_STATE',
            message: err instanceof Error ? err.message : 'Cannot complete job in current state.',
          },
        };
        return res.status(400).json(response);
      }

      if (errorCode === 'JOB_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Job not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to record job completion.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async fail(req: AuthenticatedRequest, res: Response) {
    const parseResult = failJobSchema.safeParse(req.body);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for fail job payload.',
          details: parseResult.error.flatten().fieldErrors,
        },
      };
      return res.status(400).json(response);
    }

    try {
      const organizationId = req.user?.organizationId;
      const { id } = req.params;

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

      const failedJob = await ExecutionService.failJob(organizationId, id, parseResult.data);
      const response: ApiResponse<typeof failedJob> = {
        success: true,
        data: failedJob,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const errorCode = (err as { code?: string })?.code;

      if (errorCode === 'CROSS_ORG_ACCESS') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied. Job belongs to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'INVALID_JOB_STATE') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_JOB_STATE',
            message: err instanceof Error ? err.message : 'Cannot fail job in current state.',
          },
        };
        return res.status(400).json(response);
      }

      if (errorCode === 'JOB_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Job not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to record job failure.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async getLogs(req: AuthenticatedRequest, res: Response) {
    try {
      const organizationId = req.user?.organizationId;
      const { id } = req.params;

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

      const logs = await ExecutionService.getLogs(organizationId, id);
      const response: ApiResponse<typeof logs> = {
        success: true,
        data: logs,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const errorCode = (err as { code?: string })?.code;

      if (errorCode === 'CROSS_ORG_ACCESS') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied. Job belongs to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'JOB_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Job not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to retrieve job logs.',
        },
      };
      return res.status(500).json(response);
    }
  }
}
