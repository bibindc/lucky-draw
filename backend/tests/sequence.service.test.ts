import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { allocateSequence } from '../src/services/sequence.service';

describe('global identifier allocation', () => {
  it('allocates sequential values from the configured starting value', async () => {
    const upsert = vi.fn()
      .mockResolvedValueOnce({ nextValue: 1001 })
      .mockResolvedValueOnce({ nextValue: 1002 });
    const transaction = { sequenceCounter: { upsert } } as unknown as Prisma.TransactionClient;

    expect(await allocateSequence(transaction, 'participant-number', 1000)).toBe(1000);
    expect(await allocateSequence(transaction, 'participant-number', 1000)).toBe(1001);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { name: 'participant-number' },
      create: { name: 'participant-number', nextValue: 1001 },
    }));
  });
});