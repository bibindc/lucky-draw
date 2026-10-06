import type { Request, Response } from 'express';
import { z } from 'zod';
import { listParticipantPayments, PaymentRuleError, recordParticipantPayment, voidParticipantPayment } from '../services/payment.service';
import { recordPaymentSchema } from '../validators/payment.validator';

function readId(value: string | string[] | undefined, response: Response) {
  const parsed = z.uuid().safeParse(value);
  if (parsed.success) return parsed.data;
  response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid resource id is required.' } });
  return null;
}

function reportPaymentError(error: unknown, response: Response) {
  if (error instanceof PaymentRuleError) {
    return response.status(error.status).json({ error: { code: error.code, message: error.message } });
  }
  throw error;
}

export async function recordPayment(request: Request, response: Response) {
  const participantId = readId(request.params.id, response);
  if (!participantId) return;
  if (!request.adminId) {
    return response.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Admin authentication is required.' } });
  }

  const parsed = recordPaymentSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Payment details are invalid.', details: parsed.error.issues },
    });
  }

  try {
    const payment = await recordParticipantPayment(participantId, request.adminId, parsed.data);
    return response.status(201).json({ payment });
  } catch (error) {
    return reportPaymentError(error, response);
  }
}

export async function voidPayment(request: Request, response: Response) {
  const transactionId = readId(request.params.transactionId, response);
  if (!transactionId) return;

  try {
    const payment = await voidParticipantPayment(transactionId);
    return response.json({ payment });
  } catch (error) {
    return reportPaymentError(error, response);
  }
}

export async function getPaymentHistory(request: Request, response: Response) {
  const participantId = readId(request.params.id, response);
  if (!participantId) return;

  const payments = await listParticipantPayments(participantId);
  return response.json({ payments });
}