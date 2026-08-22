import { prisma } from '../../db/client';
import { CreateScheduleInput, QueryScheduleInput } from './schedule.schema';
import { QueueService } from '../queues/queue.service';
import { ProjectService } from '../projects/project.service';
import { CronUtils } from './cron.utils';
import { Logger } from '@job-scheduler/shared';
import { Prisma } from '@prisma/client';

const logger = new Logger('Schedule:Service');

export class ScheduleService {
  static async createSchedule(organizationId: string, projectId: string, queueId: string, createdById: string, input: CreateScheduleInput) {
    const queue = await QueueService.getById(organizationId, queueId);
    if (queue.projectId !== projectId) {
      const err = new Error('Specified queue does not belong to indicated project.');
      (err as unknown as { code: string }).code = 'INVALID_QUEUE_PROJECT';
      throw err;
    }

    const now = new Date();
    const nextRunAt = CronUtils.getNextRunAt(input.cronExpression, now, input.timezone);

    const payloadJson = (input.payload || {}) as Prisma.InputJsonValue;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create base RECURRING Job record
      const job = await tx.job.create({
        data: {
          name: input.name,
          type: 'RECURRING',
          status: 'SCHEDULED',
          priority: input.priority,
          payload: payloadJson,
          maxRetries: input.maxRetries,
          scheduledAt: nextRunAt,
          projectId,
          queueId,
          createdById,
          retryPolicyId: input.retryPolicyId || queue.retryPolicyId,
        },
      });

      // 2. Create ScheduledJob tracking entity
      const scheduledJob = await tx.scheduledJob.create({
        data: {
          jobId: job.id,
          cronExpression: input.cronExpression,
          timezone: input.timezone,
          nextRunAt,
          isRecurring: true,
          totalRuns: 0,
        },
      });

      // 3. Create JobLog
      await tx.jobLog.create({
        data: {
          jobId: job.id,
          level: 'INFO',
          message: `Recurring schedule created with cron "${input.cronExpression}". First run scheduled for ${nextRunAt.toISOString()}`,
        },
      });

      return { job, scheduledJob };
    });

    logger.info(`Recurring schedule created`, { jobId: result.job.id, cron: input.cronExpression, nextRunAt });
    return result;
  }

  static async listByProject(organizationId: string, projectId: string, query: QueryScheduleInput) {
    await ProjectService.getById(organizationId, projectId);

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const whereCondition: Record<string, unknown> = {
      projectId,
      type: 'RECURRING',
    };

    if (query.search) {
      whereCondition.name = { contains: query.search, mode: 'insensitive' };
    }

    const [schedules, totalCount] = await Promise.all([
      prisma.job.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          queue: { select: { id: true, name: true } },
          scheduledJob: true,
        },
      }),
      prisma.job.count({ where: whereCondition }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return {
      schedules,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    };
  }

  static async getById(organizationId: string, scheduleId: string) {
    const job = await prisma.job.findUnique({
      where: { id: scheduleId },
      include: {
        project: { select: { organizationId: true } },
        queue: { select: { id: true, name: true } },
        scheduledJob: true,
      },
    });

    if (!job || job.type !== 'RECURRING') {
      const err = new Error('Recurring schedule not found.');
      (err as unknown as { code: string }).code = 'SCHEDULE_NOT_FOUND';
      throw err;
    }

    if (job.project.organizationId !== organizationId) {
      const err = new Error('Access denied. Schedule belongs to another organization.');
      (err as unknown as { code: string }).code = 'CROSS_ORG_ACCESS';
      throw err;
    }

    return job;
  }

  static async pauseSchedule(organizationId: string, scheduleId: string) {
    const schedule = await this.getById(organizationId, scheduleId);

    const updated = await prisma.job.update({
      where: { id: schedule.id },
      data: {
        status: 'CANCELLED',
      },
    });

    logger.info(`Paused recurring schedule`, { scheduleId });
    return updated;
  }

  static async resumeSchedule(organizationId: string, scheduleId: string) {
    const schedule = await this.getById(organizationId, scheduleId);

    const now = new Date();
    const cron = schedule.scheduledJob?.cronExpression || '0 * * * *';
    const tz = schedule.scheduledJob?.timezone || 'UTC';
    const nextRunAt = CronUtils.getNextRunAt(cron, now, tz);

    const result = await prisma.$transaction(async (tx) => {
      const updatedJob = await tx.job.update({
        where: { id: scheduleId },
        data: {
          status: 'SCHEDULED',
          scheduledAt: nextRunAt,
        },
      });

      if (schedule.scheduledJob) {
        await tx.scheduledJob.update({
          where: { jobId: scheduleId },
          data: {
            nextRunAt,
          },
        });
      }

      return updatedJob;
    });

    logger.info(`Resumed recurring schedule`, { scheduleId, nextRunAt });
    return result;
  }

  static async deleteSchedule(organizationId: string, scheduleId: string) {
    await this.getById(organizationId, scheduleId);

    await prisma.job.delete({
      where: { id: scheduleId },
    });

    logger.info(`Deleted recurring schedule`, { scheduleId });
    return { success: true, message: 'Recurring schedule deleted successfully.' };
  }

  static async handleRecurringJobCompletion(tx: Prisma.TransactionClient, jobId: string) {
    const job = await tx.job.findUnique({
      where: { id: jobId },
      include: { scheduledJob: true },
    });

    if (!job || job.type !== 'RECURRING' || !job.scheduledJob) {
      return null;
    }

    const now = new Date();
    const cron = job.scheduledJob.cronExpression || '0 * * * *';
    const tz = job.scheduledJob.timezone || 'UTC';
    const newNextRunAt = CronUtils.getNextRunAt(cron, now, tz);

    // 1. Update ScheduledJob entity
    await tx.scheduledJob.update({
      where: { jobId },
      data: {
        lastRunAt: now,
        nextRunAt: newNextRunAt,
        totalRuns: { increment: 1 },
      },
    });

    // 2. Re-schedule Job for next run cycle
    const rescheduledJob = await tx.job.update({
      where: { id: jobId },
      data: {
        status: 'SCHEDULED',
        scheduledAt: newNextRunAt,
        retryCount: 0,
      },
    });

    // 3. Create JobLog
    await tx.jobLog.create({
      data: {
        jobId,
        level: 'INFO',
        message: `Recurring run completed. Re-scheduled next execution for ${newNextRunAt.toISOString()}`,
      },
    });

    logger.info(`Re-scheduled recurring job for next run cycle`, { jobId, newNextRunAt });
    return rescheduledJob;
  }
}
