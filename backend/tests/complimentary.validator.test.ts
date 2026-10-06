import { describe, expect, it } from 'vitest';
import { createOptionSchema, deliverChoiceSchema, updateOptionSchema } from '../src/validators/complimentary.validator';

describe('complimentary validation', () => {
  it('AC-CMP-1 requires an option name and normalises optional text', () => {
    expect(createOptionSchema.parse({ name: '  Dinner set ', description: '  ' })).toEqual({ name: 'Dinner set', description: null });
    expect(createOptionSchema.safeParse({ name: ' ' }).success).toBe(false);
    expect(createOptionSchema.safeParse({ name: 'Cooker', valuePaise: -1 }).success).toBe(false);
    expect(createOptionSchema.safeParse({ name: 'Cooker', stock: 5 }).success).toBe(false);
    expect(updateOptionSchema.safeParse({}).success).toBe(false);
    expect(updateOptionSchema.parse({ isActive: false })).toEqual({ isActive: false });
  });

  it('AC-CMP-4 accepts an optional delivery date and note', () => {
    expect(deliverChoiceSchema.parse({})).toEqual({ note: null });
    expect(deliverChoiceSchema.parse({ deliveredAt: '2026-10-05T10:00:00.000Z', note: ' At office ' }))
      .toEqual({ deliveredAt: new Date('2026-10-05T10:00:00.000Z'), note: 'At office' });
    expect(deliverChoiceSchema.safeParse({ note: 'x'.repeat(501) }).success).toBe(false);
  });
});
