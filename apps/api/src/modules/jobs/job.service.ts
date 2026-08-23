import { prisma } from '../../db/client';
import { CreateJobInput, QueryJobInput } from './job.schema';
import { QueueService } from '../queues/queue.service';
import { ProjectService } from '../projects/project.service';
import { Logger } from '@job-scheduler/shared';
import { Prisma } from '@prisma/client';

const logger = new Logger('Job:Service');

export class JobService {
  static async validateDependenciesAndCycles(projectId: string, targetJobId: string | null, dependsOnJobIds: string[]) {
    if (!dependsOnJobIds || dependsOnJobIds.length === 0) return;

    const uniqueParents = Array.from(new Set(dependsOnJobIds));

    // 1. Verify all parent jobs exist within the indicated project
    const parents = await prisma.job.findMany({
      where: {
        id: { in: uniqueParents },
        projectId,
      },
      select: { id: true, status: true },
    });

    if (parents.length !== uniqueParents.length) {
      const err = new Error('One or more specified parent dependencies do not exist in this project.');
      (err as unknown as { code: string }).code = 'INVALID_DEPENDENCY';
      throw err;
    }

    // 2. Cycle Detection via Graph Traversal
    for (const parentId of uniqueParents) {
      if (targetJobId && parentId === targetJobId) {
        const err = new Error('A job cannot depend on itself.');
        (err as unknown as { code: string }).code = 'CIRCULAR_DEPENDENCY';
        throw err;
      }

      const visited = new Set<string>();
      const queue = [parentId];

      while (queue.length > 0) {
        const currentId = queue.pop()!;
        if (targetJobId && currentId === targetJobId) {
          const err = new Error('Circular dependency detected in job workflow graph.');
          (err as unknown as { code: string }).code = 'CIRCULAR_DEPENDENCY';
          throw err;
        }

        if (!visited.has(currentId)) {
          visited.add(currentId);
          const ancestors = await prisma.jobDependency.findMany({
            where: { jobId: currentId },
            select: { dependsOnJobId: true },
          });

          for (const anc of ancestors) {
            if (targetJobId && anc.dependsOnJobId === targetJobId) {
              const err = new Error('Circular dependency detected in job workflow graph.');
              (err as unknown as { code: string }).code = 'CIRCULAR_DEPENDENCY';
              throw err;
            }
            queue.push(anc.dependsOnJobId);
          }
        }
      }
    }
  }

  static async create(organizationId: string, projectId: string, queueId: string, createdById: string, input: CreateJobInput) {
    // 1. Verify queue and project ownership
    const queue = await QueueService.getById(organizationId, queueId);
    if (queue.projectId !== projectId) {
      const err = new Error('Specified queue does not belong to the indicated project.');
      (err as unknown as { code: string }).code = 'INVALID_QUEUE_PROJECT';
      throw err;
    }

    // 2. Validate DAG dependencies and circular references
    if (input.dependsOnJobIds && input.dependsOnJobIds.length > 0) {
      await this.validateDependenciesAndCycles(projectId, null, input.dependsOnJobIds);
    }

    // 3. Compute scheduledAt and initial status
    let scheduledAtDate: Date | null = null;
    let computedType = input.type;

    if (input.scheduledAt) {
      scheduledAtDate = new Date(input.scheduledAt);
      if (computedType === 'IMMEDIATE') {
        computedType = 'SCHEDULED';
      }
    } else if (input.delaySeconds && input.delaySeconds > 0) {
      scheduledAtDate = new Date(Date.now() + input.delaySeconds * 1000);
      if (computedType === 'IMMEDIATE') {
        computedType = 'DELAYED';
      }
    }

    const isFutureScheduled = scheduledAtDate !== null && scheduledAtDate.getTime() > Date.now();
    let initialStatus: 'QUEUED' | 'SCHEDULED' | 'BLOCKED' = isFutureScheduled ? 'SCHEDULED' : 'QUEUED';

    // If job has parent dependencies that are not COMPLETED, initial status is BLOCKED
    if (input.dependsOnJobIds && input.dependsOnJobIds.length > 0) {
      const parentStatuses = await prisma.job.findMany({
        where: { id: { in: input.dependsOnJobIds } },
        select: { status: true },
      });
      const allParentsCompleted = parentStatuses.every((p) => p.status === 'COMPLETED');
      if (!allParentsCompleted) {
        initialStatus = 'BLOCKED';
      }
    }

    // 4. Create Job record in PostgreSQL
    const job = await prisma.job.create({
      data: {
        name: input.name,
        type: computedType,
        status: initialStatus,
        priority: input.priority,
        payload: (input.payload || {}) as Prisma.InputJsonValue,
        maxRetries: input.maxRetries,
        scheduledAt: scheduledAtDate,
        projectId,
        queueId,
        createdById,
        retryPolicyId: input.retryPolicyId || queue.retryPolicyId,
      },
      include: {
        queue: {
          select: { id: true, name: true, priority: true, isPaused: true },
        },
        project: {
          select: { id: true, name: true, slug: true, organizationId: true },
        },
      },
    });

    // Insert DAG dependency edges if provided
    if (input.dependsOnJobIds && input.dependsOnJobIds.length > 0) {
      await prisma.jobDependency.createMany({
        data: input.dependsOnJobIds.map((parentJobId) => ({
          jobId: job.id,
          dependsOnJobId: parentJobId,
        })),
      });
    }

    // If delayed or scheduled, create ScheduledJob entity
    if (scheduledAtDate && (computedType === 'DELAYED' || computedType === 'SCHEDULED')) {
      await prisma.scheduledJob.create({
        data: {
          jobId: job.id,
          nextRunAt: scheduledAtDate,
        },
      });
    }

    // Publish lifecycle events
    const { EventService } = await import('../events/event.service');
    await EventService.publish({
      eventType: 'JOB_CREATED',
      jobId: job.id,
      queueId,
      projectId,
      payload: (input.payload || {}) as Record<string, unknown>,
    });

    if (initialStatus === 'QUEUED') {
      await EventService.publish({
        eventType: 'JOB_QUEUED',
        jobId: job.id,
        queueId,
        projectId,
        payload: (input.payload || {}) as Record<string, unknown>,
      });
    } else if (initialStatus === 'SCHEDULED') {
      await EventService.publish({
        eventType: 'JOB_SCHEDULED',
        jobId: job.id,
        queueId,
        projectId,
        payload: (input.payload || {}) as Record<string, unknown>,
        availableAt: scheduledAtDate || undefined,
      });
    }

    logger.info(`Job created successfully`, { jobId: job.id, type: computedType, status: initialStatus, dependencies: input.dependsOnJobIds?.length || 0 });
    return job;
  }

