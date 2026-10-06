import type { Request, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestDatabase } from './testDatabase';

type Controller = typeof import('../../src/controllers/participant.controller');

let cleanup: (() => void) | undefined;
let prisma: PrismaClient;
let controller: Controller;
let suggestSerial: typeof import('../../src/services/participantSerial.service').suggestSerial;
let agentId: string;
let campaignA: string;
let campaignB: string;
let contact = 0;

beforeAll(async () => {
  ({ cleanup } = createTestDatabase('serials'));
  ({ prisma } = await import('../../src/lib/prisma'));
  controller = await import('../../src/controllers/participant.controller');
  ({ suggestSerial } = await import('../../src/services/participantSerial.service'));

  agentId = (await prisma.agent.create({ data: { agentCode: 'AG-1000', name: 'Agent One', email: 'agent@example.com', mobile: '9876543210', passwordHash: 'x' } })).id;
  const campaign = (name: string) => prisma.campaign.create({
    data: { name, durationMonths: 5, drawCount: 1, totalAmountPaise: 30_000, perDrawAmountPaise: 30_000, draws: { create: [{ drawNumber: 1, scheduledAt: new Date('2027-01-01T12:00:00Z'), prizeCount: 1 }] } },
  });
  campaignA = (await campaign('Autumn Circle')).id;
  campaignB = (await campaign('Winter Circle')).id;
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  cleanup?.();
});

function makeResponse() {
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return response as unknown as Response & typeof response;
}

type Role = 'SUPER_ADMIN' | 'AGENT';

async function create(body: Record<string, unknown>, options: { campaignId?: string; role?: Role } = {}) {
  contact += 1;
  const role = options.role ?? 'SUPER_ADMIN';
  const response = makeResponse();
  await controller.createParticipant({
    params: { id: options.campaignId ?? campaignA },
    body: { name: `Person ${contact}`, email: `person${contact}@example.com`, ...(role === 'SUPER_ADMIN' ? { agentId } : {}), ...body },
    role,
    agentId: role === 'AGENT' ? agentId : undefined,
  } as unknown as Request, response);
  const [payload] = response.json.mock.calls[0];
  return { status: response.status.mock.calls[0]?.[0] as number, body: payload };
}

async function update(participantId: string, body: Record<string, unknown>, role: Role = 'SUPER_ADMIN') {
  const response = makeResponse();
  await controller.updateParticipant({
    params: { id: participantId }, body, role, agentId: role === 'AGENT' ? agentId : undefined,
  } as unknown as Request, response);
  return { status: response.status.mock.calls[0]?.[0] as number | undefined, body: response.json.mock.calls[0][0] };
}

