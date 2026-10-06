import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import type { winnerClaimSchema } from '../validators/winner.validator';

/** Updates a winner's prize claim/delivery status and note (AC-WIN-3); returns null when the winner does not exist. */
export async function updateWinnerClaimRecord(winnerId: string, input: z.infer<typeof winnerClaimSchema>, now = new Date()) {
  const existing = await prisma.winner.findUnique({ where: { id: winnerId }, select: { id: true } });
  if (!existing) return null;
  return prisma.winner.update({
    where: { id: winnerId },
    data: { ...input, claimUpdatedAt: now },
    include: {
      participant: { select: { id: true, name: true } },
      prize: true,
      draw: { select: { id: true, drawNumber: true, scheduledAt: true, executionMode: true, heldAt: true } },
    },
  });
}
