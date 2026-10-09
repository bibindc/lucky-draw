import { describe, expect, it } from 'vitest';
import { recordPaymentSchema } from '../src/validators/payment.validator';
import { indiaToday, startOfIndiaDate } from '../src/utils/indiaDate';

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

  it('AC-PAY-8 accepts a past or current India date as the payment date, but not a future one', () => {
    const today = indiaToday();
    const tomorrow = indiaToday(new Date(Date.now() + 24 * 60 * 60 * 1000));

    expect(recordPaymentSchema.safeParse({ count: 1, method: 'CASH' }).success).toBe(true);
    expect(recordPaymentSchema.safeParse({ count: 1, method: 'CASH', paidOn: '2026-01-15' }).success).toBe(true);
    expect(recordPaymentSchema.safeParse({ count: 1, method: 'CASH', paidOn: today }).success).toBe(true);
    expect(recordPaymentSchema.safeParse({ count: 1, method: 'CASH', paidOn: tomorrow }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ count: 1, method: 'CASH', paidOn: '15/01/2026' }).success).toBe(false);
  });
});

describe('India dates', () => {
  it('uses the India calendar day and its start', () => {
    // 20:00 UTC on 8 Oct is already 9 Oct in India.
    expect(indiaToday(new Date('2026-10-08T20:00:00Z'))).toBe('2026-10-09');
    expect(startOfIndiaDate('2026-10-09').toISOString()).toBe('2026-10-08T18:30:00.000Z');
  });
});
