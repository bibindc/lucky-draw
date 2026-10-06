// Helpers for `datetime-local` inputs whose values are entered and shown in Asia/Kolkata time,
// regardless of the browser's own time zone.

export function indiaDateTimeValue(date: string | Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(date));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`;
}

export function indiaDateTimeToIso(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Enter a valid date and time.');
  const [, year, month, day, hour, minute] = match;
  const utcTime = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)) - 330 * 60_000;
  return new Date(utcTime).toISOString();
}
