import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestDatabase } from './testDatabase';

type Service = typeof import('../../src/services/complimentary.service');

let cleanup: (() => void) | undefined;
let prisma: PrismaClient;
let service: Service;
let payments: typeof import('../../src/services/payment.service');
let draws: typeof import('../../src/services/draw.service');
let adminId: string;
let agentId: string;
let otherAgentId: string;
let serial = 3000;
const now = new Date('2026-10-05T12:00:00.000Z');
const hoursFromNow = (hours: number) => new Date(now.getTime() + hours * 3_600_000);

const admin = () => ({ role: 'SUPER_ADMIN' as const, adminId });
const agent = (id = agentId) => ({ role: 'AGENT' as const, agentId: id });

beforeAll(async () => {
  ({ cleanup } = createTestDatabase('complimentary'));
  ({ prisma } = await import('../../src/lib/prisma'));
  service = await import('../../src/services/complimentary.service');
  payments = await import('../../src/services/payment.service');
  draws = await import('../../src/services/draw.service');
  adminId = (await prisma.admin.create({ data: { email: 'admin@example.com', name: 'Admin', passwordHash: 'x' } })).id;
  agentId = (await prisma.agent.create({ data: { agentCode: 'AG-1000', name: 'Agent One', email: 'a1@example.com', mobile: '9876543210', passwordHash: 'x' } })).id;
  otherAgentId = (await prisma.agent.create({ data: { agentCode: 'AG-1001', name: 'Agent Two', email: 'a2@example.com', mobile: '9876543211', passwordHash: 'x' } })).id;
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  cleanup?.();
});

/** Campaign with draw 1 due now and draw 2 next week; options Dinner set and Cooker (active), Old mixer (inactive). */
async function seed() {
  serial += 10;
  const campaign = await prisma.campaign.create({
    data: {
      name: `Campaign ${serial}`, durationMonths: 5, drawCount: 2, totalAmountPaise: 60_000, perDrawAmountPaise: 30_000,
      draws: { create: [
        { drawNumber: 1, scheduledAt: hoursFromNow(-1), prizeCount: 1 },
        { drawNumber: 2, scheduledAt: hoursFromNow(168), prizeCount: 1 },
      ] },
    },
    include: { draws: { orderBy: { drawNumber: 'asc' } } },
  });
  const [draw1] = campaign.draws;
  const prize = await prisma.prize.create({ data: { campaignId: campaign.id, drawId: draw1.id, name: 'Bicycle', rank: 1, totalQuantity: 1 } });

  const person = async (name: string, paidDraws: number, owner = agentId) => {
    serial += 1;
    const participant = await prisma.participant.create({
      data: {
        campaignId: campaign.id, agentId: owner, name, participantNumber: serial, mobile: `9${String(serial).padStart(9, '0')}`,
        drawPayments: { create: campaign.draws.map((draw) => ({ drawId: draw.id })) },
      },
    });
    if (paidDraws) await payments.recordParticipantPayment(participant.id, adminId, { count: paidDraws, method: 'CASH' });
    return participant.id;
  };

  const dinner = await service.createOption(campaign.id, { name: 'Dinner set', description: '24-piece', valuePaise: 150_000 });
  const cooker = await service.createOption(campaign.id, { name: 'Cooker' });
  const old = await service.createOption(campaign.id, { name: 'Old mixer' });
  await service.updateOption(old.id, { isActive: false });

  return {
    campaign, draw1, prize, dinner, cooker, old,
    full: await person('Full Payer', 2),
    partial: await person('Partial Payer', 1),
    otherAgents: await person('Other Agent Payer', 2, otherAgentId),
  };
}

