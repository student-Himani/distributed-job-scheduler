import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const envSchema = z.object({
  PORT: z.string().default('3002').transform((val) => parseInt(val, 10)),
  WORKER_ID: z.string().default('worker-node-01'),
  QUEUE_SHARD_COUNT: z.string().default('4').transform((val) => Math.max(1, parseInt(val, 10))),
  WORKER_SHARD_ID: z.string().default('0').transform((val) => Math.max(0, parseInt(val, 10))),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/jobscheduler?schema=public'),
});

export const env = envSchema.parse(process.env);
