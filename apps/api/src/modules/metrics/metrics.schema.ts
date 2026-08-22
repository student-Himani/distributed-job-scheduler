import { z } from 'zod';

export const queryMetricsSchema = z.object({
  timeframe: z.enum(['1h', '24h', '7d', '30d']).default('24h'),
});

export type QueryMetricsInput = z.infer<typeof queryMetricsSchema>;
