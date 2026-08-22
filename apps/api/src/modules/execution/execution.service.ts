import { prisma } from '../../db/client';
import { CompleteJobInput, FailJobInput } from './execution.schema';
import { RetryService } from '../retries/retry.service';
import { ScheduleService } from '../scheduling/schedule.service';
import { Logger } from '@job-scheduler/shared';
import { Prisma } from '@prisma/client';

const logger = new Logger('Execution:Service');

export class ExecutionService {
  static async completeJob(organizationId: string, jobId: string, input: CompleteJobInput) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        project: { select: { organizationId: true } },
      },
    });

    if (!job) {
      const err = new Error('Job not found.');
      (err as unknown as { code: string }).code = 'JOB_NOT_FOUND';
      throw err;
    }

    if (job.project.organizationId !== organizationId) {
      const err = new Error('Access denied. Job belongs to another organization.');
      (err as unknown as { code: string }).code = 'CROSS_ORG_ACCESS';
      throw err;
    }

    if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
      const err = new Error(`Cannot complete job in status '${job.status}'.`);
      (err as unknown as { code: string }).code = 'INVALID_JOB_STATE';
      throw err;
    }

    const now = new Date();
    const resultJson = (input.result || {}) as Prisma.InputJsonValue;

    const completedJob = await prisma.$transaction(async (tx) => {
      // 1. Update Job record
      const updated = await tx.job.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          result: resultJson,
          completedAt: now,
        },
      });

      // 2. Update current JobExecution
      await tx.jobExecution.updateMany({
        where: {
          jobId,
          workerId: input.workerId,
          status: 'RUNNING' as any,
        },
        data: {
          status: 'COMPLETED' as any,
          output: resultJson,
          finishedAt: now,
          durationMs: input.durationMs,
        },
      });

      // 3. Decrement Worker concurrency
      const worker = await tx.worker.findUnique({ where: { id: input.workerId } });
      if (worker) {
        const newConcurrency = Math.max(0, worker.currentConcurrency - 1);
        const newStatus = worker.status === 'BUSY' ? 'ONLINE' : worker.status;

        await tx.worker.update({
          where: { id: input.workerId },
          data: {
            currentConcurrency: newConcurrency,
            status: newStatus,
          },
        });
      }

      // 4. Create JobLog
      await tx.jobLog.create({
        data: {
          jobId,
          level: 'INFO',
          message: `Job completed successfully by worker [${input.workerId}]`,
          metadata: { durationMs: input.durationMs },
        },
      });

      // 5. If RECURRING job, re-schedule for next run cycle
      if (job.type === 'RECURRING') {
        await ScheduleService.handleRecurringJobCompletion(tx, jobId);
      }

      return updated;
    });

    logger.info(`Job completed successfully`, { jobId, workerId: input.workerId });
    return completedJob;
  }

  static async failJob(organizationId: string, jobId: string, input: FailJobInput) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        project: { select: { organizationId: true } },
        retryPolicy: true,
      },
    });

    if (!job) {
      const err = new Error('Job not found.');
      (err as unknown as { code: string }).code = 'JOB_NOT_FOUND';
      throw err;
    }

    if (job.project.organizationId !== organizationId) {
      const err = new Error('Access denied. Job belongs to another organization.');
      (err as unknown as { code: string }).code = 'CROSS_ORG_ACCESS';
      throw err;
    }

    if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED' || job.status === 'DEAD_LETTER') {
      const err = new Error(`Cannot fail job in status '${job.status}'.`);
      (err as unknown as { code: string }).code = 'INVALID_JOB_STATE';
      throw err;
    }

    const now = new Date();
    const errorJson = input.errorDetails as Prisma.InputJsonValue;

    const errorMessage = typeof input.errorDetails === 'object' && input.errorDetails !== null && 'message' in input.errorDetails
      ? String((input.errorDetails as { message: unknown }).message)
      : 'Job execution failed';

    const errorStack = typeof input.errorDetails === 'object' && input.errorDetails !== null && 'stack' in input.errorDetails
      ? String((input.errorDetails as { stack: unknown }).stack)
      : undefined;

    const failedResult = await prisma.$transaction(async (tx) => {
      // 1. Update current JobExecution
      await tx.jobExecution.updateMany({
        where: {
          jobId,
          workerId: input.workerId,
          status: 'RUNNING' as any,
        },
        data: {
          status: 'FAILED' as any,
          error: errorMessage,
          stackTrace: errorStack,
          finishedAt: now,
          durationMs: input.durationMs,
        },
      });

      // 2. Decrement Worker concurrency
      const worker = await tx.worker.findUnique({ where: { id: input.workerId } });
      if (worker) {
        const newConcurrency = Math.max(0, worker.currentConcurrency - 1);
        const newStatus = worker.status === 'BUSY' ? 'ONLINE' : worker.status;

        await tx.worker.update({
          where: { id: input.workerId },
          data: {
            currentConcurrency: newConcurrency,
            status: newStatus,
          },
        });
      }

      // 3. Delegate to RetryService for automatic retry backoff or DLQ transition
      return RetryService.handleJobFailureWithRetry(tx, job, errorJson, input.durationMs);
    });

    logger.warn(`Job failure processed`, { jobId, retried: failedResult.retried, status: failedResult.status });
    return failedResult.updatedJob;
  }

  static async getLogs(organizationId: string, jobId: string) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        project: { select: { organizationId: true } },
      },
    });

    if (!job) {
      const err = new Error('Job not found.');
      (err as unknown as { code: string }).code = 'JOB_NOT_FOUND';
      throw err;
    }

    if (job.project.organizationId !== organizationId) {
      const err = new Error('Access denied. Job belongs to another organization.');
      (err as unknown as { code: string }).code = 'CROSS_ORG_ACCESS';
      throw err;
    }

    return prisma.jobLog.findMany({
      where: { jobId },
      orderBy: { timestamp: 'desc' },
    });
  }
}
