import { Router } from 'express';
import { RetryController } from './retry.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

// Router for /api/v1/projects/:projectId/dlq
export const projectDlqRouter = Router({ mergeParams: true });
projectDlqRouter.use(authenticateToken);
projectDlqRouter.get('/', RetryController.listDlq);

// Router for /api/v1/dlq
export const dlqRouter = Router();
dlqRouter.use(authenticateToken);
dlqRouter.get('/:id', RetryController.getDlqById);
dlqRouter.post('/:id/retry', RetryController.retryDlq);
dlqRouter.delete('/:id', RetryController.discardDlq);

// Router for /api/v1/retry-policies
export const retryPolicyRouter = Router();
retryPolicyRouter.use(authenticateToken);
retryPolicyRouter.post('/', RetryController.createPolicy);
retryPolicyRouter.get('/', RetryController.listPolicies);
