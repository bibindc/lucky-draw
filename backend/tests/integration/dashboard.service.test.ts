import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestDatabase } from './testDatabase';

// Runs the dashboard queries against a throwaway SQLite database built from the real migrations.
let cleanup: (() => void) | undefined;
let prisma: PrismaClient;
let getCampaignDashboard: typeof import('../../src/services/dashboard.service').getCampaignDashboard;
let campaignId: string;
const now = new Date('2026-10-05T12:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

beforeAll(async () => {
  ({ cleanup } = createTestDatabase('dashboard'));
  ({ prisma } = await import('../../src/lib/prisma'));
  ({ getCampaignDashboard } = await import('../../src/services/dashboard.service'));

  const admin = await prisma.admin.create({ data: { email: 'admin@example.com', name: 'Admin', passwordHash: 'x' } });
  const campaign = await prisma.campaign.create({
    data: { name: 'Autumn Circle', durationMonths: 5, drawCount: 3, totalAmountPaise: 90_000, perDrawAmountPaise: 30_000 },
  });
  campaignId = campaign.id;
  const [draw1, draw2, draw3] = await Promise.all([
    prisma.draw.create({ data: { campaignId, drawNumber: 1, scheduledAt: minutesAgo(60 * 24 * 14), prizeCount: 1, status: 'COMPLETED' } }),
    prisma.draw.create({ data: { campaignId, drawNumber: 2, scheduledAt: minutesAgo(30), prizeCount: 2 } }),
    prisma.draw.create({ data: { campaignId, drawNumber: 3, scheduledAt: new Date(now.getTime() + 3 * 86_400_000), prizeCount: 3 } }),
  ]);

  // status per draw [1, 2, 3]; A won draw 1 and keeps a retained-credit payment for draw 3.
  const people = [
    { name: 'Asha', number: 1000, createdAt: minutesAgo(60 * 24 * 30), payments: ['PAID', 'WAIVED', 'PAID'] },
    { name: 'Bala', number: 1001, createdAt: minutesAgo(300), payments: ['NOT_PAID', 'PAID', 'NOT_PAID'] },
    { name: 'Chitra', number: 1002, createdAt: minutesAgo(200), payments: ['NOT_PAID', 'NOT_PAID', 'NOT_PAID'] },
    { name: 'Dev', number: 1003, createdAt: minutesAgo(100), payments: ['NOT_PAID', 'PAID', 'PAID'] },
  ];
  const participants = [];
  for (const person of people) {
    participants.push(await prisma.participant.create({
      data: {
        campaignId, name: person.name, participantNumber: person.number, email: `${person.name}@example.com`, createdAt: person.createdAt,
        drawPayments: {
          create: [draw1, draw2, draw3].map((draw, index) => ({
            drawId: draw.id, status: person.payments[index], retainedCredit: person.name === 'Asha' && index === 2,
          })),
        },
      },
      include: { drawPayments: { include: { draw: true } } },
    }));
  }
  const [asha, bala, chitra, dev] = participants;

  await prisma.paymentTransaction.create({ data: { participantId: bala.id, amountPaise: 30_000, method: 'CASH', recordedByAdminId: admin.id, createdAt: minutesAgo(50) } });
  const devPayment = await prisma.paymentTransaction.create({ data: { participantId: dev.id, amountPaise: 60_000, method: 'UPI', recordedByAdminId: admin.id, createdAt: minutesAgo(40) } });
  await prisma.paymentAllocation.createMany({
    data: dev.drawPayments.filter(({ status }) => status === 'PAID').map((drawPayment) => ({ transactionId: devPayment.id, drawPaymentId: drawPayment.id })),
  });
  await prisma.paymentTransaction.create({
    data: { participantId: chitra.id, amountPaise: 30_000, method: 'CASH', status: 'VOIDED', recordedByAdminId: admin.id, createdAt: minutesAgo(25), voidedAt: minutesAgo(5) },
  });

  const drawnPrize = await prisma.prize.create({ data: { campaignId, drawId: draw1.id, name: 'Smart watch', rank: 1, totalQuantity: 2, assignedQuantity: 1 } });
  await prisma.prize.create({ data: { campaignId, drawId: draw2.id, name: 'Headphones', rank: 1, totalQuantity: 3 } });
  await prisma.prize.create({ data: { campaignId, name: 'Legacy hamper', rank: 2, totalQuantity: 4 } });
  await prisma.winner.create({
    data: { drawId: draw1.id, participantId: asha.id, prizeId: drawnPrize.id, createdAt: minutesAgo(60 * 24 * 14), claimStatus: 'CLAIMED', claimUpdatedAt: minutesAgo(10) },
  });
  await prisma.participant.update({ where: { id: asha.id }, data: { status: 'WINNER' } });
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  cleanup?.();
});

describe('campaign dashboard summary (live database)', () => {
  it('AC-DSH-2 reports draw progress', async () => {
    const dashboard = await getCampaignDashboard(campaignId, now);
    expect(dashboard?.campaign).toEqual(expect.objectContaining({ name: 'Autumn Circle', drawCount: 3 }));
    expect(dashboard?.progress).toEqual({ completedDraws: 1, cancelledDraws: 0, remainingDraws: 2, percentComplete: 33 });
  });

  it('AC-DSH-3 computes participant, eligibility, prize and payment metrics from stored records', async () => {
    const dashboard = await getCampaignDashboard(campaignId, now);

    expect(dashboard?.participants).toEqual({ total: 4, addedLast7Days: 3, winners: 1 });
    // Draw 2: Bala and Dev paid; Asha is a winner (waived); Chitra unpaid.
    expect(dashboard?.eligibility).toEqual({ nextDrawEligible: 2, activeParticipants: 3, percentOfActive: 67, pendingForNextDraw: 1 });
    expect(dashboard?.prizes).toEqual({ availableUnits: 4, assignedUnits: 1, totalUnits: 5, prizeCount: 2, unassignedPrizeCount: 1 });
    // Voided payment excluded; 5 paid of 8 payable draw payments.
    expect(dashboard?.payments).toEqual({ collectedPaise: 90_000, transactionCount: 2, dueForNextDrawPaise: 30_000, collectionRatePercent: 63 });
  });

  it('AC-DSH-4 lists upcoming scheduled draws with eligibility that excludes winners', async () => {
    const dashboard = await getCampaignDashboard(campaignId, now);

    expect(dashboard?.upcomingDraws.map(({ drawNumber, eligibleCount, isDue, prizeCount }) => ({ drawNumber, eligibleCount, isDue, prizeCount }))).toEqual([
      { drawNumber: 2, eligibleCount: 2, isDue: true, prizeCount: 2 },
      // Asha's retained-credit payment for draw 3 must not count.
      { drawNumber: 3, eligibleCount: 1, isDue: false, prizeCount: 3 },
    ]);
  });

  it('AC-DSH-6 merges the latest six events newest first', async () => {
    const dashboard = await getCampaignDashboard(campaignId, now);

    expect(dashboard?.activity.map(({ type, participantName }) => `${type}:${participantName}`)).toEqual([
      'PAYMENT_VOIDED:Chitra',
      'CLAIM_UPDATED:Asha',
      'PAYMENT_RECORDED:Chitra',
      'PAYMENT_RECORDED:Dev',
      'PAYMENT_RECORDED:Bala',
      'PARTICIPANT_ADDED:Dev',
    ]);
    expect(dashboard?.activity[3]).toEqual(expect.objectContaining({ amountPaise: 60_000, drawNumbers: [2, 3] }));
  });

  it('returns null for an unknown campaign', async () => {
    expect(await getCampaignDashboard('00000000-0000-4000-8000-000000000000', now)).toBeNull();
  });
});