async function expectRejected(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('complimentary options (live database)', () => {
  it('AC-CMP-1 adds, renames and deactivates options; duplicate names are rejected', async () => {
    const { campaign, dinner, old } = await seed();

    // Names are compared case-insensitively (the validator trims them before they reach the service).
    await expectRejected(service.createOption(campaign.id, { name: 'dinner SET' }), 'DUPLICATE_OPTION');
    await expectRejected(service.updateOption(old.id, { name: 'Cooker' }), 'DUPLICATE_OPTION');
    expect((await service.updateOption(dinner.id, { name: 'Dinner set (24 pc)' })).name).toBe('Dinner set (24 pc)');

    expect((await service.listOptions(campaign.id, admin())).map(({ name, isActive }) => `${name}:${isActive}`))
      .toEqual(['Cooker:true', 'Dinner set (24 pc):true', 'Old mixer:false']);
    expect((await service.listOptions(campaign.id, agent())).map(({ name }) => name)).toEqual(['Cooker', 'Dinner set (24 pc)']);
  });
});

describe('eligibility and choices (live database)', () => {
  it('AC-CMP-2 is eligible only with every draw paid and no win', async () => {
    const { full, partial } = await seed();

    expect(await service.getParticipantComplimentary(full, admin())).toMatchObject({ eligible: true, paidDraws: 2, totalDraws: 2, isWinner: false, status: 'NOT_CHOSEN', choice: null });
    expect(await service.getParticipantComplimentary(partial, admin())).toMatchObject({ eligible: false, paidDraws: 1, totalDraws: 2 });
  });

  it('AC-CMP-3/5 records one final choice from an active option of the campaign', async () => {
    const { campaign, full, partial, cooker, old } = await seed();
    const other = await seed();

    await expectRejected(service.recordChoice(partial, cooker.id, admin(), now), 'NOT_ELIGIBLE_COMPLIMENTARY');
    await expectRejected(service.recordChoice(full, old.id, admin(), now), 'OPTION_UNAVAILABLE');
    await expectRejected(service.recordChoice(full, other.cooker.id, admin(), now), 'OPTION_UNAVAILABLE');

    const choice = await service.recordChoice(full, cooker.id, admin(), now);
    expect(choice).toMatchObject({ status: 'CHOSEN', option: { name: 'Cooker' }, chosenAt: now, chosenByAdmin: { id: adminId } });
    await expectRejected(service.recordChoice(full, cooker.id, admin(), now), 'COMPLIMENTARY_ALREADY_CHOSEN');

    const options = await service.listOptions(campaign.id, admin());
    expect(options.find(({ name }) => name === 'Cooker')).toMatchObject({ chosenCount: 1, deliveredCount: 0 });
  });

  it('AC-CMP-3 lets only one of two simultaneous first choices succeed', async () => {
    const { full, cooker, dinner } = await seed();

    const outcomes = await Promise.allSettled([
      service.recordChoice(full, cooker.id, admin(), now),
      service.recordChoice(full, dinner.id, agent(), now),
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find(({ status }) => status === 'rejected')).toMatchObject({ reason: { code: 'COMPLIMENTARY_ALREADY_CHOSEN' } });
  });

  it('AC-CMP-10 limits agents to their own participants', async () => {
    const { full, otherAgents, cooker } = await seed();

    await expectRejected(service.getParticipantComplimentary(otherAgents, agent()), 'NOT_FOUND');
    await expectRejected(service.recordChoice(otherAgents, cooker.id, agent(), now), 'NOT_FOUND');
    expect(await service.recordChoice(full, cooker.id, agent(), now)).toMatchObject({ chosenByAgent: { id: agentId }, chosenByAdmin: null });
  });

  it('AC-CMP-4 marks a chosen prize delivered once, with a valid date and note', async () => {
    const { full, partial, cooker } = await seed();
    await service.recordChoice(full, cooker.id, admin(), now);

    await expectRejected(service.deliverChoice(partial, { note: null }, admin(), now), 'COMPLIMENTARY_NOT_CHOSEN');
    await expectRejected(service.deliverChoice(full, { deliveredAt: hoursFromNow(1), note: null }, admin(), now), 'VALIDATION_ERROR');
    await expectRejected(service.deliverChoice(full, { deliveredAt: hoursFromNow(-1), note: null }, admin(), now), 'VALIDATION_ERROR');

    const delivered = await service.deliverChoice(full, { note: 'Handed over at office' }, agent(), hoursFromNow(2));
    expect(delivered).toMatchObject({ status: 'DELIVERED', deliveredAt: hoursFromNow(2), deliveryNote: 'Handed over at office', deliveredByAgent: { id: agentId } });
    await expectRejected(service.deliverChoice(full, { note: null }, admin(), hoursFromNow(3)), 'COMPLIMENTARY_NOT_CHOSEN');
  });
});

describe('automatic cancellation (live database)', () => {
  async function win(drawId: string, prizeId: string, participantId: string) {
    await draws.startDraw(drawId, adminId, { mode: 'MANUAL', heldAt: now, conductedBy: 'Ravi', drawMethod: 'Chits', venue: null, witnesses: null, notes: null, evidenceReference: null }, now);
    await draws.drawRound(drawId, adminId, { round: 1, prizeId, participantId }, now);
  }

  it('AC-CMP-6 cancels an undelivered choice when the participant wins', async () => {
    const { draw1, prize, full, cooker } = await seed();
    await service.recordChoice(full, cooker.id, admin(), now);

    await win(draw1.id, prize.id, full);

    expect(await service.getParticipantComplimentary(full, admin())).toMatchObject({
      eligible: false, isWinner: true, status: 'CANCELLED', choice: { status: 'CANCELLED', cancelReason: 'Won draw 1' },
    });
  });

  it('AC-CMP-6 keeps a delivered prize and flags it when the participant later wins', async () => {
    const { campaign, draw1, prize, full, cooker } = await seed();
    await service.recordChoice(full, cooker.id, admin(), now);
    await service.deliverChoice(full, { note: null }, admin(), now);

    await win(draw1.id, prize.id, full);

    const rows = await service.listCampaignComplimentary(campaign.id, {}, admin());
    expect(rows.find(({ id }) => id === full)).toMatchObject({ status: 'DELIVERED_BEFORE_WINNING', choice: { status: 'DELIVERED' } });
  });

  it('AC-CMP-7 cancels an undelivered choice on a void, allows choosing again after repaying, and blocks voids once delivered', async () => {
    const { full, cooker, dinner } = await seed();
    await service.recordChoice(full, cooker.id, admin(), now);
    const [payment] = await prisma.paymentTransaction.findMany({ where: { participantId: full } });

    await payments.voidParticipantPayment(payment.id);
    expect(await service.getParticipantComplimentary(full, admin())).toMatchObject({ eligible: false, choice: { status: 'CANCELLED', cancelReason: 'Payment voided' } });

    await payments.recordParticipantPayment(full, adminId, { count: 2, method: 'UPI' });
    const again = await service.recordChoice(full, dinner.id, admin(), now);
    expect(again).toMatchObject({ status: 'CHOSEN', option: { name: 'Dinner set' }, cancelReason: null });
    expect(await prisma.complimentaryChoice.count({ where: { participantId: full } })).toBe(1);

    await service.deliverChoice(full, { note: null }, admin(), now);
    const [repayment] = await prisma.paymentTransaction.findMany({ where: { participantId: full, status: 'RECORDED' } });
    await expect(payments.voidParticipantPayment(repayment.id)).rejects.toMatchObject({ code: 'PAYMENT_NOT_ALLOWED' });
  });
});

describe('campaign list (live database)', () => {
  it('AC-CMP-9 lists eligible participants and choices with status filter and search', async () => {
    const { campaign, full, partial, otherAgents, cooker } = await seed();
    await service.recordChoice(otherAgents, cooker.id, admin(), now);

    const all = await service.listCampaignComplimentary(campaign.id, {}, admin());
    expect(all.map(({ id, status }) => [id, status])).toEqual([[full, 'NOT_CHOSEN'], [otherAgents, 'CHOSEN']]);
    expect(all.some(({ id }) => id === partial)).toBe(false);

    expect((await service.listCampaignComplimentary(campaign.id, { status: 'CHOSEN' }, admin())).map(({ id }) => id)).toEqual([otherAgents]);
    expect((await service.listCampaignComplimentary(campaign.id, { search: 'Full' }, admin())).map(({ id }) => id)).toEqual([full]);
    expect((await service.listCampaignComplimentary(campaign.id, {}, agent())).map(({ id }) => id)).toEqual([full]);
  });
});
