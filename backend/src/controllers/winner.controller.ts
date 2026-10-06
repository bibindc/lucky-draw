import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { winnerClaimSchema, winnerFilterSchema } from '../validators/winner.validator';
import { updateWinnerClaimRecord } from '../services/winner.service';

function readId(value: string | string[] | undefined, response: Response) {
  const parsed = z.uuid().safeParse(value);
  if (parsed.success) return parsed.data;
  response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid resource id is required.' } });
  return null;
}

export async function listWinners(request: Request, response: Response) {
  const campaignId = readId(request.params.id, response);
  if (!campaignId) return;
  const filters = winnerFilterSchema.safeParse(request.query);
  if (!filters.success) {
    return response.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Winner filters are invalid.', details: filters.error.issues },
    });
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Campaign was not found.' } });

  const winners = await prisma.winner.findMany({
    where: {
      draw: {
        campaignId,
        ...(filters.data.drawId ? { id: filters.data.drawId } : {}),
      },
      ...(filters.data.claimStatus ? { claimStatus: filters.data.claimStatus } : {}),
    },
    orderBy: [{ draw: { drawNumber: 'asc' } }, { drawPosition: 'asc' }],
    include: {
      participant: {
        select: {
          id: true, participantNumber: true, name: true, email: true, mobile: true, status: true,
          agent: { select: { id: true, agentCode: true, name: true } },
        },
      },
      prize: true,
      draw: { select: { id: true, drawNumber: true, scheduledAt: true, executionMode: true, heldAt: true } },
    },
  });

  return response.json({ winners });
}

export async function updateWinnerClaim(request: Request, response: Response) {
  const winnerId = readId(request.params.id, response);
  if (!winnerId) return;
  const parsed = winnerClaimSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Claim details are invalid.', details: parsed.error.issues },
    });
  }

  const winner = await updateWinnerClaimRecord(winnerId, parsed.data);
  if (!winner) {
    return response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Winner was not found.' } });
  }
  return response.json({ winner });
}