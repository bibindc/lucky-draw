import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  campaignFindUnique: vi.fn(),
  agentFindFirst: vi.fn(),
  participantFindMany: vi.fn(),
  participantCount: vi.fn(),
  participantFindUnique: vi.fn(),
  participantFindFirst: vi.fn(),
  participantUpdate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    campaign: { findUnique: mocks.campaignFindUnique },
    agent: { findFirst: mocks.agentFindFirst },
    participant: {
      findMany: mocks.participantFindMany,
      count: mocks.participantCount,
      findUnique: mocks.participantFindUnique,
      findFirst: mocks.participantFindFirst,
      update: mocks.participantUpdate,
    },
    $transaction: mocks.transaction,
  },
}));

import { createParticipant, exportParticipants, listParticipants, maxExportRows, updateParticipant } from '../src/controllers/participant.controller';

const campaignId = '00000000-0000-4000-8000-000000000001';
const drawId = '00000000-0000-4000-8000-000000000002';
const assignedAgentId = '00000000-0000-4000-8000-000000000003';
const otherAgentId = '00000000-0000-4000-8000-000000000004';
const participantId = '00000000-0000-4000-8000-000000000005';

function makeResponse() {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return response as unknown as Response & typeof response;
}

function makeRequest(
  role: 'SUPER_ADMIN' | 'AGENT',
  agentId?: string,
  body: Record<string, unknown> = {},
  query: Record<string, unknown> = {},
  resourceId = campaignId,
) {
  return {
    params: { id: resourceId },
    query,
    body: { name: 'Riya Sharma', email: 'riya@example.com', ...body },
    role,
    agentId,
  } as unknown as Request;
}

describe('participant ownership and serial allocation', () => {
  const participantCreate = vi.fn();
  const sequenceUpsert = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.campaignFindUnique.mockResolvedValue({ id: campaignId, draws: [{ id: drawId }] });
    mocks.agentFindFirst.mockResolvedValue({ id: assignedAgentId });
    mocks.participantFindMany.mockResolvedValue([]);
    mocks.participantCount.mockResolvedValue(0);
    mocks.participantFindUnique.mockResolvedValue({
      id: participantId, campaignId, agentId: assignedAgentId,
      email: 'riya@example.com', mobile: null, externalUserId: null,
    });
    mocks.participantFindFirst.mockResolvedValue(null);
    mocks.participantUpdate.mockResolvedValue({ id: 'participant-id', participantNumber: 1005, name: 'Riya Mehta' });
    sequenceUpsert.mockResolvedValue({ nextValue: 1006 });
    participantCreate.mockResolvedValue({ id: 'participant-id', participantNumber: 1005 });
    mocks.transaction.mockImplementation(async (callback: (transaction: unknown) => unknown) =>
      callback({
        // Serials 1000-1004 are taken and the counter points at 1005, so 1005 is suggested.
        sequenceCounter: { findUnique: vi.fn().mockResolvedValue({ nextValue: 1005 }), upsert: sequenceUpsert },
        participant: {
          create: participantCreate,
          findMany: vi.fn().mockResolvedValue([1000, 1001, 1002, 1003, 1004].map((participantNumber) => ({ participantNumber }))),
          findUnique: vi.fn().mockResolvedValue(null),
        },
        // No agent requests are holding serial numbers.
        approvalRequest: { findMany: vi.fn().mockResolvedValue([]) },
      }),
    );
  });

  it('assigns the selected active agent and the suggested serial for a super admin', async () => {
    const response = makeResponse();

    await createParticipant(makeRequest('SUPER_ADMIN', undefined, { agentId: assignedAgentId }), response);

    expect(sequenceUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { name: 'participant-number' },
      update: { nextValue: 1006 },
    }));
    expect(participantCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ agentId: assignedAgentId, participantNumber: 1005 }),
    }));
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it('rejects an agent attempting to assign a participant to another agent', async () => {
    const response = makeResponse();

    await createParticipant(makeRequest('AGENT', assignedAgentId, { agentId: otherAgentId }), response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('forces an agent list query to their own assignment even when another agent is requested', async () => {
    mocks.transaction.mockImplementationOnce((operations: Promise<unknown>[]) => Promise.all(operations));
    const response = makeResponse();

    await listParticipants(makeRequest('AGENT', assignedAgentId, {}, { agentId: otherAgentId }), response);

    expect(mocks.participantFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ campaignId, agentId: assignedAgentId }),
    }));
  });

  it('AC-PAR-28 matches a numeric search against the serial number as well as text fields', async () => {
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
    mocks.campaignFindUnique.mockResolvedValue({ id: campaignId });

    await listParticipants(makeRequest('SUPER_ADMIN', undefined, {}, { search: ' 1250 ' }), makeResponse());
    expect(mocks.participantFindMany.mock.calls[0][0].where.OR).toEqual(expect.arrayContaining([
      { participantNumber: 1250 }, { mobile: expect.objectContaining({ contains: '1250' }) },
    ]));

    await listParticipants(makeRequest('SUPER_ADMIN', undefined, {}, { search: 'asha' }), makeResponse());
    expect(mocks.participantFindMany.mock.calls[1][0].where.OR).not.toContainEqual(expect.objectContaining({ participantNumber: expect.anything() }));
  });

  it('AC-PAR-29 sorts by newest, serial or name and rejects unknown sorts', async () => {
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
    mocks.campaignFindUnique.mockResolvedValue({ id: campaignId });
    const orderFor = async (query: Record<string, string>) => {
      mocks.participantFindMany.mockClear();
      await listParticipants(makeRequest('SUPER_ADMIN', undefined, {}, query), makeResponse());
      return mocks.participantFindMany.mock.calls[0][0].orderBy;
    };

    expect(await orderFor({})).toEqual([{ createdAt: 'desc' }, { participantNumber: 'desc' }]);
    expect(await orderFor({ sort: 'serial' })).toEqual([{ participantNumber: 'asc' }]);
    expect(await orderFor({ sort: 'serial', order: 'desc' })).toEqual([{ participantNumber: 'desc' }]);
    expect(await orderFor({ sort: 'name', order: 'desc' })).toEqual([{ name: 'desc' }, { participantNumber: 'asc' }]);

    const invalid = makeResponse();
    await listParticipants(makeRequest('SUPER_ADMIN', undefined, {}, { sort: 'mobile' }), invalid);
    expect(invalid.status).toHaveBeenCalledWith(400);
  });

  it('allows profile edits but rejects an out-of-range serial (AC-PAR-23)', async () => {
    const response = makeResponse();

    await updateParticipant(makeRequest('SUPER_ADMIN', undefined, { name: 'Riya Mehta' }, {}, participantId), response);
    expect(mocks.participantUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: participantId },
      data: expect.objectContaining({ name: 'Riya Mehta' }),
    }));

    const serialResponse = makeResponse();
    await updateParticipant(makeRequest('SUPER_ADMIN', undefined, { participantNumber: 1 }, {}, participantId), serialResponse);
    expect(serialResponse.status).toHaveBeenCalledWith(400);
  });

  it('blocks agents from editing another agent participant and rejects duplicate contacts', async () => {
    mocks.participantFindUnique.mockResolvedValueOnce({
      id: participantId, campaignId, agentId: otherAgentId,
      email: 'riya@example.com', mobile: null, externalUserId: null,
    });
    const forbiddenResponse = makeResponse();
    await updateParticipant(makeRequest('AGENT', assignedAgentId, { name: 'Changed' }, {}, participantId), forbiddenResponse);
    // AC-APR-2: agents submit edits as approval requests, so the direct edit is refused.
    expect(forbiddenResponse.status).toHaveBeenCalledWith(403);
    expect(mocks.participantUpdate).not.toHaveBeenCalled();

    mocks.participantFindFirst.mockResolvedValueOnce({ id: 'duplicate-id' });
    const duplicateResponse = makeResponse();
    await updateParticipant(makeRequest('SUPER_ADMIN', undefined, { email: 'taken@example.com' }, {}, participantId), duplicateResponse);
    expect(duplicateResponse.status).toHaveBeenCalledWith(409);
  });
});

