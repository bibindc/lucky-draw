import { describe, expect, it } from 'vitest';
import { drawRoundSchema, startDrawSchema } from '../src/validators/draw.validator';

const prizeId = '00000000-0000-4000-8000-000000000002';
const manual = {
  mode: 'MANUAL',
  heldAt: '2026-10-05T11:00:00.000Z',
  conductedBy: '  Ravi Kumar ',
  drawMethod: 'Chits from a box',
  venue: '',
};

describe('draw start validation', () => {
  it('AC-MDR-1/2 accepts an automatic start and a manual start with required details', () => {
    expect(startDrawSchema.parse({ mode: 'AUTOMATIC' })).toEqual({ mode: 'AUTOMATIC' });
    const parsed = startDrawSchema.parse(manual);
    expect(parsed).toMatchObject({ mode: 'MANUAL', conductedBy: 'Ravi Kumar', venue: null, witnesses: null });

    expect(startDrawSchema.safeParse({ ...manual, conductedBy: ' ' }).success).toBe(false);
    expect(startDrawSchema.safeParse({ ...manual, heldAt: 'not a date' }).success).toBe(false);
    expect(startDrawSchema.safeParse({ mode: 'AUTOMATIC', conductedBy: 'Ravi' }).success).toBe(false);
    expect(startDrawSchema.safeParse({ mode: 'OTHER' }).success).toBe(false);
  });
});

describe('draw round validation', () => {
  it('AC-DRW-8 requires a positive round number and a prize', () => {
    expect(drawRoundSchema.safeParse({ round: 1, prizeId }).success).toBe(true);
    expect(drawRoundSchema.safeParse({ round: 0, prizeId }).success).toBe(false);
    expect(drawRoundSchema.safeParse({ round: 1 }).success).toBe(false);
    expect(drawRoundSchema.safeParse({ round: 1, prizeId, extra: true }).success).toBe(false);
  });
});
