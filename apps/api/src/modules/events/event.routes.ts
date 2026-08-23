import { Router } from 'express';
import { EventController } from './event.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

// Router for /api/v1/projects/:projectId/events
export const projectEventRouter = Router({ mergeParams: true });
projectEventRouter.use(authenticateToken);
projectEventRouter.get('/', EventController.listEvents);
projectEventRouter.get('/stats', EventController.getEventStats);

// Router for /api/v1/events
export const eventRouter = Router();
eventRouter.use(authenticateToken);
eventRouter.get('/:id', EventController.getById);
