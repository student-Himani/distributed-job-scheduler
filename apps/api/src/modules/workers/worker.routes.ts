import { Router } from 'express';
import { WorkerController } from './worker.controller';
import { LockAndShardController } from '../locking/lock.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

// Router for /api/v1/projects/:projectId/workers
export const projectWorkerRouter = Router({ mergeParams: true });
projectWorkerRouter.use(authenticateToken);
projectWorkerRouter.post('/', WorkerController.register);
projectWorkerRouter.get('/', WorkerController.list);

// Router for /api/v1/workers
export const workerRouter = Router();
workerRouter.use(authenticateToken);
workerRouter.get('/:id', WorkerController.getById);
workerRouter.get('/:id/shard', LockAndShardController.getWorkerShard);
workerRouter.post('/:id/heartbeat', WorkerController.heartbeat);
workerRouter.patch('/:id/status', WorkerController.updateStatus);
