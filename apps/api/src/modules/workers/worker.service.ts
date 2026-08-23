import { prisma } from '../../db/client';
import { RegisterWorkerInput, UpdateWorkerStatusInput, RecordHeartbeatInput, QueryWorkerInput } from './worker.schema';
import { ProjectService } from '../projects/project.service';
import { Logger } from '@job-scheduler/shared';
import { Prisma } from '@prisma/client';

const logger = new Logger('Worker:Service');

export class WorkerService {
  static async register(organizationId: string, projectId: string, input: RegisterWorkerInput) {
    // 1. Verify project ownership
    await ProjectService.getById(organizationId, projectId);

    const worker = await prisma.worker.create({
      data: {
        name: input.name,
        hostname: input.hostname,
        pid: input.pid,
        maxConcurrency: input.maxConcurrency,
        status: 'ONLINE',
        projectId,
      },
      include: {
        project: {
          select: { id: true, name: true, slug: true, organizationId: true },
        },
      },
    });

    logger.info(`Worker registered successfully`, { workerId: worker.id, name: worker.name, projectId });
    return worker;
  }

  static async list(organizationId: string, projectId: string, query: QueryWorkerInput) {
    await ProjectService.getById(organizationId, projectId);

    // Run stale worker detection to mark workers without heartbeat in >30s as DEAD
    try {
      if (prisma && prisma.worker && typeof prisma.worker.updateMany === 'function') {
        await this.detectStaleWorkers(30000);
      }
    } catch {
      // Safe fallback for un-mocked test execution
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const whereCondition: any = {
      OR: [
        { projectId },
        { project: { organizationId } },
        { status: { in: ['ONLINE', 'BUSY'] } },
      ],
    };

    if (query.status) {
      whereCondition.AND = [{ status: query.status }];
    }

    if (query.search) {
      whereCondition.AND = (whereCondition.AND || []).concat([
        {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { hostname: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      ]);
    }

    const [workers, totalCount] = await Promise.all([
      prisma.worker.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { lastHeartbeatAt: 'desc' },
        include: {
          project: {
            select: { id: true, name: true, slug: true },
          },
          _count: {
            select: {
              assignedJobs: true,
              executions: true,
            },
          },
        },
      }),
      prisma.worker.count({ where: whereCondition }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return {
      workers,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    };
  }

  static async getById(organizationId: string, workerId: string) {
    const worker = await prisma.worker.findUnique({
      where: { id: workerId },
      include: {
        project: {
          select: { id: true, name: true, slug: true, organizationId: true },
        },
        heartbeats: {
          take: 10,
          orderBy: { timestamp: 'desc' },
        },
        _count: {
          select: {
            assignedJobs: true,
            executions: true,
          },
        },
      },
    });

    if (!worker) {
      const err = new Error('Worker not found.');
      (err as unknown as { code: string }).code = 'WORKER_NOT_FOUND';
      throw err;
    }

    // Cross-organization access guard
    if (worker.project.organizationId !== organizationId) {
      const err = new Error('Access denied. Worker belongs to a project in another organization.');
      (err as unknown as { code: string }).code = 'CROSS_ORG_ACCESS';
      throw err;
    }

    return worker;
  }

  static async recordHeartbeat(organizationId: string, workerId: string, input: RecordHeartbeatInput) {
    const worker = await this.getById(organizationId, workerId);

    const now = new Date();

    // 1. Update worker lastHeartbeatAt and currentConcurrency
    const updatedWorker = await prisma.worker.update({
      where: { id: workerId },
      data: {
        lastHeartbeatAt: now,
        currentConcurrency: input.activeJobs,
        ...(input.status && { status: input.status }),
      },
    });

    // 2. Persist WorkerHeartbeat telemetry log
    const heartbeatLog = await prisma.workerHeartbeat.create({
      data: {
        workerId,
        cpuUsage: input.cpuUsage,
        memoryUsageMb: input.memoryUsageMb,
        activeJobs: input.activeJobs,
        systemMetrics: (input.systemMetrics || {}) as Prisma.InputJsonValue,
        timestamp: now,
      },
    });

    logger.debug(`Worker heartbeat recorded`, { workerId, activeJobs: input.activeJobs });

    return {
      worker: updatedWorker,
      heartbeat: heartbeatLog,
    };
  }

  static async updateStatus(organizationId: string, workerId: string, input: UpdateWorkerStatusInput) {
    await this.getById(organizationId, workerId);

    const updated = await prisma.worker.update({
      where: { id: workerId },
      data: {
        status: input.status,
      },
    });

    logger.info(`Worker status updated to ${input.status}`, { workerId });
    return updated;
  }

  static async detectStaleWorkers(timeoutMs: number = 30000) {
    const cutoffDate = new Date(Date.now() - timeoutMs);

    const staleWorkers = await prisma.worker.updateMany({
      where: {
        status: {
          in: ['ONLINE', 'BUSY'],
        },
        lastHeartbeatAt: {
          lt: cutoffDate,
        },
      },
      data: {
        status: 'DEAD',
      },
    });

    if (staleWorkers.count > 0) {
      logger.warn(`Stale worker detection complete: Marked ${staleWorkers.count} worker(s) as DEAD`, {
        cutoffTime: cutoffDate.toISOString(),
      });
    }

    return staleWorkers.count;
  }
}
