import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { createRetryPolicySchema, queryDlqSchema } from './retry.schema';
import { RetryService } from './retry.service';
import { ApiResponse } from '@job-scheduler/shared';

export class RetryController {
  static async createPolicy(req: AuthenticatedRequest, res: Response) {
    const parseResult = createRetryPolicySchema.safeParse(req.body);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for retry policy creation.',
          details: parseResult.error.flatten().fieldErrors,
        },
      };
      return res.status(400).json(response);
    }

    try {
      const policy = await RetryService.createRetryPolicy(parseResult.data);
      const response: ApiResponse<typeof policy> = {
        success: true,
        data: policy,
      };
      return res.status(201).json(response);
    } catch (err: unknown) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to create retry policy.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async listPolicies(_req: AuthenticatedRequest, res: Response) {
    try {
      const policies = await RetryService.listRetryPolicies();
      const response: ApiResponse<typeof policies> = {
        success: true,
        data: policies,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to list retry policies.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async listDlq(req: AuthenticatedRequest, res: Response) {
    const parseResult = queryDlqSchema.safeParse(req.query);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for DLQ query parameters.',
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

      const result = await RetryService.listDlq(organizationId, projectId, parseResult.data);
      const response: ApiResponse<typeof result.entries> = {
        success: true,
        data: result.entries,
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
          message: err instanceof Error ? err.message : 'Failed to list DLQ entries.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async getDlqById(req: AuthenticatedRequest, res: Response) {
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

      const entry = await RetryService.getDlqById(organizationId, id);
      const response: ApiResponse<typeof entry> = {
        success: true,
        data: entry,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const errorCode = (err as { code?: string })?.code;
      if (errorCode === 'CROSS_ORG_ACCESS') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied. DLQ entry belongs to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'DLQ_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'DLQ_NOT_FOUND',
            message: 'DLQ entry not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to retrieve DLQ entry details.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async retryDlq(req: AuthenticatedRequest, res: Response) {
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

      const result = await RetryService.retryDlq(organizationId, id);
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
            message: 'Access denied. Cannot retry DLQ entry belonging to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'DLQ_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'DLQ_NOT_FOUND',
            message: 'DLQ entry not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to retry DLQ entry.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async discardDlq(req: AuthenticatedRequest, res: Response) {
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

      const result = await RetryService.discardDlq(organizationId, id);
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
            message: 'Access denied. Cannot discard DLQ entry belonging to another organization.',
          },
        };
        return res.status(403).json(response);
      }

      if (errorCode === 'DLQ_NOT_FOUND') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'DLQ_NOT_FOUND',
            message: 'DLQ entry not found.',
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to discard DLQ entry.',
        },
      };
      return res.status(500).json(response);
    }
  }
}
