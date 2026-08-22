import { prisma } from '../../db/client';
import { CreateRetryPolicyInput, QueryDlqInput } from './retry.schema';
import { ProjectService } from '../projects/project.service';
import { Logger } from '@job-scheduler/shared';
import { Prisma } from '@prisma/client';

const logger = new Logger('Retry:Service');

export class RetryService {
  static calculateBackoffDelay(
    strategy: 'FIXED' | 'LINEAR' | 'EXPONENTIAL' = 'EXPONENTIAL',
    attempt: number = 1,
    initialIntervalMs: number = 1000,
    maxIntervalMs: number = 3600000,
    backoffFactor: number = 2.0
  ): number {
    let delayMs = initialIntervalMs;

    switch (strategy) {
      case 'FIXED':
        delayMs = initialIntervalMs;
        break;
      case 'LINEAR':
        delayMs = initialIntervalMs * Math.max(1, attempt);
        break;
      case 'EXPONENTIAL':
      default:
        delayMs = initialIntervalMs * Math.pow(backoffFactor, Math.max(0, attempt - 1));
        break;
    }

    return Math.min(Math.round(delayMs), maxIntervalMs);
  }

  static async handleJobFailureWithRetry(
    tx: Prisma.TransactionClient,
    job: {
      id: string;
      retryCount: number;
      maxRetries: number;
      retryPolicy?: {
        strategy: 'FIXED' | 'LINEAR' | 'EXPONENTIAL';
        initialIntervalMs: number;
        maxIntervalMs: number;
        backoffFactor: number;
      } | null;
    },
    errorDetails: Prisma.InputJsonValue,
    durationMs?: number
  ) {
    const now = new Date();
    const newRetryCount = job.retryCount + 1;

    const errorMessage =
      typeof errorDetails === 'object' && errorDetails !== null && 'message' in errorDetails
        ? String((errorDetails as { message: unknown }).message)
        : 'Job execution failed';

    const errorStack =
      typeof errorDetails === 'object' && errorDetails !== null && 'stack' in errorDetails
        ? String((errorDetails as { stack: unknown }).stack)
        : undefined;

    if (newRetryCount < job.maxRetries) {
      // Automatic retry calculation
      const policy = job.retryPolicy || {
        strategy: 'EXPONENTIAL' as const,
        initialIntervalMs: 1000,
        maxIntervalMs: 3600000,
        backoffFactor: 2.0,
      };

      const delayMs = this.calculateBackoffDelay(
        policy.strategy,
        newRetryCount,
        policy.initialIntervalMs,
        policy.maxIntervalMs,
        policy.backoffFactor
      );

      const nextRunAt = new Date(now.getTime() + delayMs);

      // Re-schedule Job
      const updatedJob = await tx.job.update({
        where: { id: job.id },
        data: {
          status: 'SCHEDULED',
          retryCount: newRetryCount,
          scheduledAt: nextRunAt,
          errorDetails,
          failedAt: now,
        },
      });

      // Update ScheduledJob tracking entity if present or create one
      await tx.scheduledJob.upsert({
        where: { jobId: job.id },
        create: {
          jobId: job.id,
          nextRunAt,
        },
        update: {
          nextRunAt,
        },
      });

      // Log warning
      await tx.jobLog.create({
        data: {
          jobId: job.id,
          level: 'WARN',
          message: `Attempt ${newRetryCount}/${job.maxRetries} failed: ${errorMessage}. Scheduled retry in ${delayMs}ms`,
          metadata: { delayMs, nextRunAt: nextRunAt.toISOString(), durationMs },
        },
      });

      logger.info(`Re-scheduled failed job for retry`, { jobId: job.id, attempt: newRetryCount, delayMs });
      return { retried: true, status: 'SCHEDULED', nextRunAt, updatedJob };
    } else {
      // Retries exhausted -> Move to DEAD_LETTER Queue (DLQ)
      const updatedJob = await tx.job.update({
        where: { id: job.id },
        data: {
          status: 'DEAD_LETTER',
          retryCount: newRetryCount,
          errorDetails,
          failedAt: now,
        },
      });

      // Create DeadLetterQueueEntry
      const dlqEntry = await tx.deadLetterQueueEntry.create({
        data: {
          jobId: job.id,
          reason: errorMessage,
          failedAtAttempts: newRetryCount,
          lastError: errorMessage,
          errorStack,
          status: 'PENDING',
        },
      });

      // Log critical error
      await tx.jobLog.create({
        data: {
          jobId: job.id,
          level: 'ERROR',
          message: `Max retries (${job.maxRetries}) exhausted. Job moved to Dead-Letter Queue (DLQ).`,
          metadata: { durationMs, error: errorDetails, dlqEntryId: dlqEntry.id },
        },
      });

      logger.warn(`Job retries exhausted, moved to DLQ`, { jobId: job.id, dlqEntryId: dlqEntry.id });
      return { retried: false, status: 'DEAD_LETTER', dlqEntry, updatedJob };
    }
  }

