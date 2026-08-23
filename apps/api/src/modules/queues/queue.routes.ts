import { Router } from 'express';
import { QueueController } from './queue.controller';
import { LockAndShardController } from '../locking/lock.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

// Router for /api/v1/projects/:projectId/queues
export const projectQueueRouter = Router({ mergeParams: true });
projectQueueRouter.use(authenticateToken);
projectQueueRouter.post('/', QueueController.create);
projectQueueRouter.get('/', QueueController.list);

// Router for /api/v1/queues
export const queueRouter = Router();
queueRouter.use(authenticateToken);
queueRouter.get('/:id', QueueController.getById);
queueRouter.patch('/:id', QueueController.update);
queueRouter.delete('/:id', QueueController.delete);
queueRouter.post('/:id/pause', QueueController.pause);
queueRouter.post('/:id/resume', QueueController.resume);
queueRouter.get('/:id/rate-limit', QueueController.getRateLimit);
queueRouter.get('/:id/shard', LockAndShardController.getQueueShard);
