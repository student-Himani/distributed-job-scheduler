import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { EventService } from './event.service';
import { ApiResponse } from '@job-scheduler/shared';
import { prisma } from '../../db/client';

export class EventController {
  static async listEvents(req: AuthenticatedRequest, res: Response) {
    try {
      const { projectId } = req.params;
      const { status, limit, offset } = req.query;

      const data = await EventService.listEvents(projectId, {
        status: status as string,
        limit: limit ? parseInt(limit as string, 10) : 50,
        offset: offset ? parseInt(offset as string, 10) : 0,
      });

      const response: ApiResponse<typeof data> = {
        success: true,
        data,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to retrieve event log.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async getEventStats(req: AuthenticatedRequest, res: Response) {
    try {
      const { projectId } = req.params;
      const data = await EventService.getEventStats(projectId);

      const response: ApiResponse<typeof data> = {
        success: true,
        data,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to retrieve event statistics.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async getById(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const event = prisma && prisma.jobEvent && typeof prisma.jobEvent.findUnique === 'function'
        ? await prisma.jobEvent.findUnique({ where: { id } })
        : null;

      if (!event) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Event [${id}] not found.`,
          },
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse<typeof event> = {
        success: true,
        data: event,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to fetch event details.',
        },
      };
      return res.status(500).json(response);
    }
  }
}
