import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import type { createOptionSchema, deliverChoiceSchema, updateOptionSchema } from '../validators/complimentary.validator';
import { containsText } from '../lib/textSearch';

type Transaction = Prisma.TransactionClient;

// When a super admin approves an agent's request, both ids are set: the agent did it, the admin approved it (A6).
export type Actor = { role: 'SUPER_ADMIN' | 'AGENT'; adminId?: string; agentId?: string };

export type ComplimentaryListStatus = 'NOT_CHOSEN' | 'CHOSEN' | 'DELIVERED' | 'CANCELLED' | 'DELIVERED_BEFORE_WINNING';

export class ComplimentaryError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const notFound = () => new ComplimentaryError('NOT_FOUND', 'Participant was not found.', 404);

// Agents only ever see their own participants (AC-CMP-10); others look like they do not exist.
function participantScope(actor: Actor): Prisma.ParticipantWhereInput {
  return actor.role === 'AGENT' ? { agentId: actor.agentId ?? '__none__' } : {};
}

// AC-CMP-2 / C1: every draw payment Paid and never a winner.
const eligibleWhere: Prisma.ParticipantWhereInput = {
  winners: { none: {} },
  drawPayments: { some: {}, every: { status: 'PAID' } },
};

export function eligibilityOf(participant: { drawPayments: { status: string }[]; winners: unknown[] }) {
  const paidDraws = participant.drawPayments.filter(({ status }) => status === 'PAID').length;
  const totalDraws = participant.drawPayments.length;
  const isWinner = participant.winners.length > 0;
  return { eligible: !isWinner && totalDraws > 0 && paidDraws === totalDraws, paidDraws, totalDraws, isWinner };
}

const choiceInclude = {
  option: { select: { id: true, name: true, description: true, valuePaise: true, isActive: true, imageUpdatedAt: true } },
  chosenByAdmin: { select: { id: true, name: true } },
  chosenByAgent: { select: { id: true, agentCode: true, name: true } },
  deliveredByAdmin: { select: { id: true, name: true } },
  deliveredByAgent: { select: { id: true, agentCode: true, name: true } },
} satisfies Prisma.ComplimentaryChoiceInclude;

function listStatus(choice: { status: string } | null, isWinner: boolean): ComplimentaryListStatus {
  if (!choice) return 'NOT_CHOSEN';
  if (choice.status === 'DELIVERED') return isWinner ? 'DELIVERED_BEFORE_WINNING' : 'DELIVERED';
  return choice.status === 'CANCELLED' ? 'CANCELLED' : 'CHOSEN';
}

// ---- Options (AC-CMP-1) -------------------------------------------------------------------------------------------

async function assertUniqueName(campaignId: string, name: string, exceptId?: string) {
  const options = await prisma.complimentaryOption.findMany({ where: { campaignId }, select: { id: true, name: true } });
  if (options.some((option) => option.id !== exceptId && option.name.toLowerCase() === name.toLowerCase())) {
    throw new ComplimentaryError('DUPLICATE_OPTION', `This campaign already has a complimentary option named "${name}".`);
  }
}

export async function listOptions(campaignId: string, actor: Actor) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true } });
  if (!campaign) throw new ComplimentaryError('NOT_FOUND', 'Campaign was not found.', 404);

  const options = await prisma.complimentaryOption.findMany({
    where: { campaignId, ...(actor.role === 'AGENT' ? { isActive: true } : {}) },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  const counts = await prisma.complimentaryChoice.groupBy({
    by: ['optionId', 'status'],
    where: { optionId: { in: options.map(({ id }) => id) }, status: { in: ['CHOSEN', 'DELIVERED'] } },
    _count: { _all: true },
  });
  const countOf = (optionId: string, status: string) =>
    counts.find((row) => row.optionId === optionId && row.status === status)?._count._all ?? 0;
  return options.map((option) => ({ ...option, chosenCount: countOf(option.id, 'CHOSEN'), deliveredCount: countOf(option.id, 'DELIVERED') }));
}

export async function createOption(campaignId: string, input: z.infer<typeof createOptionSchema>) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true } });
  if (!campaign) throw new ComplimentaryError('NOT_FOUND', 'Campaign was not found.', 404);
  await assertUniqueName(campaignId, input.name);
  return prisma.complimentaryOption.create({ data: { ...input, campaignId } });
}

