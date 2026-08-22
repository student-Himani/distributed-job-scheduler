import { prisma } from './db/client';
import { env } from './config/env';
import { Logger } from '@job-scheduler/shared';
import { JobExecutor } from './executor';
import os from 'os';

const logger = new Logger('Worker:Poller');
const executor = new JobExecutor();

const PRIORITY_WEIGHTS: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  DEFAULT: 2,
  LOW: 1,
};

export class WorkerDaemonPoller {
  private isRunning = false;
  private workerId = env.WORKER_ID;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private pollInterval: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info(`Initializing Multi-Project Worker Daemon [${this.workerId}] against PostgreSQL...`);

    // 1. Resolve initial project workspace
    const project = await this.resolveProjectWorkspace();

    // 2. Register/upsert Worker in PostgreSQL
    const now = new Date();
    const hostname = os.hostname();
    const pid = process.pid;

    await prisma.worker.upsert({
      where: { id: this.workerId },
      update: {
        name: this.workerId,
        hostname,
        pid,
        projectId: project.id,
        status: 'ONLINE',
        maxConcurrency: 10,
        currentConcurrency: 0,
        lastHeartbeatAt: now,
      },
      create: {
        id: this.workerId,
        name: this.workerId,
        hostname,
        pid,
        projectId: project.id,
        status: 'ONLINE',
        maxConcurrency: 10,
        currentConcurrency: 0,
        lastHeartbeatAt: now,
      },
    });

    logger.info(`Worker node [${this.workerId}] registered & active (Default Project: ${project.name} [${project.id}])`);

