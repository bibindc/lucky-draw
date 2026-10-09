// Calendar dates are entered as India dates (YYYY-MM-DD); India has no daylight saving, so the offset is fixed.

/** Today's date in India as YYYY-MM-DD. */
export function indiaToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

/** The start of an India calendar date (YYYY-MM-DD) as an instant. */
export function startOfIndiaDate(date: string): Date {
  return new Date(`${date}T00:00:00+05:30`);
}
