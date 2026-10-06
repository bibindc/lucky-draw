import type { Request, Response } from 'express';
import { z } from 'zod';
import { DrawRuleError, drawRound, getDrawPool, getDrawResult, startDraw } from '../services/draw.service';
import { drawRoundSchema, startDrawSchema } from '../validators/draw.validator';

function readId(request: Request, response: Response) {
  const parsed = z.uuid().safeParse(request.params.id);
  if (parsed.success) return parsed.data;
  response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid draw id is required.' } });
  return null;
}

function reportError(error: unknown, response: Response) {
  if (error instanceof DrawRuleError) {
    return response.status(error.status).json({ error: { code: error.code, message: error.message } });
  }
  throw error;
}

function requireAdmin(request: Request, response: Response) {
  if (request.adminId) return request.adminId;
  response.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Admin authentication is required.' } });
  return null;
}

export async function start(request: Request, response: Response) {
  const drawId = readId(request, response);
  if (!drawId) return;
  const adminId = requireAdmin(request, response);
  if (!adminId) return;
  const parsed = startDrawSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Draw start details are invalid.', details: parsed.error.issues },
    });
  }

  try {
    return response.json(await startDraw(drawId, adminId, parsed.data));
  } catch (error) {
    return reportError(error, response);
  }
}

export async function round(request: Request, response: Response) {
  const drawId = readId(request, response);
  if (!drawId) return;
  const adminId = requireAdmin(request, response);
  if (!adminId) return;
  const parsed = drawRoundSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Round details are invalid.', details: parsed.error.issues },
    });
  }

  try {
    return response.status(201).json(await drawRound(drawId, adminId, parsed.data));
  } catch (error) {
    return reportError(error, response);
  }
}

export async function drawResult(request: Request, response: Response) {
  const drawId = readId(request, response);
  if (!drawId) return;

  const result = await getDrawResult(drawId);
  if (!result) {
    return response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Draw was not found.' } });
  }
  return response.json({ draw: result });
}

export async function drawPool(request: Request, response: Response) {
  const drawId = readId(request, response);
  if (!drawId) return;

  const pool = await getDrawPool(drawId);
  if (!pool) {
    return response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Draw was not found.' } });
  }
  return response.json(pool);
}
