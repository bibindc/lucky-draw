import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import {
  parsePayload,
  type ParsedPayload,
  type RequestType,
  type requestFilterSchema,
  type submitRequestSchema,
} from '../validators/approval.validator';
import { createParticipantRecord, updateParticipantRecord } from './participant.service';
import { recordParticipantPayment, selectPaymentDraws } from './payment.service';
import { updateWinnerClaimRecord } from './winner.service';
import { deliverChoice, getParticipantComplimentary, recordChoice } from './complimentary.service';
import { reservedSerials } from './participantSerial.service';

type SubmitInput = z.infer<typeof submitRequestSchema>;
type Filters = z.infer<typeof requestFilterSchema>;
export type Viewer = { role: 'SUPER_ADMIN' | 'AGENT'; adminId?: string; agentId?: string };

export class ApprovalError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status = 409, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const notFound = (entity = 'Participant') => new ApprovalError('NOT_FOUND', `${entity} was not found.`, 404);
const notPending = () => new ApprovalError('REQUEST_NOT_PENDING', 'This request has already been decided or withdrawn.');
const invalid = (issues: unknown) => new ApprovalError('VALIDATION_ERROR', 'Request details are invalid.', 400, issues);

function parseOrThrow<T extends RequestType>(type: T, payload: unknown): ParsedPayload<T> {
  const parsed = parsePayload(type, payload);
  if (!parsed.success) throw invalid(parsed.issues);
  return parsed.data;
}

const requestInclude = {
  agent: { select: { id: true, agentCode: true, name: true } },
  decidedByAdmin: { select: { id: true, name: true } },
  participant: { select: { id: true, participantNumber: true, name: true } },
  winner: { select: { id: true, prize: { select: { name: true } }, draw: { select: { drawNumber: true } } } },
  campaign: { select: { id: true, name: true } },
} satisfies Prisma.ApprovalRequestInclude;

// ---- Submission (AC-APR-1, AC-APR-3) ---------------------------------------------------------------------------------

async function ownParticipant(participantId: string, agentId: string) {
  const participant = await prisma.participant.findFirst({
    where: { id: participantId, agentId },
    include: { drawPayments: { include: { draw: true } }, winners: { select: { id: true } } },
  });
  if (!participant) throw notFound();
  return participant;
}

/** New-participant requests must not clash with participants or other pending requests (A4). */
async function checkNewParticipant(campaignId: string, details: ParsedPayload<'PARTICIPANT_CREATE'>) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true } });
  if (!campaign) throw notFound('Campaign');

  const serial = details.participantNumber;
  if (serial !== undefined) {
    const [holder, reserved] = await Promise.all([
      prisma.participant.findUnique({ where: { participantNumber: serial }, select: { id: true } }),
      reservedSerials(prisma),
    ]);
    if (holder || reserved.includes(serial)) {
      throw new ApprovalError('DUPLICATE_SERIAL', `Serial number ${serial} is already used by another participant or pending request.`, 409,
        [{ path: ['participantNumber'], message: `Serial number ${serial} is already used.` }]);
    }
  }

  const contacts = [
    ...(details.email ? [{ email: details.email }] : []),
    ...(details.mobile ? [{ mobile: details.mobile }] : []),
    ...(details.externalUserId ? [{ externalUserId: details.externalUserId }] : []),
  ];
  if (contacts.length === 0) return;
  const existing = await prisma.participant.findFirst({ where: { campaignId, OR: contacts }, select: { id: true } });
  const pending = await prisma.approvalRequest.findMany({ where: { type: 'PARTICIPANT_CREATE', campaignId, status: 'PENDING' }, select: { payload: true } });
  const clashes = pending.some(({ payload }) => {
    const other = payload as Record<string, unknown>;
    return contacts.some((contact) => Object.entries(contact).some(([key, value]) => other[key] === value));
  });
  if (existing || clashes) {
    throw new ApprovalError('DUPLICATE_PARTICIPANT', 'A participant or pending request with this email, mobile, or user ID already exists in this campaign.');
  }
}

