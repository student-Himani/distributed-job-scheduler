import { app } from './app';
import { env } from './config/env';
import { Logger } from '@job-scheduler/shared';
import { WebSocketService } from './modules/websocket/websocket.service';

const logger = new Logger('API:Server');

const server = app.listen(env.PORT, () => {
  logger.info(`REST API Service started successfully`, {
    port: env.PORT,
    environment: env.NODE_ENV,
    healthEndpoint: `http://localhost:${env.PORT}/api/v1/health`,
    wsEndpoint: `ws://localhost:${env.PORT}/ws`,
  });
});

// Initialize WebSocket Gateway on existing HTTP server port (3001)
WebSocketService.initialize(server);

const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}. Shutting down API server gracefully...`);
  WebSocketService.close();
  server.close(() => {
    logger.info('API HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
