import type { DrawPool } from '../../api/campaigns';

export const modeLabels = { AUTOMATIC: 'Automatic', MANUAL: 'Manual' } as const;

export function formatDrawDate(date: string) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
  }).format(new Date(date));
}

export const pad = (value: number) => String(value).padStart(2, '0');

export function rankLabel(rank: number) {
  const suffix = rank % 100 >= 11 && rank % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[rank % 10] ?? 'th';
  return `${rank}${suffix} prize`;
}

/** AC-DRW-5: suggest the lowest-ranked prize with units left, so the 1st prize is drawn last. */
export function suggestedPrizeId(prizes: DrawPool['prizes']): string {
  const available = prizes.filter((prize) => prize.available > 0);
  return available.reduce<DrawPool['prizes'][number] | undefined>(
    (lowest, prize) => (!lowest || prize.rank > lowest.rank ? prize : lowest),
    undefined,
  )?.id ?? '';
}
