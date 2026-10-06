import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import type { createParticipantSchema, updateParticipantSchema } from '../validators/participant.validator';
import {
  SerialRuleError,
  claimSerialForNewParticipant,
  duplicateSerialError,
  isSerialConflict,
  suggestSerial,
} from './participantSerial.service';

type CreateInput = Omit<z.infer<typeof createParticipantSchema>, 'agentId'>;
type UpdateInput = z.infer<typeof updateParticipantSchema>;

/** A participant rule failure, carrying the HTTP status and error code the API reports. */
export class ParticipantRuleError extends Error {
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

const duplicateParticipant = () => new ParticipantRuleError(
  'DUPLICATE_PARTICIPANT', 'A participant with this email, mobile, or user ID already exists in this campaign.', 409,
);
const invalid = (path: string, message: string) => new ParticipantRuleError(
  'VALIDATION_ERROR', 'Participant details are invalid.', 400, [{ path: [path], message }],
);
const isUniqueConstraint = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

async function assertActiveAgent(agentId: string) {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, isActive: true }, select: { id: true } });
  if (!agent) throw invalid('agentId', 'Select an active agent.');
}

/** Adds a participant assigned to `agentId` with one draw payment per draw (AC-PAR-5, AC-PAR-6, AC-PAR-23). */
export async function createParticipantRecord(campaignId: string, input: CreateInput, agentId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, include: { draws: { select: { id: true } } } });
  if (!campaign) throw new ParticipantRuleError('NOT_FOUND', 'Campaign was not found.', 404);
  await assertActiveAgent(agentId);

  let attemptedSerial = input.participantNumber;
  try {
    return await prisma.$transaction(async (transaction) => {
      const participantNumber = await claimSerialForNewParticipant(transaction, input.participantNumber);
      attemptedSerial = participantNumber;
      const { participantNumber: _requested, ...details } = input;
      void _requested;
      return transaction.participant.create({
        data: {
          campaignId,
          agentId,
          participantNumber,
          ...details,
          drawPayments: { create: campaign.draws.map((draw) => ({ drawId: draw.id })) },
        },
        include: { drawPayments: true },
      });
    });
  } catch (error) {
    if (error instanceof SerialRuleError) throw new ParticipantRuleError(error.code, error.message, error.status, error.details);
    // Two saves of the same serial at once: the unique index rejects the second (AC-PAR-23).
    if (isSerialConflict(error)) {
      const serialError = duplicateSerialError(attemptedSerial ?? 0, await suggestSerial(prisma));
      throw new ParticipantRuleError(serialError.code, serialError.message, serialError.status, serialError.details);
    }
    if (isUniqueConstraint(error)) throw duplicateParticipant();
    throw error;
  }
}

/** Edits a participant (AC-PAR-12, AC-PAR-14, AC-PAR-24). Only super admins may reassign or change the serial. */
export async function updateParticipantRecord(participantId: string, input: UpdateInput) {
  const existing = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!existing) throw new ParticipantRuleError('NOT_FOUND', 'Participant was not found.', 404);

  const { agentId: requestedAgentId, participantNumber: requestedSerial, ...profileData } = input;
  const serialChange = requestedSerial !== undefined && requestedSerial !== existing.participantNumber ? requestedSerial : undefined;
  if (serialChange !== undefined) {
    const holder = await prisma.participant.findUnique({ where: { participantNumber: serialChange }, select: { id: true } });
    if (holder) {
      const serialError = duplicateSerialError(serialChange, await suggestSerial(prisma));
      throw new ParticipantRuleError(serialError.code, serialError.message, serialError.status, serialError.details);
    }
  }

  const email = profileData.email === undefined ? existing.email : profileData.email;
  const mobile = profileData.mobile === undefined ? existing.mobile : profileData.mobile;
  if (!email && !mobile) throw invalid('email', 'A participant must retain an email or mobile number.');
  if (requestedAgentId && requestedAgentId !== existing.agentId) await assertActiveAgent(requestedAgentId);

  const externalUserId = profileData.externalUserId === undefined ? existing.externalUserId : profileData.externalUserId;
  const duplicateKeys = [
    ...(email ? [{ email }] : []),
    ...(mobile ? [{ mobile }] : []),
    ...(externalUserId ? [{ externalUserId }] : []),
  ];
  if (duplicateKeys.length > 0) {
    const duplicate = await prisma.participant.findFirst({
      where: { campaignId: existing.campaignId, id: { not: participantId }, OR: duplicateKeys },
      select: { id: true },
    });
    if (duplicate) throw duplicateParticipant();
  }

  try {
    return await prisma.participant.update({
      where: { id: participantId },
      data: {
        ...profileData,
        ...(requestedAgentId ? { agentId: requestedAgentId } : {}),
        ...(serialChange !== undefined ? { participantNumber: serialChange } : {}),
      },
      include: { agent: { select: { id: true, agentCode: true, name: true } } },
    });
  } catch (error) {
    if (serialChange !== undefined && isSerialConflict(error)) {
      const serialError = duplicateSerialError(serialChange, await suggestSerial(prisma));
      throw new ParticipantRuleError(serialError.code, serialError.message, serialError.status, serialError.details);
    }
    if (isUniqueConstraint(error)) throw duplicateParticipant();
    throw error;
  }
}