export async function submitRequest(agentId: string, input: SubmitInput) {
  let campaignId: string;
  let participantId: string | null = null;
  let winnerId: string | null = null;
  let itemKey: string | null = null;

  switch (input.type) {
    case 'PARTICIPANT_CREATE': {
      const details = parseOrThrow('PARTICIPANT_CREATE', input.payload);
      await checkNewParticipant(input.campaignId, details);
      campaignId = input.campaignId;
      break;
    }
    case 'WINNER_CLAIM': {
      parseOrThrow('WINNER_CLAIM', input.payload);
      const winner = await prisma.winner.findFirst({ where: { id: input.winnerId, participant: { agentId } }, select: { id: true, participantId: true, participant: { select: { campaignId: true } } } });
      if (!winner) throw notFound('Winner');
      campaignId = winner.participant.campaignId;
      participantId = winner.participantId;
      winnerId = winner.id;
      itemKey = winner.id;
      break;
    }
    default: {
      const participant = await ownParticipant(input.participantId, agentId);
      campaignId = participant.campaignId;
      participantId = participant.id;
      itemKey = participant.id;
      if (input.type === 'PARTICIPANT_UPDATE') {
        parseOrThrow('PARTICIPANT_UPDATE', input.payload);
      } else if (input.type === 'PAYMENT') {
        const details = parseOrThrow('PAYMENT', input.payload);
        if (participant.winners.length) throw new ApprovalError('PAYMENT_NOT_ALLOWED', 'A winner cannot be charged for a later draw.');
        selectPaymentDraws(participant.drawPayments, details);
      } else if (input.type === 'COMPLIMENTARY_CHOICE') {
        const { optionId } = parseOrThrow('COMPLIMENTARY_CHOICE', input.payload);
        const status = await getParticipantComplimentary(participant.id, { role: 'AGENT', agentId });
        if (!status.eligible) throw new ApprovalError('NOT_ELIGIBLE_COMPLIMENTARY', 'This participant is not eligible for a complimentary prize.');
        if (status.choice && status.choice.status !== 'CANCELLED') throw new ApprovalError('COMPLIMENTARY_ALREADY_CHOSEN', 'This participant has already chosen a complimentary prize; the choice is final.');
        const option = await prisma.complimentaryOption.findUnique({ where: { id: optionId } });
        if (!option || option.campaignId !== participant.campaignId || !option.isActive) {
          throw new ApprovalError('OPTION_UNAVAILABLE', 'Choose an active complimentary option from this participant’s campaign.', 400);
        }
      } else {
        parseOrThrow('COMPLIMENTARY_DELIVERY', input.payload);
        const status = await getParticipantComplimentary(participant.id, { role: 'AGENT', agentId });
        if (status.choice?.status !== 'CHOSEN') throw new ApprovalError('COMPLIMENTARY_NOT_CHOSEN', 'Only a chosen complimentary prize can be marked delivered.');
      }
    }
  }

  try {
    return await prisma.approvalRequest.create({
      data: {
        type: input.type, campaignId, participantId, winnerId, agentId,
        payload: input.payload as Prisma.InputJsonValue,
        pendingKey: itemKey ? `${input.type}:${itemKey}` : null,
      },
      include: requestInclude,
    });
  } catch (error) {
    // The unique pendingKey makes a second pending request for the same item fail, even at the same moment (A4).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApprovalError('REQUEST_ALREADY_PENDING', 'A request of this kind is already waiting for approval for this item.');
    }
    throw error;
  }
}

// ---- Reading (AC-APR-4, AC-APR-5) ------------------------------------------------------------------------------------

function scope(viewer: Viewer): Prisma.ApprovalRequestWhereInput {
  return viewer.role === 'AGENT' ? { agentId: viewer.agentId ?? '__none__' } : {};
}

export async function listRequests(filters: Filters, viewer: Viewer) {
  return prisma.approvalRequest.findMany({
    where: {
      ...scope(viewer),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.agentId && viewer.role === 'SUPER_ADMIN' ? { agentId: filters.agentId } : {}),
      ...(filters.participantId ? { participantId: filters.participantId } : {}),
    },
    orderBy: { submittedAt: 'desc' },
    include: requestInclude,
    take: 500,
  });
}

export async function pendingCount() {
  return prisma.approvalRequest.count({ where: { status: 'PENDING' } });
}

