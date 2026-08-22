import { Router } from 'express';
import { MetricsController } from './metrics.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

// Router for /api/v1/metrics
export const systemMetricsRouter = Router();
systemMetricsRouter.get('/health', MetricsController.getSystemHealth);

// Router for /api/v1/projects/:projectId/metrics
export const projectMetricsRouter = Router({ mergeParams: true });
projectMetricsRouter.use(authenticateToken);
projectMetricsRouter.get('/overview', MetricsController.getProjectOverview);
