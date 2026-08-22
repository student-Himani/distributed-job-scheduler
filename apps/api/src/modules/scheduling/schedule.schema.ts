import { z } from 'zod';
import { CronUtils } from './cron.utils';

export const createScheduleSchema = z.object({
  name: z.string().min(2, 'Schedule name must be at least 2 characters long').max(100).trim(),
  cronExpression: z
    .string()
    .refine((val) => CronUtils.isValidCron(val), {
      message: 'Invalid 5-field cron expression (e.g. "*/5 * * * *" or "0 0 * * *")',
    }),
  timezone: z.string().default('UTC'),
  priority: z.number().int().min(-100).max(100).default(0),
  payload: z.record(z.unknown()).default({}),
  maxRetries: z.number().int().min(0).max(20).default(3),
  retryPolicyId: z.string().uuid().optional(),
});

export const queryScheduleSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10))) : 10)),
  search: z.string().optional(),
});

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type QueryScheduleInput = z.infer<typeof queryScheduleSchema>;
