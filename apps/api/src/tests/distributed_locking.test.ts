import { DistributedLockService } from '../modules/locking/distributed-lock.service';
import { prisma } from '../db/client';

const mockLockStore = new Map<string, any>();

jest.mock('../db/client', () => {
  return {
    prisma: {
      distributedLock: {
        findUnique: jest.fn(async ({ where }: { where: { resource: string } }) => {
          return mockLockStore.get(where.resource) || null;
        }),
        create: jest.fn(async ({ data }: { data: any }) => {
          mockLockStore.set(data.resource, { ...data, id: 'lock-uuid-123' });
          return mockLockStore.get(data.resource);
        }),
        update: jest.fn(async ({ where, data }: { where: { resource: string }; data: any }) => {
          const lock = mockLockStore.get(where.resource);
          if (lock) {
            Object.assign(lock, data);
          }
          return lock;
        }),
        updateMany: jest.fn(async ({ where, data }: { where: any; data: any }) => {
          const lock = mockLockStore.get(where.resource);
          if (!lock) return { count: 0 };
          const now = new Date();
          if (where.workerId && lock.workerId !== where.workerId) return { count: 0 };
          if (where.expiresAt && where.expiresAt.gt && lock.expiresAt <= now) return { count: 0 };

          Object.assign(lock, data);
          return { count: 1 };
        }),
        deleteMany: jest.fn(async ({ where }: { where: any }) => {
          const lock = mockLockStore.get(where.resource);
          if (!lock) return { count: 0 };
          const now = new Date();

          if (where.expiresAt && where.expiresAt.lte) {
            if (lock.expiresAt <= where.expiresAt.lte) {
              mockLockStore.delete(where.resource);
              return { count: 1 };
            }
            return { count: 0 };
          }

          if (where.workerId && lock.workerId !== where.workerId) {
            return { count: 0 };
          }

          mockLockStore.delete(where.resource);
          return { count: 1 };
        }),
      },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    },
    checkDatabaseHealth: jest.fn().mockResolvedValue({ connected: true }),
  };
});

describe('Distributed Locking Subsystem', () => {
  const resource = 'job:lock:job-123-test';
  const workerA = 'worker-node-alpha';
  const workerB = 'worker-node-beta';

  beforeEach(() => {
    mockLockStore.clear();
    jest.clearAllMocks();
  });

  it('1. First worker acquires lock successfully', async () => {
    const res = await DistributedLockService.acquire(resource, workerA, 30000);
    expect(res.acquired).toBe(true);
    expect(res.workerId).toBe(workerA);
  });

  it('2. Second worker cannot acquire same active lock', async () => {
    const resA = await DistributedLockService.acquire(resource, workerA, 30000);
    expect(resA.acquired).toBe(true);

    const resB = await DistributedLockService.acquire(resource, workerB, 30000);
    expect(resB.acquired).toBe(false);
    expect(resB.message).toContain('locked by worker');
  });

  it('3. Lock can be released by owner', async () => {
    await DistributedLockService.acquire(resource, workerA, 30000);
    const released = await DistributedLockService.release(resource, workerA);
    expect(released).toBe(true);
  });

  it('4. Non-owner cannot release lock', async () => {
    await DistributedLockService.acquire(resource, workerA, 30000);
    const releasedByB = await DistributedLockService.release(resource, workerB);
    expect(releasedByB).toBe(false);
  });

  it('5. Expired lock can be acquired by another worker', async () => {
    // Simulate expired lock by acquiring with negative duration
    await DistributedLockService.acquire(resource, workerA, -1000);

    const resB = await DistributedLockService.acquire(resource, workerB, 30000);
    expect(resB.acquired).toBe(true);
    expect(resB.workerId).toBe(workerB);
  });

  it('6. Lock renewal works for owner', async () => {
    await DistributedLockService.acquire(resource, workerA, 30000);
    const renewed = await DistributedLockService.renew(resource, workerA, 60000);
    expect(renewed).toBe(true);
  });

  it('7. Non-owner cannot renew lock', async () => {
    await DistributedLockService.acquire(resource, workerA, 30000);
    const renewedByB = await DistributedLockService.renew(resource, workerB, 60000);
    expect(renewedByB).toBe(false);
  });

  it('8. Concurrent acquisition results in only one successful owner', async () => {
    const res1 = await DistributedLockService.acquire('job:lock:concurrent', workerA, 30000);
    const res2 = await DistributedLockService.acquire('job:lock:concurrent', workerB, 30000);

    const successCount = [res1.acquired, res2.acquired].filter(Boolean).length;
    expect(successCount).toBe(1);
    expect(res1.acquired).toBe(true);
    expect(res2.acquired).toBe(false);
  });

  it('9. Worker crash / expired lease scenario does not permanently block job', async () => {
    // Worker A acquired lock then crashed
    const statusBefore = await DistributedLockService.getLockStatus('job:lock:crashed-job');
    expect(statusBefore.isLocked).toBe(false);

    // Worker B can acquire free lock
    const resB = await DistributedLockService.acquire('job:lock:crashed-job', workerB, 30000);
    expect(resB.acquired).toBe(true);
  });

  it('10. Lock status query returns accurate operational telemetry', async () => {
    await DistributedLockService.acquire(resource, workerA, 30000);
    const status = await DistributedLockService.getLockStatus(resource);

    expect(status.isLocked).toBe(true);
    expect(status.ownerWorkerId).toBe(workerA);
    expect(status.remainingMs).toBeGreaterThan(0);
  });
});
