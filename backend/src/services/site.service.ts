import { prisma } from '../lib/prisma';
import type { SiteSettingsInput } from '../validators/site.validator';

export class SiteError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

const settingsId = 1;
const emptySettings = {
  featuredCampaignId: null as string | null,
  organizerName: null as string | null,
  contactPhone: null as string | null,
  whatsappNumber: null as string | null,
  contactEmail: null as string | null,
  joinNote: null as string | null,
  updatedAt: null as Date | null,
};

export async function getSiteSettings() {
  const settings = await prisma.siteSettings.findUnique({ where: { id: settingsId } });
  if (!settings) return emptySettings;
  const { featuredCampaignId, organizerName, contactPhone, whatsappNumber, contactEmail, joinNote, updatedAt } = settings;
  return { featuredCampaignId, organizerName, contactPhone, whatsappNumber, contactEmail, joinNote, updatedAt };
}

/** AC-PUB-1: save the single settings row. */
export async function saveSiteSettings(input: SiteSettingsInput, adminId: string | undefined) {
  if (input.featuredCampaignId) {
    const campaign = await prisma.campaign.findUnique({ where: { id: input.featuredCampaignId }, select: { id: true } });
    if (!campaign) throw new SiteError('CAMPAIGN_NOT_FOUND', 'The chosen campaign was not found.', 404);
  }
  const data = {
    featuredCampaignId: input.featuredCampaignId ?? null,
    organizerName: input.organizerName ?? null,
    contactPhone: input.contactPhone ?? null,
    whatsappNumber: input.whatsappNumber ?? null,
    contactEmail: input.contactEmail ?? null,
    joinNote: input.joinNote ?? null,
    updatedByAdminId: adminId ?? null,
  };
  await prisma.siteSettings.upsert({ where: { id: settingsId }, update: data, create: { id: settingsId, ...data } });
  return getSiteSettings();
}

/** P2: first name and the initial of the last name; a one-word name is shown as-is. */
export function publicName(fullName: string) {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words[0] ?? '';
  return `${words[0]} ${words[words.length - 1].charAt(0).toUpperCase()}.`;
}

export type PublicDrawStatus = 'UPCOMING' | 'IN_PROGRESS' | 'RESULTS_SOON' | 'COMPLETED';

function publicDrawStatus(status: string, scheduledAt: Date, now: Date): PublicDrawStatus {
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'IN_PROGRESS') return 'IN_PROGRESS';
  return scheduledAt.getTime() > now.getTime() ? 'UPCOMING' : 'RESULTS_SOON';
}

const recentWinnerCount = 8;

/**
 * Everything the public site shows (AC-PUB-3..8, 11, 12). Every field is picked explicitly:
 * this object is the privacy allow-list (AC-PUB-9), so never spread database rows into it.
 */
