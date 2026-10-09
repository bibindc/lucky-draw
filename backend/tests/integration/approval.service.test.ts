import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestDatabase } from './testDatabase';

type Service = typeof import('../../src/services/approval.service');

let cleanup: (() => void) | undefined;
let prisma: PrismaClient;
let service: Service;
let suggestSerial: typeof import('../../src/services/participantSerial.service').suggestSerial;
let adminId: string;
let agentId: string;
let otherAgentId: string;
let serial = 5000;

beforeAll(async () => {
  ({ cleanup } = createTestDatabase('approvals'));
  ({ prisma } = await import('../../src/lib/prisma'));
  service = await import('../../src/services/approval.service');
  ({ suggestSerial } = await import('../../src/services/participantSerial.service'));
  adminId = (await prisma.admin.create({ data: { email: 'admin@example.com', name: 'Meera', passwordHash: 'x' } })).id;
  agentId = (await prisma.agent.create({ data: { agentCode: 'AG-1000', name: 'Agent One', email: 'a1@example.com', mobile: '9876543210', passwordHash: 'x' } })).id;
  otherAgentId = (await prisma.agent.create({ data: { agentCode: 'AG-1001', name: 'Agent Two', email: 'a2@example.com', mobile: '9876543211', passwordHash: 'x' } })).id;
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  cleanup?.();
});

/** Campaign with 3 future draws, one own participant, one other agent's, and a winner record owned by the agent. */
async function seed() {
  serial += 10;
  const campaign = await prisma.campaign.create({
    data: {
      name: `Campaign ${serial}`, durationMonths: 5, drawCount: 3, totalAmountPaise: 90_000, perDrawAmountPaise: 30_000,
      draws: { create: [1, 2, 3].map((drawNumber) => ({ drawNumber, scheduledAt: new Date(Date.UTC(2027, drawNumber, 1)), prizeCount: 1 })) },
    },
    include: { draws: { orderBy: { drawNumber: 'asc' } } },
  });
  const person = async (name: string, owner: string, statuses = ['NOT_PAID', 'NOT_PAID', 'NOT_PAID']) => {
    serial += 1;
    return prisma.participant.create({
      data: {
        campaignId: campaign.id, agentId: owner, name, participantNumber: serial, mobile: `9${String(serial).padStart(9, '0')}`,
        drawPayments: { create: campaign.draws.map((draw, index) => ({ drawId: draw.id, status: statuses[index] })) },
      },
    });
  };
  const own = await person('Own Participant', agentId);
  const others = await person('Other Agent Participant', otherAgentId);
  const winnerPerson = await person('Winner Person', agentId, ['PAID', 'WAIVED', 'WAIVED']);
  const prize = await prisma.prize.create({ data: { campaignId: campaign.id, drawId: campaign.draws[0].id, name: 'Watch', rank: 1, totalQuantity: 1, assignedQuantity: 1 } });
  const winner = await prisma.winner.create({ data: { drawId: campaign.draws[0].id, participantId: winnerPerson.id, prizeId: prize.id } });
  return { campaign, own, others, winner };
}

