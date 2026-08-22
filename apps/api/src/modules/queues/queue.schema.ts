import { z } from 'zod';

export const createQueueSchema = z.object({
  name: z.string().min(2, 'Queue name must be at least 2 characters long').max(100).trim(),
  description: z.string().max(500).optional(),
  priority: z.enum(['CRITICAL', 'HIGH', 'DEFAULT', 'LOW']).default('DEFAULT'),
  concurrencyLimit: z.number().int().min(1, 'Concurrency limit must be at least 1').max(100, 'Concurrency limit cannot exceed 100').default(10),
  retryPolicyId: z.string().uuid().optional(),
});

export const updateQueueSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  description: z.string().max(500).optional(),
  priority: z.enum(['CRITICAL', 'HIGH', 'DEFAULT', 'LOW']).optional(),
  concurrencyLimit: z.number().int().min(1).max(100).optional(),
  retryPolicyId: z.string().uuid().nullable().optional(),
});

export const queryQueueSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10))) : 10)),
  search: z.string().optional(),
  priority: z.enum(['CRITICAL', 'HIGH', 'DEFAULT', 'LOW']).optional(),
  isPaused: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? val === 'true' : undefined)),
});

export type CreateQueueInput = z.infer<typeof createQueueSchema>;
export type UpdateQueueInput = z.infer<typeof updateQueueSchema>;
export type QueryQueueInput = z.infer<typeof queryQueueSchema>;
