import { Router } from 'express';
import { JobController } from './job.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

// Router for /api/v1/projects/:projectId/queues/:queueId/jobs
export const projectQueueJobRouter = Router({ mergeParams: true });
projectQueueJobRouter.use(authenticateToken);
projectQueueJobRouter.post('/', JobController.create);

// Router for /api/v1/projects/:projectId/jobs
export const projectJobRouter = Router({ mergeParams: true });
projectJobRouter.use(authenticateToken);
projectJobRouter.get('/', JobController.listByProject);
projectJobRouter.get('/:id/dag', JobController.getJobDag);
projectJobRouter.get('/:id/executions', JobController.getJobExecutions);
projectJobRouter.post('/:id/retry', JobController.replayJob);

// Router for /api/v1/queues/:queueId/jobs
export const queueJobRouter = Router({ mergeParams: true });
queueJobRouter.use(authenticateToken);
queueJobRouter.get('/', JobController.listByQueue);

// Router for /api/v1/jobs
export const jobRouter = Router();
jobRouter.use(authenticateToken);
jobRouter.get('/:id', JobController.getById);
jobRouter.post('/:id/cancel', JobController.cancel);
