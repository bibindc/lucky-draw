import type { jsPDF as JsPDFDocument } from 'jspdf';
import type { Campaign } from '../api/campaigns';
import type { ParticipantDetail } from '../api/participants';

function dateInIndia(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

function inr(amountPaise: number) {
  return `INR ${(amountPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

export async function exportParticipantPdf(participant: ParticipantDetail, campaign: Campaign) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const document = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = document.internal.pageSize.getWidth();
  const margin = 42;

  document.setFont('helvetica', 'bold');
  document.setFontSize(18);
  document.setTextColor('#214f42');
  document.text('Lucky Draw Participant Report', margin, 48);
  document.setFont('helvetica', 'normal');
  document.setFontSize(9);
  document.setTextColor('#718078');
  document.text(`Generated ${dateInIndia(new Date().toISOString())} · Asia/Kolkata`, margin, 66);

  document.setDrawColor('#dfe7df');
  document.line(margin, 78, pageWidth - margin, 78);

  const agentLabel = participant.agent
    ? `${participant.agent.agentCode} · ${participant.agent.name}`
    : 'Unassigned';
  const identityRows = [
    ['Participant number', String(participant.participantNumber)],
    ['Name', participant.name],
    ['Campaign', campaign.name],
    ['Agent', agentLabel],
    ['Email', participant.email ?? '—'],
    ['Mobile', participant.mobile ?? '—'],
    ['External user ID', participant.externalUserId ?? '—'],
    ['Address', participant.address ?? '—'],
    ['Status', participant.status.replaceAll('_', ' ')],
    ['Registered', dateInIndia(participant.createdAt)],
  ];

  autoTable(document, {
    startY: 92,
    head: [['PARTICIPANT DETAILS', '']],
    body: identityRows,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 6, textColor: [55, 67, 59] },
    headStyles: { fillColor: [32, 79, 66], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 145, fontStyle: 'bold' }, 1: { cellWidth: 'auto' } },
    margin: { left: margin, right: margin },
  });

  let cursorY = (document as JsPDFDocument & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 250;
  cursorY += 24;
  document.setFont('helvetica', 'bold');
  document.setFontSize(12);
  document.setTextColor('#2f3c34');
  document.text('Draw participation', margin, cursorY);

  autoTable(document, {
    startY: cursorY + 10,
    head: [['DRAW', 'SCHEDULED (IST)', 'PAYMENT', 'RETAINED CREDIT']],
    body: (participant.drawPayments ?? []).map((payment) => [
      `Draw ${payment.draw.drawNumber}`,
      dateInIndia(payment.draw.scheduledAt),
      payment.status.replaceAll('_', ' '),
      payment.retainedCredit ? 'Yes' : 'No',
    ]),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 5, textColor: [55, 67, 59] },
    headStyles: { fillColor: [48, 101, 77], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: margin, right: margin },
  });

  cursorY = (document as JsPDFDocument & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY + 30;
  cursorY += 24;
  if (cursorY > document.internal.pageSize.getHeight() - 90) {
    document.addPage();
    cursorY = 48;
  }
  document.setFont('helvetica', 'bold');
  document.setFontSize(12);
  document.setTextColor('#2f3c34');
  document.text('Payment history', margin, cursorY);

  autoTable(document, {
    startY: cursorY + 10,
    head: [['DATE', 'AMOUNT', 'METHOD', 'STATUS', 'DRAWS COVERED']],
    body: participant.paymentTransactions.map((transaction) => [
      dateInIndia(transaction.createdAt),
      inr(transaction.amountPaise),
      transaction.method.replaceAll('_', ' '),
      transaction.status,
      transaction.allocations?.map(({ drawPayment }) => `#${drawPayment.draw.drawNumber}`).join(', ') ?? '—',
    ]),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 5, textColor: [55, 67, 59] },
    headStyles: { fillColor: [48, 101, 77], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: margin, right: margin },
  });

  const pageCount = document.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    document.setPage(page);
    document.setFont('helvetica', 'normal');
    document.setFontSize(8);
    document.setTextColor('#89948c');
    document.text(`Participant ${participant.participantNumber} · Page ${page} of ${pageCount}`, margin, document.internal.pageSize.getHeight() - 22);
  }

  document.save(`participant-${participant.participantNumber}.pdf`);
}