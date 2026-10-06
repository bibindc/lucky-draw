import { z } from 'zod';

const drawInputSchema = z.object({
  scheduledAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  prizeCount: z.number().int().min(1),
});

export const createCampaignSchema = z
  .object({
    name: z.string().trim().min(1),
    durationMonths: z.number().int().min(1).default(5),
    drawCount: z.number().int().min(1).default(10),
    totalAmountPaise: z.number().int().positive().default(300_000),
    perDrawAmountPaise: z.number().int().positive().default(30_000),
    draws: z.array(drawInputSchema).min(1),
  })
  .superRefine((campaign, context) => {
    if (campaign.totalAmountPaise !== campaign.drawCount * campaign.perDrawAmountPaise) {
      context.addIssue({
        code: 'custom',
        path: ['totalAmountPaise'],
        message: 'Total amount must equal draw count multiplied by per-draw amount.',
      });
    }

    if (campaign.draws.length !== campaign.drawCount) {
      context.addIssue({
        code: 'custom',
        path: ['draws'],
        message: `Provide a schedule for all ${campaign.drawCount} draws.`,
      });
    }

    const firstDate = campaign.draws[0]?.scheduledAt;
    if (!firstDate) return;

    const latestDate = addUtcMonths(firstDate, campaign.durationMonths);
    const seenDates = new Set<number>();

    campaign.draws.forEach((draw, index) => {
      const timestamp = draw.scheduledAt.getTime();
      if (timestamp <= Date.now()) {
        context.addIssue({
          code: 'custom',
          path: ['draws', index, 'scheduledAt'],
          message: 'Draw date and time must be in the future.',
        });
      }
      if (seenDates.has(timestamp)) {
        context.addIssue({
          code: 'custom',
          path: ['draws', index, 'scheduledAt'],
          message: 'Draw dates and times must be unique.',
        });
      }
      seenDates.add(timestamp);

      if (index > 0 && timestamp <= campaign.draws[index - 1].scheduledAt.getTime()) {
        context.addIssue({
          code: 'custom',
          path: ['draws', index, 'scheduledAt'],
          message: 'Draws must be scheduled in chronological order.',
        });
      }
      if (timestamp > latestDate.getTime()) {
        context.addIssue({
          code: 'custom',
          path: ['draws', index, 'scheduledAt'],
          message: 'Draw date must fall within the campaign duration.',
        });
      }
    });
  });

export const updateDrawSchema = z
  .object({
    scheduledAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)).optional(),
    prizeCount: z.number().int().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'Provide a draw date or prize count to update.');

export function addUtcMonths(date: Date, months: number): Date {
  const targetMonth = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = targetMonth % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(date.getUTCDate(), lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}