  static async listByProject(organizationId: string, projectId: string, query: QueryJobInput) {
    await ProjectService.getById(organizationId, projectId);

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const whereCondition: Record<string, unknown> = {
      projectId,
    };

    if (query.search) {
      whereCondition.name = { contains: query.search, mode: 'insensitive' };
    }
    if (query.status) {
      whereCondition.status = query.status;
    }
    if (query.type) {
      whereCondition.type = query.type;
    }

    const [jobs, totalCount] = await Promise.all([
      prisma.job.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          queue: {
            select: { id: true, name: true },
          },
          dependencies: {
            select: {
              dependsOnJob: {
                select: { id: true, name: true, status: true },
              },
            },
          },
        },
      }),
      prisma.job.count({ where: whereCondition }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return {
      jobs,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    };
  }

  static async listByQueue(organizationId: string, queueId: string, query: QueryJobInput) {
    const queue = await QueueService.getById(organizationId, queueId);

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const whereCondition: Record<string, unknown> = {
      queueId,
    };

    if (query.search) {
      whereCondition.name = { contains: query.search, mode: 'insensitive' };
    }
    if (query.status) {
      whereCondition.status = query.status;
    }
    if (query.type) {
      whereCondition.type = query.type;
    }

    const [jobs, totalCount] = await Promise.all([
      prisma.job.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.job.count({ where: whereCondition }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return {
      queueName: queue.name,
      jobs,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    };
  }

  static async getById(organizationId: string, jobId: string) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        queue: {
          select: { id: true, name: true, priority: true, isPaused: true },
        },
        project: {
          select: { id: true, name: true, slug: true, organizationId: true },
        },
        assignedWorker: {
          select: { id: true, name: true, hostname: true, status: true },
        },
        scheduledJob: true,
        executions: {
          orderBy: { attempt: 'asc' },
        },
        dependencies: {
          include: {
            dependsOnJob: {
              select: { id: true, name: true, status: true, type: true },
            },
          },
        },
        dependents: {
          include: {
            job: {
              select: { id: true, name: true, status: true, type: true },
            },
          },
        },
        dlqEntry: true,
      },
    });

    if (!job) {
      const err = new Error('Job not found.');
      (err as unknown as { code: string }).code = 'JOB_NOT_FOUND';
      throw err;
    }

    // Cross-organization access guard
    if (job.project.organizationId !== organizationId) {
      const err = new Error('Access denied. Job belongs to another organization.');
      (err as unknown as { code: string }).code = 'CROSS_ORG_ACCESS';
      throw err;
    }

    return job;
  }

  static async getJobDag(organizationId: string, projectId: string, jobId: string) {
    const job = await this.getById(organizationId, jobId);

    const parents = job.dependencies.map((d) => d.dependsOnJob);
    const children = job.dependents.map((d) => d.job);

    return {
      job: {
        id: job.id,
        name: job.name,
        status: job.status,
        type: job.type,
      },
      parents,
      children,
    };
  }

  static async getJobExecutions(organizationId: string, projectId: string, jobId: string) {
    const job = await this.getById(organizationId, jobId);
    return {
      jobId: job.id,
      jobName: job.name,
      retryCount: job.retryCount,
      maxRetries: job.maxRetries,
      status: job.status,
      executions: job.executions,
    };
  }

  static async replayJob(organizationId: string, projectId: string, jobId: string) {
    const job = await this.getById(organizationId, jobId);

    // 1. Reset job state to QUEUED
    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'QUEUED',
        retryCount: 0,
        scheduledAt: null,
        errorDetails: Prisma.DbNull,
        assignedWorkerId: null,
        claimedAt: null,
        startedAt: null,
        completedAt: null,
        failedAt: null,
      },
    });

    // 2. Delete DLQ entry if present
    await prisma.deadLetterQueueEntry.deleteMany({
      where: { jobId },
    });

    // 3. Create log entry
    await prisma.jobLog.create({
      data: {
        jobId,
        level: 'INFO',
        message: 'Job replayed manually via Failure Intelligence engine.',
      },
    });

    logger.info(`Job replayed manually`, { jobId });
    return updatedJob;
  }

  static async cancel(organizationId: string, jobId: string) {
    const job = await this.getById(organizationId, jobId);

    if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED' || job.status === 'DEAD_LETTER') {
      const err = new Error(`Cannot cancel job currently in terminal status '${job.status}'.`);
      (err as unknown as { code: string }).code = 'INVALID_JOB_STATE';
      throw err;
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'CANCELLED',
      },
    });

    const { EventService } = await import('../events/event.service');
    await EventService.publish({
      eventType: 'JOB_CANCELLED',
      jobId: job.id,
      queueId: job.queueId,
      projectId: job.projectId,
    });

    logger.info(`Job cancelled successfully`, { jobId });
    return updated;
  }
}
