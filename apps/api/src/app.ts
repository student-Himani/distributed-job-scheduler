import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.routes';
import { authRouter } from './modules/auth/auth.routes';
import { organizationRouter } from './modules/organizations/organization.routes';
import { projectRouter } from './modules/projects/project.routes';
import { projectQueueRouter, queueRouter } from './modules/queues/queue.routes';
import {
  projectQueueJobRouter,
  projectJobRouter,
  queueJobRouter,
  jobRouter,
} from './modules/jobs/job.routes';
import { projectWorkerRouter, workerRouter } from './modules/workers/worker.routes';
import { claimingRouter } from './modules/claiming/claiming.routes';
import { executionRouter } from './modules/execution/execution.routes';
import { projectDlqRouter, dlqRouter, retryPolicyRouter } from './modules/retries/retry.routes';
import {
  projectQueueScheduleRouter,
  projectScheduleRouter,
  scheduleRouter,
} from './modules/scheduling/schedule.routes';
import { systemMetricsRouter, projectMetricsRouter } from './modules/metrics/metrics.routes';
import { projectEventRouter, eventRouter } from './modules/events/event.routes';

export const app = express();

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/v1', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/organizations', organizationRouter);

// Metrics Routes
app.use('/api/v1/metrics', systemMetricsRouter);
app.use('/api/v1/projects/:projectId/metrics', projectMetricsRouter);

// Event Routes
app.use('/api/v1/projects/:projectId/events', projectEventRouter);
app.use('/api/v1/events', eventRouter);

// Retry Policies Routes
app.use('/api/v1/retry-policies', retryPolicyRouter);

// DLQ Routes
app.use('/api/v1/projects/:projectId/dlq', projectDlqRouter);
app.use('/api/v1/dlq', dlqRouter);

// Worker Claiming Routes
app.use('/api/v1/workers', claimingRouter);

// Worker Routes
app.use('/api/v1/projects/:projectId/workers', projectWorkerRouter);
app.use('/api/v1/workers', workerRouter);

// Schedule Routes
app.use('/api/v1/projects/:projectId/queues/:queueId/schedules', projectQueueScheduleRouter);
app.use('/api/v1/projects/:projectId/schedules', projectScheduleRouter);
app.use('/api/v1/schedules', scheduleRouter);

// Job Enqueueing Route
app.use('/api/v1/projects/:projectId/queues/:queueId/jobs', projectQueueJobRouter);

// Queue Routes
app.use('/api/v1/projects/:projectId/queues', projectQueueRouter);
app.use('/api/v1/queues/:queueId/jobs', queueJobRouter);
app.use('/api/v1/queues', queueRouter);

// Project Job Listing & Project Routes
app.use('/api/v1/projects/:projectId/jobs', projectJobRouter);
app.use('/api/v1/projects', projectRouter);

// Direct Execution & Job Routes
app.use('/api/v1/jobs', executionRouter);
app.use('/api/v1/jobs', jobRouter);

// 404 Handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested API endpoint does not exist.',
    },
  });
});
