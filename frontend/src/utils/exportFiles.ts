// Shared helpers for list exports (participants, winners): IST dates, INR text and file names.

export function dateInIndia(value: Date | string, withTime = true) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

// jsPDF's built-in fonts have no ₹ glyph, so PDFs spell out the currency.
export function inrText(amountRupees: number) {
  return `INR ${amountRupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function exportFileName(prefix: string, campaignName: string, extension: 'xlsx' | 'pdf', now = new Date()) {
  const slug = campaignName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campaign';
  // en-CA formats as YYYY-MM-DD.
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  return `${prefix}-${slug}-${date}.${extension}`;
}

export const excelHeaderCell = { fontWeight: 'bold', textColor: '#ffffff', backgroundColor: '#204f42' } as const;
