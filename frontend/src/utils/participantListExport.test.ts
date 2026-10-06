import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Campaign } from '../api/campaigns';
import type { ParticipantExportRow } from '../api/participants';
import {
  buildParticipantListRows,
  describeFilters,
  exportFileName,
  exportParticipantListExcel,
} from './participantListExport';

const writer = vi.hoisted(() => ({ toFile: vi.fn(), writeXlsxFile: vi.fn() }));
vi.mock('write-excel-file/browser', () => ({ default: writer.writeXlsxFile }));

const campaign: Campaign = {
  id: 'campaign-id', name: 'Autumn Circle 2026', durationMonths: 5, drawCount: 3,
  totalAmountPaise: 90_000, perDrawAmountPaise: 30_000, status: 'ACTIVE',
};

function participant(overrides: Partial<ParticipantExportRow>): ParticipantExportRow {
  return {
    id: 'id', participantNumber: 1000, agentId: 'agent-id',
    agent: { id: 'agent-id', agentCode: 'AG-1000', name: 'Agent One' },
    name: 'Riya Sharma', email: 'riya@example.com', mobile: null, externalUserId: null,
    status: 'ELIGIBLE', createdAt: '2026-10-04T20:00:00.000Z',
    drawPayments: [{ status: 'PAID' }, { status: 'PAID' }, { status: 'NOT_PAID' }],
    ...overrides,
  };
}

describe('participant list export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writer.writeXlsxFile.mockReturnValue({ toFile: writer.toFile });
  });

  it('AC-PAR-19 maps rows with draw counts, rupee amounts and IST dates, ordered by serial (AC-PAR-20)', () => {
    const rows = buildParticipantListRows([
      participant({ participantNumber: 1002, name: 'Kabir Nair', agent: null, status: 'WINNER', drawPayments: [{ status: 'PAID' }, { status: 'WAIVED' }, { status: 'WAIVED' }] }),
      participant({}),
    ], campaign);

    expect(rows.map((row) => row.serial)).toEqual([1000, 1002]);
    expect(rows[0]).toEqual(expect.objectContaining({
      agentCode: 'AG-1000', status: 'Eligible', paidDraws: 2, totalDraws: 3, waivedDraws: 0, amountPaidRupees: 600, mobile: '',
    }));
    // 20:00 UTC on 4 Oct is 01:30 IST on 5 Oct.
    expect(rows[0].registered).toContain('5 Oct 2026');
    expect(rows[1]).toEqual(expect.objectContaining({ agentCode: '', status: 'Winner', paidDraws: 1, waivedDraws: 2, amountPaidRupees: 300 }));
  });

  it('AC-PAR-20 describes applied filters, or all participants when none apply', () => {
    expect(describeFilters({})).toBe('All participants');
    expect(describeFilters({ search: '  riya ', status: 'PAYMENT_PENDING', agentLabel: 'AG-1000 · Agent One' }))
      .toBe('Search "riya" · Status: Payment pending · Agent: AG-1000 · Agent One');
  });

  it('names files by campaign slug and IST date', () => {
    expect(exportFileName(campaign, 'xlsx', new Date('2026-10-05T19:00:00.000Z'))).toBe('participants-autumn-circle-2026-2026-10-06.xlsx');
  });

  it('AC-PAR-17 writes a participants sheet with a frozen header and an export details sheet', async () => {
    await exportParticipantListExcel([participant({ address: '12, MG Road\nKochi' })], campaign, { status: 'ELIGIBLE' }, new Date('2026-10-05T06:30:00.000Z'));

    const [sheets] = writer.writeXlsxFile.mock.calls[0];
    expect(sheets[0]).toEqual(expect.objectContaining({ sheet: 'Participants', stickyRowsCount: 1 }));
    expect(sheets[0].data[0][0]).toEqual(expect.objectContaining({ value: 'Serial', fontWeight: 'bold' }));
    expect(sheets[0].data[1][0]).toEqual({ value: 1000, type: Number });
    expect(sheets[0].data[0][7]).toEqual(expect.objectContaining({ value: 'Address' }));
    expect(sheets[0].data[1][7]).toEqual({ value: '12, MG Road\nKochi', wrap: true });
    expect(sheets[0].data[1][12]).toEqual(expect.objectContaining({ value: 600, type: Number }));
    expect(sheets[1].data).toEqual(expect.arrayContaining([
      ['Campaign', 'Autumn Circle 2026'],
      ['Filters', 'Status: Eligible'],
      ['Records', { value: 1, type: Number }],
    ]));
    expect(writer.toFile).toHaveBeenCalledWith('participants-autumn-circle-2026-2026-10-05.xlsx');
  });
});
