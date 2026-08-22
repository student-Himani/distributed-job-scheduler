import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { createProjectSchema, updateProjectSchema, queryProjectSchema } from './project.schema';
import { ProjectService } from './project.service';
import { ApiResponse } from '@job-scheduler/shared';

export class ProjectController {
  static async create(req: AuthenticatedRequest, res: Response) {
    const parseResult = createProjectSchema.safeParse(req.body);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for project creation.',
          details: parseResult.error.flatten().fieldErrors,
        },
      };
      return res.status(400).json(response);
    }

    try {
      const organizationId = req.user?.organizationId;
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

      const project = await ProjectService.create(organizationId, parseResult.data);
      const response: ApiResponse<typeof project> = {
        success: true,
        data: project,
      };
      return res.status(201).json(response);
    } catch (err: unknown) {
      const errorCode = (err as { code?: string })?.code;
      if (errorCode === 'DUPLICATE_PROJECT') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'DUPLICATE_PROJECT',
            message: err instanceof Error ? err.message : 'A project with this slug already exists.',
          },
        };
        return res.status(409).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to create project.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async list(req: AuthenticatedRequest, res: Response) {
    const parseResult = queryProjectSchema.safeParse(req.query);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for query parameters.',
          details: parseResult.error.flatten().fieldErrors,
        },
      };
      return res.status(400).json(response);
    }

    try {
      const organizationId = req.user?.organizationId;
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

      const result = await ProjectService.list(organizationId, parseResult.data);
      const response: ApiResponse<typeof result.projects> = {
        success: true,
        data: result.projects,
        meta: {
          timestamp: new Date().toISOString(),
          ...result.pagination,
        },
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to fetch projects list.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async getById(req: AuthenticatedRequest, res: Response) {
    try {
      const organizationId = req.user?.organizationId;
      const projectId = req.params.id;

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

      const project = await ProjectService.getById(organizationId, projectId);
      const response: ApiResponse<typeof project> = {
        success: true,
        data: project,
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
            message: 'Requested project was not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to retrieve project details.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async update(req: AuthenticatedRequest, res: Response) {
    const parseResult = updateProjectSchema.safeParse(req.body);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for project update payload.',
          details: parseResult.error.flatten().fieldErrors,
        },
      };
      return res.status(400).json(response);
    }

    try {
      const organizationId = req.user?.organizationId;
      const projectId = req.params.id;

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

      const updated = await ProjectService.update(organizationId, projectId, parseResult.data);
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
            message: 'Access denied. Cannot update project belonging to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'PROJECT_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: 'Project not found for update.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to update project.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async delete(req: AuthenticatedRequest, res: Response) {
    try {
      const organizationId = req.user?.organizationId;
      const projectId = req.params.id;

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

      const result = await ProjectService.delete(organizationId, projectId);
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
            message: 'Access denied. Cannot delete project belonging to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'PROJECT_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: 'Project not found for deletion.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to delete project.',
        },
      };
      return res.status(500).json(response);
    }
  }
}
