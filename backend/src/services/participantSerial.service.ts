import type { Prisma, PrismaClient } from '@prisma/client';

export const serialRange = { min: 1000, max: 9999 } as const;
const counterName = 'participant-number';

type Client = Prisma.TransactionClient | PrismaClient;

export class SerialRuleError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * AC-PAR-26: the lowest free number at or after the counter; wraps to search from 1000 when the top of the range is
 * taken. Numbers below the counter (e.g. freed by a serial change) are only suggested again after the wrap.
 */
export async function suggestSerial(client: Client): Promise<number | null> {
  const [counter, taken, reserved] = await Promise.all([
    client.sequenceCounter.findUnique({ where: { name: counterName } }),
    client.participant.findMany({
      where: { participantNumber: { gte: serialRange.min, lte: serialRange.max } },
      select: { participantNumber: true },
    }),
    reservedSerials(client),
  ]);
  const used = new Set([...taken.map(({ participantNumber }) => participantNumber), ...reserved]);
  const start = Math.min(Math.max(counter?.nextValue ?? serialRange.min, serialRange.min), serialRange.max + 1);

  for (let serial = start; serial <= serialRange.max; serial += 1) if (!used.has(serial)) return serial;
  for (let serial = serialRange.min; serial < start; serial += 1) if (!used.has(serial)) return serial;
  return null;
}

/** Serial numbers held by agents' pending new-participant requests (AC-APR-3). */
export async function reservedSerials(client: Client): Promise<number[]> {
  const pending = await client.approvalRequest.findMany({
    where: { type: 'PARTICIPANT_CREATE', status: { in: ['PENDING', 'APPROVING'] } },
    select: { payload: true },
  });
  return pending
    .map(({ payload }) => (payload as { participantNumber?: unknown } | null)?.participantNumber)
    .filter((serial): serial is number => typeof serial === 'number');
}

export function duplicateSerialError(serial: number, nextSerial: number | null) {
  return new SerialRuleError(
    'DUPLICATE_SERIAL',
    `Serial number ${serial} is already used by another participant.${nextSerial ? ` The next available number is ${nextSerial}.` : ''}`,
    409,
    [{ path: ['participantNumber'], message: `Serial number ${serial} is already used.`, nextSerial }],
  );
}

/**
 * Picks the serial for a new participant inside the create transaction: the requested number, or the suggestion when
 * none was given. Using the suggestion moves the counter past it; a hand-typed number leaves the counter alone.
 */
export async function claimSerialForNewParticipant(client: Prisma.TransactionClient, requested: number | undefined) {
  const suggestion = await suggestSerial(client);
  const serial = requested ?? suggestion;
  if (serial === null) {
    throw new SerialRuleError('SERIAL_RANGE_FULL', `All serial numbers from ${serialRange.min} to ${serialRange.max} are in use.`, 409);
  }
  const holder = await client.participant.findUnique({ where: { participantNumber: serial }, select: { id: true } });
  if (holder) throw duplicateSerialError(serial, suggestion);

  if (serial === suggestion) {
    await client.sequenceCounter.upsert({
      where: { name: counterName },
      update: { nextValue: serial + 1 },
      create: { name: counterName, nextValue: serial + 1 },
    });
  }
  return serial;
}

/** True when a Prisma unique-constraint error came from the participant serial number index. */
export function isSerialConflict(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'P2002') return false;
  const meta = 'meta' in error ? JSON.stringify(error.meta) : '';
  return meta.includes('participantNumber');
}