    // 3. Start Heartbeat Loop (Every 5s)
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), 5000);
    await this.sendHeartbeat();

    // 4. Start Polling Loop (Every 2s)
    this.pollInterval = setInterval(() => this.pollAndExecute(), 2000);
    logger.info(`Worker poller active. Polling PostgreSQL every 2s for QUEUED/SCHEDULED jobs across ALL active projects...`);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.pollInterval) clearInterval(this.pollInterval);

    logger.info(`Setting worker [${this.workerId}] to DRAINING state...`);

    try {
      await prisma.worker.update({
        where: { id: this.workerId },
        data: { status: 'OFFLINE', currentConcurrency: 0 },
      });
    } catch {
      // Ignore cleanup error on exit
    }

    logger.info(`Worker [${this.workerId}] shut down cleanly.`);
  }

  private async resolveProjectWorkspace() {
    let project = await prisma.project.findFirst({
      orderBy: { createdAt: 'asc' },
    });

    if (!project) {
      let org = await prisma.organization.findFirst();
      if (!org) {
        org = await prisma.organization.create({
          data: {
            name: 'Default Organization',
            slug: 'default-org-' + Date.now().toString(36),
          },
        });
      }

      project = await prisma.project.create({
        data: {
          name: 'Default Project',
          slug: 'default-project-' + Date.now().toString(36),
          organizationId: org.id,
        },
      });
    }

    return project;
  }

  private async sendHeartbeat(): Promise<void> {
    try {
      const now = new Date();
      const cpuUsage = Math.floor(Math.random() * 15) + 5;
      const memoryUsageMb = Math.floor(Math.random() * 50) + 120; // MB

      await prisma.worker.update({
        where: { id: this.workerId },
        data: {
          lastHeartbeatAt: now,
          status: executor.activeJobs >= 10 ? 'BUSY' : 'ONLINE',
        },
      });

      await prisma.workerHeartbeat.create({
        data: {
          workerId: this.workerId,
          cpuUsage,
          memoryUsageMb,
          activeJobs: executor.activeJobs,
        },
      });
    } catch (err) {
      logger.warn(`Failed to record worker heartbeat pulse`, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async checkAndUnblockChildJobs(completedJobId: string): Promise<void> {
    try {
      const dependentEdges = await prisma.jobDependency.findMany({
        where: { dependsOnJobId: completedJobId },
        select: { jobId: true },
      });

      for (const edge of dependentEdges) {
        const childJobId = edge.jobId;

        const childJob = await prisma.job.findUnique({
          where: { id: childJobId },
          include: {
            dependencies: {
              include: {
                dependsOnJob: { select: { id: true, status: true } },
              },
            },
          },
        });

        if (childJob && childJob.status === 'BLOCKED') {
          const allParentsCompleted = childJob.dependencies.every(
            (d) => d.dependsOnJob.status === 'COMPLETED'
          );

          if (allParentsCompleted) {
            await prisma.$transaction(async (tx) => {
              await tx.job.update({
                where: { id: childJobId },
                data: { status: 'QUEUED' },
              });

              await tx.jobLog.create({
                data: {
                  jobId: childJobId,
                  level: 'INFO',
                  message: 'DAG dependency unblocked: All prerequisite parent jobs completed successfully.',
                },
              });
            });

            logger.info(`DAG UNBLOCKED JOB [Child Job ID: ${childJob.id}, Name: ${childJob.name}] -> QUEUED`);
          }
        }
      }
    } catch (err) {
      logger.error('Error checking DAG child dependencies', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async pollAndExecute(): Promise<void> {
    try {
      // 1. Fetch current worker node details
      const worker = await prisma.worker.findUnique({
        where: { id: this.workerId },
      });

      if (!worker || worker.status === 'DRAINING' || worker.status === 'OFFLINE') return;
      if (worker.currentConcurrency >= worker.maxConcurrency) return;

      // 2. Fetch unpaused queues across ALL projects in PostgreSQL
      const queues = await prisma.queue.findMany({
        where: {
          isPaused: false,
        },
      });

      if (queues.length === 0) return;

      // Filter eligible queues under concurrency limits
      const eligibleQueueIds: string[] = [];
      for (const q of queues) {
        const activeCount = await prisma.job.count({
          where: {
            queueId: q.id,
            status: { in: ['CLAIMED', 'RUNNING'] },
          },
        });
        if (activeCount < q.concurrencyLimit) {
          eligibleQueueIds.push(q.id);
        }
      }

      if (eligibleQueueIds.length === 0) return;

      // 3. Find candidate jobs across all eligible queues in QUEUED or SCHEDULED status
      const now = new Date();
      const candidateJobs = await prisma.job.findMany({
        where: {
          queueId: { in: eligibleQueueIds },
          status: { in: ['QUEUED', 'SCHEDULED'] },
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
        },
        include: {
          queue: { select: { id: true, name: true, priority: true } },
          project: { select: { id: true, name: true } },
        },
        take: 15,
      });

      if (candidateJobs.length === 0) return;

      // Sort candidate jobs by Queue Priority -> Job Priority -> Earliest Created
      candidateJobs.sort((a, b) => {
        const weightA = PRIORITY_WEIGHTS[a.queue.priority] || 2;
        const weightB = PRIORITY_WEIGHTS[b.queue.priority] || 2;
        if (weightA !== weightB) return weightB - weightA;
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      // 4. Attempt atomic claim on top candidate
      for (const candidate of candidateJobs) {
        const claimedJob = await prisma.$transaction(async (tx) => {
          const claimResult = await tx.job.updateMany({
            where: {
              id: candidate.id,
              status: { in: ['QUEUED', 'SCHEDULED'] },
            },
            data: {
              status: 'CLAIMED',
              assignedWorkerId: this.workerId,
              claimedAt: now,
              startedAt: now,
            },
          });

          if (claimResult.count === 0) return null;

          // Align worker's projectId to candidate job's projectId & increment concurrency
          await tx.worker.update({
            where: { id: this.workerId },
            data: {
              projectId: candidate.projectId,
              currentConcurrency: { increment: 1 },
              lastHeartbeatAt: now,
            },
          });

          // Create JobExecution record
          await tx.jobExecution.create({
            data: {
              jobId: candidate.id,
              workerId: this.workerId,
              attempt: candidate.retryCount + 1,
              status: 'RUNNING',
              startedAt: now,
            },
          });

          // Create log
          await tx.jobLog.create({
            data: {
              jobId: candidate.id,
              level: 'INFO',
              message: `Job claimed by worker [${this.workerId}] for project [${candidate.project.name}]`,
            },
          });

          return candidate;
        });

        if (claimedJob) {
          logger.info(`JOB QUEUED -> CLAIMED -> RUNNING [Job ID: ${claimedJob.id}, Project ID: ${claimedJob.projectId}] (Queue: ${claimedJob.queue.name})`);
          
          // Execute asynchronously
          this.executeClaimedJob(claimedJob);
          break;
        }
      }
    } catch (err) {
      logger.error(`Poller error`, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async executeClaimedJob(job: { id: string; name: string; payload: unknown; retryCount: number; maxRetries: number; projectId: string }): Promise<void> {
    const payloadObj = (typeof job.payload === 'object' && job.payload !== null ? job.payload : {}) as Record<string, unknown>;
    const shouldFail = Boolean(payloadObj.fail || payloadObj.shouldFail || payloadObj.error);

    const task = {
      id: job.id,
      name: job.name,
      payload: payloadObj,
      maxRetries: job.maxRetries,
    };

    // Update status to RUNNING in database
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'RUNNING' },
    });

    const executionResult = await executor.executeTask(task, async (p) => {
      if (shouldFail) {
        throw new Error((p.errorMessage as string) || 'Simulated worker task failure');
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
      return {
        processedAt: new Date().toISOString(),
        workerId: this.workerId,
        status: 'SUCCESS',
        payloadEcho: p,
      };
    });

    const finishedAt = new Date();

    if (executionResult.success) {
      // Complete Job
      await prisma.$transaction(async (tx) => {
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: 'COMPLETED',
            result: executionResult.result as any,
            completedAt: finishedAt,
          },
        });

        await tx.jobExecution.updateMany({
          where: {
            jobId: job.id,
            workerId: this.workerId,
            status: 'RUNNING',
          },
          data: {
            status: 'SUCCESS',
            output: executionResult.result as any,
            finishedAt,
            durationMs: executionResult.durationMs,
          },
        });

        await tx.worker.update({
          where: { id: this.workerId },
          data: { currentConcurrency: { decrement: 1 } },
        });

        await tx.jobLog.create({
          data: {
            jobId: job.id,
            level: 'INFO',
            message: `Job execution COMPLETED successfully in ${executionResult.durationMs}ms`,
            metadata: { durationMs: executionResult.durationMs },
          },
        });
      });

      logger.info(`JOB RUNNING -> COMPLETED [Job ID: ${job.id}, Project ID: ${job.projectId}] (Duration: ${executionResult.durationMs}ms)`);

      // Unblock dependent child DAG jobs
      await this.checkAndUnblockChildJobs(job.id);
    } else {
      // Process Job Failure with Retry / DLQ
      const errorMsg = executionResult.error?.message || 'Execution failed';
      const isRetriable = job.retryCount < job.maxRetries;

      await prisma.$transaction(async (tx) => {
        await tx.jobExecution.updateMany({
          where: {
            jobId: job.id,
            workerId: this.workerId,
            status: 'RUNNING',
          },
          data: {
            status: 'FAILURE' as any,
            error: errorMsg,
            stackTrace: executionResult.error?.stack,
            finishedAt,
            durationMs: executionResult.durationMs,
          },
        });

        await tx.worker.update({
          where: { id: this.workerId },
          data: { currentConcurrency: { decrement: 1 } },
        });

        if (isRetriable) {
          const nextAttempt = job.retryCount + 1;
          const delayMs = Math.min(30000, 2000 * Math.pow(2, job.retryCount));
          const nextRunAt = new Date(Date.now() + delayMs);

          await tx.job.update({
            where: { id: job.id },
            data: {
              status: 'SCHEDULED',
              retryCount: nextAttempt,
              scheduledAt: nextRunAt,
              errorDetails: { message: errorMsg, attempt: nextAttempt },
            },
          });

          await tx.jobLog.create({
            data: {
              jobId: job.id,
              level: 'WARN',
              message: `Job failed (Attempt ${nextAttempt}/${job.maxRetries}). Re-scheduled for retry in ${delayMs}ms`,
            },
          });

          logger.warn(`JOB FAILED -> RETRY SCHEDULED [Job ID: ${job.id}, Project ID: ${job.projectId}] (Attempt ${nextAttempt}/${job.maxRetries})`);
        } else {
          // Exhausted retries -> move to DLQ
          await tx.job.update({
            where: { id: job.id },
            data: {
              status: 'DEAD_LETTER',
              completedAt: finishedAt,
              errorDetails: { message: errorMsg, finalStatus: 'DEAD_LETTER' },
            },
          });

          await tx.deadLetterQueueEntry.create({
            data: {
              jobId: job.id,
              reason: errorMsg,
              failedAtAttempts: job.retryCount + 1,
              lastError: errorMsg,
              errorStack: executionResult.error?.stack,
            },
          });

          await tx.jobLog.create({
            data: {
              jobId: job.id,
              level: 'ERROR',
              message: `Job retries exhausted (${job.maxRetries}). Moved to Dead-Letter Queue (DLQ).`,
            },
          });

          logger.warn(`JOB FAILED -> MOVED TO DLQ [Job ID: ${job.id}, Project ID: ${job.projectId}]`);
        }
      });
    }
  }
}
