import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../utils/password';
import { allocateSequence } from '../services/sequence.service';
import { createAgentSchema, updateAgentSchema } from '../validators/agent.validator';
import { containsText } from '../lib/textSearch';

function validationError(response: Response, issues: unknown) {
  return response.status(400).json({
    error: { code: 'VALIDATION_ERROR', message: 'Agent details are invalid.', details: issues },
  });
}

function duplicateResponse(response: Response) {
  return response.status(409).json({
    error: { code: 'DUPLICATE_AGENT', message: 'An agent with this email or mobile number already exists.' },
  });
}

function readId(request: Request, response: Response) {
  const parsed = z.uuid().safeParse(request.params.id);
  if (parsed.success) return parsed.data;
  response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid agent ID is required.' } });
  return null;
}

function isUniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function listAgents(request: Request, response: Response) {
  const search = typeof request.query.search === 'string' ? request.query.search.trim() : '';
  const agents = await prisma.agent.findMany({
    where: search
      ? {
          OR: [
            { name: containsText(search) },
            { agentCode: containsText(search) },
            { email: containsText(search) },
            { mobile: containsText(search) },
          ],
        }
      : undefined,
    orderBy: { agentCode: 'asc' },
    include: { _count: { select: { participants: true } } },
  });
  return response.json({ agents });
}

export async function createAgent(request: Request, response: Response) {
  const parsed = createAgentSchema.safeParse(request.body);
  if (!parsed.success) return validationError(response, parsed.error.issues);

  const passwordHash = await hashPassword(parsed.data.password);
  try {
    const agent = await prisma.$transaction(async (transaction) => {
      const existingAdmin = await transaction.admin.findUnique({ where: { email: parsed.data.email } });
      const existingAgent = await transaction.agent.findFirst({
        where: { OR: [{ email: parsed.data.email }, { mobile: parsed.data.mobile }] },
      });
      if (existingAdmin || existingAgent) throw new Error('DUPLICATE_AGENT');

      const agentNumber = await allocateSequence(transaction, 'agent-code', 1000);
      const agentCode = `AG-${String(agentNumber).padStart(4, '0')}`;

      return transaction.agent.create({
        data: {
          agentCode,
          name: parsed.data.name,
          email: parsed.data.email,
          mobile: parsed.data.mobile,
          passwordHash,
        },
        select: { id: true, agentCode: true, name: true, email: true, mobile: true, isActive: true, createdAt: true },
      });
    });
    return response.status(201).json({ agent });
  } catch (error) {
    if (error instanceof Error && error.message === 'DUPLICATE_AGENT') return duplicateResponse(response);
    if (isUniqueConstraint(error)) return duplicateResponse(response);
    throw error;
  }
}

export async function updateAgent(request: Request, response: Response) {
  const id = readId(request, response);
  if (!id) return;
  const parsed = updateAgentSchema.safeParse(request.body);
  if (!parsed.success) return validationError(response, parsed.error.issues);

  const existing = await prisma.agent.findUnique({ where: { id } });
  if (!existing) return response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Agent was not found.' } });

  if (parsed.data.email) {
    const [admin, otherAgent] = await Promise.all([
      prisma.admin.findUnique({ where: { email: parsed.data.email } }),
      prisma.agent.findFirst({ where: { email: parsed.data.email, id: { not: id } } }),
    ]);
    if (admin || otherAgent) return duplicateResponse(response);
  }
  if (parsed.data.mobile) {
    const otherAgent = await prisma.agent.findFirst({ where: { mobile: parsed.data.mobile, id: { not: id } } });
    if (otherAgent) return duplicateResponse(response);
  }

  try {
    const agent = await prisma.agent.update({
      where: { id },
      data: parsed.data,
      select: {
        id: true, agentCode: true, name: true, email: true, mobile: true,
        isActive: true, createdAt: true, updatedAt: true,
        _count: { select: { participants: true } },
      },
    });
    return response.json({ agent });
  } catch (error) {
    if (isUniqueConstraint(error)) return duplicateResponse(response);
    throw error;
  }
}