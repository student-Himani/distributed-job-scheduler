import { z } from 'zod';

export const createRetryPolicySchema = z.object({
  name: z.string().min(2, 'Retry policy name must be at least 2 characters long').max(100).trim(),
  strategy: z.enum(['FIXED', 'LINEAR', 'EXPONENTIAL']).default('EXPONENTIAL'),
  maxRetries: z.number().int().min(0).max(20).default(3),
  initialIntervalMs: z.number().int().min(100).max(86400000).default(1000), // ms (default 1s)
  maxIntervalMs: z.number().int().min(1000).max(604800000).default(3600000), // ms (default 1h)
  backoffFactor: z.number().min(1.0).max(10.0).default(2.0),
});

export const queryDlqSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10))) : 10)),
  reprocessed: z
    .string()
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
});

export type CreateRetryPolicyInput = z.infer<typeof createRetryPolicySchema>;
export type QueryDlqInput = z.infer<typeof queryDlqSchema>;
