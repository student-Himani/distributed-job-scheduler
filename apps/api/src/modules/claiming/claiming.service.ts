import { prisma } from '../../db/client';
import { WorkerService } from '../workers/worker.service';
import { Logger } from '@job-scheduler/shared';

const logger = new Logger('Claiming:Engine');

const PRIORITY_WEIGHTS: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  DEFAULT: 2,
  LOW: 1,
};

export class ClaimingService {
  static async claimNextJob(organizationId: string, workerId: string) {
    // 1. Verify worker ownership & state
    const worker = await WorkerService.getById(organizationId, workerId);

    if (worker.status === 'OFFLINE' || worker.status === 'DRAINING' || worker.status === 'DEAD') {
      const err = new Error(`Worker [${worker.name}] in status '${worker.status}' cannot claim jobs.`);
      (err as unknown as { code: string }).code = 'WORKER_INELIGIBLE';
      throw err;
    }

    if (worker.currentConcurrency >= worker.maxConcurrency) {
      const err = new Error(`Worker [${worker.name}] has reached maximum concurrency limit (${worker.maxConcurrency}).`);
      (err as unknown as { code: string }).code = 'WORKER_FULL';
      throw err;
    }

    // 2. Fetch all queues in the worker's project
    const queues = await prisma.queue.findMany({
      where: {
        projectId: worker.projectId,
        isPaused: false, // Ignore paused queues
      },
    });

    if (queues.length === 0) {
      return { claimed: false, job: null, message: 'No active, unpaused queues in project.' };
    }

    // Filter out queues that have reached their concurrency limit
    const eligibleQueues = [];
    for (const queue of queues) {
      const activeJobsInQueue = await prisma.job.count({
        where: {
          queueId: queue.id,
          status: { in: ['CLAIMED', 'RUNNING'] },
        },
      });

      if (activeJobsInQueue < queue.concurrencyLimit) {
        eligibleQueues.push(queue);
      }
    }

    if (eligibleQueues.length === 0) {
      return { claimed: false, job: null, message: 'All queues have reached maximum concurrency limits.' };
    }

    const eligibleQueueIds = eligibleQueues.map((q) => q.id);

    // 3. Find candidate jobs ready for execution
    const now = new Date();
    const candidateJobs = await prisma.job.findMany({
      where: {
        projectId: worker.projectId,
        queueId: { in: eligibleQueueIds },
        status: { in: ['QUEUED', 'SCHEDULED'] },
        OR: [
          { scheduledAt: null },
          { scheduledAt: { lte: now } },
        ],
      },
      include: {
        queue: {
          select: { id: true, name: true, priority: true },
        },
      },
      take: 20,
    });

    if (candidateJobs.length === 0) {
      return { claimed: false, job: null, message: 'No eligible jobs ready for execution.' };
    }

    // 4. Sort candidates by Queue Priority (CRITICAL > HIGH > DEFAULT > LOW), then Job Priority DESC, then createdAt ASC
    candidateJobs.sort((a, b) => {
      const weightA = PRIORITY_WEIGHTS[a.queue.priority] || 2;
      const weightB = PRIORITY_WEIGHTS[b.queue.priority] || 2;

      if (weightA !== weightB) {
        return weightB - weightA; // Higher queue priority first
      }

      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher job priority first
      }

      return a.createdAt.getTime() - b.createdAt.getTime(); // Earliest created first
    });

    // 5. Transactional Atomic Claim Loop with Distributed Locking
    for (const candidate of candidateJobs) {
      const lockResource = `job:lock:${candidate.id}`;
      const { DistributedLockService } = await import('../locking/distributed-lock.service');
      const lockRes = await DistributedLockService.acquire(lockResource, worker.id, 30000);

      if (!lockRes.acquired) {
        logger.info(`Skipped candidate job claim [${candidate.id}] - lock active by another worker`, { workerId: worker.id });
        continue;
      }

      const claimedJob = await prisma.$transaction(async (tx) => {
        // Atomic update checking status in ['QUEUED', 'SCHEDULED']
        const updateResult = await tx.job.updateMany({
          where: {
            id: candidate.id,
            status: { in: ['QUEUED', 'SCHEDULED'] },
          },
          data: {
            status: 'CLAIMED',
            assignedWorkerId: worker.id,
            claimedAt: now,
            startedAt: now,
          },
        });

        if (updateResult.count === 0) {
          // Lost race to another worker process
          return null;
        }

        // Increment worker concurrency
        const newConcurrency = worker.currentConcurrency + 1;
        const newStatus = newConcurrency >= worker.maxConcurrency ? 'BUSY' : 'ONLINE';

        await tx.worker.update({
          where: { id: worker.id },
          data: {
            currentConcurrency: newConcurrency,
            status: newStatus,
            lastHeartbeatAt: now,
          },
        });

        // Create JobExecution record (attempt = retryCount + 1)
        await tx.jobExecution.create({
          data: {
            jobId: candidate.id,
            workerId: worker.id,
            attempt: candidate.retryCount + 1,
            status: 'RUNNING',
            startedAt: now,
          },
        });

        // Fetch full updated job payload
        return tx.job.findUnique({
          where: { id: candidate.id },
          include: {
            queue: { select: { id: true, name: true, priority: true } },
            project: { select: { id: true, name: true, slug: true } },
          },
        });
      });

      if (!claimedJob) {
        // Release lock if atomic claim update count was 0
        await DistributedLockService.release(lockResource, worker.id);
      } else {
        logger.info(`Job claimed atomically with distributed lock`, { jobId: claimedJob.id, workerId: worker.id });
        return {
          claimed: true,
          job: claimedJob,
        };
      }
    }

    return { claimed: false, job: null, message: 'All candidate jobs were claimed by competing workers.' };
  }

  static async releaseClaim(organizationId: string, workerId: string, jobId: string) {
    const worker = await WorkerService.getById(organizationId, workerId);

    const updatedWorker = await prisma.$transaction(async (tx) => {
      const newConcurrency = Math.max(0, worker.currentConcurrency - 1);
      const newStatus = worker.status === 'BUSY' ? 'ONLINE' : worker.status;

      return tx.worker.update({
        where: { id: workerId },
        data: {
          currentConcurrency: newConcurrency,
          status: newStatus,
        },
      });
    });

    logger.info(`Released claim for worker`, { workerId, jobId, newConcurrency: updatedWorker.currentConcurrency });
    return updatedWorker;
  }
}
