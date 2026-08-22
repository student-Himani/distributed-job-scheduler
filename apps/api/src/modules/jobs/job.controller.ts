import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { createJobSchema, queryJobSchema } from './job.schema';
import { JobService } from './job.service';
import { ApiResponse } from '@job-scheduler/shared';

export class JobController {
  static async create(req: AuthenticatedRequest, res: Response) {
    const parseResult = createJobSchema.safeParse(req.body);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for job creation.',
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

      const job = await JobService.create(organizationId, projectId, queueId, createdById, parseResult.data);
      const response: ApiResponse<typeof job> = {
        success: true,
        data: job,
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

      if (errorCode === 'CIRCULAR_DEPENDENCY' || errorCode === 'INVALID_DEPENDENCY') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: errorCode,
            message: err instanceof Error ? err.message : 'Invalid job dependency configuration.',
          },
        };
        return res.status(400).json(response);
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
          message: err instanceof Error ? err.message : 'Failed to create job.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async listByProject(req: AuthenticatedRequest, res: Response) {
    const parseResult = queryJobSchema.safeParse(req.query);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for job query parameters.',
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

      const result = await JobService.listByProject(organizationId, projectId, parseResult.data);
      const response: ApiResponse<typeof result.jobs> = {
        success: true,
        data: result.jobs,
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
          message: err instanceof Error ? err.message : 'Failed to list project jobs.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async listByQueue(req: AuthenticatedRequest, res: Response) {
    const parseResult = queryJobSchema.safeParse(req.query);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for queue job query parameters.',
          details: parseResult.error.flatten().fieldErrors,
        },
      };
      return res.status(400).json(response);
    }

    try {
      const organizationId = req.user?.organizationId;
      const { queueId } = req.params;

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

      const result = await JobService.listByQueue(organizationId, queueId, parseResult.data);
      const response: ApiResponse<typeof result.jobs> = {
        success: true,
        data: result.jobs,
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
            message: 'Access denied. Queue belongs to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to list queue jobs.',
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

      const job = await JobService.getById(organizationId, id);
      const response: ApiResponse<typeof job> = {
        success: true,
        data: job,
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
            message: 'Requested job not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to retrieve job details.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async getJobDag(req: AuthenticatedRequest, res: Response) {
    try {
      const organizationId = req.user?.organizationId;
      const { projectId, id } = req.params;

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

      const dag = await JobService.getJobDag(organizationId, projectId, id);
      const response: ApiResponse<typeof dag> = {
        success: true,
        data: dag,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to retrieve job DAG workflow.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async getJobExecutions(req: AuthenticatedRequest, res: Response) {
    try {
      const organizationId = req.user?.organizationId;
      const { projectId, id } = req.params;

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

      const executions = await JobService.getJobExecutions(organizationId, projectId, id);
      const response: ApiResponse<typeof executions> = {
        success: true,
        data: executions,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to retrieve job execution timeline.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async replayJob(req: AuthenticatedRequest, res: Response) {
    try {
      const organizationId = req.user?.organizationId;
      const { projectId, id } = req.params;

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

      const updated = await JobService.replayJob(organizationId, projectId, id);
      const response: ApiResponse<typeof updated> = {
        success: true,
        data: updated,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to replay job.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async cancel(req: AuthenticatedRequest, res: Response) {
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

      const updated = await JobService.cancel(organizationId, id);
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
            message: 'Access denied. Cannot cancel job belonging to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'INVALID_JOB_STATE') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_JOB_STATE',
            message: err instanceof Error ? err.message : 'Cannot cancel job in its current status.',
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
          message: err instanceof Error ? err.message : 'Failed to cancel job.',
        },
      };
      return res.status(500).json(response);
    }
  }
}
