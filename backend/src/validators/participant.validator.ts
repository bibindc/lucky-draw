import { z } from 'zod';

const serialNumberSchema = z
  .number({ error: 'Enter a serial number.' })
  .int('Serial number must be a whole number.')
  .min(1000, 'Serial number must be between 1000 and 9999.')
  .max(9999, 'Serial number must be between 1000 and 9999.');

const addressSchema = z.string().trim().max(500, 'Address can be at most 500 characters.');

export const createParticipantSchema = z
  .object({
    name: z.string().trim().min(1),
    email: z.email().trim().toLowerCase().optional().or(z.literal('')),
    mobile: z.string().trim().optional().or(z.literal('')),
    externalUserId: z.string().trim().optional().or(z.literal('')),
    agentId: z.uuid().optional(),
    participantNumber: serialNumberSchema.optional(),
    address: addressSchema.optional(),
  })
  .superRefine((participant, context) => {
    if (!participant.email && !participant.mobile) {
      context.addIssue({
        code: 'custom',
        path: ['mobile'],
        message: 'Provide an email address or mobile number.',
      });
    }
    if (participant.mobile && !/^[6-9]\d{9}$/.test(participant.mobile)) {
      context.addIssue({
        code: 'custom',
        path: ['mobile'],
        message: 'Enter a 10-digit Indian mobile number.',
      });
    }
  })
  .transform((participant) => ({
    ...participant,
    email: participant.email || null,
    mobile: participant.mobile || null,
    externalUserId: participant.externalUserId || null,
    address: participant.address || null,
  }));

export const participantStatusSchema = z.enum([
  'REGISTERED',
  'PAYMENT_PENDING',
  'ELIGIBLE',
  'WINNER',
  'COMPLETED',
]);

export const updateParticipantSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    email: z.email().trim().toLowerCase().optional().or(z.literal('')),
    mobile: z.string().trim().optional().or(z.literal('')),
    externalUserId: z.string().trim().optional().or(z.literal('')),
    agentId: z.uuid().optional(),
    participantNumber: serialNumberSchema.optional(),
    address: addressSchema.optional(),
  })
  .strict()
  .superRefine((participant, context) => {
    if (Object.keys(participant).length === 0) {
      context.addIssue({ code: 'custom', message: 'Provide at least one participant field to update.' });
    }
    if (participant.mobile && !/^[6-9]\d{9}$/.test(participant.mobile)) {
      context.addIssue({
        code: 'custom',
        path: ['mobile'],
        message: 'Enter a 10-digit Indian mobile number.',
      });
    }
  })
  .transform((participant) => ({
    ...participant,
    ...(participant.email !== undefined ? { email: participant.email || null } : {}),
    ...(participant.mobile !== undefined ? { mobile: participant.mobile || null } : {}),
    ...(participant.externalUserId !== undefined ? { externalUserId: participant.externalUserId || null } : {}),
    ...(participant.address !== undefined ? { address: participant.address || null } : {}),
  }));