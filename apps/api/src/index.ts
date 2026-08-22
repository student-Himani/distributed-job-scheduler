import { app } from './app';
import { env } from './config/env';
import { Logger } from '@job-scheduler/shared';

const logger = new Logger('API:Server');

const server = app.listen(env.PORT, () => {
  logger.info(`REST API Service started successfully`, {
    port: env.PORT,
    environment: env.NODE_ENV,
    healthEndpoint: `http://localhost:${env.PORT}/api/v1/health`,
  });
});

const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}. Shutting down API server gracefully...`);
  server.close(() => {
    logger.info('API HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
