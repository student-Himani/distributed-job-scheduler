import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { registerWorkerSchema, updateWorkerStatusSchema, recordHeartbeatSchema, queryWorkerSchema } from './worker.schema';
import { WorkerService } from './worker.service';
import { ApiResponse } from '@job-scheduler/shared';

export class WorkerController {
  static async register(req: AuthenticatedRequest, res: Response) {
    const parseResult = registerWorkerSchema.safeParse(req.body);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for worker registration.',
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

      const worker = await WorkerService.register(organizationId, projectId, parseResult.data);
      const response: ApiResponse<typeof worker> = {
        success: true,
        data: worker,
      };
      return res.status(201).json(response);
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
          message: err instanceof Error ? err.message : 'Failed to register worker.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async list(req: AuthenticatedRequest, res: Response) {
    const parseResult = queryWorkerSchema.safeParse(req.query);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for worker query parameters.',
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

      const result = await WorkerService.list(organizationId, projectId, parseResult.data);
      const response: ApiResponse<typeof result.workers> = {
        success: true,
        data: result.workers,
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
          message: err instanceof Error ? err.message : 'Failed to list workers.',
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

      const worker = await WorkerService.getById(organizationId, id);
      const response: ApiResponse<typeof worker> = {
        success: true,
        data: worker,
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
          message: err instanceof Error ? err.message : 'Failed to retrieve worker details.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async heartbeat(req: AuthenticatedRequest, res: Response) {
    const parseResult = recordHeartbeatSchema.safeParse(req.body);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for heartbeat payload.',
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

      const result = await WorkerService.recordHeartbeat(organizationId, id, parseResult.data);
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
            message: 'Access denied. Cannot submit heartbeat for worker in another organization.',
          },
        };
        return res.status(403).json(response);
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
          message: err instanceof Error ? err.message : 'Failed to process worker heartbeat.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async updateStatus(req: AuthenticatedRequest, res: Response) {
    const parseResult = updateWorkerStatusSchema.safeParse(req.body);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for status update payload.',
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

      const updated = await WorkerService.updateStatus(organizationId, id, parseResult.data);
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
            message: 'Access denied. Cannot update status for worker in another organization.',
          },
        };
        return res.status(403).json(response);
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
          message: err instanceof Error ? err.message : 'Failed to update worker status.',
        },
      };
      return res.status(500).json(response);
    }
  }
}
