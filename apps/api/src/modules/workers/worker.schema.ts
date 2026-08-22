import { z } from 'zod';

export const registerWorkerSchema = z.object({
  name: z.string().min(2, 'Worker name must be at least 2 characters long').max(100).trim(),
  hostname: z.string().min(1, 'Hostname is required').max(100).trim(),
  pid: z.number().int().min(1, 'PID must be a positive integer'),
  maxConcurrency: z.number().int().min(1, 'Max concurrency must be at least 1').max(100).default(5),
});

export const updateWorkerStatusSchema = z.object({
  status: z.enum(['ONLINE', 'BUSY', 'OFFLINE', 'DRAINING', 'DEAD']),
});

export const recordHeartbeatSchema = z.object({
  cpuUsage: z.number().min(0).max(100).optional(),
  memoryUsageMb: z.number().min(0).optional(),
  activeJobs: z.number().int().min(0).default(0),
  systemMetrics: z.record(z.unknown()).optional(),
  status: z.enum(['ONLINE', 'BUSY', 'OFFLINE', 'DRAINING', 'DEAD']).optional(),
});

export const queryWorkerSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10))) : 10)),
  search: z.string().optional(),
  status: z.enum(['ONLINE', 'BUSY', 'OFFLINE', 'DRAINING', 'DEAD']).optional(),
});

export type RegisterWorkerInput = z.infer<typeof registerWorkerSchema>;
export type UpdateWorkerStatusInput = z.infer<typeof updateWorkerStatusSchema>;
export type RecordHeartbeatInput = z.infer<typeof recordHeartbeatSchema>;
export type QueryWorkerInput = z.infer<typeof queryWorkerSchema>;
