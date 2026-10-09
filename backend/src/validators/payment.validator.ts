import { z } from 'zod';
import { indiaToday } from '../utils/indiaDate';

export const recordPaymentSchema = z
  .object({
    count: z.number().int().positive().optional(),
    drawIds: z.array(z.uuid()).min(1).optional(),
    method: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER']),
    reference: z.string().trim().max(500).optional(),
    // The day the money was received (India date); defaults to today. Agents may collect first and enter it later.
    paidOn: z.iso.date().optional(),
  })
  .superRefine((payment, context) => {
    if (payment.paidOn && payment.paidOn > indiaToday()) {
      context.addIssue({ code: 'custom', path: ['paidOn'], message: 'The payment date cannot be in the future.' });
    }
    if (Boolean(payment.count) === Boolean(payment.drawIds?.length)) {
      context.addIssue({
        code: 'custom',
        path: ['drawIds'],
        message: 'Provide either a draw count or specific draw IDs.',
      });
    }
    if (payment.drawIds && new Set(payment.drawIds).size !== payment.drawIds.length) {
      context.addIssue({ code: 'custom', path: ['drawIds'], message: 'Draw IDs must be unique.' });
    }
  });
