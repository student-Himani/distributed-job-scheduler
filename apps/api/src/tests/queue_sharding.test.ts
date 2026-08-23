import { QueueShardingService } from '../modules/sharding/queue-sharding.service';

describe('Queue Sharding Subsystem', () => {
  const shardCount = 4;

  it('1. Same queue always maps to same shard', () => {
    const queueId = 'queue-webhooks-123';
    const shard1 = QueueShardingService.getQueueShard(queueId, shardCount);
    const shard2 = QueueShardingService.getQueueShard(queueId, shardCount);
    const shard3 = QueueShardingService.getQueueShard(queueId, shardCount);

    expect(shard1).toBe(shard2);
    expect(shard2).toBe(shard3);
    expect(shard1).toBeGreaterThanOrEqual(0);
    expect(shard1).toBeLessThan(shardCount);
  });

  it('2. Different queues distribute across shards', () => {
    const queues = Array.from({ length: 20 }, (_, i) => `queue-sample-${i}`);
    const assignedShards = queues.map((q) => QueueShardingService.getQueueShard(q, shardCount));
    const uniqueShards = new Set(assignedShards);

    expect(uniqueShards.size).toBeGreaterThan(1);
    assignedShards.forEach((s) => {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(shardCount);
    });
  });

  it('3. Worker only processes its assigned shard', () => {
    const queues = [
      { id: 'q1', name: 'Queue 1' },
      { id: 'q2', name: 'Queue 2' },
      { id: 'q3', name: 'Queue 3' },
      { id: 'q4', name: 'Queue 4' },
    ];

    const workerShardId = 1;
    const filtered = QueueShardingService.filterQueuesForWorker(queues, workerShardId, shardCount);

    filtered.forEach((q) => {
      expect(QueueShardingService.getQueueShard(q.id, shardCount)).toBe(workerShardId);
    });
  });

  it('4. Invalid shard configuration is rejected', () => {
    expect(() => QueueShardingService.getQueueShard('q1', 0)).toThrow('Invalid shardCount');
    expect(() => QueueShardingService.validateShardConfig(-1, 4)).toThrow('Invalid WORKER_SHARD_ID');
    expect(() => QueueShardingService.validateShardConfig(4, 4)).toThrow('Invalid WORKER_SHARD_ID');
    expect(() => QueueShardingService.validateShardConfig(0, 0)).toThrow('Invalid QUEUE_SHARD_COUNT');
  });

  it('5. Queue polling respects shard ownership', () => {
    const allQueues = Array.from({ length: 12 }, (_, i) => ({ id: `q-${i}` }));

    const worker0Queues = QueueShardingService.filterQueuesForWorker(allQueues, 0, shardCount);
    const worker1Queues = QueueShardingService.filterQueuesForWorker(allQueues, 1, shardCount);
    const worker2Queues = QueueShardingService.filterQueuesForWorker(allQueues, 2, shardCount);
    const worker3Queues = QueueShardingService.filterQueuesForWorker(allQueues, 3, shardCount);

    const totalFiltered = worker0Queues.length + worker1Queues.length + worker2Queues.length + worker3Queues.length;
    expect(totalFiltered).toBe(allQueues.length);
  });

  it('6. Multiple workers process different shards concurrently without overlap', () => {
    const queuesWorker0 = QueueShardingService.filterQueuesForWorker([{ id: 'q-a' }, { id: 'q-b' }], 0, 2);
    const queuesWorker1 = QueueShardingService.filterQueuesForWorker([{ id: 'q-a' }, { id: 'q-b' }], 1, 2);

    const intersection = queuesWorker0.filter((q0) => queuesWorker1.some((q1) => q1.id === q0.id));
    expect(intersection.length).toBe(0);
  });
});
