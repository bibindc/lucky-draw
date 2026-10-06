import type { jsPDF as JsPDFDocument } from 'jspdf';
import type { Campaign } from '../api/campaigns';
import type { WinnerClaimStatus, WinnerRecord } from '../api/winners';
import { dateInIndia, excelHeaderCell, exportFileName, inrText } from './exportFiles';

export const claimStatusLabels: Record<WinnerClaimStatus, string> = {
  PENDING: 'Pending',
  CLAIMED: 'Claimed',
  DELIVERED: 'Delivered',
};

export type WinnerListFilters = {
  drawNumber?: number;
  claimStatus?: string;
};

export type WinnerListExportRow = {
  drawNumber: number;
  heldOn: string;
  mode: string;
  position: number | null;
  serial: number | null;
  name: string;
  agent: string;
  email: string;
  mobile: string;
  prize: string;
  rank: number;
  prizeValueRupees: number | null;
  claimStatus: string;
  claimUpdated: string;
  claimNote: string;
};

export function describeWinnerFilters(filters: WinnerListFilters): string {
  const parts = [
    filters.drawNumber ? `Draw ${filters.drawNumber}` : '',
    filters.claimStatus ? `Claim status: ${claimStatusLabels[filters.claimStatus as WinnerClaimStatus] ?? filters.claimStatus}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'All winners';
}

export function buildWinnerListRows(winners: WinnerRecord[]): WinnerListExportRow[] {
  return [...winners]
    .sort((left, right) => left.draw.drawNumber - right.draw.drawNumber || (left.drawPosition ?? 0) - (right.drawPosition ?? 0))
    .map((winner) => ({
      drawNumber: winner.draw.drawNumber,
      heldOn: dateInIndia(winner.draw.heldAt ?? winner.draw.scheduledAt),
      mode: winner.draw.executionMode === 'MANUAL' ? 'Manual' : winner.draw.executionMode === 'AUTOMATIC' ? 'Automatic' : '',
      position: winner.drawPosition ?? null,
      serial: winner.participant.participantNumber ?? null,
      name: winner.participant.name,
      agent: winner.participant.agent ? `${winner.participant.agent.agentCode} · ${winner.participant.agent.name}` : '',
      email: winner.participant.email ?? '',
      mobile: winner.participant.mobile ?? '',
      prize: winner.prize.name,
      rank: winner.prize.rank,
      prizeValueRupees: winner.prize.valuePaise === null ? null : winner.prize.valuePaise / 100,
      claimStatus: claimStatusLabels[winner.claimStatus] ?? winner.claimStatus,
      claimUpdated: winner.claimUpdatedAt ? dateInIndia(winner.claimUpdatedAt) : '',
      claimNote: winner.claimNote ?? '',
    }));
}

export function summarizeWinners(winners: WinnerRecord[]) {
  const byStatus = { PENDING: 0, CLAIMED: 0, DELIVERED: 0 } as Record<WinnerClaimStatus, number>;
  let totalValuePaise = 0;
  for (const winner of winners) {
    byStatus[winner.claimStatus] += 1;
    totalValuePaise += winner.prize.valuePaise ?? 0;
  }
  return { count: winners.length, byStatus, totalValueRupees: totalValuePaise / 100 };
}

function statusSummary(summary: ReturnType<typeof summarizeWinners>) {
  return (Object.keys(claimStatusLabels) as WinnerClaimStatus[])
    .map((status) => `${claimStatusLabels[status]} ${summary.byStatus[status]}`)
    .join(' · ');
}

export async function exportWinnerListExcel(winners: WinnerRecord[], campaign: Campaign, filters: WinnerListFilters, now = new Date()) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const rows = buildWinnerListRows(winners);
  const summary = summarizeWinners(winners);
  const headers = [
    'Draw', 'Held on (IST)', 'Mode', 'Position', 'Serial', 'Winner', 'Agent', 'Email', 'Mobile',
    'Prize', 'Rank', 'Prize value (₹)', 'Claim status', 'Claim updated (IST)', 'Claim note',
  ];
  const number = (value: number | null) => (value === null ? null : { value, type: Number });

  const winnerSheet = [
    headers.map((value) => ({ value, ...excelHeaderCell })),
    ...rows.map((row) => [
      { value: row.drawNumber, type: Number },
      row.heldOn,
      row.mode,
      number(row.position),
      number(row.serial),
      row.name,
      row.agent,
      row.email,
      row.mobile,
      row.prize,
      { value: row.rank, type: Number },
      row.prizeValueRupees === null ? null : { value: row.prizeValueRupees, type: Number, format: '#,##0.00' },
      row.claimStatus,
      row.claimUpdated,
      row.claimNote,
    ]),
  ];
  const detailsSheet = [
    [{ value: 'Lucky Draw winners export', fontWeight: 'bold' as const }, ''],
    ['Campaign', campaign.name],
    ['Filters', describeWinnerFilters(filters)],
    ['Winners', { value: summary.count, type: Number }],
    ...(Object.keys(claimStatusLabels) as WinnerClaimStatus[]).map((status) => [claimStatusLabels[status], { value: summary.byStatus[status], type: Number }]),
    ['Total prize value (₹)', { value: summary.totalValueRupees, type: Number, format: '#,##0.00' }],
    ['Generated (IST)', dateInIndia(now)],
  ];

  await writeXlsxFile([
    {
      sheet: 'Winners',
      data: winnerSheet,
      stickyRowsCount: 1,
      columns: [6, 18, 10, 9, 8, 22, 20, 26, 12, 22, 6, 14, 12, 18, 32].map((width) => ({ width })),
    },
    { sheet: 'Export details', data: detailsSheet, columns: [{ width: 22 }, { width: 60 }] },
  ]).toFile(exportFileName('winners', campaign.name, 'xlsx', now));
}

export async function exportWinnerListPdf(winners: WinnerRecord[], campaign: Campaign, filters: WinnerListFilters, now = new Date()) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const rows = buildWinnerListRows(winners);
  const summary = summarizeWinners(winners);
  const document = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 36;

  document.setFont('helvetica', 'bold');
  document.setFontSize(16);
  document.setTextColor('#214f42');
  document.text(`Winners · ${campaign.name}`, margin, 44);
  document.setFont('helvetica', 'normal');
  document.setFontSize(9);
  document.setTextColor('#5d6a61');
  document.text(`${describeWinnerFilters(filters)} · ${summary.count} ${summary.count === 1 ? 'winner' : 'winners'} · ${statusSummary(summary)} · Prize value ${inrText(summary.totalValueRupees)}`, margin, 61);
  document.setTextColor('#718078');
  document.text(`Generated ${dateInIndia(now)} · Asia/Kolkata`, margin, 74);
  document.setDrawColor('#dfe7df');
  document.line(margin, 84, pageWidth - margin, 84);

  autoTable(document, {
    startY: 94,
    head: [['DRAW', 'HELD ON', 'MODE', 'POS', 'SERIAL', 'WINNER', 'AGENT', 'CONTACT', 'PRIZE', 'VALUE', 'CLAIM', 'UPDATED', 'NOTE']],
    body: rows.map((row) => [
      String(row.drawNumber),
      row.heldOn,
      row.mode || '—',
      row.position === null ? '—' : String(row.position),
      row.serial === null ? '—' : String(row.serial),
      row.name,
      row.agent || '—',
      row.mobile || row.email || '—',
      `${row.prize} (rank ${row.rank})`,
      row.prizeValueRupees === null ? '—' : inrText(row.prizeValueRupees),
      row.claimStatus,
      row.claimUpdated || '—',
      row.claimNote || '—',
    ]),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7, cellPadding: 3.5, textColor: [55, 67, 59], overflow: 'linebreak' },
    headStyles: { fillColor: [32, 79, 66], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.5 },
    alternateRowStyles: { fillColor: [247, 249, 246] },
    columnStyles: { 0: { halign: 'center', cellWidth: 30 }, 3: { halign: 'center', cellWidth: 26 }, 9: { halign: 'right' } },
    margin: { left: margin, right: margin, bottom: 36 },
  });

  const pageCount = (document as JsPDFDocument).getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    document.setPage(page);
    document.setFont('helvetica', 'normal');
    document.setFontSize(8);
    document.setTextColor('#89948c');
    document.text(`${campaign.name} winners · Page ${page} of ${pageCount}`, margin, pageHeight - 18);
  }

  document.save(exportFileName('winners', campaign.name, 'pdf', now));
}
