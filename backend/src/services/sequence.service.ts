import type { Prisma } from '@prisma/client';

export async function allocateSequence(
  transaction: Prisma.TransactionClient,
  name: string,
  firstValue: number,
): Promise<number> {
  const counter = await transaction.sequenceCounter.upsert({
    where: { name },
    update: { nextValue: { increment: 1 } },
    create: { name, nextValue: firstValue + 1 },
  });

  return counter.nextValue - 1;
}
