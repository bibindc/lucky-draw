import type { Draw, Prisma } from '@prisma/client';

type Client = Pick<Prisma.TransactionClient, 'draw'>;
type DrawRef = Pick<Draw, 'id' | 'campaignId' | 'drawNumber'>;

/** The campaign's last draw holds the bumper prize (D2). */
export async function isFinalDraw(client: Client, draw: Pick<Draw, 'campaignId' | 'drawNumber'>) {
  const last = await client.draw.aggregate({ where: { campaignId: draw.campaignId }, _max: { drawNumber: true } });
  return draw.drawNumber === last._max.drawNumber;
}

/**
 * D5: a participant is in draw N's pool when every installment up to and including draw N is paid (missed
 * installments must be paid first, however late) and they have not won. Previous winners stay in the final
 * (bumper) draw's pool, but nobody wins the same draw twice.
 */
export function drawEligibilityWhere(draw: DrawRef, finalDraw: boolean): Prisma.ParticipantWhereInput {
  return {
    campaignId: draw.campaignId,
    drawPayments: {
      some: { drawId: draw.id, status: 'PAID' },
      none: { status: 'NOT_PAID', draw: { drawNumber: { lte: draw.drawNumber } } },
    },
    winners: finalDraw ? { none: { drawId: draw.id } } : { none: {} },
  };
}

type PaymentWithDraw = { status: string; draw: Pick<Draw, 'drawNumber' | 'status'> };

/** The next draw still to be held (scheduled or in progress), if any. */
export function nextOpenDraw<T extends PaymentWithDraw>(drawPayments: T[]) {
  return drawPayments
    .filter(({ draw }) => draw.status === 'SCHEDULED' || draw.status === 'IN_PROGRESS')
    .sort((left, right) => left.draw.drawNumber - right.draw.drawNumber)[0]?.draw ?? null;
}

/** AC-PAY-6: Eligible when every installment up to the next draw is paid; Payment pending otherwise. */
export function participantStatus(drawPayments: PaymentWithDraw[], isWinner: boolean): 'WINNER' | 'ELIGIBLE' | 'PAYMENT_PENDING' {
  if (isWinner) return 'WINNER';
  const next = nextOpenDraw(drawPayments);
  if (!next) return 'PAYMENT_PENDING';
  const upToNext = drawPayments.filter(({ draw }) => draw.drawNumber <= next.drawNumber);
  return upToNext.every(({ status }) => status !== 'NOT_PAID') ? 'ELIGIBLE' : 'PAYMENT_PENDING';
}
