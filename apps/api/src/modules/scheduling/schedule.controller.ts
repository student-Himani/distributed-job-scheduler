import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { createScheduleSchema, queryScheduleSchema } from './schedule.schema';
import { ScheduleService } from './schedule.service';
import { ApiResponse } from '@job-scheduler/shared';

export class ScheduleController {
  static async create(req: AuthenticatedRequest, res: Response) {
    const parseResult = createScheduleSchema.safeParse(req.body);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for schedule creation.',
          details: parseResult.error.flatten().fieldErrors,
        },
      };
      return res.status(400).json(response);
    }

    try {
      const organizationId = req.user?.organizationId;
      const createdById = req.user?.userId;
      const { projectId, queueId } = req.params;

      if (!organizationId || !createdById) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication context is missing.',
          },
        };
        return res.status(401).json(response);
      }

      const result = await ScheduleService.createSchedule(organizationId, projectId, queueId, createdById, parseResult.data);
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
      };
      return res.status(201).json(response);
    } catch (err: unknown) {
      const errorCode = (err as { code?: string })?.code;
      if (errorCode === 'CROSS_ORG_ACCESS') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied. Queue or Project belongs to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'QUEUE_NOT_FOUND' || errorCode === 'PROJECT_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: err instanceof Error ? err.message : 'Target queue or project not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to create recurring schedule.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async list(req: AuthenticatedRequest, res: Response) {
    const parseResult = queryScheduleSchema.safeParse(req.query);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for schedule query parameters.',
          details: parseResult.error.flatten().fieldErrors,
        },
      };
      return res.status(400).json(response);
    }

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

      const result = await ScheduleService.listByProject(organizationId, projectId, parseResult.data);
      const response: ApiResponse<typeof result.schedules> = {
        success: true,
        data: result.schedules,
        meta: {
          timestamp: new Date().toISOString(),
          ...result.pagination,
        },
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

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to list recurring schedules.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async getById(req: AuthenticatedRequest, res: Response) {
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

      const schedule = await ScheduleService.getById(organizationId, id);
      const response: ApiResponse<typeof schedule> = {
        success: true,
        data: schedule,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const errorCode = (err as { code?: string })?.code;
      if (errorCode === 'CROSS_ORG_ACCESS') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied. Schedule belongs to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'SCHEDULE_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'SCHEDULE_NOT_FOUND',
            message: 'Recurring schedule not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to retrieve recurring schedule details.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async pause(req: AuthenticatedRequest, res: Response) {
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

      const updated = await ScheduleService.pauseSchedule(organizationId, id);
      const response: ApiResponse<typeof updated> = {
        success: true,
        data: updated,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const errorCode = (err as { code?: string })?.code;
      if (errorCode === 'CROSS_ORG_ACCESS') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied. Cannot pause schedule belonging to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'SCHEDULE_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'SCHEDULE_NOT_FOUND',
            message: 'Recurring schedule not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to pause recurring schedule.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async resume(req: AuthenticatedRequest, res: Response) {
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

      const updated = await ScheduleService.resumeSchedule(organizationId, id);
      const response: ApiResponse<typeof updated> = {
        success: true,
        data: updated,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const errorCode = (err as { code?: string })?.code;
      if (errorCode === 'CROSS_ORG_ACCESS') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied. Cannot resume schedule belonging to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'SCHEDULE_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'SCHEDULE_NOT_FOUND',
            message: 'Recurring schedule not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to resume recurring schedule.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async delete(req: AuthenticatedRequest, res: Response) {
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

      const result = await ScheduleService.deleteSchedule(organizationId, id);
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
            message: 'Access denied. Cannot delete schedule belonging to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'SCHEDULE_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'SCHEDULE_NOT_FOUND',
            message: 'Recurring schedule not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to delete recurring schedule.',
        },
      };
      return res.status(500).json(response);
    }
  }
}
