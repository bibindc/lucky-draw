import { z } from 'zod';

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((value) => value || null);

export const startDrawSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('AUTOMATIC') }).strict(),
  z
    .object({
      mode: z.literal('MANUAL'),
      heldAt: z.coerce.date({ error: 'Enter when the draw was held.' }),
      conductedBy: z.string().trim().min(1, 'Enter who conducted the draw.').max(120),
      drawMethod: z.string().trim().min(1, 'Describe how winners were drawn.').max(200),
      venue: optionalText(200),
      witnesses: optionalText(500),
      notes: optionalText(1000),
      evidenceReference: optionalText(500),
    })
    .strict(),
]);

export const drawRoundSchema = z
  .object({
    // The round the client believes it is drawing; guards against double submits (AC-DRW-8).
    round: z.number().int().min(1),
    prizeId: z.uuid(),
    participantId: z.uuid().optional(),
  })
  .strict();
