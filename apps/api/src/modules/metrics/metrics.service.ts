import { prisma, checkDatabaseHealth } from '../../db/client';
import { ProjectService } from '../projects/project.service';
import { Logger } from '@job-scheduler/shared';

const logger = new Logger('Metrics:Service');

export class MetricsService {
  static async getProjectOverview(organizationId: string, projectId: string) {
    await ProjectService.getById(organizationId, projectId);

    const [
      queuedCount,
      runningCount,
      completedCount,
      failedCount,
      scheduledCount,
      deadLetterCount,
      cancelledCount,
      totalQueues,
      pausedQueues,
      workers,
      pendingDlqCount,
      executionStats,
    ] = await Promise.all([
      prisma.job.count({ where: { projectId, status: 'QUEUED' } }),
      prisma.job.count({ where: { projectId, status: 'RUNNING' } }),
      prisma.job.count({ where: { projectId, status: 'COMPLETED' } }),
      prisma.job.count({ where: { projectId, status: 'FAILED' } }),
      prisma.job.count({ where: { projectId, status: 'SCHEDULED' } }),
      prisma.job.count({ where: { projectId, status: 'DEAD_LETTER' } }),
      prisma.job.count({ where: { projectId, status: 'CANCELLED' } }),
      prisma.queue.count({ where: { projectId } }),
      prisma.queue.count({ where: { projectId, isPaused: true } }),
      prisma.worker.findMany({ where: { projectId } }),
      prisma.deadLetterQueueEntry.count({
        where: { job: { projectId }, status: 'PENDING' },
      }),
      prisma.jobExecution.aggregate({
        where: { job: { projectId } },
        _avg: { durationMs: true },
        _count: { id: true },
      }),
    ]);

    const totalJobs = queuedCount + runningCount + completedCount + failedCount + scheduledCount + deadLetterCount + cancelledCount;
    const activeQueues = totalQueues - pausedQueues;

    const workerCounts = {
      total: workers.length,
      online: workers.filter((w) => w.status === 'ONLINE').length,
      busy: workers.filter((w) => w.status === 'BUSY').length,
      draining: workers.filter((w) => w.status === 'DRAINING').length,
      dead: workers.filter((w) => w.status === 'DEAD').length,
      offline: workers.filter((w) => w.status === 'OFFLINE').length,
      totalCapacity: workers.reduce((acc, w) => acc + w.maxConcurrency, 0),
      currentActiveConcurrency: workers.reduce((acc, w) => acc + w.currentConcurrency, 0),
    };

    const finishedExecutions = completedCount + failedCount;
    const successRate = finishedExecutions > 0 ? Number(((completedCount / finishedExecutions) * 100).toFixed(2)) : 100;

    return {
      jobs: {
        queued: queuedCount,
        running: runningCount,
        completed: completedCount,
        failed: failedCount,
        scheduled: scheduledCount,
        deadLetter: deadLetterCount,
        cancelled: cancelledCount,
        total: totalJobs,
      },
      queues: {
        total: totalQueues,
        active: activeQueues,
        paused: pausedQueues,
      },
      workers: workerCounts,
      dlq: {
        pending: pendingDlqCount,
      },
      executionMetrics: {
        totalExecutions: executionStats._count.id || 0,
        avgDurationMs: Math.round(executionStats._avg.durationMs || 0),
        successRatePercentage: successRate,
      },
    };
  }

  static async getSystemHealthReport() {
    const dbHealth = await checkDatabaseHealth();

    const [activeWorkerCount, totalPendingDlq] = await Promise.all([
      prisma.worker.count({ where: { status: { in: ['ONLINE', 'BUSY'] } } }),
      prisma.deadLetterQueueEntry.count({ where: { status: 'PENDING' } }),
    ]);

    const status = !dbHealth.connected
      ? 'unhealthy'
      : totalPendingDlq > 100
      ? 'degraded'
      : 'healthy';

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbHealth,
      workers: {
        activeWorkers: activeWorkerCount,
      },
      dlq: {
        pendingEntries: totalPendingDlq,
      },
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
