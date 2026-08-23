import { prisma } from '../../db/client';
import { CreateQueueInput, UpdateQueueInput, QueryQueueInput } from './queue.schema';
import { ProjectService } from '../projects/project.service';
import { Logger } from '@job-scheduler/shared';

const logger = new Logger('Queue:Service');

export class QueueService {
  static async create(organizationId: string, projectId: string, input: CreateQueueInput) {
    // 1. Verify project exists and belongs to organization
    await ProjectService.getById(organizationId, projectId);

    // 2. Check unique queue name in project
    const existing = await prisma.queue.findUnique({
      where: {
        projectId_name: {
          projectId,
          name: input.name,
        },
      },
    });

    if (existing) {
      const err = new Error(`A queue named '${input.name}' already exists in this project.`);
      (err as unknown as { code: string }).code = 'DUPLICATE_QUEUE';
      throw err;
    }

    const queue = await prisma.queue.create({
      data: {
        name: input.name,
        description: input.description,
        priority: input.priority,
        concurrencyLimit: input.concurrencyLimit,
        rateLimitRpm: input.rateLimitRpm,
        retryPolicyId: input.retryPolicyId,
        projectId,
      },
      include: {
        project: {
          select: { id: true, name: true, slug: true, organizationId: true },
        },
      },
    });

    logger.info(`Queue created successfully`, { queueId: queue.id, projectId, name: queue.name });
    return queue;
  }

  static async list(organizationId: string, projectId: string, query: QueryQueueInput) {
    // Verify project exists and belongs to organization
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

    if (query.priority) {
      whereCondition.priority = query.priority;
    }

    if (query.isPaused !== undefined) {
      whereCondition.isPaused = query.isPaused;
    }

    const [queues, totalCount] = await Promise.all([
      prisma.queue.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              jobs: true,
            },
          },
        },
      }),
      prisma.queue.count({ where: whereCondition }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return {
      queues,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    };
  }

  static async getById(organizationId: string, queueId: string) {
    const queue = await prisma.queue.findUnique({
      where: { id: queueId },
      include: {
        project: {
          select: { id: true, name: true, slug: true, organizationId: true },
        },
        _count: {
          select: {
            jobs: true,
          },
        },
      },
    });

    if (!queue) {
      const err = new Error('Queue not found.');
      (err as unknown as { code: string }).code = 'QUEUE_NOT_FOUND';
      throw err;
    }

    // Cross-organization access prevention
    if (queue.project.organizationId !== organizationId) {
      const err = new Error('Access denied. Queue belongs to a project in another organization.');
      (err as unknown as { code: string }).code = 'CROSS_ORG_ACCESS';
      throw err;
    }

    return queue;
  }

  static async update(organizationId: string, queueId: string, input: UpdateQueueInput) {
    await this.getById(organizationId, queueId);

    const updated = await prisma.queue.update({
      where: { id: queueId },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.priority && { priority: input.priority }),
        ...(input.concurrencyLimit && { concurrencyLimit: input.concurrencyLimit }),
        ...(input.rateLimitRpm && { rateLimitRpm: input.rateLimitRpm }),
        ...(input.retryPolicyId !== undefined && { retryPolicyId: input.retryPolicyId }),
      },
    });

    logger.info(`Queue updated`, { queueId });
    return updated;
  }

  static async delete(organizationId: string, queueId: string) {
    await this.getById(organizationId, queueId);

    await prisma.queue.delete({
      where: { id: queueId },
    });

    logger.info(`Queue deleted`, { queueId });
    return { deleted: true, queueId };
  }

  static async setPaused(organizationId: string, queueId: string, isPaused: boolean) {
    await this.getById(organizationId, queueId);

    const updated = await prisma.queue.update({
      where: { id: queueId },
      data: { isPaused },
    });

    logger.info(`Queue ${isPaused ? 'paused' : 'resumed'}`, { queueId, isPaused });
    return updated;
  }
}
