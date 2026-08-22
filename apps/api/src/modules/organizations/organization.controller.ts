import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { OrganizationService } from './organization.service';
import { createOrganizationSchema, updateOrganizationSchema } from './organization.schema';
import { ApiResponse } from '@job-scheduler/shared';

export class OrganizationController {
  static async create(req: AuthenticatedRequest, res: Response) {
    const parseResult = createOrganizationSchema.safeParse(req.body);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for organization creation.',
          details: parseResult.error.flatten().fieldErrors,
        },
      };
      return res.status(400).json(response);
    }

    try {
      const userId = req.user?.userId;
      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required to create an organization.',
          },
        };
        return res.status(401).json(response);
      }

      const organization = await OrganizationService.create(parseResult.data, userId);
      const response: ApiResponse<typeof organization> = {
        success: true,
        data: organization,
      };
      return res.status(201).json(response);
    } catch (err: unknown) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to create organization.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async list(_req: AuthenticatedRequest, res: Response) {
    try {
      const organizations = await OrganizationService.listAll();
      const response: ApiResponse<typeof organizations> = {
        success: true,
        data: organizations,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to retrieve organizations.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async getMe(req: AuthenticatedRequest, res: Response) {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User is not associated with an organization.',
          },
        };
        return res.status(401).json(response);
      }

      const org = await OrganizationService.getById(organizationId);
      const response: ApiResponse<typeof org> = {
        success: true,
        data: org,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: err instanceof Error ? err.message : 'Organization not found.',
        },
      };
      return res.status(404).json(response);
    }
  }

  static async updateMe(req: AuthenticatedRequest, res: Response) {
    const parseResult = updateOrganizationSchema.safeParse(req.body);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for organization update.',
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
            message: 'User is not associated with an organization.',
          },
        };
        return res.status(401).json(response);
      }

      const updatedOrg = await OrganizationService.update(organizationId, parseResult.data);
      const response: ApiResponse<typeof updatedOrg> = {
        success: true,
        data: updatedOrg,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to update organization.',
        },
      };
      return res.status(500).json(response);
    }
  }
}
