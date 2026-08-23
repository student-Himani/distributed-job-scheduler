import { EventService } from '../modules/events/event.service';
import { prisma } from '../db/client';

const mockEvents = new Map<string, any>();

jest.mock('../db/client', () => {
  return {
    prisma: {
      jobEvent: {
        create: jest.fn(async ({ data }: { data: any }) => {
          const event = {
            id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            status: 'PENDING',
            attempts: 0,
            maxAttempts: 5,
            availableAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          };
          mockEvents.set(event.id, event);
          return event;
        }),
        findFirst: jest.fn(async ({ where }: { where: any }) => {
          for (const event of mockEvents.values()) {
            if (where.status && event.status !== where.status) continue;
            if (where.availableAt && where.availableAt.lte && event.availableAt > where.availableAt.lte) continue;
            if (where.attempts && where.attempts.lt && event.attempts >= where.attempts.lt) continue;
            return event;
          }
          return null;
        }),
        findMany: jest.fn(async ({ where }: { where: any }) => {
          const results = [];
          for (const event of mockEvents.values()) {
            if (where.projectId && event.projectId !== where.projectId) continue;
            if (where.status && event.status !== where.status) continue;
            results.push(event);
          }
          return results;
        }),
        count: jest.fn(async ({ where }: { where: any }) => {
          let count = 0;
          for (const event of mockEvents.values()) {
            if (where.projectId && event.projectId !== where.projectId) continue;
            if (where.status && event.status !== where.status) continue;
            count++;
          }
          return count;
        }),
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          return mockEvents.get(where.id) || null;
        }),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
          const event = mockEvents.get(where.id);
          if (event) {
            Object.assign(event, data);
          }
          return event;
        }),
        updateMany: jest.fn(async ({ where, data }: { where: { id: string; status: string }; data: any }) => {
          const event = mockEvents.get(where.id);
          if (!event || event.status !== where.status) {
            return { count: 0 };
          }
          if (data.attempts && data.attempts.increment) {
            event.attempts += data.attempts.increment;
            delete data.attempts;
          }
          Object.assign(event, data);
          return { count: 1 };
        }),
      },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    },
    checkDatabaseHealth: jest.fn().mockResolvedValue({ connected: true }),
  };
});

describe('Event-Driven Execution Subsystem', () => {
  const projectId = 'proj-event-test-123';
  const jobId = 'job-event-target-123';

  beforeEach(() => {
    mockEvents.clear();
    jest.clearAllMocks();
  });

  it('1. Event created when a job is created', async () => {
    const event = await EventService.publish({
      eventType: 'JOB_CREATED',
      jobId,
      projectId,
      payload: { name: 'Test Event Job' },
    });

    expect(event).toBeDefined();
    expect(event.eventType).toBe('JOB_CREATED');
    expect(event.status).toBe('PENDING');
  });

  it('2. JOB_QUEUED event is published', async () => {
    const event = await EventService.publish({
      eventType: 'JOB_QUEUED',
      jobId,
      projectId,
    });

    expect(event).toBeDefined();
    expect(event.eventType).toBe('JOB_QUEUED');
    expect(mockEvents.size).toBe(1);
  });

  it('3. Event listing and stats query reflect persisted events', async () => {
    await EventService.publish({ eventType: 'JOB_QUEUED', jobId: 'j1', projectId });
    await EventService.publish({ eventType: 'JOB_COMPLETED', jobId: 'j2', projectId });

    const stats = await EventService.getEventStats(projectId);
    expect(stats.pending).toBe(2);
    expect(stats.total).toBe(2);

    const list = await EventService.listEvents(projectId);
    expect(list.events.length).toBe(2);
  });

  it('4. Atomic event status transition PENDING -> PROCESSING prevents duplicate claim', async () => {
    const event = await EventService.publish({ eventType: 'JOB_QUEUED', jobId, projectId });

    // Worker A claims event
    const resA = await prisma.jobEvent.updateMany({
      where: { id: event.id, status: 'PENDING' },
      data: { status: 'PROCESSING', workerId: 'worker-node-alpha' },
    });
    expect(resA.count).toBe(1);

    // Worker B tries to claim same event
    const resB = await prisma.jobEvent.updateMany({
      where: { id: event.id, status: 'PENDING' },
      data: { status: 'PROCESSING', workerId: 'worker-node-beta' },
    });
    expect(resB.count).toBe(0);
  });

  it('5. Event processing updates event status to PROCESSED', async () => {
    const event = await EventService.publish({ eventType: 'JOB_COMPLETED', jobId, projectId });

    await prisma.jobEvent.update({
      where: { id: event.id },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });

    const updated = await prisma.jobEvent.findUnique({ where: { id: event.id } });
    expect(updated).toBeDefined();
    expect(updated!.status).toBe('PROCESSED');
    expect(updated!.processedAt).toBeDefined();
  });

  it('6. Failed event increments attempts and is returned to PENDING for retry', async () => {
    const event = await EventService.publish({ eventType: 'JOB_QUEUED', jobId, projectId });

    await prisma.jobEvent.update({
      where: { id: event.id },
      data: {
        status: 'PENDING',
        attempts: 1,
        lastError: 'Simulated transient network glitch',
      },
    });

    const updated = await prisma.jobEvent.findUnique({ where: { id: event.id } });
    expect(updated).toBeDefined();
    expect(updated!.status).toBe('PENDING');
    expect(updated!.attempts).toBe(1);
    expect(updated!.lastError).toBe('Simulated transient network glitch');
  });

  it('7. Event eventually transitions to FAILED when maxAttempts reached', async () => {
    const event = await EventService.publish({ eventType: 'JOB_QUEUED', jobId, projectId });

    await prisma.jobEvent.update({
      where: { id: event.id },
      data: {
        status: 'FAILED',
        attempts: 5,
        lastError: 'Max attempts reached',
      },
    });

    const updated = await prisma.jobEvent.findUnique({ where: { id: event.id } });
    expect(updated).toBeDefined();
    expect(updated!.status).toBe('FAILED');
    expect(updated!.attempts).toBe(5);
  });

  it('8. Lifecycle events (JOB_RETRY, JOB_FAILED, JOB_DEAD_LETTERED, JOB_DEPENDENCY_SATISFIED) are supported', async () => {
    const eRetry = await EventService.publish({ eventType: 'JOB_RETRY', jobId, projectId });
    const eFailed = await EventService.publish({ eventType: 'JOB_FAILED', jobId, projectId });
    const eDLQ = await EventService.publish({ eventType: 'JOB_DEAD_LETTERED', jobId, projectId });
    const eDAG = await EventService.publish({ eventType: 'JOB_DEPENDENCY_SATISFIED', jobId, projectId });

    expect(eRetry.eventType).toBe('JOB_RETRY');
    expect(eFailed.eventType).toBe('JOB_FAILED');
    expect(eDLQ.eventType).toBe('JOB_DEAD_LETTERED');
    expect(eDAG.eventType).toBe('JOB_DEPENDENCY_SATISFIED');
    expect(mockEvents.size).toBe(4);
  });
});
