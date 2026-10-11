import type { DrawPayment, Draw } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { z } from 'zod';
import type { recordPaymentSchema } from '../validators/payment.validator';
import { cancelActiveChoice, hasDeliveredChoice } from './complimentary.service';
import { indiaToday, startOfIndiaDate } from '../utils/indiaDate';
import { participantStatus } from './eligibility';

type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export class PaymentRuleError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function recordParticipantPayment(
  participantId: string,
  adminId: string,
  input: RecordPaymentInput,
  options: { collectedByAgentId?: string } = {},
) {
  return prisma.$transaction(async (transaction) => {
    const participant = await transaction.participant.findUnique({
      where: { id: participantId },
      include: {
        campaign: { select: { perDrawAmountPaise: true } },
        drawPayments: {
          include: { draw: true },
          orderBy: { draw: { drawNumber: 'asc' } },
        },
        winners: { select: { id: true } },
      },
    });
    if (!participant) throw new PaymentRuleError('NOT_FOUND', 'Participant was not found.', 404);
    // Winners may keep paying, to enter the final (bumper) draw (D2).
    const selectedPayments = selectPaymentDraws(participant.drawPayments, input);

    const payment = await transaction.paymentTransaction.create({
      data: {
        participantId,
        amountPaise: participant.campaign.perDrawAmountPaise * selectedPayments.length,
        method: input.method,
        reference: input.reference || null,
        paidOn: startOfIndiaDate(input.paidOn ?? indiaToday()),
        recordedByAdminId: adminId,
        collectedByAgentId: options.collectedByAgentId ?? null,
      },
    });

    const updateResult = await transaction.drawPayment.updateMany({
      where: {
        id: { in: selectedPayments.map((drawPayment) => drawPayment.id) },
        status: 'NOT_PAID',
      },
      data: { status: 'PAID', transactionId: payment.id },
    });
    if (updateResult.count !== selectedPayments.length) {
      throw new PaymentRuleError('PAYMENT_NOT_ALLOWED', 'Payment status changed; reload and try again.');
    }

    await transaction.paymentAllocation.createMany({
      data: selectedPayments.map((drawPayment) => ({
        transactionId: payment.id,
        drawPaymentId: drawPayment.id,
      })),
    });

    const updatedPayments = participant.drawPayments.map((drawPayment) =>
      selectedPayments.some((selected) => selected.id === drawPayment.id)
        ? { ...drawPayment, status: 'PAID' as const }
        : drawPayment,
    );
    await transaction.participant.update({
      where: { id: participantId },
      data: { status: participantStatus(updatedPayments, participant.winners.length > 0) },
    });

    return transaction.paymentTransaction.findUniqueOrThrow({
      where: { id: payment.id },
      include: {
        allocations: {
          include: { drawPayment: { include: { draw: { select: { drawNumber: true } } } } },
        },
      },
    });
  });
}

export async function voidParticipantPayment(transactionId: string) {
  return prisma.$transaction(async (transaction) => {
    const payment = await transaction.paymentTransaction.findUnique({
      where: { id: transactionId },
      include: {
        allocations: {
          include: { drawPayment: { include: { draw: true } } },
        },
      },
    });
    if (!payment) throw new PaymentRuleError('NOT_FOUND', 'Payment transaction was not found.', 404);
    if (payment.status !== 'RECORDED') {
      throw new PaymentRuleError('PAYMENT_NOT_ALLOWED', 'This payment transaction has already been voided.');
    }
    // A payment that counted towards a draw's pool cannot be undone once that draw has started. A late payment for a
    // draw already held when it was recorded never counted, so it can still be voided.
    const lockedDraw = ({ draw }: { draw: Draw }) =>
      draw.status !== 'SCHEDULED' && !(draw.status === 'COMPLETED' && (draw.startedAt ?? new Date(0)) < payment.createdAt);
    if (payment.allocations.length === 0 || payment.allocations.some(({ drawPayment }) => lockedDraw(drawPayment))) {
      throw new PaymentRuleError('PAYMENT_NOT_ALLOWED', 'A payment can only be voided while no draw it covered has started since it was recorded.');
    }

    // AC-CMP-7: the complimentary prize was given on the strength of this payment.
    if (await hasDeliveredChoice(transaction, payment.participantId)) {
      throw new PaymentRuleError('PAYMENT_NOT_ALLOWED', 'This participant has already received their complimentary prize, so the payment cannot be voided.');
    }

    const allocationIds = payment.allocations.map(({ drawPayment }) => drawPayment.id);
    const updateResult = await transaction.drawPayment.updateMany({
      where: { id: { in: allocationIds }, status: 'PAID', transactionId },
      data: { status: 'NOT_PAID', transactionId: null },
    });
    if (updateResult.count !== allocationIds.length) {
      throw new PaymentRuleError('PAYMENT_NOT_ALLOWED', 'Payment allocations changed; reload and try again.');
    }

    const voidedPayment = await transaction.paymentTransaction.update({
      where: { id: transactionId },
      data: { status: 'VOIDED', voidedAt: new Date() },
    });
    await cancelActiveChoice(transaction, payment.participantId, 'Payment voided', voidedPayment.voidedAt ?? new Date());
    const participantPayments = await transaction.drawPayment.findMany({
      where: { participantId: payment.participantId },
      include: { draw: true },
    });
    const hasWinner = await transaction.winner.findFirst({
      where: { participantId: payment.participantId },
      select: { id: true },
    });
    await transaction.participant.update({
      where: { id: payment.participantId },
      data: { status: participantStatus(participantPayments, Boolean(hasWinner)) },
    });

    return voidedPayment;
  });
}

export async function listParticipantPayments(participantId: string) {
  return prisma.paymentTransaction.findMany({
    where: { participantId },
    orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
    include: {
      recordedByAdmin: { select: { id: true, name: true, email: true } },
      allocations: { include: { drawPayment: { include: { draw: { select: { drawNumber: true } } } } } },
    },
  });
}

type SelectablePayment = Pick<DrawPayment, 'id' | 'drawId' | 'status'> & {
  draw: Pick<Draw, 'status' | 'drawNumber'>;
};

// A draw being held cannot take payments (AC-DRW-10); a missed installment stays payable after its draw (AC-PAY-4).
export function isPayable(payment: { status: string; draw: { status: string } }) {
  return payment.status === 'NOT_PAID' && (payment.draw.status === 'SCHEDULED' || payment.draw.status === 'COMPLETED');
}

export function selectPaymentDraws<T extends SelectablePayment>(
  drawPayments: T[],
  input: Pick<RecordPaymentInput, 'count' | 'drawIds'>,
): T[] {
  // Oldest unpaid installment first, so missed installments are settled before later ones (AC-ADV-2).
  const unpaid = drawPayments.filter(isPayable).sort((left, right) => left.draw.drawNumber - right.draw.drawNumber);
  const requestedCount = input.count ?? input.drawIds?.length ?? 0;
  if (input.count && input.count > unpaid.length) {
    throw new PaymentRuleError('PAYMENT_NOT_ALLOWED', 'Payment count exceeds the unpaid installments.');
  }

  const selectedPayments = input.drawIds
    ? unpaid.filter((payment) => input.drawIds?.includes(payment.drawId))
    : unpaid.slice(0, requestedCount);
  if (selectedPayments.length !== requestedCount) {
    throw new PaymentRuleError(
      'PAYMENT_NOT_ALLOWED',
      'One or more selected draws are in progress, already paid, or not part of this participant’s campaign.',
    );
  }
  return selectedPayments;
}
