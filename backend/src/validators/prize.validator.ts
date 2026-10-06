import { z } from 'zod';

export const createPrizeSchema = z.object({
  drawId: z.uuid(),
  name: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  valuePaise: z.number().int().nonnegative().nullable().optional(),
  rank: z.number().int().min(1),
  totalQuantity: z.number().int().min(1),
});

export const updatePrizeSchema = z
  .object({
    drawId: z.uuid().optional(),
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().nullable().optional(),
    valuePaise: z.number().int().nonnegative().nullable().optional(),
    rank: z.number().int().min(1).optional(),
    totalQuantity: z.number().int().min(1).optional(),
  })
  .refine((prize) => Object.keys(prize).length > 0, 'Provide at least one prize field to update.');