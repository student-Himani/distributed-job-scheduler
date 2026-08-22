import { z } from 'zod';

export const completeJobSchema = z.object({
  workerId: z.string().min(1, 'workerId is required'),
  result: z.record(z.unknown()).optional().default({}),
  durationMs: z.number().int().min(0).optional(),
});

export const failJobSchema = z.object({
  workerId: z.string().min(1, 'workerId is required'),
  errorDetails: z.object({
    message: z.string(),
    stack: z.string().optional(),
    code: z.string().optional(),
  }).or(z.record(z.unknown())),
  durationMs: z.number().int().min(0).optional(),
});

export type CompleteJobInput = z.infer<typeof completeJobSchema>;
export type FailJobInput = z.infer<typeof failJobSchema>;
