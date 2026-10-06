import type { Request, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestDatabase } from './testDatabase';

type DrawService = typeof import('../../src/services/draw.service');

let cleanup: (() => void) | undefined;
let prisma: PrismaClient;
let service: DrawService;
let adminId: string;
let serial = 2000;
const now = new Date('2026-10-05T12:00:00.000Z');
const hoursFromNow = (hours: number) => new Date(now.getTime() + hours * 3_600_000);
const pickIndex = (index: number) => () => index;

beforeAll(async () => {
  ({ cleanup } = createTestDatabase('draws'));
  ({ prisma } = await import('../../src/lib/prisma'));
  service = await import('../../src/services/draw.service');
  adminId = (await prisma.admin.create({ data: { email: 'admin@example.com', name: 'Admin', passwordHash: 'x' } })).id;
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  cleanup?.();
});

/**
 * Draw 1 completed earlier (Esha won it). Draw 2 is due with prize count 2: Gold ×1 (rank 1), Silver ×2 (rank 2).
 * Draw 3 (the final draw) is in 48 hours with a Bicycle ×1.
 * Payments [draw1, draw2, draw3]: Asha, Bala, Chitra paid draw 2; Dev did not; Esha paid but already won.
 */
async function seedCampaign(options: { draw2Payments?: 'none' } = {}) {
  const campaign = await prisma.campaign.create({
    data: { name: `Campaign ${serial}`, durationMonths: 5, drawCount: 3, totalAmountPaise: 90_000, perDrawAmountPaise: 30_000 },
  });
  const draw1 = await prisma.draw.create({ data: { campaignId: campaign.id, drawNumber: 1, scheduledAt: hoursFromNow(-48), prizeCount: 1, status: 'COMPLETED' } });
  const draw2 = await prisma.draw.create({ data: { campaignId: campaign.id, drawNumber: 2, scheduledAt: hoursFromNow(-2), prizeCount: 2 } });
  const draw3 = await prisma.draw.create({ data: { campaignId: campaign.id, drawNumber: 3, scheduledAt: hoursFromNow(48), prizeCount: 2 } });

  const paidDraw2 = options.draw2Payments === 'none' ? 'NOT_PAID' : 'PAID';
  const people: Record<string, string[]> = {
    Asha: ['NOT_PAID', paidDraw2, 'PAID'],
    Bala: ['NOT_PAID', paidDraw2, 'NOT_PAID'],
    Chitra: ['NOT_PAID', paidDraw2, 'NOT_PAID'],
    Dev: ['NOT_PAID', 'NOT_PAID', 'NOT_PAID'],
    Esha: ['PAID', 'PAID', 'NOT_PAID'],
  };
  const ids: Record<string, string> = {};
  for (const [name, statuses] of Object.entries(people)) {
    serial += 1;
    const participant = await prisma.participant.create({
      data: {
        campaignId: campaign.id, name, participantNumber: serial, email: `${name}-${serial}@example.com`,
        drawPayments: { create: [draw1, draw2, draw3].map((draw, index) => ({ drawId: draw.id, status: statuses[index] })) },
      },
    });
    ids[name] = participant.id;
  }

  const gold = await prisma.prize.create({ data: { campaignId: campaign.id, drawId: draw2.id, name: 'Gold coin', rank: 1, totalQuantity: 1 } });
  const silver = await prisma.prize.create({ data: { campaignId: campaign.id, drawId: draw2.id, name: 'Silver coin', rank: 2, totalQuantity: 2 } });
  const bicycle = await prisma.prize.create({ data: { campaignId: campaign.id, drawId: draw3.id, name: 'Bicycle', rank: 1, totalQuantity: 1 } });
  const draw1Prize = await prisma.prize.create({ data: { campaignId: campaign.id, drawId: draw1.id, name: 'Watch', rank: 1, totalQuantity: 1, assignedQuantity: 1 } });
  await prisma.winner.create({ data: { drawId: draw1.id, participantId: ids.Esha, prizeId: draw1Prize.id } });

  return { campaign, draw2, draw3, ids, gold, silver, bicycle };
}

