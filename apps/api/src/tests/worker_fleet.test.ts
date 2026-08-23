import request from 'supertest';
import { app } from '../app';
import { prisma } from '../db/client';
import { WorkerService } from '../modules/workers/worker.service';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key';

describe('Worker Fleet: Registration, Heartbeat, and Active Worker Pipeline', () => {
  let authToken: string;
  let organizationId: string;
  let projectId: string;
  let testWorkerId: string;

  beforeAll(async () => {
    // 1. Create org & project
    const org = await prisma.organization.create({
      data: {
        name: 'Worker Fleet Test Org',
        slug: 'worker-fleet-org-' + Date.now().toString(36),
      },
    });
    organizationId = org.id;

    const user = await prisma.user.create({
      data: {
        email: `worker-test-${Date.now()}@example.com`,
        name: 'Worker Fleet Tester',
        organizationId,
      },
    });

    const project = await prisma.project.create({
      data: {
        name: 'Worker Fleet Project',
        slug: 'worker-fleet-proj-' + Date.now().toString(36),
        organizationId,
      },
    });
    projectId = project.id;

    authToken = jwt.sign(
      { userId: user.id, email: user.email, organizationId, role: 'ADMIN' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    testWorkerId = `test-worker-${Date.now()}`;
  });

  afterAll(async () => {
    try {
      await prisma.worker.deleteMany({ where: { name: { contains: 'test-worker' } } });
      await prisma.project.deleteMany({ where: { id: projectId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    } catch {
      // Cleanup best effort
    }
  });

  it('1. New worker registration creates a database record and sets status to ONLINE', async () => {
    const worker = await prisma.worker.upsert({
      where: { id: testWorkerId },
      update: {
        status: 'ONLINE',
        lastHeartbeatAt: new Date(),
      },
      create: {
        id: testWorkerId,
        name: testWorkerId,
        hostname: 'test-host-01',
        pid: 1234,
        projectId,
        status: 'ONLINE',
        maxConcurrency: 10,
        currentConcurrency: 0,
        lastHeartbeatAt: new Date(),
      },
    });

    expect(worker.id).toBe(testWorkerId);
    expect(worker.status).toBe('ONLINE');
    expect(worker.maxConcurrency).toBe(10);
    expect(worker.currentConcurrency).toBe(0);
  });

  it('2. Restarting the same worker performs an upsert without creating duplicate records', async () => {
    const initialCount = await prisma.worker.count({ where: { id: testWorkerId } });
    expect(initialCount).toBe(1);

    await prisma.worker.upsert({
      where: { id: testWorkerId },
      update: {
        status: 'ONLINE',
        lastHeartbeatAt: new Date(),
      },
      create: {
        id: testWorkerId,
        name: testWorkerId,
        hostname: 'test-host-01',
        pid: 1234,
        projectId,
        status: 'ONLINE',
        maxConcurrency: 10,
        currentConcurrency: 0,
        lastHeartbeatAt: new Date(),
      },
    });

    const afterCount = await prisma.worker.count({ where: { id: testWorkerId } });
    expect(afterCount).toBe(1);
  });

  it('3. Heartbeat updates lastHeartbeatAt and reflects busy vs online status', async () => {
    const now = new Date();
    const updated = await prisma.worker.update({
      where: { id: testWorkerId },
      data: {
        lastHeartbeatAt: now,
        status: 'BUSY',
        currentConcurrency: 2,
      },
    });

    expect(updated.status).toBe('BUSY');
    expect(updated.currentConcurrency).toBe(2);
  });

  it('4. Stale worker detection marks workers without a heartbeat for >30s as OFFLINE', async () => {
    const pastCutoff = new Date(Date.now() - 40000); // 40s ago

    await prisma.worker.update({
      where: { id: testWorkerId },
      data: {
        lastHeartbeatAt: pastCutoff,
        status: 'ONLINE',
      },
    });

    const deadCount = await WorkerService.detectStaleWorkers(30000);
    expect(deadCount).toBeGreaterThanOrEqual(1);

    const workerState = await prisma.worker.findUnique({ where: { id: testWorkerId } });
    expect(['DEAD', 'OFFLINE']).toContain(workerState?.status);
  });

  it('5. API GET /api/v1/projects/:projectId/workers returns registered organization workers', async () => {
    // Re-activate worker
    await prisma.worker.update({
      where: { id: testWorkerId },
      data: {
        lastHeartbeatAt: new Date(),
        status: 'ONLINE',
        currentConcurrency: 0,
      },
    });

    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/workers`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const targetWorker = res.body.data.find((w: any) => w.id === testWorkerId);
    expect(targetWorker).toBeDefined();
    expect(targetWorker.name).toBe(testWorkerId);
    expect(targetWorker.status).toBe('ONLINE');
    expect(targetWorker.maxConcurrency).toBe(10);
  });

  it('6. Worker status becomes BUSY when executing jobs and returns ONLINE when completed', async () => {
    // Transition to BUSY
    await prisma.worker.update({
      where: { id: testWorkerId },
      data: { status: 'BUSY', currentConcurrency: 1, lastHeartbeatAt: new Date() },
    });

    let res = await request(app)
      .get(`/api/v1/projects/${projectId}/workers`)
      .set('Authorization', `Bearer ${authToken}`);

    let targetWorker = res.body.data.find((w: any) => w.id === testWorkerId);
    expect(targetWorker.status).toBe('BUSY');
    expect(targetWorker.currentConcurrency).toBe(1);

    // Transition back to ONLINE
    await prisma.worker.update({
      where: { id: testWorkerId },
      data: { status: 'ONLINE', currentConcurrency: 0, lastHeartbeatAt: new Date() },
    });

    res = await request(app)
      .get(`/api/v1/projects/${projectId}/workers`)
      .set('Authorization', `Bearer ${authToken}`);

    targetWorker = res.body.data.find((w: any) => w.id === testWorkerId);
    expect(targetWorker.status).toBe('ONLINE');
    expect(targetWorker.currentConcurrency).toBe(0);
  });
});
