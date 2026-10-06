import { z } from 'zod';

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform((value) => (value === undefined ? undefined : value || null));

export const createOptionSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name for the option.').max(120),
    description: optionalText(500),
    valuePaise: z.number().int().min(0).nullable().optional(),
  })
  .strict();

export const updateOptionSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name for the option.').max(120).optional(),
    description: optionalText(500),
    valuePaise: z.number().int().min(0).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((input) => Object.values(input).some((value) => value !== undefined), 'Provide at least one field to update.');

export const recordChoiceSchema = z.object({ optionId: z.uuid() }).strict();

export const deliverChoiceSchema = z
  .object({
    deliveredAt: z.coerce.date().optional(),
    note: optionalText(500).transform((value) => value ?? null),
  })
  .strict();

export const complimentaryStatusSchema = z.enum(['NOT_CHOSEN', 'CHOSEN', 'DELIVERED', 'CANCELLED', 'DELIVERED_BEFORE_WINNING']);
