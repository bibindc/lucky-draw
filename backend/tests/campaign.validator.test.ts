import { describe, expect, it } from 'vitest';
import { createCampaignSchema } from '../src/validators/campaign.validator';

function campaignWithDates(firstOffsetDays: number, secondOffsetDays: number) {
  return {
    name: 'Spring Circle',
    durationMonths: 2,
    drawCount: 2,
    totalAmountPaise: 60_000,
    perDrawAmountPaise: 30_000,
    draws: [firstOffsetDays, secondOffsetDays].map((offset, index) => ({
      scheduledAt: new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString(),
      prizeCount: index + 1,
    })),
  };
}

describe('campaign configuration validation', () => {
  it('accepts a valid campaign and scheduled draw list', () => {
    const result = createCampaignSchema.safeParse(campaignWithDates(20, 40));

    expect(result.success).toBe(true);
  });

  it('rejects amount mismatch, duplicate dates, and incomplete schedules', () => {
    const input = campaignWithDates(20, 20);
    input.totalAmountPaise = 50_000;

    const result = createCampaignSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining(['totalAmountPaise', 'draws.1.scheduledAt']),
      );
    }
  });

  it('rejects non-chronological and out-of-duration draw dates', () => {
    const nonChronological = createCampaignSchema.safeParse(campaignWithDates(80, 20));

    expect(nonChronological.success).toBe(false);
    if (!nonChronological.success) {
      expect(nonChronological.error.issues.some((issue) => issue.message.includes('chronological'))).toBe(true);
    }

    const outsideDuration = campaignWithDates(20, 80);
    outsideDuration.durationMonths = 1;
    const durationResult = createCampaignSchema.safeParse(outsideDuration);
    expect(durationResult.success).toBe(false);
    if (!durationResult.success) {
      expect(durationResult.error.issues.some((issue) => issue.message.includes('campaign duration'))).toBe(true);
    }
  });
});