  static async createRetryPolicy(input: CreateRetryPolicyInput) {
    const policy = await prisma.retryPolicy.create({
      data: {
        name: input.name,
        strategy: input.strategy,
        maxRetries: input.maxRetries,
        initialIntervalMs: input.initialIntervalMs,
        maxIntervalMs: input.maxIntervalMs,
        backoffFactor: input.backoffFactor,
      },
    });

    logger.info(`Retry policy created`, { policyId: policy.id, name: policy.name });
    return policy;
  }

  static async listRetryPolicies() {
    return prisma.retryPolicy.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  static async listDlq(organizationId: string, projectId: string, query: QueryDlqInput) {
    await ProjectService.getById(organizationId, projectId);

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const whereCondition: Record<string, unknown> = {
      job: {
        projectId,
      },
    };

    if (typeof query.reprocessed === 'boolean') {
      whereCondition.status = query.reprocessed ? 'RETRIED' : 'PENDING';
    }

    const [entries, totalCount] = await Promise.all([
      prisma.deadLetterQueueEntry.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          job: {
            select: { id: true, name: true, type: true, priority: true, payload: true, queueId: true, retryCount: true, maxRetries: true },
          },
        },
      }),
      prisma.deadLetterQueueEntry.count({ where: whereCondition }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return {
      entries,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    };
  }

  static async getDlqById(organizationId: string, dlqId: string) {
    const entry = await prisma.deadLetterQueueEntry.findUnique({
      where: { id: dlqId },
      include: {
        job: {
          include: {
            project: { select: { organizationId: true } },
            queue: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!entry) {
      const err = new Error('DLQ entry not found.');
      (err as unknown as { code: string }).code = 'DLQ_NOT_FOUND';
      throw err;
    }

    if (entry.job.project.organizationId !== organizationId) {
      const err = new Error('Access denied. DLQ entry belongs to another organization.');
      (err as unknown as { code: string }).code = 'CROSS_ORG_ACCESS';
      throw err;
    }

    return entry;
  }

  static async retryDlq(organizationId: string, dlqId: string) {
    const dlqEntry = await this.getDlqById(organizationId, dlqId);

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // 1. Mark DLQ entry as RETRIED
      const updatedDlq = await tx.deadLetterQueueEntry.update({
        where: { id: dlqId },
        data: {
          status: 'RETRIED',
          reviewedAt: now,
        },
      });

      // 2. Reset job state back to QUEUED
      const updatedJob = await tx.job.update({
        where: { id: dlqEntry.jobId },
        data: {
          status: 'QUEUED',
          retryCount: 0,
          scheduledAt: null,
        },
      });

      // 3. Create JobLog
      await tx.jobLog.create({
        data: {
          jobId: dlqEntry.jobId,
          level: 'INFO',
          message: 'Job re-enqueued from Dead-Letter Queue (DLQ)',
          metadata: { dlqId },
        },
      });

      return { dlqEntry: updatedDlq, job: updatedJob };
    });

    logger.info(`DLQ entry re-enqueued for retry`, { dlqId, jobId: dlqEntry.jobId });
    return result;
  }

  static async discardDlq(organizationId: string, dlqId: string) {
    const dlqEntry = await this.getDlqById(organizationId, dlqId);

    await prisma.deadLetterQueueEntry.delete({
      where: { id: dlqId },
    });

    logger.info(`DLQ entry discarded`, { dlqId, jobId: dlqEntry.jobId });
    return { success: true, message: 'DLQ entry discarded successfully.' };
  }
}
