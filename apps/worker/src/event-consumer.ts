import { prisma } from './db/client';
import { Logger } from '@job-scheduler/shared';
import { DistributedLockService } from './services/distributed-lock.service';
import { QueueShardingService } from './services/queue-sharding.service';
import { env } from './config/env';
import { JobExecutor } from './executor';

const logger = new Logger('EventConsumer:Worker');

export class WorkerEventConsumer {
  private workerId: string;
  private isRunning: boolean = false;
  private timer: NodeJS.Timeout | null = null;
  private pollIntervalMs: number;
  private enabled: boolean;
  private maxAttempts: number;
  private executor: JobExecutor;

  constructor(workerId: string) {
    this.workerId = workerId;
    this.pollIntervalMs = parseInt(process.env.EVENT_POLL_INTERVAL_MS || '1000', 10);
    this.enabled = process.env.EVENT_PROCESSING_ENABLED !== 'false';
    this.maxAttempts = parseInt(process.env.EVENT_MAX_ATTEMPTS || '5', 10);
    this.executor = new JobExecutor();
  }

  public async start(): Promise<void> {
    if (!this.enabled) {
      logger.info('Event-driven execution consumer is DISABLED by configuration.');
      return;
    }

    this.isRunning = true;
    logger.info(`Worker Event Consumer started [Worker ID: ${this.workerId}]`, {
      pollIntervalMs: this.pollIntervalMs,
      maxAttempts: this.maxAttempts,
      shardId: env.WORKER_SHARD_ID,
      shardCount: env.QUEUE_SHARD_COUNT,
    });

    this.loop();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info(`Worker Event Consumer stopped [Worker ID: ${this.workerId}]`);
  }

