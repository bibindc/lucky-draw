import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  approveRequest,
  getRequest,
  listRequests,
  pendingCount,
  rejectRequest,
  submitRequest,
  withdrawRequest,
  type Viewer,
} from '../services/approval.service';
import { approveSchema, rejectSchema, requestFilterSchema, submitRequestSchema } from '../validators/approval.validator';

function readId(request: Request, response: Response) {
  const parsed = z.uuid().safeParse(request.params.id);
  if (parsed.success) return parsed.data;
  response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid request id is required.' } });
  return null;
}

const viewerOf = (request: Request): Viewer => ({ role: request.role ?? 'AGENT', adminId: request.adminId, agentId: request.agentId });

function invalid(response: Response, issues: unknown) {
  return response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request details are invalid.', details: issues } });
}

// Rule errors from the approval service and from the actions it applies (participants, payments, prizes) all carry
// a code and an HTTP status.
function isRuleError(error: unknown): error is Error & { code: string; status: number; details?: unknown } {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' && 'status' in error && typeof error.status === 'number';
}

async function respond(response: Response, work: () => Promise<unknown>, status = 200) {
  try {
    const result = await work();
    return response.status(status).json(result);
  } catch (error) {
    if (isRuleError(error)) {
      return response.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
    }
    throw error;
  }
}

export async function submit(request: Request, response: Response) {
  if (request.role !== 'AGENT' || !request.agentId) {
    return response.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only agents submit approval requests; super admins make changes directly.' } });
  }
  const parsed = submitRequestSchema.safeParse(request.body);
  if (!parsed.success) return invalid(response, parsed.error.issues);
  return respond(response, async () => ({ request: await submitRequest(request.agentId!, parsed.data) }), 201);
}

export async function list(request: Request, response: Response) {
  const filters = requestFilterSchema.safeParse(request.query);
  if (!filters.success) return invalid(response, filters.error.issues);
  return respond(response, async () => ({ requests: await listRequests(filters.data, viewerOf(request)) }));
}

export async function count(_request: Request, response: Response) {
  return respond(response, async () => ({ count: await pendingCount() }));
}

export async function detail(request: Request, response: Response) {
  const id = readId(request, response);
  if (!id) return;
  return respond(response, async () => ({ request: await getRequest(id, viewerOf(request)) }));
}

export async function approve(request: Request, response: Response) {
  const id = readId(request, response);
  if (!id) return;
  const parsed = approveSchema.safeParse(request.body ?? {});
  if (!parsed.success) return invalid(response, parsed.error.issues);
  return respond(response, async () => ({ request: await approveRequest(id, request.adminId!, parsed.data.payload) }));
}

export async function reject(request: Request, response: Response) {
  const id = readId(request, response);
  if (!id) return;
  const parsed = rejectSchema.safeParse(request.body);
  if (!parsed.success) return invalid(response, parsed.error.issues);
  return respond(response, async () => ({ request: await rejectRequest(id, request.adminId!, parsed.data.reason) }));
}

export async function withdraw(request: Request, response: Response) {
  const id = readId(request, response);
  if (!id) return;
  if (request.role !== 'AGENT' || !request.agentId) {
    return response.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the submitting agent can withdraw a request.' } });
  }
  return respond(response, async () => ({ request: await withdrawRequest(id, request.agentId!) }));
}
