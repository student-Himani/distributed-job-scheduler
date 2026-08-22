import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { createQueueSchema, updateQueueSchema, queryQueueSchema } from './queue.schema';
import { QueueService } from './queue.service';
import { ApiResponse } from '@job-scheduler/shared';

export class QueueController {
  static async create(req: AuthenticatedRequest, res: Response) {
    const parseResult = createQueueSchema.safeParse(req.body);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for queue creation.',
          details: parseResult.error.flatten().fieldErrors,
        },
      };
      return res.status(400).json(response);
    }

    try {
      const organizationId = req.user?.organizationId;
      const projectId = req.params.projectId;

      if (!organizationId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User organization context is missing.',
          },
        };
        return res.status(401).json(response);
      }

      const queue = await QueueService.create(organizationId, projectId, parseResult.data);
      const response: ApiResponse<typeof queue> = {
        success: true,
        data: queue,
      };
      return res.status(201).json(response);
    } catch (err: unknown) {
      const errorCode = (err as { code?: string })?.code;
      if (errorCode === 'DUPLICATE_QUEUE') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'DUPLICATE_QUEUE',
            message: err instanceof Error ? err.message : 'A queue with this name already exists in this project.',
          },
        };
        return res.status(409).json(response);
      }

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
            code: 'PROJECT_NOT_FOUND',
            message: 'Target project was not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to create queue.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async list(req: AuthenticatedRequest, res: Response) {
    const parseResult = queryQueueSchema.safeParse(req.query);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for queue list queries.',
          details: parseResult.error.flatten().fieldErrors,
        },
      };
      return res.status(400).json(response);
    }

    try {
      const organizationId = req.user?.organizationId;
      const projectId = req.params.projectId;

      if (!organizationId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User organization context is missing.',
          },
        };
        return res.status(401).json(response);
      }

      const result = await QueueService.list(organizationId, projectId, parseResult.data);
      const response: ApiResponse<typeof result.queues> = {
        success: true,
        data: result.queues,
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

      if (errorCode === 'PROJECT_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: 'Project not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to list queues.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async getById(req: AuthenticatedRequest, res: Response) {
    try {
      const organizationId = req.user?.organizationId;
      const queueId = req.params.id;

      if (!organizationId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User organization context is missing.',
          },
        };
        return res.status(401).json(response);
      }

      const queue = await QueueService.getById(organizationId, queueId);
      const response: ApiResponse<typeof queue> = {
        success: true,
        data: queue,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const errorCode = (err as { code?: string })?.code;
      if (errorCode === 'CROSS_ORG_ACCESS') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied. Queue belongs to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'QUEUE_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'QUEUE_NOT_FOUND',
            message: 'Queue not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to retrieve queue details.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async update(req: AuthenticatedRequest, res: Response) {
    const parseResult = updateQueueSchema.safeParse(req.body);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for queue update payload.',
          details: parseResult.error.flatten().fieldErrors,
        },
      };
      return res.status(400).json(response);
    }

    try {
      const organizationId = req.user?.organizationId;
      const queueId = req.params.id;

      if (!organizationId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User organization context is missing.',
          },
        };
        return res.status(401).json(response);
      }

      const updated = await QueueService.update(organizationId, queueId, parseResult.data);
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
            message: 'Access denied. Cannot update queue belonging to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'QUEUE_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'QUEUE_NOT_FOUND',
            message: 'Queue not found for update.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to update queue.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async delete(req: AuthenticatedRequest, res: Response) {
    try {
      const organizationId = req.user?.organizationId;
      const queueId = req.params.id;

      if (!organizationId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User organization context is missing.',
          },
        };
        return res.status(401).json(response);
      }

      const result = await QueueService.delete(organizationId, queueId);
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
            message: 'Access denied. Cannot delete queue belonging to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'QUEUE_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'QUEUE_NOT_FOUND',
            message: 'Queue not found for deletion.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to delete queue.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async pause(req: AuthenticatedRequest, res: Response) {
    try {
      const organizationId = req.user?.organizationId;
      const queueId = req.params.id;

      if (!organizationId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User organization context is missing.',
          },
        };
        return res.status(401).json(response);
      }

      const updated = await QueueService.setPaused(organizationId, queueId, true);
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
            message: 'Access denied. Cannot pause queue belonging to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'QUEUE_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'QUEUE_NOT_FOUND',
            message: 'Queue not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to pause queue.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async resume(req: AuthenticatedRequest, res: Response) {
    try {
      const organizationId = req.user?.organizationId;
      const queueId = req.params.id;

      if (!organizationId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User organization context is missing.',
          },
        };
        return res.status(401).json(response);
      }

      const updated = await QueueService.setPaused(organizationId, queueId, false);
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
            message: 'Access denied. Cannot resume queue belonging to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'QUEUE_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'QUEUE_NOT_FOUND',
            message: 'Queue not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to resume queue.',
        },
      };
      return res.status(500).json(response);
    }
  }
}
