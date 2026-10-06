import { describe, expect, it } from 'vitest';
import { winnerClaimSchema, winnerFilterSchema } from '../src/validators/winner.validator';

describe('winner claim validation', () => {
  it('accepts each supported claim state and optional note', () => {
    expect(winnerClaimSchema.safeParse({ claimStatus: 'CLAIMED', claimNote: 'Collected at the office' }).success).toBe(true);
    expect(winnerClaimSchema.safeParse({ claimStatus: 'DELIVERED' }).success).toBe(true);
  });

  it('rejects invalid claim states and draw filters', () => {
    expect(winnerClaimSchema.safeParse({ claimStatus: 'LOST' }).success).toBe(false);
    expect(winnerFilterSchema.safeParse({ drawId: 'not-a-uuid' }).success).toBe(false);
  });
});