async function expectRejected(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

const payment = (participantId: string, count = 2) => ({ type: 'PAYMENT' as const, participantId, payload: { count, method: 'CASH' } });

describe('submitting requests (live database)', () => {
  it('AC-APR-1 checks rules on submission and changes nothing until approved', async () => {
    const { own, others } = await seed();

    await expectRejected(service.submitRequest(agentId, payment(own.id, 4)), 'PAYMENT_NOT_ALLOWED');
    await expectRejected(service.submitRequest(agentId, payment(others.id)), 'NOT_FOUND');
    await expectRejected(service.submitRequest(agentId, { type: 'PARTICIPANT_UPDATE', participantId: own.id, payload: { agentId: otherAgentId } }), 'VALIDATION_ERROR');
    await expectRejected(service.submitRequest(agentId, { type: 'PARTICIPANT_UPDATE', participantId: own.id, payload: { mobile: '123' } }), 'VALIDATION_ERROR');

    const request = await service.submitRequest(agentId, payment(own.id));
    expect(request).toMatchObject({ status: 'PENDING', type: 'PAYMENT', agent: { agentCode: 'AG-1000' }, pendingKey: `PAYMENT:${own.id}` });
    expect(await prisma.paymentTransaction.count({ where: { participantId: own.id } })).toBe(0);
  });

  it('AC-APR-3 allows one pending request per item, even when submitted at the same moment', async () => {
    const { own } = await seed();

    const outcomes = await Promise.allSettled([service.submitRequest(agentId, payment(own.id)), service.submitRequest(agentId, payment(own.id, 1))]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find(({ status }) => status === 'rejected')).toMatchObject({ reason: { code: 'REQUEST_ALREADY_PENDING' } });
    // A different kind of request for the same participant is fine.
    await service.submitRequest(agentId, { type: 'PARTICIPANT_UPDATE', participantId: own.id, payload: { name: 'Renamed' } });
  });

  it('AC-APR-3 reserves a pending new participant’s serial number and contacts', async () => {
    const { campaign } = await seed();
    const next = await suggestSerial(prisma);

    await service.submitRequest(agentId, { type: 'PARTICIPANT_CREATE', campaignId: campaign.id, payload: { name: 'New Person', mobile: '9123456780', participantNumber: next } });
    expect(await suggestSerial(prisma)).not.toBe(next);

    await expectRejected(service.submitRequest(agentId, { type: 'PARTICIPANT_CREATE', campaignId: campaign.id, payload: { name: 'Copy', mobile: '9000000001', participantNumber: next } }), 'DUPLICATE_SERIAL');
    await expectRejected(service.submitRequest(agentId, { type: 'PARTICIPANT_CREATE', campaignId: campaign.id, payload: { name: 'Copy', mobile: '9123456780', participantNumber: 9900 } }), 'DUPLICATE_PARTICIPANT');
    await expectRejected(service.submitRequest(agentId, { type: 'PARTICIPANT_CREATE', campaignId: campaign.id, payload: { name: 'No serial', mobile: '9000000002' } }), 'VALIDATION_ERROR');
    await expectRejected(service.submitRequest(agentId, { type: 'PARTICIPANT_CREATE', campaignId: campaign.id, payload: { name: 'Other', mobile: '9000000003', participantNumber: 9901, agentId: otherAgentId } }), 'VALIDATION_ERROR');
  });
});

describe('approving requests (live database)', () => {
  it('AC-APR-6 applies each request type exactly like the super admin’s own action', async () => {
    const { campaign, own, winner } = await seed();
    const option = await prisma.complimentaryOption.create({ data: { campaignId: campaign.id, name: 'Cooker' } });

    const create = await service.submitRequest(agentId, { type: 'PARTICIPANT_CREATE', campaignId: campaign.id, payload: { name: 'Field Signup', mobile: '9111111111', participantNumber: 8000, address: 'Kochi' } });
    const created = await service.approveRequest(create.id, adminId);
    expect(created).toMatchObject({ status: 'APPROVED', decidedByAdmin: { name: 'Meera' }, pendingKey: null });
    expect(await prisma.participant.findUniqueOrThrow({ where: { id: created.participantId! } }))
      .toMatchObject({ participantNumber: 8000, agentId, address: 'Kochi', campaignId: campaign.id });

    await service.approveRequest((await service.submitRequest(agentId, { type: 'PARTICIPANT_UPDATE', participantId: own.id, payload: { address: 'Thrissur' } })).id, adminId);
    expect((await prisma.participant.findUniqueOrThrow({ where: { id: own.id } })).address).toBe('Thrissur');

    await service.approveRequest((await service.submitRequest(agentId, payment(own.id, 3))).id, adminId);
    expect(await prisma.paymentTransaction.findFirstOrThrow({ where: { participantId: own.id } }))
      .toMatchObject({ amountPaise: 90_000, recordedByAdminId: adminId, collectedByAgentId: agentId });

    await service.approveRequest((await service.submitRequest(agentId, { type: 'WINNER_CLAIM', winnerId: winner.id, payload: { claimStatus: 'DELIVERED', claimNote: 'Handed over' } })).id, adminId);
    expect(await prisma.winner.findUniqueOrThrow({ where: { id: winner.id } })).toMatchObject({ claimStatus: 'DELIVERED', claimNote: 'Handed over' });

    await service.approveRequest((await service.submitRequest(agentId, { type: 'COMPLIMENTARY_CHOICE', participantId: own.id, payload: { optionId: option.id } })).id, adminId);
    await service.approveRequest((await service.submitRequest(agentId, { type: 'COMPLIMENTARY_DELIVERY', participantId: own.id, payload: { note: 'At office' } })).id, adminId);
    expect(await prisma.complimentaryChoice.findUniqueOrThrow({ where: { participantId: own.id } })).toMatchObject({
      status: 'DELIVERED', chosenByAgentId: agentId, chosenByAdminId: adminId, deliveredByAgentId: agentId, deliveredByAdminId: adminId, deliveryNote: 'At office',
    });
  });

  it('AC-APR-6 keeps a request pending when a rule fails at approval time', async () => {
    const { campaign, own } = await seed();
    const request = await service.submitRequest(agentId, payment(own.id, 3));
    await prisma.draw.update({ where: { campaignId_drawNumber: { campaignId: campaign.id, drawNumber: 1 } }, data: { status: 'IN_PROGRESS' } });

    await expectRejected(service.approveRequest(request.id, adminId), 'PAYMENT_NOT_ALLOWED');
    expect(await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } })).toMatchObject({ status: 'PENDING', decidedAt: null });
    expect(await prisma.paymentTransaction.count({ where: { participantId: own.id } })).toBe(0);
  });

  it('AC-APR-7 approves an edited request and keeps the agent’s original', async () => {
    const { own } = await seed();
    const request = await service.submitRequest(agentId, payment(own.id, 3));

    await expectRejected(service.approveRequest(request.id, adminId, { count: 9, method: 'CASH' }), 'PAYMENT_NOT_ALLOWED');
    await expectRejected(service.approveRequest(request.id, adminId, { count: 1, method: 'CHEQUE' }), 'VALIDATION_ERROR');
    const approved = await service.approveRequest(request.id, adminId, { count: 1, method: 'UPI', reference: 'Corrected' });

    expect(approved).toMatchObject({ payload: { count: 1, method: 'UPI' }, originalPayload: { count: 3, method: 'CASH' } });
    expect(await prisma.paymentTransaction.findFirstOrThrow({ where: { participantId: own.id } })).toMatchObject({ amountPaise: 30_000, method: 'UPI' });
  });

  it('AC-PAY-8 records the date the agent collected the payment, not the approval date', async () => {
    const { own } = await seed();
    const request = await service.submitRequest(agentId, { type: 'PAYMENT', participantId: own.id, payload: { count: 1, method: 'CASH', paidOn: '2026-01-15' } });

    await service.approveRequest(request.id, adminId);

    const recorded = await prisma.paymentTransaction.findFirstOrThrow({ where: { participantId: own.id } });
    expect(recorded.paidOn.toISOString()).toBe('2026-01-14T18:30:00.000Z');
    expect(recorded.createdAt.getTime()).toBeGreaterThan(recorded.paidOn.getTime());
  });

  it('AC-APR-8/5 rejects with a reason, after which the agent can resubmit or withdraw', async () => {
    const { own } = await seed();
    const first = await service.submitRequest(agentId, payment(own.id));

    const rejected = await service.rejectRequest(first.id, adminId, 'Cash not received at office');
    expect(rejected).toMatchObject({ status: 'REJECTED', rejectionReason: 'Cash not received at office', pendingKey: null });
    expect(await prisma.paymentTransaction.count({ where: { participantId: own.id } })).toBe(0);

    const second = await service.submitRequest(agentId, payment(own.id));
    await expectRejected(service.withdrawRequest(second.id, otherAgentId), 'NOT_FOUND');
    expect(await service.withdrawRequest(second.id, agentId)).toMatchObject({ status: 'WITHDRAWN' });
  });

  it('AC-APR-9 decides a request only once, even with simultaneous approvals', async () => {
    const { own } = await seed();
    const request = await service.submitRequest(agentId, payment(own.id, 1));

    const outcomes = await Promise.allSettled([service.approveRequest(request.id, adminId), service.approveRequest(request.id, adminId)]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find(({ status }) => status === 'rejected')).toMatchObject({ reason: { code: 'REQUEST_NOT_PENDING' } });
    expect(await prisma.paymentTransaction.count({ where: { participantId: own.id } })).toBe(1);

    await expectRejected(service.rejectRequest(request.id, adminId, 'Too late'), 'REQUEST_NOT_PENDING');
    await expectRejected(service.withdrawRequest(request.id, agentId), 'REQUEST_NOT_PENDING');
  });
});

describe('reading requests (live database)', () => {
  it('AC-APR-4/5 scopes lists to the agent, filters by status, counts pending, and shows current values', async () => {
    const { own } = await seed();
    const request = await service.submitRequest(agentId, { type: 'PARTICIPANT_UPDATE', participantId: own.id, payload: { name: 'New Name' } });

    const mine = await service.listRequests({ status: 'PENDING' }, { role: 'AGENT', agentId });
    expect(mine.every((item) => item.agentId === agentId)).toBe(true);
    expect(await service.listRequests({}, { role: 'AGENT', agentId: otherAgentId })).toEqual([]);
    expect(await service.pendingCount()).toBeGreaterThan(0);

    const detail = await service.getRequest(request.id, { role: 'SUPER_ADMIN', adminId });
    expect(detail).toMatchObject({ payload: { name: 'New Name' }, current: { name: 'Own Participant' } });
    await expectRejected(service.getRequest(request.id, { role: 'AGENT', agentId: otherAgentId }), 'NOT_FOUND');
  });
});
