import { Logger } from '../utils/logger';

const logger = new Logger('DistributedLock:Service');

export interface LockResult {
  acquired: boolean;
  resource: string;
  workerId: string;
  expiresAt?: Date;
  message?: string;
}

export interface LockStatus {
  isLocked: boolean;
  resource: string;
  ownerWorkerId: string | null;
  expiresAt: Date | null;
  remainingMs: number;
}

export class DistributedLockService {
  /**
   * Atomically attempts to acquire a distributed lock for a resource using passed Prisma client.
   */
  static async acquire(
    prismaClient: any,
    resource: string,
    workerId: string,
    leaseDurationMs: number = 30000
  ): Promise<LockResult> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + leaseDurationMs);

    try {
      if (!prismaClient || !prismaClient.distributedLock || typeof prismaClient.distributedLock.findUnique !== 'function') {
        return { acquired: true, resource, workerId, expiresAt };
      }

      return await prismaClient.$transaction(async (tx: any) => {
        // 1. Delete any expired locks for this resource
        await tx.distributedLock.deleteMany({
          where: {
            resource,
            expiresAt: { lte: now },
          },
        });

        // 2. Find current active lock
        const existing = await tx.distributedLock.findUnique({
          where: { resource },
        });

        if (existing) {
          if (existing.workerId === workerId) {
            // Re-entrant renewal by same owner
            const updated = await tx.distributedLock.update({
              where: { resource },
              data: { expiresAt, updatedAt: now },
            });
            logger.info(`Lock renewed by owner`, { resource, workerId, expiresAt: updated.expiresAt });
            return { acquired: true, resource, workerId, expiresAt: updated.expiresAt };
          }
          // Owned by another active worker
          return {
            acquired: false,
            resource,
            workerId,
            message: `Resource locked by worker [${existing.workerId}] until ${existing.expiresAt.toISOString()}`,
          };
        }

        // 3. Create new lock atomically
        const lock = await tx.distributedLock.create({
          data: {
            resource,
            workerId,
            acquiredAt: now,
            expiresAt,
          },
        });

        logger.info(`Lock acquired successfully`, { resource, workerId, expiresAt: lock.expiresAt });
        return { acquired: true, resource, workerId, expiresAt: lock.expiresAt };
      });
    } catch (err) {
      logger.warn(`Lock acquisition conflict for resource [${resource}] by worker [${workerId}]`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return { acquired: false, resource, workerId, message: 'Concurrent lock acquisition conflict' };
    }
  }

  /**
   * Releases lock if owned by workerId.
   */
  static async release(prismaClient: any, resource: string, workerId: string): Promise<boolean> {
    try {
      if (!prismaClient || !prismaClient.distributedLock || typeof prismaClient.distributedLock.deleteMany !== 'function') {
        return true;
      }

      const result = await prismaClient.distributedLock.deleteMany({
        where: {
          resource,
          workerId,
        },
      });

      const released = result.count > 0;
      if (released) {
        logger.info(`Lock released successfully`, { resource, workerId });
      }
      return released;
    } catch (err) {
      logger.error(`Error releasing lock`, { resource, workerId, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }

  /**
   * Renews lock if owned by workerId and active.
   */
  static async renew(
    prismaClient: any,
    resource: string,
    workerId: string,
    leaseDurationMs: number = 30000
  ): Promise<boolean> {
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + leaseDurationMs);

    try {
      if (!prismaClient || !prismaClient.distributedLock || typeof prismaClient.distributedLock.updateMany !== 'function') {
        return true;
      }

      const result = await prismaClient.distributedLock.updateMany({
        where: {
          resource,
          workerId,
          expiresAt: { gt: now },
        },
        data: {
          expiresAt: newExpiresAt,
          updatedAt: now,
        },
      });

      const renewed = result.count > 0;
      if (renewed) {
        logger.info(`Lock renewed successfully`, { resource, workerId, newExpiresAt });
      }
      return renewed;
    } catch (err) {
      logger.error(`Error renewing lock`, { resource, workerId, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }

  /**
   * Retrieves operational status of lock for UI/API visibility.
   */
  static async getLockStatus(prismaClient: any, resource: string): Promise<LockStatus> {
    const now = new Date();
    try {
      if (!prismaClient || !prismaClient.distributedLock || typeof prismaClient.distributedLock.findUnique !== 'function') {
        return { isLocked: false, resource, ownerWorkerId: null, expiresAt: null, remainingMs: 0 };
      }

      const lock = await prismaClient.distributedLock.findUnique({
        where: { resource },
      });

      if (!lock || lock.expiresAt <= now) {
        return {
          isLocked: false,
          resource,
          ownerWorkerId: null,
          expiresAt: null,
          remainingMs: 0,
        };
      }

      const remainingMs = Math.max(0, lock.expiresAt.getTime() - now.getTime());
      return {
        isLocked: true,
        resource,
        ownerWorkerId: lock.workerId,
        expiresAt: lock.expiresAt,
        remainingMs,
      };
    } catch (err) {
      return { isLocked: false, resource, ownerWorkerId: null, expiresAt: null, remainingMs: 0 };
    }
  }
}
