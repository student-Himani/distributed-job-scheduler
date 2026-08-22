import { Router } from 'express';
import { ExecutionController } from './execution.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

export const executionRouter = Router();

executionRouter.use(authenticateToken);

executionRouter.post('/:id/complete', ExecutionController.complete);
executionRouter.post('/:id/fail', ExecutionController.fail);
executionRouter.get('/:id/logs', ExecutionController.getLogs);