const manualDetails = {
  mode: 'MANUAL' as const,
  heldAt: hoursFromNow(-1),
  conductedBy: 'Ravi Kumar',
  drawMethod: 'Chits drawn from a sealed box',
  venue: 'Community hall',
  witnesses: 'Anil, Sunita',
  notes: null,
  evidenceReference: 'https://example.com/video/draw-2',
};

async function expectRejected(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('starting a draw (live database)', () => {
  it('AC-DRW-1/3 starts a due draw once, fixing the mode and number of rounds', async () => {
    const { draw2, draw3, ids } = await seedCampaign();

    const { draw, warning } = await service.startDraw(draw2.id, adminId, { mode: 'AUTOMATIC' }, now);

    expect(warning).toBeNull();
    expect(draw).toMatchObject({
      status: 'IN_PROGRESS', executionMode: 'AUTOMATIC', totalRounds: 2, roundsCompleted: 0,
      startedAt: now, heldAt: now, executedAt: null, executedByAdminId: adminId,
    });
    expect(draw.poolSnapshot).toEqual([ids.Asha, ids.Bala, ids.Chitra]);
    await expectRejected(service.startDraw(draw2.id, adminId, { mode: 'AUTOMATIC' }, now), 'DRAW_ALREADY_STARTED');
    await expectRejected(service.startDraw(draw3.id, adminId, { mode: 'AUTOMATIC' }, now), 'DRAW_NOT_DUE');
  });

  it('AC-DRW-4 completes at once with a warning when nobody is eligible', async () => {
    const { draw2 } = await seedCampaign({ draw2Payments: 'none' });

    const { draw, warning } = await service.startDraw(draw2.id, adminId, { mode: 'AUTOMATIC' }, now);

    expect(draw).toMatchObject({ status: 'COMPLETED', totalRounds: 0, executedAt: now });
    expect(warning).toMatch(/no eligible participants/);
  });
});

describe('drawing rounds (live database)', () => {
  it('AC-DRW-2/5/7/11 draws one winner per round for the chosen prize and completes after the last round', async () => {
    const { draw2, draw3, ids, gold, silver } = await seedCampaign();
    await service.startDraw(draw2.id, adminId, { mode: 'AUTOMATIC' }, now);

    // Round 1: Silver first (lowest prize), random index 2 of [Asha, Bala, Chitra] → Chitra.
    const first = await service.drawRound(draw2.id, adminId, { round: 1, prizeId: silver.id }, now, pickIndex(2));
    expect(first.winner).toMatchObject({ drawPosition: 1, participantId: ids.Chitra, prizeId: silver.id, drawnAt: now, recordedByAdminId: adminId });
    expect(first.winner.poolSnapshot).toEqual([ids.Asha, ids.Bala, ids.Chitra]);
    expect(first.progress).toEqual({ roundsCompleted: 1, totalRounds: 2, completed: false });
    expect(await prisma.draw.findUniqueOrThrow({ where: { id: draw2.id } })).toMatchObject({ status: 'IN_PROGRESS', roundsCompleted: 1 });

    // Round 2: Chitra is no longer in the pool; index 0 of [Asha, Bala] → Asha gets Gold.
    const second = await service.drawRound(draw2.id, adminId, { round: 2, prizeId: gold.id }, hoursFromNow(0.1), pickIndex(0));
    expect(second.winner).toMatchObject({ drawPosition: 2, participantId: ids.Asha, prizeId: gold.id });
    expect(second.winner.poolSnapshot).toEqual([ids.Asha, ids.Bala]);
    expect(second.progress).toEqual({ roundsCompleted: 2, totalRounds: 2, completed: true });

    expect(await prisma.draw.findUniqueOrThrow({ where: { id: draw2.id } })).toMatchObject({ status: 'COMPLETED', executedAt: hoursFromNow(0.1) });
    const prizes = await prisma.prize.findMany({ where: { id: { in: [gold.id, silver.id] } }, orderBy: { rank: 'asc' } });
    expect(prizes.map(({ assignedQuantity }) => assignedQuantity)).toEqual([1, 1]);
    const later = await prisma.drawPayment.findMany({ where: { drawId: draw3.id, participantId: { in: [ids.Asha, ids.Chitra] } } });
    expect(later.find(({ participantId }) => participantId === ids.Chitra)).toMatchObject({ status: 'WAIVED' });
    expect(later.find(({ participantId }) => participantId === ids.Asha)).toMatchObject({ status: 'PAID', retainedCredit: true });
    expect((await prisma.participant.findUniqueOrThrow({ where: { id: ids.Asha } })).status).toBe('WINNER');
  });

  it('AC-DRW-8 rejects a repeated or concurrent round without creating a second winner', async () => {
    const { draw2, silver } = await seedCampaign();
    await service.startDraw(draw2.id, adminId, { mode: 'AUTOMATIC' }, now);
    await service.drawRound(draw2.id, adminId, { round: 1, prizeId: silver.id }, now, pickIndex(0));

    await expectRejected(service.drawRound(draw2.id, adminId, { round: 1, prizeId: silver.id }, now, pickIndex(0)), 'ROUND_CONFLICT');
    await expectRejected(service.drawRound(draw2.id, adminId, { round: 3, prizeId: silver.id }, now, pickIndex(0)), 'ROUND_CONFLICT');

    const outcomes = await Promise.allSettled([
      service.drawRound(draw2.id, adminId, { round: 2, prizeId: silver.id }, now, pickIndex(0)),
      service.drawRound(draw2.id, adminId, { round: 2, prizeId: silver.id }, now, pickIndex(0)),
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.winner.count({ where: { drawId: draw2.id } })).toBe(2);
    await expectRejected(service.drawRound(draw2.id, adminId, { round: 3, prizeId: silver.id }, now), 'DRAW_NOT_IN_PROGRESS');
  });

  it('AC-DRW-5 rejects prizes without units or from another draw and leaves the round available', async () => {
    const { draw2, gold, bicycle } = await seedCampaign();
    await service.startDraw(draw2.id, adminId, { mode: 'AUTOMATIC' }, now);
    await service.drawRound(draw2.id, adminId, { round: 1, prizeId: gold.id }, now, pickIndex(0));

    await expectRejected(service.drawRound(draw2.id, adminId, { round: 2, prizeId: gold.id }, now), 'PRIZE_UNAVAILABLE');
    await expectRejected(service.drawRound(draw2.id, adminId, { round: 2, prizeId: bicycle.id }, now), 'PRIZE_UNAVAILABLE');
    expect(await prisma.draw.findUniqueOrThrow({ where: { id: draw2.id } })).toMatchObject({ roundsCompleted: 1, status: 'IN_PROGRESS' });
  });

  it('AC-WIN-4 marks non-winners completed when the final draw’s last round is drawn', async () => {
    const { draw3, ids, bicycle } = await seedCampaign();
    const later = hoursFromNow(49);

    // Only Asha paid draw 3, so it has one round.
    const { draw } = await service.startDraw(draw3.id, adminId, { mode: 'AUTOMATIC' }, later);
    expect(draw.totalRounds).toBe(1);
    await service.drawRound(draw3.id, adminId, { round: 1, prizeId: bicycle.id }, later);

    const statuses = await prisma.participant.findMany({ where: { id: { in: Object.values(ids) } }, select: { name: true, status: true } });
    expect(Object.fromEntries(statuses.map(({ name, status }) => [name, status]))).toMatchObject({
      Asha: 'WINNER', Bala: 'COMPLETED', Chitra: 'COMPLETED', Dev: 'COMPLETED',
    });
  });
});

describe('manual draws (live database)', () => {
  it('AC-MDR-1..4 records the offline winner of each round and keeps the mode for every round', async () => {
    const { draw2, ids, gold, silver } = await seedCampaign();

    const { draw } = await service.startDraw(draw2.id, adminId, manualDetails, now);
    expect(draw).toMatchObject({ executionMode: 'MANUAL', heldAt: manualDetails.heldAt, status: 'IN_PROGRESS' });
    expect(draw.manualRecord).toMatchObject({ conductedBy: 'Ravi Kumar', drawMethod: 'Chits drawn from a sealed box' });

    await expectRejected(service.drawRound(draw2.id, adminId, { round: 1, prizeId: silver.id }, now), 'VALIDATION_ERROR');
    await expectRejected(service.drawRound(draw2.id, adminId, { round: 1, prizeId: silver.id, participantId: ids.Dev }, now), 'INELIGIBLE_WINNER');
    await expectRejected(service.drawRound(draw2.id, adminId, { round: 1, prizeId: silver.id, participantId: ids.Esha }, now), 'INELIGIBLE_WINNER');

    await service.drawRound(draw2.id, adminId, { round: 1, prizeId: silver.id, participantId: ids.Bala }, now);
    await expectRejected(service.drawRound(draw2.id, adminId, { round: 2, prizeId: gold.id, participantId: ids.Bala }, now), 'INELIGIBLE_WINNER');
    const last = await service.drawRound(draw2.id, adminId, { round: 2, prizeId: gold.id, participantId: ids.Chitra }, now);
    expect(last.progress.completed).toBe(true);

    const result = await service.getDrawResult(draw2.id);
    expect(result?.winners.map(({ drawPosition, participant, prize }) => [drawPosition, participant.name, prize.name])).toEqual([
      [1, 'Bala', 'Silver coin'],
      [2, 'Chitra', 'Gold coin'],
    ]);
  });

  it('AC-MDR-2 checks the held time, and automatic rounds refuse a chosen participant', async () => {
    const { draw2, ids, silver } = await seedCampaign();

    await expectRejected(service.startDraw(draw2.id, adminId, { ...manualDetails, heldAt: hoursFromNow(-3) }, now), 'VALIDATION_ERROR');
    await expectRejected(service.startDraw(draw2.id, adminId, { ...manualDetails, heldAt: hoursFromNow(1) }, now), 'VALIDATION_ERROR');
    expect(await prisma.draw.findUniqueOrThrow({ where: { id: draw2.id } })).toMatchObject({ status: 'SCHEDULED', startedAt: null });

    await service.startDraw(draw2.id, adminId, { mode: 'AUTOMATIC' }, now);
    await expectRejected(service.drawRound(draw2.id, adminId, { round: 1, prizeId: silver.id, participantId: ids.Asha }, now), 'VALIDATION_ERROR');
  });
});

describe('locks while a draw is in progress (live database)', () => {
  it('AC-DRW-10 blocks payments and prize stock changes, but allows description edits', async () => {
    const { draw2, ids, silver } = await seedCampaign();
    const { recordParticipantPayment } = await import('../../src/services/payment.service');
    const { updatePrize, deletePrize } = await import('../../src/controllers/prize.controller');
    await service.startDraw(draw2.id, adminId, { mode: 'AUTOMATIC' }, now);

    await expect(recordParticipantPayment(ids.Dev, adminId, { drawIds: [draw2.id], method: 'CASH' })).rejects.toMatchObject({ code: 'PAYMENT_NOT_ALLOWED' });

    const call = async (handler: typeof updatePrize, body: Record<string, unknown> = {}) => {
      const response = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn() };
      await handler({ params: { id: silver.id }, body } as unknown as Request, response as unknown as Response);
      return response;
    };
    expect((await call(updatePrize, { totalQuantity: 5 })).status).toHaveBeenCalledWith(409);
    expect((await call(deletePrize)).status).toHaveBeenCalledWith(409);
    const descriptionEdit = await call(updatePrize, { description: 'Sponsored by the bank' });
    expect(descriptionEdit.status).not.toHaveBeenCalled();
    expect(descriptionEdit.json).toHaveBeenCalledWith({ prize: expect.objectContaining({ description: 'Sponsored by the bank' }) });
  });
});

describe('draw pool', () => {
  it('reports planned rounds before the start and current progress afterwards', async () => {
    const { draw2, ids, silver } = await seedCampaign();

    expect(await service.getDrawPool(draw2.id)).toMatchObject({ totalRounds: 2, roundsCompleted: 0 });
    await service.startDraw(draw2.id, adminId, { mode: 'AUTOMATIC' }, now);
    await service.drawRound(draw2.id, adminId, { round: 1, prizeId: silver.id }, now, pickIndex(0));

    const pool = await service.getDrawPool(draw2.id);
    expect(pool).toMatchObject({ totalRounds: 2, roundsCompleted: 1 });
    expect(pool?.participants.map(({ id }) => id)).toEqual([ids.Bala, ids.Chitra]);
    expect(pool?.prizes).toEqual([
      expect.objectContaining({ name: 'Gold coin', available: 1 }),
      expect.objectContaining({ name: 'Silver coin', available: 1 }),
    ]);
  });
});
