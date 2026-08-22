import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { MetricsService } from './metrics.service';
import { ApiResponse } from '@job-scheduler/shared';

export class MetricsController {
  static async getSystemHealth(_req: Request, res: Response) {
    try {
      const report = await MetricsService.getSystemHealthReport();
      const response: ApiResponse<typeof report> = {
        success: true,
        data: report,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to retrieve system health report.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async getProjectOverview(req: AuthenticatedRequest, res: Response) {
    try {
      const organizationId = req.user?.organizationId;
      const { projectId } = req.params;

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

      const overview = await MetricsService.getProjectOverview(organizationId, projectId);
      const response: ApiResponse<typeof overview> = {
        success: true,
        data: overview,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const errorCode = (err as { code?: string })?.code;
      if (errorCode === 'CROSS_ORG_ACCESS') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied. Project belongs to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'PROJECT_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Project not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to retrieve project metrics.',
        },
      };
      return res.status(500).json(response);
    }
  }
}
