import { describe, expect, it } from 'vitest';
import { recordPaymentSchema } from '../src/validators/payment.validator';

describe('payment input validation', () => {
  it('requires exactly one draw count or explicit draw list', () => {
    expect(recordPaymentSchema.safeParse({ method: 'CASH' }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({
      count: 1,
      drawIds: ['00000000-0000-4000-8000-000000000001'],
      method: 'CASH',
    }).success).toBe(false);
  });

  it('rejects duplicate draw IDs and invalid methods', () => {
    const drawId = '00000000-0000-4000-8000-000000000001';
    expect(recordPaymentSchema.safeParse({ drawIds: [drawId, drawId], method: 'CASH' }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ count: 1, method: 'CHEQUE' }).success).toBe(false);
  });
});
