import { z } from 'zod';

export const recordPaymentSchema = z
  .object({
    count: z.number().int().positive().optional(),
    drawIds: z.array(z.uuid()).min(1).optional(),
    method: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER']),
    reference: z.string().trim().max(500).optional(),
  })
  .superRefine((payment, context) => {
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
