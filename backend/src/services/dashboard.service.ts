import { prisma } from '../lib/prisma';

const upcomingDrawLimit = 3;
const activityLimit = 6;
const recentWindowMs = 7 * 24 * 60 * 60 * 1000;

export type DashboardActivity = {
  type: 'PARTICIPANT_ADDED' | 'PAYMENT_RECORDED' | 'PAYMENT_VOIDED' | 'WINNER_DRAWN' | 'CLAIM_UPDATED';
  at: Date;
  participantName: string;
  amountPaise?: number;
  drawNumbers?: number[];
  prizeName?: string;
  claimStatus?: string;
};

export function mergeActivity(events: DashboardActivity[], limit = activityLimit): DashboardActivity[] {
  return [...events].sort((left, right) => right.at.getTime() - left.at.getTime()).slice(0, limit);
}

// Unpaid or won participants are excluded from eligibility (D5).
const notWinner = { participant: { winners: { none: {} } } };

export async function getCampaignDashboard(campaignId: string, now = new Date()) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { draws: { orderBy: { drawNumber: 'asc' } } },
  });
  if (!campaign) return null;

  // An in-progress draw is still upcoming work: it leads the list and counts as remaining.
  const scheduledDraws = campaign.draws.filter(({ status }) => status === 'SCHEDULED' || status === 'IN_PROGRESS');
  const upcomingDraws = scheduledDraws.slice(0, upcomingDrawLimit);
  const nextDraw = upcomingDraws[0] ?? null;
  const participantScope = { participant: { campaignId } };

  const [
    participantTotal,
    participantsAddedRecently,
    winnerCount,
    eligibleByDraw,
    pendingForNextDraw,
    prizeStock,
    unassignedPrizeCount,
    payments,
    paidDrawPayments,
    unpaidPayableDrawPayments,
    recentParticipants,
    recentTransactions,
    recentVoids,
    recentWinners,
    recentClaims,
  ] = await Promise.all([
    prisma.participant.count({ where: { campaignId } }),
    prisma.participant.count({ where: { campaignId, createdAt: { gte: new Date(now.getTime() - recentWindowMs) } } }),
    prisma.winner.count({ where: { draw: { campaignId } } }),
    upcomingDraws.length
      ? prisma.drawPayment.groupBy({
          by: ['drawId'],
          where: { drawId: { in: upcomingDraws.map(({ id }) => id) }, status: 'PAID', ...notWinner },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    nextDraw ? prisma.drawPayment.count({ where: { drawId: nextDraw.id, status: 'NOT_PAID', ...notWinner } }) : Promise.resolve(0),
    prisma.prize.aggregate({
      where: { campaignId, drawId: { not: null } },
      _sum: { totalQuantity: true, assignedQuantity: true },
      _count: { _all: true },
    }),
    prisma.prize.count({ where: { campaignId, drawId: null } }),
    prisma.paymentTransaction.aggregate({
      where: { ...participantScope, status: 'RECORDED' },
      _sum: { amountPaise: true },
      _count: { _all: true },
    }),
    prisma.drawPayment.count({ where: { ...participantScope, status: 'PAID' } }),
    prisma.drawPayment.count({ where: { ...participantScope, status: 'NOT_PAID', draw: { status: 'SCHEDULED' } } }),
    prisma.participant.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
      take: activityLimit,
      select: { name: true, createdAt: true },
    }),
    prisma.paymentTransaction.findMany({
      where: participantScope,
      orderBy: { createdAt: 'desc' },
      take: activityLimit,
      select: {
        amountPaise: true,
        createdAt: true,
        participant: { select: { name: true } },
        allocations: { select: { drawPayment: { select: { draw: { select: { drawNumber: true } } } } } },
      },
    }),
    prisma.paymentTransaction.findMany({
      where: { ...participantScope, voidedAt: { not: null } },
      orderBy: { voidedAt: 'desc' },
      take: activityLimit,
      select: { amountPaise: true, voidedAt: true, participant: { select: { name: true } } },
    }),
    prisma.winner.findMany({
      where: { draw: { campaignId } },
      orderBy: { createdAt: 'desc' },
      take: activityLimit,
      select: {
        createdAt: true,
        participant: { select: { name: true } },
        prize: { select: { name: true } },
        draw: { select: { drawNumber: true } },
      },
    }),
    prisma.winner.findMany({
      where: { draw: { campaignId }, claimUpdatedAt: { not: null } },
      orderBy: { claimUpdatedAt: 'desc' },
      take: activityLimit,
      select: { claimStatus: true, claimUpdatedAt: true, participant: { select: { name: true } }, prize: { select: { name: true } } },
    }),
  ]);

  const eligibleCounts = new Map(eligibleByDraw.map((group) => [group.drawId, group._count._all]));
  const completedDraws = campaign.draws.filter(({ status }) => status === 'COMPLETED').length;
  const cancelledDraws = campaign.draws.filter(({ status }) => status === 'CANCELLED').length;
  const activeParticipants = participantTotal - winnerCount;
  const nextDrawEligible = nextDraw ? eligibleCounts.get(nextDraw.id) ?? 0 : 0;
  const totalPrizeUnits = prizeStock._sum.totalQuantity ?? 0;
  const assignedPrizeUnits = prizeStock._sum.assignedQuantity ?? 0;
  const payableDrawPayments = paidDrawPayments + unpaidPayableDrawPayments;

  const activity = mergeActivity([
    ...recentParticipants.map((participant) => ({
      type: 'PARTICIPANT_ADDED' as const,
      at: participant.createdAt,
      participantName: participant.name,
    })),
    ...recentTransactions.map((transaction) => ({
      type: 'PAYMENT_RECORDED' as const,
      at: transaction.createdAt,
      participantName: transaction.participant.name,
      amountPaise: transaction.amountPaise,
      drawNumbers: transaction.allocations.map(({ drawPayment }) => drawPayment.draw.drawNumber).sort((a, b) => a - b),
    })),
    ...recentVoids.map((transaction) => ({
      type: 'PAYMENT_VOIDED' as const,
      at: transaction.voidedAt!,
      participantName: transaction.participant.name,
      amountPaise: transaction.amountPaise,
    })),
    ...recentWinners.map((winner) => ({
      type: 'WINNER_DRAWN' as const,
      at: winner.createdAt,
      participantName: winner.participant.name,
      prizeName: winner.prize.name,
      drawNumbers: [winner.draw.drawNumber],
    })),
    ...recentClaims.map((winner) => ({
      type: 'CLAIM_UPDATED' as const,
      at: winner.claimUpdatedAt!,
      participantName: winner.participant.name,
      prizeName: winner.prize.name,
      claimStatus: winner.claimStatus,
    })),
  ]);

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      durationMonths: campaign.durationMonths,
      drawCount: campaign.draws.length,
      perDrawAmountPaise: campaign.perDrawAmountPaise,
      firstDrawAt: campaign.draws[0]?.scheduledAt ?? null,
    },
    progress: {
      completedDraws,
      cancelledDraws,
      remainingDraws: scheduledDraws.length,
      percentComplete: campaign.draws.length ? Math.round((completedDraws / campaign.draws.length) * 100) : 0,
    },
    participants: {
      total: participantTotal,
      addedLast7Days: participantsAddedRecently,
      winners: winnerCount,
    },
    eligibility: {
      nextDrawEligible,
      activeParticipants,
      percentOfActive: activeParticipants ? Math.round((nextDrawEligible / activeParticipants) * 100) : 0,
      pendingForNextDraw,
    },
    prizes: {
      availableUnits: totalPrizeUnits - assignedPrizeUnits,
      assignedUnits: assignedPrizeUnits,
      totalUnits: totalPrizeUnits,
      prizeCount: prizeStock._count._all,
      unassignedPrizeCount,
    },
    payments: {
      collectedPaise: payments._sum.amountPaise ?? 0,
      transactionCount: payments._count._all,
      dueForNextDrawPaise: pendingForNextDraw * campaign.perDrawAmountPaise,
      collectionRatePercent: payableDrawPayments ? Math.round((paidDrawPayments / payableDrawPayments) * 100) : 0,
    },
    upcomingDraws: upcomingDraws.map((draw) => ({
      id: draw.id,
      drawNumber: draw.drawNumber,
      scheduledAt: draw.scheduledAt,
      prizeCount: draw.prizeCount,
      eligibleCount: eligibleCounts.get(draw.id) ?? 0,
      isDue: draw.scheduledAt <= now,
      status: draw.status,
      roundsCompleted: draw.roundsCompleted,
      totalRounds: draw.totalRounds,
    })),
    activity,
    generatedAt: now,
  };
}
