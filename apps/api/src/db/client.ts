import { PrismaClient } from '@prisma/client';
import { Logger } from '@job-scheduler/shared';

const logger = new Logger('API:Database');

export const prisma = new PrismaClient();

export async function checkDatabaseHealth(): Promise<{ connected: boolean; error?: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { connected: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown database connection error';
    logger.warn('Database health check failed', { error: errorMessage });
    return { connected: false, error: errorMessage };
  }
}
