import { describe, expect, it } from 'vitest';
import { createPrizeSchema, updatePrizeSchema } from '../src/validators/prize.validator';

describe('prize validation', () => {
  it('requires a name, positive rank, and positive quantity', () => {
    const result = createPrizeSchema.safeParse({
      drawId: '00000000-0000-4000-8000-000000000001',
      name: ' ',
      rank: 0,
      totalQuantity: 0,
    });

    expect(result.success).toBe(false);
  });

  it('requires a draw assignment for newly created prizes', () => {
    const result = createPrizeSchema.safeParse({ name: 'Voucher', rank: 1, totalQuantity: 1 });

    expect(result.success).toBe(false);
  });

  it('accepts a prize with optional description and paise value', () => {
    const result = createPrizeSchema.safeParse({
      drawId: '00000000-0000-4000-8000-000000000001',
      name: 'Noise-cancelling headphones',
      description: 'Over-ear, wireless',
      valuePaise: 18_999_00,
      rank: 1,
      totalQuantity: 3,
    });

    expect(result.success).toBe(true);
  });

  it('requires at least one field when updating', () => {
    expect(updatePrizeSchema.safeParse({}).success).toBe(false);
  });
});