describe('participant serial numbers (live database)', () => {
  it('AC-PAR-26 suggests the next number in sequence and skips numbers typed by hand', async () => {
    expect(await suggestSerial(prisma)).toBe(1000);

    expect((await create({})).body.participant.participantNumber).toBe(1000);
    // A hand-typed number does not move the sequence.
    expect((await create({ participantNumber: 1003 })).body.participant.participantNumber).toBe(1003);
    expect(await suggestSerial(prisma)).toBe(1001);

    expect((await create({ participantNumber: 1001 })).body.participant.participantNumber).toBe(1001);
    // AC-APR-2: agents can no longer add participants directly; they submit approval requests.
    expect((await create({ participantNumber: 1002 }, { role: 'AGENT' })).status).toBe(403);
    expect((await create({ participantNumber: 1002 })).body.participant.participantNumber).toBe(1002);
    // 1003 is taken, so the suggestion jumps to 1004.
    expect(await suggestSerial(prisma)).toBe(1004);
  });

  it('AC-PAR-23 rejects a used number in any campaign, with the next available number', async () => {
    const duplicate = await create({ participantNumber: 1003 }, { campaignId: campaignB });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toMatchObject({
      code: 'DUPLICATE_SERIAL',
      message: 'Serial number 1003 is already used by another participant. The next available number is 1004.',
      details: [expect.objectContaining({ path: ['participantNumber'], nextSerial: 1004 })],
    });
  });

  it('AC-PAR-23 accepts only whole numbers from 1000 to 9999', async () => {
    for (const participantNumber of [999, 10_000, 1004.5, '1004']) {
      expect((await create({ participantNumber })).status).toBe(400);
    }
    expect((await create({ participantNumber: 9999 })).status).toBe(201);
  });

  it('AC-PAR-23 lets only the first of two simultaneous saves of the same number succeed', async () => {
    const results = await Promise.all([create({ participantNumber: 1500 }), create({ participantNumber: 1500 }, { campaignId: campaignB })]);

    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(results.find(({ status }) => status === 409)?.body.error.code).toBe('DUPLICATE_SERIAL');
    expect(await prisma.participant.count({ where: { participantNumber: 1500 } })).toBe(1);

    // Two saves that both take the suggestion: one gets it, the other is told which number clashed.
    const suggested = await suggestSerial(prisma);
    const raced = await Promise.all([create({}), create({}, { campaignId: campaignB })]);
    const numbers = raced.filter(({ status }) => status === 201).map(({ body }) => body.participant.participantNumber);
    expect(numbers).toContain(suggested);
    for (const failed of raced.filter(({ status }) => status === 409)) {
      expect(failed.body.error.message).toContain(`Serial number ${suggested} is already used`);
    }
  });

  it('AC-PAR-24 lets super admins change a serial, uniquely, and refuses agents', async () => {
    const { body } = await create({ participantNumber: 1600 });
    const id = body.participant.id as string;
    const suggestionBefore = await suggestSerial(prisma);

    expect((await update(id, { participantNumber: 1001 })).body.error).toMatchObject({ code: 'DUPLICATE_SERIAL' });
    // AC-APR-2: agents cannot edit participants directly at all.
    expect((await update(id, { participantNumber: 1600 }, 'AGENT')).status).toBe(403);
    expect((await update(id, { participantNumber: 1601 }, 'AGENT')).status).toBe(403);

    const changed = await update(id, { participantNumber: 1601 });
    expect(changed.status).toBeUndefined();
    expect(changed.body.participant.participantNumber).toBe(1601);
    // The freed number 1600 is not suggested; the sequence carries on where it was.
    expect(await suggestSerial(prisma)).toBe(suggestionBefore);
  });

  it('AC-PAR-26 wraps to the lowest free number after 9999, and reports a full range', async () => {
    await prisma.sequenceCounter.update({ where: { name: 'participant-number' }, data: { nextValue: 9999 } });
    const used = new Set((await prisma.participant.findMany({ select: { participantNumber: true } })).map(({ participantNumber }) => participantNumber));
    const free = Array.from({ length: 9000 }, (_, index) => 1000 + index).filter((serial) => !used.has(serial));
    // 9999 is taken, so the search wraps to the lowest free number — which includes 1600, freed by the serial change.
    expect(await suggestSerial(prisma)).toBe(free[0]);
    expect(free).toContain(1600);

    await prisma.participant.createMany({ data: free.map((participantNumber) => ({ participantNumber, campaignId: campaignB, name: `Filler ${participantNumber}` })) });

    expect(await suggestSerial(prisma)).toBeNull();
    const full = await create({});
    expect(full.status).toBe(409);
    expect(full.body.error).toMatchObject({ code: 'SERIAL_RANGE_FULL', message: 'All serial numbers from 1000 to 9999 are in use.' });
    const nextResponse = makeResponse();
    await controller.nextSerial({} as Request, nextResponse);
    expect(nextResponse.json).toHaveBeenCalledWith({ serial: null });
  });
});

describe('participant address (live database)', () => {
  it('AC-PAR-25 stores an optional trimmed multi-line address of up to 500 characters', async () => {
    await prisma.participant.deleteMany({ where: { name: { startsWith: 'Filler' } } });

    const withAddress = await create({ address: '  12, MG Road\nKochi 682016  ' });
    expect(withAddress.body.participant.address).toBe('12, MG Road\nKochi 682016');
    expect((await create({ address: '   ' })).body.participant.address).toBeNull();
    expect((await create({})).body.participant.address).toBeNull();
    expect((await create({ address: 'x'.repeat(501) })).status).toBe(400);

    const id = withAddress.body.participant.id as string;
    expect((await update(id, { address: 'Flat 4B, Marine Drive' }, 'AGENT')).status).toBe(403);
    expect((await update(id, { address: 'Flat 4B, Marine Drive' })).body.participant.address).toBe('Flat 4B, Marine Drive');
    expect((await update(id, { address: '' })).body.participant.address).toBeNull();
  });
});
