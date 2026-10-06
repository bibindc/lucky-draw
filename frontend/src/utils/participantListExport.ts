import type { jsPDF as JsPDFDocument } from 'jspdf';
import type { Campaign } from '../api/campaigns';
import type { ParticipantExportRow, ParticipantStatus } from '../api/participants';
import { dateInIndia, excelHeaderCell as headerCell, exportFileName as sharedFileName, inrText as inr } from './exportFiles';

export const participantStatusLabels: Record<ParticipantStatus, string> = {
  REGISTERED: 'Registered',
  PAYMENT_PENDING: 'Payment pending',
  ELIGIBLE: 'Eligible',
  WINNER: 'Winner',
  COMPLETED: 'Completed',
};

export type ParticipantListFilters = {
  search?: string;
  status?: string;
  agentLabel?: string;
};

export type ParticipantListExportRow = {
  serial: number;
  name: string;
  agentCode: string;
  agentName: string;
  email: string;
  mobile: string;
  externalUserId: string;
  address: string;
  status: string;
  paidDraws: number;
  totalDraws: number;
  waivedDraws: number;
  amountPaidRupees: number;
  registered: string;
};

export function describeFilters(filters: ParticipantListFilters): string {
  const parts = [
    filters.search?.trim() ? `Search "${filters.search.trim()}"` : '',
    filters.status ? `Status: ${participantStatusLabels[filters.status as ParticipantStatus] ?? filters.status}` : '',
    filters.agentLabel ? `Agent: ${filters.agentLabel}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'All participants';
}

export function exportFileName(campaign: Pick<Campaign, 'name'>, extension: 'xlsx' | 'pdf', now = new Date()) {
  return sharedFileName('participants', campaign.name, extension, now);
}

export function buildParticipantListRows(
  participants: ParticipantExportRow[],
  campaign: Pick<Campaign, 'perDrawAmountPaise'>,
): ParticipantListExportRow[] {
  return [...participants]
    .sort((left, right) => left.participantNumber - right.participantNumber)
    .map((participant) => {
      const paidDraws = participant.drawPayments.filter(({ status }) => status === 'PAID').length;
      return {
        serial: participant.participantNumber,
        name: participant.name,
        agentCode: participant.agent?.agentCode ?? '',
        agentName: participant.agent?.name ?? '',
        email: participant.email ?? '',
        mobile: participant.mobile ?? '',
        externalUserId: participant.externalUserId ?? '',
        address: participant.address ?? '',
        status: participantStatusLabels[participant.status] ?? participant.status,
        paidDraws,
        totalDraws: participant.drawPayments.length,
        waivedDraws: participant.drawPayments.filter(({ status }) => status === 'WAIVED').length,
        amountPaidRupees: (paidDraws * campaign.perDrawAmountPaise) / 100,
        registered: dateInIndia(participant.createdAt, false),
      };
    });
}

export async function exportParticipantListExcel(
  participants: ParticipantExportRow[],
  campaign: Campaign,
  filters: ParticipantListFilters,
  now = new Date(),
) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const rows = buildParticipantListRows(participants, campaign);
  const headers = [
    'Serial', 'Name', 'Agent ID', 'Agent name', 'Email', 'Mobile', 'User ID', 'Address',
    'Status', 'Paid draws', 'Total draws', 'Waived draws', 'Amount paid (₹)', 'Registered (IST)',
  ];

  const participantSheet = [
    headers.map((value) => ({ value, ...headerCell })),
    ...rows.map((row) => [
      { value: row.serial, type: Number },
      row.name,
      row.agentCode,
      row.agentName,
      row.email,
      row.mobile,
      row.externalUserId,
      { value: row.address, wrap: true },
      row.status,
      { value: row.paidDraws, type: Number },
      { value: row.totalDraws, type: Number },
      { value: row.waivedDraws, type: Number },
      { value: row.amountPaidRupees, type: Number, format: '#,##0.00' },
      row.registered,
    ]),
  ];
  const detailsSheet = [
    [{ value: 'Lucky Draw participant export', fontWeight: 'bold' as const }, ''],
    ['Campaign', campaign.name],
    ['Filters', describeFilters(filters)],
    ['Records', { value: rows.length, type: Number }],
    ['Generated (IST)', dateInIndia(now)],
  ];

  await writeXlsxFile([
    {
      sheet: 'Participants',
      data: participantSheet,
      stickyRowsCount: 1,
      columns: [8, 24, 10, 20, 28, 13, 14, 36, 16, 10, 10, 12, 15, 16].map((width) => ({ width })),
    },
    { sheet: 'Export details', data: detailsSheet, columns: [{ width: 18 }, { width: 60 }] },
  ]).toFile(exportFileName(campaign, 'xlsx', now));
}

export async function exportParticipantListPdf(
  participants: ParticipantExportRow[],
  campaign: Campaign,
  filters: ParticipantListFilters,
  now = new Date(),
) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const rows = buildParticipantListRows(participants, campaign);
  const document = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 36;

  document.setFont('helvetica', 'bold');
  document.setFontSize(16);
  document.setTextColor('#214f42');
  document.text(`Participants · ${campaign.name}`, margin, 44);
  document.setFont('helvetica', 'normal');
  document.setFontSize(9);
  document.setTextColor('#5d6a61');
  document.text(`${describeFilters(filters)} · ${rows.length} ${rows.length === 1 ? 'record' : 'records'}`, margin, 61);
  document.setTextColor('#718078');
  document.text(`Generated ${dateInIndia(now)} · Asia/Kolkata`, margin, 74);
  document.setDrawColor('#dfe7df');
  document.line(margin, 84, pageWidth - margin, 84);

  autoTable(document, {
    startY: 94,
    head: [['SERIAL', 'NAME', 'AGENT', 'EMAIL', 'MOBILE', 'USER ID', 'ADDRESS', 'STATUS', 'PAID / TOTAL', 'WAIVED', 'AMOUNT PAID', 'REGISTERED']],
    body: rows.map((row) => [
      String(row.serial),
      row.name,
      row.agentCode ? `${row.agentCode} · ${row.agentName}` : '—',
      row.email || '—',
      row.mobile || '—',
      row.externalUserId || '—',
      row.address || '—',
      row.status,
      `${row.paidDraws} / ${row.totalDraws}`,
      String(row.waivedDraws),
      inr(row.amountPaidRupees),
      row.registered,
    ]),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 4, textColor: [55, 67, 59], overflow: 'linebreak' },
    headStyles: { fillColor: [32, 79, 66], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    alternateRowStyles: { fillColor: [247, 249, 246] },
    columnStyles: { 0: { cellWidth: 38 }, 6: { cellWidth: 110 }, 8: { halign: 'center' }, 9: { halign: 'center' }, 10: { halign: 'right' } },
    margin: { left: margin, right: margin, bottom: 36 },
  });

  const pageCount = (document as JsPDFDocument).getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    document.setPage(page);
    document.setFont('helvetica', 'normal');
    document.setFontSize(8);
    document.setTextColor('#89948c');
    document.text(`${campaign.name} participants · Page ${page} of ${pageCount}`, margin, pageHeight - 18);
  }

  document.save(exportFileName(campaign, 'pdf', now));
}
