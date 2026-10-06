import { prisma } from '../lib/prisma';
import { ImageError, checkImage } from './image.service';

const notFound = () => new ImageError('NOT_FOUND', 'Prize was not found.', 404);

export async function savePrizeImage(prizeId: string, data: Buffer, now = new Date()) {
  const { mimeType, bytes } = checkImage(data);
  const prize = await prisma.prize.findUnique({ where: { id: prizeId }, select: { id: true } });
  if (!prize) throw notFound();
  // AC-PRZ-9: cosmetic, so allowed whatever the prize's assignment or draw state.
  return prisma.$transaction(async (transaction) => {
    await transaction.prizeImage.upsert({
      where: { prizeId },
      update: { mimeType, data: bytes, size: bytes.length },
      create: { prizeId, mimeType, data: bytes, size: bytes.length },
    });
    return transaction.prize.update({ where: { id: prizeId }, data: { imageUpdatedAt: now } });
  });
}

export async function removePrizeImage(prizeId: string) {
  const prize = await prisma.prize.findUnique({ where: { id: prizeId }, select: { id: true } });
  if (!prize) throw notFound();
  return prisma.$transaction(async (transaction) => {
    await transaction.prizeImage.deleteMany({ where: { prizeId } });
    return transaction.prize.update({ where: { id: prizeId }, data: { imageUpdatedAt: null } });
  });
}

export async function loadPrizeImage(prizeId: string) {
  return prisma.prizeImage.findUnique({ where: { prizeId }, select: { mimeType: true, data: true, size: true } });
}