export async function getPublicSite(now = new Date()) {
  const settings = await getSiteSettings();
  const contact = {
    organizerName: settings.organizerName,
    contactPhone: settings.contactPhone,
    whatsappNumber: settings.whatsappNumber,
    contactEmail: settings.contactEmail,
    joinNote: settings.joinNote,
  };
  const campaign = settings.featuredCampaignId
    ? await prisma.campaign.findUnique({
        where: { id: settings.featuredCampaignId },
        include: {
          draws: {
            where: { status: { not: 'CANCELLED' } },
            orderBy: { drawNumber: 'asc' },
            include: {
              prizes: { orderBy: [{ rank: 'asc' }, { name: 'asc' }] },
              winners: { orderBy: { drawPosition: 'asc' }, include: { participant: { select: { name: true, participantNumber: true } }, prize: { select: { name: true, rank: true } } } },
            },
          },
          complimentaryOptions: { where: { isActive: true }, orderBy: { name: 'asc' } },
          _count: { select: { participants: true } },
        },
      })
    : null;

  if (!campaign) {
    return { contact, campaign: null, stats: null, draws: [], nextDraw: null, complimentaryOptions: [], recentWinners: [], pastResults: [] };
  }

  const winnerOf = (winner: (typeof campaign.draws)[number]['winners'][number], drawNumber: number) => ({
    id: winner.id,
    round: winner.drawPosition,
    name: publicName(winner.participant.name),
    participantNumber: winner.participant.participantNumber,
    prize: { name: winner.prize.name, rank: winner.prize.rank },
    drawNumber,
    drawnAt: winner.drawnAt,
  });

  const draws = campaign.draws.map((draw) => ({
    id: draw.id,
    drawNumber: draw.drawNumber,
    scheduledAt: draw.scheduledAt,
    status: publicDrawStatus(draw.status, draw.scheduledAt, now),
    prizeCount: draw.prizeCount,
    roundsCompleted: draw.roundsCompleted,
    totalRounds: draw.totalRounds,
    prizes: draw.prizes.map((prize) => ({
      id: prize.id,
      name: prize.name,
      description: prize.description,
      rank: prize.rank,
      valuePaise: prize.valuePaise,
      quantity: prize.totalQuantity,
      imageUpdatedAt: prize.imageUpdatedAt,
    })),
  }));

  const allWinners = campaign.draws.flatMap((draw) => draw.winners.map((winner) => winnerOf(winner, draw.drawNumber)));
  const prizes = draws.flatMap((draw) => draw.prizes);
  const nextDraw = draws.find((draw) => draw.status === 'IN_PROGRESS') ?? draws.find((draw) => draw.status === 'UPCOMING' || draw.status === 'RESULTS_SOON') ?? null;

  return {
    contact,
    campaign: {
      name: campaign.name,
      status: campaign.status,
      durationMonths: campaign.durationMonths,
      drawCount: campaign.drawCount,
      perDrawAmountPaise: campaign.perDrawAmountPaise,
      totalAmountPaise: campaign.totalAmountPaise,
    },
    stats: {
      members: campaign._count.participants,
      drawsCompleted: draws.filter((draw) => draw.status === 'COMPLETED').length,
      totalDraws: draws.length,
      winners: allWinners.length,
      prizeUnits: prizes.reduce((total, prize) => total + prize.quantity, 0),
      prizeValuePaise: prizes.reduce((total, prize) => total + (prize.valuePaise ?? 0) * prize.quantity, 0),
    },
    draws,
    nextDraw: nextDraw && { id: nextDraw.id, drawNumber: nextDraw.drawNumber, scheduledAt: nextDraw.scheduledAt, status: nextDraw.status, prizeCount: nextDraw.prizeCount, roundsCompleted: nextDraw.roundsCompleted, totalRounds: nextDraw.totalRounds },
    complimentaryOptions: campaign.complimentaryOptions.map((option) => ({
      id: option.id,
      name: option.name,
      description: option.description,
      valuePaise: option.valuePaise,
      imageUpdatedAt: option.imageUpdatedAt,
    })),
    recentWinners: [...allWinners].sort((a, b) => b.drawnAt.getTime() - a.drawnAt.getTime() || b.round - a.round).slice(0, recentWinnerCount),
    pastResults: campaign.draws
      .filter((draw) => draw.status === 'COMPLETED')
      .reverse()
      .map((draw) => ({
        drawNumber: draw.drawNumber,
        scheduledAt: draw.scheduledAt,
        heldAt: draw.heldAt ?? draw.executedAt,
        mode: draw.executionMode,
        winners: draw.winners.map((winner) => winnerOf(winner, draw.drawNumber)),
      })),
  };
}

/** AC-PUB-10: only images of the featured campaign are public. */
export async function loadPublicPrizeImage(prizeId: string) {
  const { featuredCampaignId } = await getSiteSettings();
  if (!featuredCampaignId) return null;
  const prize = await prisma.prize.findFirst({ where: { id: prizeId, campaignId: featuredCampaignId }, select: { image: { select: { mimeType: true, data: true, size: true } } } });
  return prize?.image ?? null;
}

export async function loadPublicOptionImage(optionId: string) {
  const { featuredCampaignId } = await getSiteSettings();
  if (!featuredCampaignId) return null;
  const option = await prisma.complimentaryOption.findFirst({
    where: { id: optionId, campaignId: featuredCampaignId, isActive: true },
    select: { image: { select: { mimeType: true, data: true, size: true } } },
  });
  return option?.image ?? null;
}
