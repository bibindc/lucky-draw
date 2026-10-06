import { z } from 'zod';
import { createParticipantSchema, updateParticipantSchema } from './participant.validator';
import { recordPaymentSchema } from './payment.validator';
import { winnerClaimSchema } from './winner.validator';
import { deliverChoiceSchema, recordChoiceSchema } from './complimentary.validator';

export const requestTypes = [
  'PARTICIPANT_CREATE',
  'PARTICIPANT_UPDATE',
  'PAYMENT',
  'WINNER_CLAIM',
  'COMPLIMENTARY_CHOICE',
  'COMPLIMENTARY_DELIVERY',
] as const;
export type RequestType = (typeof requestTypes)[number];

const record = z.record(z.string(), z.unknown());

// Where each request points; the details themselves are checked per type below.
export const submitRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('PARTICIPANT_CREATE'), campaignId: z.uuid(), payload: record }).strict(),
  z.object({ type: z.literal('PARTICIPANT_UPDATE'), participantId: z.uuid(), payload: record }).strict(),
  z.object({ type: z.literal('PAYMENT'), participantId: z.uuid(), payload: record }).strict(),
  z.object({ type: z.literal('WINNER_CLAIM'), winnerId: z.uuid(), payload: record }).strict(),
  z.object({ type: z.literal('COMPLIMENTARY_CHOICE'), participantId: z.uuid(), payload: record }).strict(),
  z.object({ type: z.literal('COMPLIMENTARY_DELIVERY'), participantId: z.uuid(), payload: record }).strict(),
]);

// Fields an agent may never set through a request (ownership and serial changes stay with super admins).
const forbiddenKeys: Partial<Record<RequestType, string[]>> = {
  PARTICIPANT_CREATE: ['agentId'],
  PARTICIPANT_UPDATE: ['agentId', 'participantNumber'],
};

const payloadSchemas = {
  PARTICIPANT_CREATE: createParticipantSchema,
  PARTICIPANT_UPDATE: updateParticipantSchema,
  PAYMENT: recordPaymentSchema,
  WINNER_CLAIM: winnerClaimSchema,
  COMPLIMENTARY_CHOICE: recordChoiceSchema,
  COMPLIMENTARY_DELIVERY: deliverChoiceSchema,
} as const;

export type ParsedPayload<T extends RequestType> = z.infer<(typeof payloadSchemas)[T]>;

/** Validates a request's details exactly as the matching direct action would (A2). */
export function parsePayload<T extends RequestType>(type: T, payload: unknown):
  | { success: true; data: ParsedPayload<T> }
  | { success: false; issues: { path: (string | number)[]; message: string }[] } {
  const forbidden = (forbiddenKeys[type] ?? []).filter((key) => typeof payload === 'object' && payload !== null && key in payload);
  if (forbidden.length) {
    return { success: false, issues: forbidden.map((key) => ({ path: [key], message: 'This field cannot be changed through a request.' })) };
  }
  if (type === 'PARTICIPANT_CREATE' && (typeof payload !== 'object' || payload === null || !('participantNumber' in payload))) {
    return { success: false, issues: [{ path: ['participantNumber'], message: 'Enter a serial number.' }] };
  }
  const parsed = payloadSchemas[type].safeParse(payload);
  if (parsed.success) return { success: true, data: parsed.data as ParsedPayload<T> };
  return { success: false, issues: parsed.error.issues.map(({ path, message }) => ({ path: path as (string | number)[], message })) };
}

export const rejectSchema = z.object({ reason: z.string().trim().min(1, 'Enter a reason for rejecting.').max(500) }).strict();
export const approveSchema = z.object({ payload: record.optional() }).strict();
export const requestFilterSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN']).optional(),
  type: z.enum(requestTypes).optional(),
  agentId: z.uuid().optional(),
  participantId: z.uuid().optional(),
});
