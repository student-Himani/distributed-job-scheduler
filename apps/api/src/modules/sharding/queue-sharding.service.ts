import { Logger } from '@job-scheduler/shared';

const logger = new Logger('QueueSharding:Service');

export class QueueShardingService {
  /**
   * Deterministic DJB2 string hashing.
   * Maps any queueId string to a non-negative integer.
   */
  static hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return Math.abs(hash);
  }

  /**
   * Deterministically calculates the assigned shard ID for a given queueId.
   * Formula: hash(queueId) % shardCount
   */
  static getQueueShard(queueId: string, shardCount: number = 4): number {
    if (shardCount <= 0) {
      const err = new Error(`Invalid shardCount '${shardCount}'. Shard count must be greater than 0.`);
      (err as unknown as { code: string }).code = 'INVALID_SHARD_CONFIG';
      throw err;
    }
    return this.hashString(queueId) % shardCount;
  }

  /**
   * Validates worker shard configuration.
   */
  static validateShardConfig(workerShardId: number, shardCount: number): void {
    if (shardCount <= 0) {
      const err = new Error(`Invalid QUEUE_SHARD_COUNT '${shardCount}'. Shard count must be > 0.`);
      (err as unknown as { code: string }).code = 'INVALID_SHARD_CONFIG';
      throw err;
    }
    if (workerShardId < 0 || workerShardId >= shardCount) {
      const err = new Error(`Invalid WORKER_SHARD_ID '${workerShardId}'. Must satisfy 0 <= WORKER_SHARD_ID < ${shardCount}.`);
      (err as unknown as { code: string }).code = 'INVALID_SHARD_CONFIG';
      throw err;
    }
  }

  /**
   * Filters a list of queue objects, retaining only queues assigned to target workerShardId.
   */
  static filterQueuesForWorker<T extends { id: string }>(
    queues: T[],
    workerShardId: number,
    shardCount: number
  ): T[] {
    this.validateShardConfig(workerShardId, shardCount);
    const filtered = queues.filter((q) => this.getQueueShard(q.id, shardCount) === workerShardId);
    logger.debug(`Filtered ${filtered.length}/${queues.length} queues for Worker Shard [${workerShardId}/${shardCount}]`);
    return filtered;
  }
}
