import { z } from 'zod';

export const createJobSchema = z.object({
  name: z.string().min(2, 'Job name must be at least 2 characters long').max(100).trim(),
  type: z.enum(['IMMEDIATE', 'DELAYED', 'SCHEDULED', 'RECURRING', 'BATCH']).default('IMMEDIATE'),
  priority: z.number().int().min(-100).max(100).default(0),
  payload: z.record(z.unknown()).default({}),
  maxRetries: z.number().int().min(0).max(20).default(3),
  delaySeconds: z.number().int().min(0).max(31536000).optional(), // Up to 1 year
  scheduledAt: z.string().datetime({ offset: true }).optional().or(z.string().datetime().optional()),
  retryPolicyId: z.string().uuid().optional(),
  dependsOnJobIds: z.array(z.string().uuid()).optional(),
});

export const queryJobSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10))) : 10)),
  search: z.string().optional(),
  status: z
    .enum(['QUEUED', 'SCHEDULED', 'CLAIMED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'DEAD_LETTER', 'BLOCKED'])
    .optional(),
  type: z.enum(['IMMEDIATE', 'DELAYED', 'SCHEDULED', 'RECURRING', 'BATCH']).optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type QueryJobInput = z.infer<typeof queryJobSchema>;
