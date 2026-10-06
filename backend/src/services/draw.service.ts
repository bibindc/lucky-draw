import { randomInt } from 'node:crypto';
import { Prisma, type Draw } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import type { drawRoundSchema, startDrawSchema } from '../validators/draw.validator';
import { cancelActiveChoice } from './complimentary.service';

type Transaction = Prisma.TransactionClient;
type StartDrawInput = z.infer<typeof startDrawSchema>;
type DrawRoundInput = z.infer<typeof drawRoundSchema>;

export class DrawRuleError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const transactionOptions = { maxWait: 10_000, timeout: 30_000 };

const resultInclude = {
  winners: {
    include: {
      participant: { select: { id: true, participantNumber: true, name: true, email: true, mobile: true } },
      prize: true,
      recordedByAdmin: { select: { id: true, name: true } },
    },
    orderBy: { drawPosition: 'asc' },
  },
  executedByAdmin: { select: { id: true, name: true } },
  manualRecord: true,
} satisfies Prisma.DrawInclude;

// Eligible pool (D5) and this draw's prizes that still have stock, highest rank first.
async function loadDrawPool(client: Transaction | typeof prisma, draw: Pick<Draw, 'id' | 'campaignId'>) {
  const [eligibleParticipants, prizes] = await Promise.all([
    client.participant.findMany({
      where: {
        campaignId: draw.campaignId,
        drawPayments: { some: { drawId: draw.id, status: 'PAID' } },
        winners: { none: {} },
      },
      select: {
        id: true, participantNumber: true, name: true, email: true, mobile: true,
        agent: { select: { id: true, agentCode: true, name: true } },
      },
      orderBy: { participantNumber: 'asc' },
    }),
    client.prize.findMany({
      where: { campaignId: draw.campaignId, drawId: draw.id, assignedQuantity: { lt: client.prize.fields.totalQuantity } },
      orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);
  const availableUnits = prizes.reduce((sum, prize) => sum + prize.totalQuantity - prize.assignedQuantity, 0);
  return { eligibleParticipants, prizes, availableUnits };
}

function plannedRounds(draw: Pick<Draw, 'prizeCount'>, poolSize: number, availableUnits: number) {
  return Math.min(draw.prizeCount, poolSize, availableUnits);
}

async function completeDraw(transaction: Transaction, draw: Draw, now: Date) {
  const isFinalDraw = draw.drawNumber === await transaction.draw.count({ where: { campaignId: draw.campaignId } });
  if (isFinalDraw) {
    await transaction.participant.updateMany({
      where: { campaignId: draw.campaignId, winners: { none: {} }, status: { not: 'COMPLETED' } },
      data: { status: 'COMPLETED' },
    });
  }
  await transaction.draw.update({ where: { id: draw.id }, data: { status: 'COMPLETED', executedAt: now } });
}

// AC-DRW-11 / AC-WAV-1..2: a winner's later draws are waived or kept as retained credit in the round's transaction.
async function applyWinnerEffects(transaction: Transaction, draw: Draw, participantId: string, now: Date) {
  await transaction.participant.update({ where: { id: participantId }, data: { status: 'WINNER' } });
  // AC-CMP-6: winners lose an undelivered complimentary prize.
  await cancelActiveChoice(transaction, participantId, `Won draw ${draw.drawNumber}`, now);
  const futurePayments = await transaction.drawPayment.findMany({
    where: { participantId, draw: { campaignId: draw.campaignId, drawNumber: { gt: draw.drawNumber } } },
    select: { id: true, status: true },
  });
  const unpaidIds = futurePayments.filter(({ status }) => status === 'NOT_PAID').map(({ id }) => id);
  const paidIds = futurePayments.filter(({ status }) => status === 'PAID').map(({ id }) => id);
  if (unpaidIds.length) await transaction.drawPayment.updateMany({ where: { id: { in: unpaidIds } }, data: { status: 'WAIVED' } });
  if (paidIds.length) await transaction.drawPayment.updateMany({ where: { id: { in: paidIds } }, data: { retainedCredit: true } });
}

export async function startDraw(drawId: string, adminId: string, input: StartDrawInput, now = new Date()) {
  return prisma.$transaction(async (transaction) => {
    // Conditional claim: exactly one start can move a due draw out of SCHEDULED (AC-DRW-1).
    const claim = await transaction.draw.updateMany({
      where: { id: drawId, status: 'SCHEDULED', scheduledAt: { lte: now } },
      data: { status: 'IN_PROGRESS', startedAt: now },
    });
    const draw = await transaction.draw.findUnique({ where: { id: drawId } });
    if (!draw) throw new DrawRuleError('NOT_FOUND', 'Draw was not found.', 404);
    if (claim.count !== 1) {
      if (draw.status === 'SCHEDULED') throw new DrawRuleError('DRAW_NOT_DUE', 'This draw cannot start before its scheduled date and time.');
      throw new DrawRuleError('DRAW_ALREADY_STARTED', 'This draw has already been started.');
    }

    let heldAt = now;
    if (input.mode === 'MANUAL') {
      if (input.heldAt < draw.scheduledAt) {
        throw new DrawRuleError('VALIDATION_ERROR', 'The draw cannot have been held before its scheduled date and time.', 400);
      }
      if (input.heldAt > now) throw new DrawRuleError('VALIDATION_ERROR', 'The time the draw was held cannot be in the future.', 400);
      heldAt = input.heldAt;
      await transaction.manualDrawRecord.create({
        data: {
          drawId,
          conductedBy: input.conductedBy,
          drawMethod: input.drawMethod,
          venue: input.venue,
          witnesses: input.witnesses,
          notes: input.notes,
          evidenceReference: input.evidenceReference,
        },
      });
    }

    const { eligibleParticipants, availableUnits } = await loadDrawPool(transaction, draw);
    const totalRounds = plannedRounds(draw, eligibleParticipants.length, availableUnits);
    const started = await transaction.draw.update({
      where: { id: drawId },
      data: {
        executionMode: input.mode,
        heldAt,
        executedByAdminId: adminId,
        totalRounds,
        poolSnapshot: eligibleParticipants.map(({ id }) => id) as Prisma.InputJsonValue,
      },
    });
    if (totalRounds === 0) await completeDraw(transaction, started, now);

    return {
      draw: await transaction.draw.findUniqueOrThrow({ where: { id: drawId }, include: resultInclude }),
      warning: totalRounds > 0
        ? null
        : eligibleParticipants.length === 0
          ? 'There were no eligible participants, so the draw completed with zero winners.'
          : 'No prizes were available, so the draw completed with zero winners.',
    };
  }, transactionOptions);
}

export async function drawRound(
  drawId: string,
  adminId: string,
  input: DrawRoundInput,
  now = new Date(),
  randomIndex: (max: number) => number = randomInt,
) {
  return prisma.$transaction(async (transaction) => {
    // Conditional claim on the round counter: a repeated or concurrent request for this round updates nothing (AC-DRW-8).
    const claim = await transaction.draw.updateMany({
      where: { id: drawId, status: 'IN_PROGRESS', roundsCompleted: input.round - 1 },
      data: { roundsCompleted: input.round },
    });
    const draw = await transaction.draw.findUnique({ where: { id: drawId } });
    if (!draw) throw new DrawRuleError('NOT_FOUND', 'Draw was not found.', 404);
    if (claim.count !== 1) {
      if (draw.status !== 'IN_PROGRESS') throw new DrawRuleError('DRAW_NOT_IN_PROGRESS', 'This draw is not in progress.');
      throw new DrawRuleError('ROUND_CONFLICT', `Round ${input.round} cannot be drawn now; ${draw.roundsCompleted} round${draw.roundsCompleted === 1 ? ' has' : 's have'} been drawn. Reload and continue.`);
    }
    if (draw.executionMode === 'MANUAL' && !input.participantId) {
      throw new DrawRuleError('VALIDATION_ERROR', 'Choose the participant who was drawn for this round.', 400);
    }
    if (draw.executionMode === 'AUTOMATIC' && input.participantId) {
      throw new DrawRuleError('VALIDATION_ERROR', 'Automatic rounds pick the winner; do not send a participant.', 400);
    }

    const stock = await transaction.prize.updateMany({
      where: { id: input.prizeId, drawId, assignedQuantity: { lt: transaction.prize.fields.totalQuantity } },
      data: { assignedQuantity: { increment: 1 } },
    });
    if (stock.count !== 1) throw new DrawRuleError('PRIZE_UNAVAILABLE', 'Choose a prize from this draw that still has units left.', 400);

    const { eligibleParticipants } = await loadDrawPool(transaction, draw);
    let participantId: string;
    if (input.participantId) {
      if (!eligibleParticipants.some(({ id }) => id === input.participantId)) {
        throw new DrawRuleError('INELIGIBLE_WINNER', 'The winner must be in this draw’s eligible pool (paid for this draw and not already a winner).', 400);
      }
      participantId = input.participantId;
    } else {
      if (eligibleParticipants.length === 0) throw new DrawRuleError('NO_ELIGIBLE_PARTICIPANTS', 'Nobody is left in the eligible pool.');
      participantId = eligibleParticipants[randomIndex(eligibleParticipants.length)].id;
    }

    const winner = await transaction.winner.create({
      data: {
        drawId,
        participantId,
        prizeId: input.prizeId,
        drawPosition: input.round,
        drawnAt: now,
        recordedByAdminId: adminId,
        poolSnapshot: eligibleParticipants.map(({ id }) => id) as Prisma.InputJsonValue,
      },
      include: resultInclude.winners.include,
    });
    await applyWinnerEffects(transaction, draw, participantId, now);

    const completed = input.round === draw.totalRounds;
    if (completed) await completeDraw(transaction, draw, now);

    return {
      winner,
      progress: { roundsCompleted: input.round, totalRounds: draw.totalRounds ?? input.round, completed },
      eligibleCount: eligibleParticipants.length,
    };
  }, transactionOptions);
}

export async function getDrawPool(drawId: string) {
  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    include: { campaign: { select: { id: true, name: true } } },
  });
  if (!draw) return null;

  const { eligibleParticipants, prizes, availableUnits } = await loadDrawPool(prisma, draw);
  return {
    draw: {
      id: draw.id, drawNumber: draw.drawNumber, scheduledAt: draw.scheduledAt, prizeCount: draw.prizeCount,
      status: draw.status, executionMode: draw.executionMode, campaign: draw.campaign,
    },
    participants: eligibleParticipants,
    prizes: prizes.map((prize) => ({
      id: prize.id, name: prize.name, rank: prize.rank, available: prize.totalQuantity - prize.assignedQuantity,
    })),
    // Before the start this is what the draw would get; afterwards it is the number fixed at start (AC-DRW-3).
    totalRounds: draw.status === 'SCHEDULED' ? plannedRounds(draw, eligibleParticipants.length, availableUnits) : draw.totalRounds ?? 0,
    roundsCompleted: draw.roundsCompleted,
  };
}

export async function getDrawResult(drawId: string) {
  return prisma.draw.findUnique({
    where: { id: drawId },
    include: { campaign: { select: { id: true, name: true } }, ...resultInclude },
  });
}
