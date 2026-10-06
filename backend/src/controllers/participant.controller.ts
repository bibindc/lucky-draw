import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { createParticipantSchema, participantStatusSchema, updateParticipantSchema } from '../validators/participant.validator';
import { suggestSerial } from '../services/participantSerial.service';
import { ParticipantRuleError, createParticipantRecord, updateParticipantRecord } from '../services/participant.service';
import { containsText } from '../lib/textSearch';

function readId(value: string | string[] | undefined, response: Response): string | null {
  const parsed = z.uuid().safeParse(value);
  if (parsed.success) return parsed.data;
  response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid resource id is required.' } });
  return null;
}

function validationError(response: Response, issues: unknown) {
  return response.status(400).json({
    error: { code: 'VALIDATION_ERROR', message: 'Participant details are invalid.', details: issues },
  });
}

function notFound(response: Response, entity: string) {
  return response.status(404).json({ error: { code: 'NOT_FOUND', message: `${entity} was not found.` } });
}

function ruleErrorResponse(response: Response, error: ParticipantRuleError) {
  return response.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
}

// AC-APR-2: agents submit participant changes as approval requests instead.
function agentsUseRequests(response: Response) {
  return response.status(403).json({
    error: { code: 'FORBIDDEN', message: 'Agents submit participant changes as approval requests.' },
  });
}

export async function createParticipant(request: Request, response: Response) {
  const campaignId = readId(request.params.id, response);
  if (!campaignId) return;
  if (request.role !== 'SUPER_ADMIN') return agentsUseRequests(response);
  const parsed = createParticipantSchema.safeParse(request.body);
  if (!parsed.success) return validationError(response, parsed.error.issues);
  const { agentId, ...details } = parsed.data;
  if (!agentId) return validationError(response, [{ path: ['agentId'], message: 'Select an agent for this participant.' }]);

  try {
    const participant = await createParticipantRecord(campaignId, details, agentId);
    return response.status(201).json({ participant });
  } catch (error) {
    if (error instanceof ParticipantRuleError) return ruleErrorResponse(response, error);
    throw error;
  }
}

export async function nextSerial(_request: Request, response: Response) {
  return response.json({ serial: await suggestSerial(prisma) });
}

export const maxExportRows = 10_000;

// Shared by the list and export endpoints so both apply identical filters and agent scoping.
async function buildParticipantListFilter(request: Request, response: Response): Promise<Prisma.ParticipantWhereInput | null> {
  const campaignId = readId(request.params.id, response);
  if (!campaignId) return null;

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    notFound(response, 'Campaign');
    return null;
  }

  const search = typeof request.query.search === 'string' ? request.query.search.trim() : '';
  const status = participantStatusSchema.safeParse(request.query.status);
  if (request.query.status && !status.success) {
    validationError(response, [{ path: ['status'], message: 'Participant status is invalid.' }]);
    return null;
  }

  let requestedAgentId: string | undefined;
  if (request.role === 'AGENT') {
    if (!request.agentId) {
      response.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Agent session is invalid.' } });
      return null;
    }
    requestedAgentId = request.agentId;
  } else if (request.query.agentId !== undefined) {
    const parsedAgentId = z.uuid().safeParse(request.query.agentId);
    if (!parsedAgentId.success) {
      validationError(response, [{ path: ['agentId'], message: 'Agent filter is invalid.' }]);
      return null;
    }
    requestedAgentId = parsedAgentId.data;
  }

  return {
    campaignId,
    ...(requestedAgentId ? { agentId: requestedAgentId } : {}),
    ...(status.success && request.query.status ? { status: status.data } : {}),
    ...(search
      ? {
          OR: [
            { name: containsText(search) },
            { email: containsText(search) },
            { mobile: containsText(search) },
            { externalUserId: containsText(search) },
          ],
        }
      : {}),
  };
}

export async function listParticipants(request: Request, response: Response) {
  const where = await buildParticipantListFilter(request, response);
  if (!where) return;

  const page = Math.max(1, Number(request.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize) || 25));
  const [participants, total] = await prisma.$transaction([
    prisma.participant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        agent: { select: { id: true, agentCode: true, name: true } },
        drawPayments: {
          orderBy: { draw: { drawNumber: 'asc' } },
          include: { draw: { select: { drawNumber: true, scheduledAt: true, status: true } } },
        },
      },
    }),
    prisma.participant.count({ where }),
  ]);

  return response.json({ participants, pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) } });
}

export async function exportParticipants(request: Request, response: Response) {
  const where = await buildParticipantListFilter(request, response);
  if (!where) return;

  const total = await prisma.participant.count({ where });
  if (total > maxExportRows) {
    return response.status(422).json({
      error: {
        code: 'EXPORT_TOO_LARGE',
        message: `${total} participants match these filters; narrow them to ${maxExportRows.toLocaleString('en-IN')} or fewer to export.`,
      },
    });
  }

  const participants = await prisma.participant.findMany({
    where,
    orderBy: { participantNumber: 'asc' },
    include: {
      agent: { select: { id: true, agentCode: true, name: true } },
      drawPayments: { select: { status: true } },
    },
  });

  return response.json({ participants, total });
}

export async function getParticipant(request: Request, response: Response) {
  const participantId = readId(request.params.id, response);
  if (!participantId) return;

  const participant = await prisma.participant.findUnique({
    where: {
      id: participantId,
      ...(request.role === 'AGENT' ? { agentId: request.agentId } : {}),
    },
    include: {
      drawPayments: {
        orderBy: { draw: { drawNumber: 'asc' } },
        include: {
          draw: { select: { drawNumber: true, scheduledAt: true, status: true } },
          currentTransaction: { select: { id: true, amountPaise: true, method: true, createdAt: true, status: true } },
        },
      },
      agent: { select: { id: true, agentCode: true, name: true } },
      paymentTransactions: {
        orderBy: { createdAt: 'desc' },
        include: {
          recordedByAdmin: { select: { id: true, name: true, email: true } },
          allocations: { include: { drawPayment: { include: { draw: { select: { drawNumber: true, status: true } } } } } },
        },
      },
      winners: { include: { draw: true, prize: true } },
    },
  });
  if (!participant) return notFound(response, 'Participant');

  return response.json({ participant });
}

export async function updateParticipant(request: Request, response: Response) {
  const participantId = readId(request.params.id, response);
  if (!participantId) return;
  if (request.role !== 'SUPER_ADMIN') return agentsUseRequests(response);
  const parsed = updateParticipantSchema.safeParse(request.body);
  if (!parsed.success) return validationError(response, parsed.error.issues);

  try {
    const participant = await updateParticipantRecord(participantId, parsed.data);
    return response.json({ participant });
  } catch (error) {
    if (error instanceof ParticipantRuleError) return ruleErrorResponse(response, error);
    throw error;
  }
}
