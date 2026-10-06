import { z } from 'zod';

export const winnerClaimSchema = z.object({
  claimStatus: z.enum(['PENDING', 'CLAIMED', 'DELIVERED']),
  claimNote: z.string().trim().max(1000).nullable().optional(),
});

export const winnerFilterSchema = z.object({
  claimStatus: z.enum(['PENDING', 'CLAIMED', 'DELIVERED']).optional(),
  drawId: z.uuid().optional(),
});