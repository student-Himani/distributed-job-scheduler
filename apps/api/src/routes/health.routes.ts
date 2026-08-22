import { Router } from 'express';
import { ApiResponse, ServiceHealth, SYSTEM_CONSTANTS } from '@job-scheduler/shared';
import { checkDatabaseHealth } from '../db/client';

export const healthRouter = Router();

const startTime = Date.now();

healthRouter.get('/health', async (_req, res) => {
  const dbHealth = await checkDatabaseHealth();
  const uptime = Math.floor((Date.now() - startTime) / 1000);

  const isHealthy = dbHealth.connected;
  const statusPayload: ServiceHealth = {
    name: 'api',
    status: isHealthy ? 'healthy' : 'degraded',
    version: SYSTEM_CONSTANTS.VERSION,
    uptime,
    timestamp: new Date().toISOString(),
    database: dbHealth,
  };

  const response: ApiResponse<ServiceHealth> = {
    success: true,
    data: statusPayload,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  res.status(isHealthy ? 200 : 503).json(response);
});
