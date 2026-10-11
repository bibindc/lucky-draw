import { describe, expect, it } from 'vitest';
import { PaymentRuleError, selectPaymentDraws } from '../src/services/payment.service';
import { participantStatus } from '../src/services/eligibility';

type DrawStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED';

function drawPayment(drawNumber: number, status: DrawStatus, paymentStatus: 'NOT_PAID' | 'PAID' | 'WAIVED' = 'NOT_PAID') {
  return {
    id: `payment-${drawNumber}`,
    drawId: `draw-${drawNumber}`,
    status: paymentStatus,
    draw: { drawNumber, status },
  };
}

describe('payment draw allocation rules', () => {
  it('AC-ADV-2 / AC-PAY-4 settles missed installments first, including draws already held', () => {
    const candidates = [drawPayment(3, 'SCHEDULED'), drawPayment(1, 'SCHEDULED'), drawPayment(2, 'COMPLETED')];

    expect(selectPaymentDraws(candidates, { count: 2 }).map((payment) => payment.draw.drawNumber)).toEqual([1, 2]);
  });

  it('supports explicit draw IDs in campaign order', () => {
    const candidates = [drawPayment(3, 'SCHEDULED'), drawPayment(1, 'SCHEDULED'), drawPayment(2, 'SCHEDULED')];

    expect(selectPaymentDraws(candidates, { drawIds: ['draw-3', 'draw-1'] }).map((payment) => payment.draw.drawNumber)).toEqual([1, 3]);
  });

  it('rejects draws in progress, already paid or waived, and out-of-range requests', () => {
    const candidates = [drawPayment(1, 'IN_PROGRESS'), drawPayment(2, 'SCHEDULED', 'PAID'), drawPayment(3, 'SCHEDULED', 'WAIVED')];

    expect(() => selectPaymentDraws(candidates, { count: 1 })).toThrow(PaymentRuleError);
    expect(() => selectPaymentDraws(candidates, { drawIds: ['draw-1'] })).toThrow(PaymentRuleError);
    expect(() => selectPaymentDraws(candidates, { drawIds: ['draw-2'] })).toThrow(PaymentRuleError);
  });
});

describe('participant status (AC-PAY-6)', () => {
  it('is Eligible only when every installment up to the next draw is paid', () => {
    // Missed installment 1, paid 2 and 3: still pending for draw 2.
    expect(participantStatus([drawPayment(1, 'COMPLETED'), drawPayment(2, 'SCHEDULED', 'PAID'), drawPayment(3, 'SCHEDULED', 'PAID')], false)).toBe('PAYMENT_PENDING');
    expect(participantStatus([drawPayment(1, 'COMPLETED', 'PAID'), drawPayment(2, 'SCHEDULED', 'PAID'), drawPayment(3, 'SCHEDULED')], false)).toBe('ELIGIBLE');
    expect(participantStatus([drawPayment(1, 'COMPLETED', 'PAID'), drawPayment(2, 'SCHEDULED', 'PAID')], true)).toBe('WINNER');
  });
});