export async function updateOption(optionId: string, input: z.infer<typeof updateOptionSchema>) {
  const option = await prisma.complimentaryOption.findUnique({ where: { id: optionId } });
  if (!option) throw new ComplimentaryError('NOT_FOUND', 'Complimentary option was not found.', 404);
  if (input.name !== undefined) await assertUniqueName(option.campaignId, input.name, optionId);
  return prisma.complimentaryOption.update({ where: { id: optionId }, data: input });
}

// ---- Participants ---------------------------------------------------------------------------------------------------

export async function getParticipantComplimentary(participantId: string, actor: Actor) {
  const participant = await prisma.participant.findFirst({
    where: { id: participantId, ...participantScope(actor) },
    select: {
      id: true,
      campaignId: true,
      drawPayments: { select: { status: true } },
      winners: { select: { id: true } },
      complimentaryChoice: { include: choiceInclude },
    },
  });
  if (!participant) throw notFound();
  const eligibility = eligibilityOf(participant);
  return { ...eligibility, status: listStatus(participant.complimentaryChoice, eligibility.isWinner), choice: participant.complimentaryChoice };
}

export async function recordChoice(participantId: string, optionId: string, actor: Actor, now = new Date()) {
  try {
    return await prisma.$transaction(async (transaction) => {
      const participant = await transaction.participant.findFirst({
        where: { id: participantId, ...participantScope(actor) },
        select: { id: true, campaignId: true, drawPayments: { select: { status: true } }, winners: { select: { id: true } }, complimentaryChoice: true },
      });
      if (!participant) throw notFound();
      const eligibility = eligibilityOf(participant);
      if (!eligibility.eligible) {
        throw new ComplimentaryError(
          'NOT_ELIGIBLE_COMPLIMENTARY',
          eligibility.isWinner
            ? 'Winners do not receive a complimentary prize.'
            : `Pay all ${eligibility.totalDraws} draws to qualify (${eligibility.paidDraws} paid).`,
        );
      }

      const option = await transaction.complimentaryOption.findUnique({ where: { id: optionId } });
      if (!option || option.campaignId !== participant.campaignId || !option.isActive) {
        throw new ComplimentaryError('OPTION_UNAVAILABLE', 'Choose an active complimentary option from this participant’s campaign.', 400);
      }

      const recorded = {
        optionId, status: 'CHOSEN', chosenAt: now,
        chosenByAdminId: actor.adminId ?? null,
        chosenByAgentId: actor.agentId ?? null,
        deliveredAt: null, deliveryNote: null, deliveredByAdminId: null, deliveredByAgentId: null,
        cancelledAt: null, cancelReason: null,
      };
      if (participant.complimentaryChoice) {
        // Only a cancelled choice may be replaced (C4); the condition guards against a concurrent change.
        const reused = await transaction.complimentaryChoice.updateMany({ where: { participantId, status: 'CANCELLED' }, data: recorded });
        if (reused.count !== 1) {
          throw new ComplimentaryError('COMPLIMENTARY_ALREADY_CHOSEN', 'This participant has already chosen a complimentary prize; the choice is final.');
        }
      } else {
        await transaction.complimentaryChoice.create({ data: { participantId, ...recorded } });
      }
      return transaction.complimentaryChoice.findUniqueOrThrow({ where: { participantId }, include: choiceInclude });
    });
  } catch (error) {
    // A simultaneous first choice loses on the unique participant index.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ComplimentaryError('COMPLIMENTARY_ALREADY_CHOSEN', 'This participant has already chosen a complimentary prize; the choice is final.');
    }
    throw error;
  }
}

