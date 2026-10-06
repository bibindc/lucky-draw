import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { getCampaignDashboard } from '../services/dashboard.service';
import { addUtcMonths, createCampaignSchema, updateDrawSchema } from '../validators/campaign.validator';

function validationError(response: Response, issues: unknown) {
  return response.status(400).json({
    error: { code: 'VALIDATION_ERROR', message: 'Campaign configuration is invalid.', details: issues },
  });
}

function notFound(response: Response, entity: string) {
  return response.status(404).json({
    error: { code: 'NOT_FOUND', message: `${entity} was not found.` },
  });
}

function readId(request: Request, response: Response): string | null {
  const parsed = z.uuid().safeParse(request.params.id);
  if (parsed.success) return parsed.data;

  response.status(400).json({
    error: { code: 'VALIDATION_ERROR', message: 'A valid resource id is required.' },
  });
  return null;
}

export async function createCampaign(request: Request, response: Response) {
  const parsed = createCampaignSchema.safeParse(request.body);
  if (!parsed.success) return validationError(response, parsed.error.issues);

  const { draws, ...campaignData } = parsed.data;
  const campaign = await prisma.$transaction(async (transaction) => {
    const createdCampaign = await transaction.campaign.create({ data: campaignData });
    await transaction.draw.createMany({
      data: draws.map((draw, index) => ({
        ...draw,
        campaignId: createdCampaign.id,
        drawNumber: index + 1,
      })),
    });

    return transaction.campaign.findUniqueOrThrow({
      where: { id: createdCampaign.id },
      include: { draws: { orderBy: { drawNumber: 'asc' } } },
    });
  });

  return response.status(201).json({ campaign });
}

export async function listCampaigns(request: Request, response: Response) {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          participants: request.role === 'AGENT' ? { where: { agentId: request.agentId } } : true,
          draws: true,
          prizes: true,
        },
      },
    },
  });

  return response.json({ campaigns });
}

export async function getCampaign(request: Request, response: Response) {
  const id = readId(request, response);
  if (!id) return;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      draws: { orderBy: { drawNumber: 'asc' } },
      _count: { select: { participants: true, prizes: true } },
    },
  });
  if (!campaign) return notFound(response, 'Campaign');

  return response.json({ campaign });
}

export async function getCampaignDraws(request: Request, response: Response) {
  const id = readId(request, response);
  if (!id) return;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return notFound(response, 'Campaign');

  const draws = await prisma.draw.findMany({
    where: { campaignId: campaign.id },
    orderBy: { drawNumber: 'asc' },
    include: {
      _count: {
        select: {
          drawPayments: {
            where: {
              status: 'PAID',
              participant: { winners: { none: {} } },
            },
          },
          winners: true,
        },
      },
    },
  });
  const prizeStocks = await Promise.all(draws.map((draw) => prisma.prize.aggregate({
    where: { campaignId: campaign.id, drawId: draw.id },
    _sum: { totalQuantity: true, assignedQuantity: true },
  })));
  return response.json({
    draws: draws.map((draw, index) => {
      const prizeStock = prizeStocks[index];
      return {
        ...draw,
        availablePrizeCount: (prizeStock._sum.totalQuantity ?? 0) - (prizeStock._sum.assignedQuantity ?? 0),
      };
    }),
  });
}

export async function updateDraw(request: Request, response: Response) {
  const id = readId(request, response);
  if (!id) return;
  const parsed = updateDrawSchema.safeParse(request.body);
  if (!parsed.success) return validationError(response, parsed.error.issues);

  const existingDraw = await prisma.draw.findUnique({
    where: { id },
  });
  if (!existingDraw) return notFound(response, 'Draw');
  if (existingDraw.status !== 'SCHEDULED') {
    return response.status(409).json({
      error: { code: 'DRAW_NOT_EDITABLE', message: 'Only scheduled draws can be edited.' },
    });
  }

  if (parsed.data.scheduledAt) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: existingDraw.campaignId },
      include: { draws: { orderBy: { drawNumber: 'asc' } } },
    });
    if (!campaign) return notFound(response, 'Campaign');

    const nextTimestamp = parsed.data.scheduledAt.getTime();
    if (nextTimestamp <= Date.now()) {
      return validationError(response, [{ path: ['scheduledAt'], message: 'Draw date and time must be in the future.' }]);
    }

    const proposedDates = campaign.draws.map((draw) =>
      draw.id === existingDraw.id ? parsed.data.scheduledAt! : draw.scheduledAt,
    );
    if (new Set(proposedDates.map((date) => date.getTime())).size !== proposedDates.length) {
      return validationError(response, [{ path: ['scheduledAt'], message: 'Draw dates and times must be unique.' }]);
    }
    if (proposedDates.some((date, index) => index > 0 && date <= proposedDates[index - 1])) {
      return validationError(response, [{ path: ['scheduledAt'], message: 'Draws must remain in chronological order.' }]);
    }

    const firstDate = proposedDates[0];
    const lastDate = proposedDates.at(-1);
    if (firstDate && lastDate && lastDate > addUtcMonths(firstDate, campaign.durationMonths)) {
      return validationError(response, [{ path: ['scheduledAt'], message: 'Draw date must fall within the campaign duration.' }]);
    }
  }

  const updateResult = await prisma.draw.updateMany({
    where: {
      id: existingDraw.id,
      status: 'SCHEDULED',
      scheduledAt: existingDraw.scheduledAt,
    },
    data: parsed.data,
  });
  if (updateResult.count !== 1) {
    return response.status(409).json({
      error: { code: 'DRAW_NOT_EDITABLE', message: 'This draw changed while being edited. Reload and try again.' },
    });
  }

  const draw = await prisma.draw.findUniqueOrThrow({ where: { id: existingDraw.id } });
  return response.json({ draw });
}
export async function getDashboard(request: Request, response: Response) {
  const id = readId(request, response);
  if (!id) return;
  const dashboard = await getCampaignDashboard(id);
  if (!dashboard) return notFound(response, 'Campaign');

  return response.json({ dashboard });
}
