// Even draw schedule for the create-campaign form (AC-CAM-9). Works on `datetime-local` wall-clock
// values ("YYYY-MM-DDTHH:mm") so the result does not depend on the browser's time zone.

const dayMs = 86_400_000;

function addMonthsClamped(year: number, month: number, day: number, months: number): number {
  const lastDay = new Date(Date.UTC(year, month + months + 1, 0)).getUTCDate();
  return Date.UTC(year, month + months, Math.min(day, lastDay));
}

function formatWallClock(dayStart: number, time: string): string {
  return `${new Date(dayStart).toISOString().slice(0, 10)}T${time}`;
}

/**
 * Spreads `drawCount` draws evenly over `durationMonths` calendar months, starting at `firstDraw`.
 * Draw i sits at month offset i × months ÷ draws; a fractional offset is that share of the next
 * calendar month, rounded to whole days. Every draw keeps the first draw's time of day.
 */
export function spreadDrawDates(firstDraw: string, durationMonths: number, drawCount: number): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/.exec(firstDraw);
  if (!match || durationMonths < 1 || drawCount < 1) return [];
  const [, yearText, monthText, dayText, time] = match;
  const [year, month, day] = [Number(yearText), Number(monthText) - 1, Number(dayText)];

  const dates: string[] = [];
  let previous = -Infinity;
  for (let index = 0; index < drawCount; index += 1) {
    // Integer arithmetic keeps whole-month offsets exact (e.g. 5 months / 5 draws).
    const wholeMonths = Math.floor((index * durationMonths) / drawCount);
    const fraction = (index * durationMonths - wholeMonths * drawCount) / drawCount;
    const monthStart = addMonthsClamped(year, month, day, wholeMonths);
    const nextMonthStart = addMonthsClamped(year, month, day, wholeMonths + 1);
    let dayStart = monthStart + Math.round((fraction * (nextMonthStart - monthStart)) / dayMs) * dayMs;
    // More draws than days: keep dates unique and in order rather than repeating a day.
    if (dayStart <= previous) dayStart = previous + dayMs;
    previous = dayStart;
    dates.push(formatWallClock(dayStart, time));
  }
  return dates;
}