describe('participant list export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.campaignFindUnique.mockResolvedValue({ id: campaignId });
    mocks.participantCount.mockResolvedValue(1);
    mocks.participantFindMany.mockResolvedValue([{ id: participantId, participantNumber: 1000 }]);
  });

  it('AC-PAR-18 exports every row matching the list filters, ordered by serial, without pagination', async () => {
    const response = makeResponse();

    await exportParticipants(
      makeRequest('SUPER_ADMIN', undefined, {}, { search: 'riya', status: 'ELIGIBLE', agentId: assignedAgentId, page: '3', pageSize: '5' }),
      response,
    );

    const query = mocks.participantFindMany.mock.calls[0][0];
    expect(query).toEqual(expect.objectContaining({
      where: expect.objectContaining({ campaignId, agentId: assignedAgentId, status: 'ELIGIBLE', OR: expect.any(Array) }),
      orderBy: { participantNumber: 'asc' },
    }));
    expect(query).not.toHaveProperty('skip');
    expect(query).not.toHaveProperty('take');
    expect(response.json).toHaveBeenCalledWith({ participants: [{ id: participantId, participantNumber: 1000 }], total: 1 });
  });

  it('AC-PAR-21 forces agent exports to their own participants even when another agent is requested', async () => {
    const response = makeResponse();

    await exportParticipants(makeRequest('AGENT', assignedAgentId, {}, { agentId: otherAgentId }), response);

    expect(mocks.participantFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ campaignId, agentId: assignedAgentId }),
    }));
  });

  it('rejects invalid filters and exports above the row limit', async () => {
    const invalidResponse = makeResponse();
    await exportParticipants(makeRequest('SUPER_ADMIN', undefined, {}, { status: 'BOGUS' }), invalidResponse);
    expect(invalidResponse.status).toHaveBeenCalledWith(400);

    mocks.participantCount.mockResolvedValueOnce(maxExportRows + 1);
    const largeResponse = makeResponse();
    await exportParticipants(makeRequest('SUPER_ADMIN'), largeResponse);
    expect(largeResponse.status).toHaveBeenCalledWith(422);
    expect(largeResponse.json).toHaveBeenCalledWith({ error: expect.objectContaining({ code: 'EXPORT_TOO_LARGE' }) });
    expect(mocks.participantFindMany).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown campaign', async () => {
    mocks.campaignFindUnique.mockResolvedValueOnce(null);
    const response = makeResponse();
    await exportParticipants(makeRequest('SUPER_ADMIN'), response);
    expect(response.status).toHaveBeenCalledWith(404);
  });
});
