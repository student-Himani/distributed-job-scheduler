import { Router } from 'express';
import { ScheduleController } from './schedule.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

// Router for /api/v1/projects/:projectId/queues/:queueId/schedules
export const projectQueueScheduleRouter = Router({ mergeParams: true });
projectQueueScheduleRouter.use(authenticateToken);
projectQueueScheduleRouter.post('/', ScheduleController.create);

// Router for /api/v1/projects/:projectId/schedules
export const projectScheduleRouter = Router({ mergeParams: true });
projectScheduleRouter.use(authenticateToken);
projectScheduleRouter.get('/', ScheduleController.list);

// Router for /api/v1/schedules
export const scheduleRouter = Router();
scheduleRouter.use(authenticateToken);
scheduleRouter.get('/:id', ScheduleController.getById);
scheduleRouter.post('/:id/pause', ScheduleController.pause);
scheduleRouter.post('/:id/resume', ScheduleController.resume);
scheduleRouter.delete('/:id', ScheduleController.delete);