export async function deliverChoice(participantId: string, input: z.infer<typeof deliverChoiceSchema>, actor: Actor, now = new Date()) {
  return prisma.$transaction(async (transaction) => {
    const participant = await transaction.participant.findFirst({
      where: { id: participantId, ...participantScope(actor) },
      select: { id: true, complimentaryChoice: true },
    });
    if (!participant) throw notFound();
    const choice = participant.complimentaryChoice;
    if (!choice || choice.status !== 'CHOSEN') {
      throw new ComplimentaryError('COMPLIMENTARY_NOT_CHOSEN', 'Only a chosen complimentary prize that has not been delivered or cancelled can be marked delivered.');
    }
    const deliveredAt = input.deliveredAt ?? now;
    if (deliveredAt > now) throw new ComplimentaryError('VALIDATION_ERROR', 'The delivery date cannot be in the future.', 400);
    if (deliveredAt < choice.chosenAt) throw new ComplimentaryError('VALIDATION_ERROR', 'The delivery date cannot be before the prize was chosen.', 400);

    const delivered = await transaction.complimentaryChoice.updateMany({
      where: { participantId, status: 'CHOSEN' },
      data: {
        status: 'DELIVERED',
        deliveredAt,
        deliveryNote: input.note,
        deliveredByAdminId: actor.adminId ?? null,
        deliveredByAgentId: actor.agentId ?? null,
      },
    });
    if (delivered.count !== 1) throw new ComplimentaryError('COMPLIMENTARY_NOT_CHOSEN', 'This complimentary prize changed; reload and try again.');
    return transaction.complimentaryChoice.findUniqueOrThrow({ where: { participantId }, include: choiceInclude });
  });
}

export async function listCampaignComplimentary(
  campaignId: string,
  filters: { status?: ComplimentaryListStatus; search?: string },
  actor: Actor,
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true } });
  if (!campaign) throw new ComplimentaryError('NOT_FOUND', 'Campaign was not found.', 404);

  const search = filters.search?.trim();
  const participants = await prisma.participant.findMany({
    where: {
      campaignId,
      ...participantScope(actor),
      OR: [eligibleWhere, { complimentaryChoice: { isNot: null } }],
      ...(search
        ? {
            AND: [{
              OR: [
                { name: containsText(search) },
                { mobile: containsText(search) },
                { email: containsText(search) },
                ...(/^\d+$/.test(search) ? [{ participantNumber: Number(search) }] : []),
              ],
            }],
          }
        : {}),
    },
    orderBy: { participantNumber: 'asc' },
    select: {
      id: true, participantNumber: true, name: true, mobile: true, email: true,
      agent: { select: { id: true, agentCode: true, name: true } },
      drawPayments: { select: { status: true } },
      winners: { select: { id: true } },
      complimentaryChoice: { include: choiceInclude },
    },
  });

  return participants
    .map(({ drawPayments, winners, complimentaryChoice, ...participant }) => {
      const eligibility = eligibilityOf({ drawPayments, winners });
      return { ...participant, ...eligibility, status: listStatus(complimentaryChoice, eligibility.isWinner), choice: complimentaryChoice };
    })
    .filter((row) => !filters.status || row.status === filters.status);
}

// ---- Hooks used by draws and payments (AC-CMP-6, AC-CMP-7) ----------------------------------------------------------

export async function cancelActiveChoice(transaction: Transaction, participantId: string, reason: string, now: Date) {
  await transaction.complimentaryChoice.updateMany({
    where: { participantId, status: 'CHOSEN' },
    data: { status: 'CANCELLED', cancelledAt: now, cancelReason: reason },
  });
}

export async function hasDeliveredChoice(transaction: Transaction, participantId: string) {
  return (await transaction.complimentaryChoice.count({ where: { participantId, status: 'DELIVERED' } })) > 0;
}
