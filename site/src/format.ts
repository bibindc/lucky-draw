// Draws are scheduled in India, so times are shown in IST whatever the visitor's clock says.
const timeZone = 'Asia/Kolkata';

export function rupees(paise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
}

/** Compact amounts for headline figures, e.g. ₹12.5 L. */
export function compactRupees(paise: number) {
  const value = paise / 100;
  if (value >= 1_00_00_000) return `₹${trim(value / 1_00_00_000)} Cr`;
  if (value >= 1_00_000) return `₹${trim(value / 1_00_000)} L`;
  return rupees(paise);
}

function trim(value: number) {
  return value.toFixed(1).replace(/\.0$/, '');
}

export function drawDate(iso: string) {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(new Date(iso));
}

export function drawTime(iso: string) {
  return `${new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone }).format(new Date(iso))} IST`;
}

export function shortDate(iso: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(new Date(iso));
}

export function rankLabel(rank: number) {
  const teen = rank % 100 >= 11 && rank % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[rank % 10] ?? 'th';
  return `${rank}${suffix} prize`;
}

export const pad = (value: number) => String(value).padStart(2, '0');

/** Days, hours, minutes and seconds until a moment; all zero once it has passed. */
export function timeUntil(targetMs: number, nowMs: number) {
  const total = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  return { done: total === 0, days: Math.floor(total / 86_400), hours: Math.floor((total % 86_400) / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}

export function initials(name: string) {
  return name.replace(/\./g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('');
}

/** wa.me wants digits only, with the country code. */
export function whatsappLink(number: string) {
  return `https://wa.me/${number.replace(/\D/g, '')}`;
}
