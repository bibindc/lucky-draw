import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  ComplimentaryError,
  createOption,
  deliverChoice,
  getParticipantComplimentary,
  listCampaignComplimentary,
  listOptions,
  recordChoice,
  updateOption,
  type Actor,
} from '../services/complimentary.service';
import {
  complimentaryStatusSchema,
  createOptionSchema,
  deliverChoiceSchema,
  recordChoiceSchema,
  updateOptionSchema,
} from '../validators/complimentary.validator';

function readId(request: Request, response: Response) {
  const parsed = z.uuid().safeParse(request.params.id);
  if (parsed.success) return parsed.data;
  response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid resource id is required.' } });
  return null;
}

function actorOf(request: Request): Actor {
  return { role: request.role ?? 'AGENT', adminId: request.adminId, agentId: request.agentId };
}

function invalid(response: Response, issues: unknown) {
  return response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Complimentary prize details are invalid.', details: issues } });
}

async function respond(response: Response, work: () => Promise<unknown>, status = 200) {
  try {
    const result = await work();
    return response.status(status).json(result);
  } catch (error) {
    if (error instanceof ComplimentaryError) {
      return response.status(error.status).json({ error: { code: error.code, message: error.message } });
    }
    throw error;
  }
}

export async function getOptions(request: Request, response: Response) {
  const campaignId = readId(request, response);
  if (!campaignId) return;
  return respond(response, async () => ({ options: await listOptions(campaignId, actorOf(request)) }));
}

export async function addOption(request: Request, response: Response) {
  const campaignId = readId(request, response);
  if (!campaignId) return;
  const parsed = createOptionSchema.safeParse(request.body);
  if (!parsed.success) return invalid(response, parsed.error.issues);
  return respond(response, async () => ({ option: await createOption(campaignId, parsed.data) }), 201);
}

export async function editOption(request: Request, response: Response) {
  const optionId = readId(request, response);
  if (!optionId) return;
  const parsed = updateOptionSchema.safeParse(request.body);
  if (!parsed.success) return invalid(response, parsed.error.issues);
  return respond(response, async () => ({ option: await updateOption(optionId, parsed.data) }));
}

export async function campaignComplimentary(request: Request, response: Response) {
  const campaignId = readId(request, response);
  if (!campaignId) return;
  const status = complimentaryStatusSchema.safeParse(request.query.status);
  if (request.query.status !== undefined && !status.success) return invalid(response, [{ path: ['status'], message: 'Status filter is invalid.' }]);
  const search = typeof request.query.search === 'string' ? request.query.search : undefined;
  return respond(response, async () => ({
    participants: await listCampaignComplimentary(campaignId, { status: status.success ? status.data : undefined, search }, actorOf(request)),
  }));
}

export async function participantComplimentary(request: Request, response: Response) {
  const participantId = readId(request, response);
  if (!participantId) return;
  return respond(response, async () => ({ complimentary: await getParticipantComplimentary(participantId, actorOf(request)) }));
}

function agentsUseRequests(response: Response) {
  return response.status(403).json({ error: { code: 'FORBIDDEN', message: 'Agents submit complimentary prize changes as approval requests.' } });
}

export async function chooseComplimentary(request: Request, response: Response) {
  const participantId = readId(request, response);
  if (!participantId) return;
  if (request.role !== 'SUPER_ADMIN') return agentsUseRequests(response);
  const parsed = recordChoiceSchema.safeParse(request.body);
  if (!parsed.success) return invalid(response, parsed.error.issues);
  return respond(response, async () => ({ choice: await recordChoice(participantId, parsed.data.optionId, actorOf(request)) }), 201);
}

export async function deliverComplimentary(request: Request, response: Response) {
  const participantId = readId(request, response);
  if (!participantId) return;
  if (request.role !== 'SUPER_ADMIN') return agentsUseRequests(response);
  const parsed = deliverChoiceSchema.safeParse(request.body ?? {});
  if (!parsed.success) return invalid(response, parsed.error.issues);
  return respond(response, async () => ({ choice: await deliverChoice(participantId, parsed.data, actorOf(request)) }));
}