/** A request plus the current values it would change, for side-by-side review. */
export async function getRequest(id: string, viewer: Viewer) {
  const request = await prisma.approvalRequest.findFirst({ where: { id, ...scope(viewer) }, include: requestInclude });
  if (!request) throw notFound('Request');
  const current = request.participantId
    ? await prisma.participant.findUnique({
        where: { id: request.participantId },
        select: {
          participantNumber: true, name: true, email: true, mobile: true, externalUserId: true, address: true,
          drawPayments: { select: { status: true, draw: { select: { drawNumber: true, status: true } } }, orderBy: { draw: { drawNumber: 'asc' } } },
          complimentaryChoice: { select: { status: true, option: { select: { name: true } } } },
          winners: { select: { id: true, claimStatus: true, claimNote: true, prize: { select: { name: true } } } },
        },
      })
    : null;
  return { ...request, current };
}

// ---- Decisions (AC-APR-6..9) -----------------------------------------------------------------------------------------

async function apply(request: { type: string; campaignId: string; participantId: string | null; winnerId: string | null; agentId: string }, payload: unknown, adminId: string) {
  const type = request.type as RequestType;
  const actor = { role: 'SUPER_ADMIN' as const, adminId, agentId: request.agentId };
  switch (type) {
    case 'PARTICIPANT_CREATE': {
      const { agentId: _ignored, ...details } = parseOrThrow('PARTICIPANT_CREATE', payload);
      void _ignored;
      return (await createParticipantRecord(request.campaignId, details, request.agentId)).id;
    }
    case 'PARTICIPANT_UPDATE':
      await updateParticipantRecord(request.participantId!, parseOrThrow('PARTICIPANT_UPDATE', payload));
      return request.participantId;
    case 'PAYMENT':
      await recordParticipantPayment(request.participantId!, adminId, parseOrThrow('PAYMENT', payload), { collectedByAgentId: request.agentId });
      return request.participantId;
    case 'WINNER_CLAIM':
      if (!(await updateWinnerClaimRecord(request.winnerId!, parseOrThrow('WINNER_CLAIM', payload)))) throw notFound('Winner');
      return request.participantId;
    case 'COMPLIMENTARY_CHOICE':
      await recordChoice(request.participantId!, parseOrThrow('COMPLIMENTARY_CHOICE', payload).optionId, actor);
      return request.participantId;
    case 'COMPLIMENTARY_DELIVERY':
      await deliverChoice(request.participantId!, parseOrThrow('COMPLIMENTARY_DELIVERY', payload), actor);
      return request.participantId;
  }
}

export async function approveRequest(id: string, adminId: string, editedPayload?: Record<string, unknown>, now = new Date()) {
  // Claim first so two approvals cannot both apply the change (AC-APR-9).
  const claimed = await prisma.approvalRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'APPROVING' } });
  const request = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!request) throw notFound('Request');
  if (claimed.count !== 1) throw notPending();

  const payload = editedPayload ?? request.payload;
  try {
    const participantId = await apply(request, payload, adminId);
    return await prisma.approvalRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        decidedAt: now,
        decidedByAdminId: adminId,
        pendingKey: null,
        participantId,
        ...(editedPayload ? { payload: editedPayload as Prisma.InputJsonValue, originalPayload: request.payload as Prisma.InputJsonValue } : {}),
      },
      include: requestInclude,
    });
  } catch (error) {
    // A rule failed: nothing was applied, so the request goes back to pending for an edit or a rejection (A2).
    await prisma.approvalRequest.update({ where: { id }, data: { status: 'PENDING' } });
    throw error;
  }
}

export async function rejectRequest(id: string, adminId: string, reason: string, now = new Date()) {
  const rejected = await prisma.approvalRequest.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'REJECTED', decidedAt: now, decidedByAdminId: adminId, rejectionReason: reason, pendingKey: null },
  });
  if (rejected.count !== 1) {
    if (!(await prisma.approvalRequest.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Request');
    throw notPending();
  }
  return prisma.approvalRequest.findUniqueOrThrow({ where: { id }, include: requestInclude });
}

export async function withdrawRequest(id: string, agentId: string, now = new Date()) {
  const withdrawn = await prisma.approvalRequest.updateMany({
    where: { id, agentId, status: 'PENDING' },
    data: { status: 'WITHDRAWN', decidedAt: now, pendingKey: null },
  });
  if (withdrawn.count !== 1) {
    if (!(await prisma.approvalRequest.findFirst({ where: { id, agentId }, select: { id: true } }))) throw notFound('Request');
    throw notPending();
  }
  return prisma.approvalRequest.findUniqueOrThrow({ where: { id }, include: requestInclude });
}
