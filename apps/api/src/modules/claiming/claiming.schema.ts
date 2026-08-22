import { z } from 'zod';

export const claimJobSchema = z.object({
  batchSize: z.number().int().min(1).max(10).default(1),
});

export const releaseClaimSchema = z.object({
  jobId: z.string().uuid(),
});

export type ClaimJobInput = z.infer<typeof claimJobSchema>;
export type ReleaseClaimInput = z.infer<typeof releaseClaimSchema>;
