import { describe, expect, it } from 'vitest';
import { PaymentRuleError, selectPaymentDraws } from '../src/services/payment.service';

function drawPayment(drawNumber: number, status: 'SCHEDULED' | 'COMPLETED', paymentStatus: 'NOT_PAID' | 'PAID' | 'WAIVED' = 'NOT_PAID') {
  return {
    id: `payment-${drawNumber}`,
    drawId: `draw-${drawNumber}`,
    status: paymentStatus,
    draw: { drawNumber, status },
  };
}

describe('payment draw allocation rules', () => {
  it('allocates advances to the earliest unpaid scheduled draws', () => {
    const candidates = [drawPayment(3, 'SCHEDULED'), drawPayment(1, 'SCHEDULED'), drawPayment(2, 'COMPLETED')];

    expect(selectPaymentDraws(candidates, { count: 2 }).map((payment) => payment.draw.drawNumber)).toEqual([1, 3]);
  });

  it('supports explicit draw IDs in campaign order', () => {
    const candidates = [drawPayment(3, 'SCHEDULED'), drawPayment(1, 'SCHEDULED'), drawPayment(2, 'SCHEDULED')];

    expect(selectPaymentDraws(candidates, { drawIds: ['draw-3', 'draw-1'] }).map((payment) => payment.draw.drawNumber)).toEqual([1, 3]);
  });

  it('rejects completed, paid, waived, and out-of-range requests', () => {
    const candidates = [drawPayment(1, 'COMPLETED'), drawPayment(2, 'SCHEDULED', 'PAID'), drawPayment(3, 'SCHEDULED', 'WAIVED')];

    expect(() => selectPaymentDraws(candidates, { count: 1 })).toThrow(PaymentRuleError);
    expect(() => selectPaymentDraws(candidates, { drawIds: ['draw-1'] })).toThrow(PaymentRuleError);
  });
});