  private loop = async (): Promise<void> => {
    if (!this.isRunning) return;

    try {
      await this.processNextEvent();
    } catch (err) {
      logger.error('Error processing event cycle', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (this.isRunning) {
        this.timer = setTimeout(this.loop, this.pollIntervalMs);
      }
    }
  };

  /**
   * Atomically claims and processes the next pending event.
   */
  public async processNextEvent(): Promise<boolean> {
    if (!prisma || !prisma.jobEvent || typeof prisma.jobEvent.findFirst !== 'function') {
      return false;
    }

    const now = new Date();

    // 1. Find candidate PENDING event
    const candidate = await prisma.jobEvent.findFirst({
      where: {
        status: 'PENDING',
        availableAt: { lte: now },
        attempts: { lt: this.maxAttempts },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!candidate) {
      return false;
    }

    // 2. Concurrency-safe atomic claim transition: PENDING -> PROCESSING
    const claimedEvent = await prisma.$transaction(async (tx) => {
      const result = await tx.jobEvent.updateMany({
        where: {
          id: candidate.id,
          status: 'PENDING',
        },
        data: {
          status: 'PROCESSING',
          workerId: this.workerId,
          attempts: { increment: 1 },
        },
      });

      return result.count > 0 ? candidate : null;
    });

    if (!claimedEvent) {
      return false; // Another worker claimed this event concurrently
    }

    logger.info(`Claimed event atomically [Event ID: ${claimedEvent.id}, Type: ${claimedEvent.eventType}]`);

    try {
      await this.handleEvent(claimedEvent);

      // Mark event PROCESSED
      await prisma.jobEvent.update({
        where: { id: claimedEvent.id },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          lastError: null,
        },
      });

      logger.info(`Event PROCESSED successfully [Event ID: ${claimedEvent.id}, Type: ${claimedEvent.eventType}]`);
      return true;
    } catch (err: any) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const updatedAttempts = claimedEvent.attempts + 1;
      const isExhausted = updatedAttempts >= this.maxAttempts;

      await prisma.jobEvent.update({
        where: { id: claimedEvent.id },
        data: {
          status: isExhausted ? 'FAILED' : 'PENDING',
          availableAt: isExhausted ? now : new Date(Date.now() + 3000 * updatedAttempts),
          lastError: errorMsg,
        },
      });

      logger.warn(`Event processing ${isExhausted ? 'FAILED permanently' : 'deferred for retry'} [Event ID: ${claimedEvent.id}]`, {
        attempts: updatedAttempts,
        error: errorMsg,
      });

      return false;
    }
  }

  private async handleEvent(event: any): Promise<void> {
    const actionableEvents = ['JOB_QUEUED', 'JOB_SCHEDULED', 'JOB_RETRY', 'JOB_DEPENDENCY_SATISFIED'];
    if (!actionableEvents.includes(event.eventType) || !event.jobId) {
      // Non-actionable event (e.g. JOB_COMPLETED, JOB_CANCELLED, JOB_FAILED logs)
      return;
    }

    const job = await prisma.job.findUnique({
      where: { id: event.jobId },
      include: { queue: true },
    });

    if (!job) {
      logger.warn(`Target job for event not found [Job ID: ${event.jobId}]`);
      return;
    }

    // Skip terminal / already running jobs
    if (['COMPLETED', 'FAILED', 'CANCELLED', 'DEAD_LETTER', 'RUNNING'].includes(job.status)) {
      logger.debug(`Job is already in status '${job.status}'. Event skipped. [Job ID: ${job.id}]`);
      return;
    }

    // Queue Sharding Check
    const targetQueueId = event.queueId || job.queueId;
    if (targetQueueId) {
      const queueShard = QueueShardingService.getQueueShard(targetQueueId, env.QUEUE_SHARD_COUNT);
      if (queueShard !== env.WORKER_SHARD_ID) {
        logger.debug(`Event queue shard [Shard ${queueShard}] does not match worker shard [Shard ${env.WORKER_SHARD_ID}]. Releasing event.`);
        throw new Error(`Queue shard mismatch: Shard ${queueShard} != Worker Shard ${env.WORKER_SHARD_ID}`);
      }
    }

    // Distributed Locking Strategy (job:lock:{jobId})
    const lockKey = `job:lock:${job.id}`;
    const lockResult = await DistributedLockService.acquire(lockKey, this.workerId, 30000);

    if (!lockResult.acquired) {
      logger.info(`Job lock currently held by another worker. Event deferred. [Job ID: ${job.id}]`);
      throw new Error(`Distributed lock held by another worker: ${lockResult.message}`);
    }

    try {
      // Transition job state atomically: QUEUED / SCHEDULED -> CLAIMED
      const claimed = await prisma.$transaction(async (tx) => {
        const updateCount = await tx.job.updateMany({
          where: {
            id: job.id,
            status: { in: ['QUEUED', 'SCHEDULED'] },
          },
          data: {
            status: 'CLAIMED',
            assignedWorkerId: this.workerId,
            claimedAt: new Date(),
          },
        });

        if (updateCount.count === 0) {
          return false;
        }

        await tx.jobExecution.create({
          data: {
            jobId: job.id,
            workerId: this.workerId,
            status: 'RUNNING',
            attempt: job.retryCount + 1,
          },
        });

        return true;
      });

      if (!claimed) {
        logger.info(`Job was already claimed/processed. [Job ID: ${job.id}]`);
        return;
      }

      logger.info(`EVENT-DRIVEN EXECUTION TRIGGERED [Job ID: ${job.id}, Event: ${event.eventType}]`);

      // Trigger Execution
      await prisma.job.update({
        where: { id: job.id },
        data: { status: 'RUNNING' },
      });

      const payloadObj = (job.payload as Record<string, unknown>) || {};
      const shouldFail = Boolean(payloadObj.shouldFail || payloadObj.forceFail);

      const result = await this.executor.executeTask(
        {
          id: job.id,
          name: job.name || 'Job Event Task',
          payload: payloadObj,
          maxRetries: job.maxRetries,
        },
        async (p: Record<string, unknown>) => {
          if (shouldFail) {
            throw new Error((p.errorMessage as string) || 'Simulated task failure');
          }
          await new Promise((res) => setTimeout(res, 500));
          return { processedAt: new Date().toISOString(), workerId: this.workerId, status: 'SUCCESS' };
        }
      );

      const finishedAt = new Date();

      if (result.success) {
        await prisma.$transaction(async (tx) => {
          await tx.job.update({
            where: { id: job.id },
            data: { status: 'COMPLETED', result: result.result as any, completedAt: finishedAt },
          });

          await tx.jobExecution.updateMany({
            where: { jobId: job.id, workerId: this.workerId, status: 'RUNNING' },
            data: { status: 'SUCCESS', output: result.result as any, finishedAt, durationMs: result.durationMs },
          });

          await tx.jobLog.create({
            data: {
              jobId: job.id,
              level: 'INFO',
              message: `Event-driven execution COMPLETED in ${result.durationMs}ms`,
            },
          });
        });

        logger.info(`Event-driven job execution COMPLETED [Job ID: ${job.id}]`);
      } else {
        const errorMsg = result.error?.message || 'Event execution failed';
        await prisma.job.update({
          where: { id: job.id },
          data: { status: 'FAILED', errorDetails: { message: errorMsg } },
        });
      }
    } finally {
      await DistributedLockService.release(lockKey, this.workerId);
    }
  }
}
