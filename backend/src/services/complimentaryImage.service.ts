import { prisma } from '../lib/prisma';
import { ImageError, checkImage } from './image.service';

const notFound = () => new ImageError('NOT_FOUND', 'Complimentary option was not found.', 404);

/** AC-CMP-11: one image per option, replaceable at any time (cosmetic, even after it has been chosen). */
export async function saveOptionImage(optionId: string, data: Buffer, now = new Date()) {
  const { mimeType, bytes } = checkImage(data);
  const option = await prisma.complimentaryOption.findUnique({ where: { id: optionId }, select: { id: true } });
  if (!option) throw notFound();
  return prisma.$transaction(async (transaction) => {
    await transaction.complimentaryOptionImage.upsert({
      where: { optionId },
      update: { mimeType, data: bytes, size: bytes.length },
      create: { optionId, mimeType, data: bytes, size: bytes.length },
    });
    return transaction.complimentaryOption.update({ where: { id: optionId }, data: { imageUpdatedAt: now } });
  });
}

export async function removeOptionImage(optionId: string) {
  const option = await prisma.complimentaryOption.findUnique({ where: { id: optionId }, select: { id: true } });
  if (!option) throw notFound();
  return prisma.$transaction(async (transaction) => {
    await transaction.complimentaryOptionImage.deleteMany({ where: { optionId } });
    return transaction.complimentaryOption.update({ where: { id: optionId }, data: { imageUpdatedAt: null } });
  });
}

export async function loadOptionImage(optionId: string) {
  return prisma.complimentaryOptionImage.findUnique({ where: { optionId }, select: { mimeType: true, data: true, size: true } });
}
