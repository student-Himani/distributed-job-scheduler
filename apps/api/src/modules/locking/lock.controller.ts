import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { DistributedLockService } from './distributed-lock.service';
import { QueueShardingService } from '../sharding/queue-sharding.service';
import { ApiResponse } from '@job-scheduler/shared';

export class LockAndShardController {
  static async getJobLock(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const resource = `job:lock:${id}`;
      const status = await DistributedLockService.getLockStatus(resource);

      const response: ApiResponse<typeof status> = {
        success: true,
        data: status,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to retrieve job lock status.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async getQueueShard(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const shardCount = parseInt((req.query.shardCount as string) || '4', 10);
      const shardId = QueueShardingService.getQueueShard(id, shardCount);

      const data = {
        queueId: id,
        shardId,
        shardCount,
      };

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
          message: err instanceof Error ? err.message : 'Failed to compute queue shard.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async getWorkerShard(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const shardCount = parseInt(process.env.QUEUE_SHARD_COUNT || '4', 10);
      const shardId = parseInt(process.env.WORKER_SHARD_ID || '0', 10);

      const data = {
        workerId: id,
        shardId,
        shardCount,
        lockStatus: 'Healthy',
      };

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
          message: err instanceof Error ? err.message : 'Failed to retrieve worker shard details.',
        },
      };
      return res.status(500).json(response);
    }
  }
}
