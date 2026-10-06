import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { createPrizeSchema, updatePrizeSchema } from '../validators/prize.validator';

function readId(request: Request, response: Response) {
  const parsed = z.uuid().safeParse(request.params.id);
  if (parsed.success) return parsed.data;
  response.status(400).json({
    error: { code: 'VALIDATION_ERROR', message: 'A valid resource id is required.' },
  });
  return null;
}

function validationError(response: Response, issues: unknown) {
  return response.status(400).json({
    error: { code: 'VALIDATION_ERROR', message: 'Prize details are invalid.', details: issues },
  });
}

function drawInProgress(response: Response) {
  return response.status(409).json({
    error: { code: 'DRAW_IN_PROGRESS', message: 'This prize’s draw is in progress; only its description and value can change.' },
  });
}

function notFound(response: Response, entity: string) {
  return response.status(404).json({
    error: { code: 'NOT_FOUND', message: `${entity} was not found.` },
  });
}

export async function listPrizes(request: Request, response: Response) {
  const campaignId = readId(request, response);
  if (!campaignId) return;

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return notFound(response, 'Campaign');

  const drawFilter = request.query.drawId;
  let drawWhere: { drawId?: string | null } = {};
  if (drawFilter === 'unassigned') {
    drawWhere = { drawId: null };
  } else if (drawFilter !== undefined) {
    const drawId = z.uuid().safeParse(drawFilter);
    if (!drawId.success) {
      return validationError(response, [{ path: ['drawId'], message: 'Select a valid draw or unassigned inventory.' }]);
    }
    const draw = await prisma.draw.findFirst({ where: { id: drawId.data, campaignId } });
    if (!draw) return notFound(response, 'Draw');
    drawWhere = { drawId: draw.id };
  }

  const prizes = await prisma.prize.findMany({
    where: { campaignId, ...drawWhere },
    orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
  });
  return response.json({ prizes });
}

export async function createPrize(request: Request, response: Response) {
  const campaignId = readId(request, response);
  if (!campaignId) return;
  const parsed = createPrizeSchema.safeParse(request.body);
  if (!parsed.success) return validationError(response, parsed.error.issues);

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return notFound(response, 'Campaign');

  const draw = await prisma.draw.findFirst({
    where: { id: parsed.data.drawId, campaignId, status: 'SCHEDULED' },
  });
  if (!draw) {
    return validationError(response, [{ path: ['drawId'], message: 'Choose a scheduled draw in this campaign.' }]);
  }

  const prize = await prisma.prize.create({
    data: { ...parsed.data, campaignId, drawId: draw.id },
  });
  return response.status(201).json({ prize });
}

export async function updatePrize(request: Request, response: Response) {
  const id = readId(request, response);
  if (!id) return;
  const parsed = updatePrizeSchema.safeParse(request.body);
  if (!parsed.success) return validationError(response, parsed.error.issues);

  const existingPrize = await prisma.prize.findUnique({ where: { id }, include: { draw: { select: { status: true } } } });
  if (!existingPrize) return notFound(response, 'Prize');

  // AC-DRW-10: a running draw's stock is locked; only description and value may change.
  const lockedFields = ['name', 'rank', 'totalQuantity', 'drawId'] as const;
  if (existingPrize.draw?.status === 'IN_PROGRESS' && lockedFields.some((field) => Object.hasOwn(parsed.data, field))) {
    return drawInProgress(response);
  }

  if (parsed.data.drawId && parsed.data.drawId !== existingPrize.drawId) {
    if (existingPrize.assignedQuantity > 0) {
      return response.status(409).json({
        error: { code: 'PRIZE_ASSIGNED', message: 'A prize with assigned winners cannot be moved to another draw.' },
      });
    }
    const targetDraw = await prisma.draw.findFirst({
      where: { id: parsed.data.drawId, campaignId: existingPrize.campaignId, status: 'SCHEDULED' },
    });
    if (!targetDraw) {
      return validationError(response, [{ path: ['drawId'], message: 'Choose a scheduled draw in the same campaign.' }]);
    }
  }

  const assignedFields = ['name', 'rank', 'totalQuantity'] as const;
  if (
    existingPrize.assignedQuantity > 0 &&
    assignedFields.some((field) => Object.hasOwn(parsed.data, field))
  ) {
    return response.status(409).json({
      error: { code: 'PRIZE_ASSIGNED', message: 'Assigned prizes can only change description or value.' },
    });
  }
  if (
    parsed.data.totalQuantity !== undefined &&
    parsed.data.totalQuantity < existingPrize.assignedQuantity
  ) {
    return validationError(response, [{
      path: ['totalQuantity'],
      message: 'Total quantity cannot be lower than already assigned quantity.',
    }]);
  }

  const prize = await prisma.prize.update({ where: { id }, data: parsed.data });
  return response.json({ prize });
}

export async function deletePrize(request: Request, response: Response) {
  const id = readId(request, response);
  if (!id) return;

  const prize = await prisma.prize.findUnique({ where: { id }, include: { draw: { select: { status: true } } } });
  if (!prize) return notFound(response, 'Prize');
  if (prize.draw?.status === 'IN_PROGRESS') return drawInProgress(response);
  if (prize.assignedQuantity > 0) {
    return response.status(409).json({
      error: { code: 'PRIZE_ASSIGNED', message: 'A prize cannot be deleted after it has been assigned.' },
    });
  }

  await prisma.prize.delete({ where: { id } });
  return response.status(204).send();
}