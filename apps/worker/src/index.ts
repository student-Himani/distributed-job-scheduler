import express from 'express';
import { env } from './config/env';
import { checkDatabaseHealth } from './db/client';
import { Logger, ServiceHealth, SYSTEM_CONSTANTS, ApiResponse } from '@job-scheduler/shared';
import { WorkerDaemonPoller } from './poller';

const logger = new Logger('Worker:Daemon');
const startTime = Date.now();
const poller = new WorkerDaemonPoller();

logger.info(`Starting standalone Worker process daemon [ID: ${env.WORKER_ID}]...`);

// 1. Start worker daemon poller
poller.start().catch((err) => {
  logger.error(`Fatal error starting worker poller`, { error: err instanceof Error ? err.message : String(err) });
});

// 2. Worker internal express server for health checks
const app = express();

// CORS Middleware for health checks
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (_req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.get('/health', async (_req, res) => {
  const dbHealth = await checkDatabaseHealth();
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const isHealthy = dbHealth.connected;

  const healthPayload: ServiceHealth & { workerId: string } = {
    name: 'worker',
    workerId: env.WORKER_ID,
    status: isHealthy ? 'healthy' : 'degraded',
    version: SYSTEM_CONSTANTS.VERSION,
    uptime,
    timestamp: new Date().toISOString(),
    database: dbHealth,
  };

  const response: ApiResponse<typeof healthPayload> = {
    success: true,
    data: healthPayload,
  };

  res.status(isHealthy ? 200 : 503).json(response);
});

const server = app.listen(env.PORT, () => {
  logger.info(`Worker status server active`, {
    port: env.PORT,
    workerId: env.WORKER_ID,
    healthEndpoint: `http://localhost:${env.PORT}/health`,
  });
});

const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Shutting down worker process gracefully...`);
  await poller.stop();
  server.close(() => {
    logger.info(`Worker ${env.WORKER_ID} daemon stopped.`);
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
