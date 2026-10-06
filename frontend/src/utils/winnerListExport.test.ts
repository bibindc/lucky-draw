import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Campaign } from '../api/campaigns';
import type { WinnerRecord } from '../api/winners';
import { buildWinnerListRows, describeWinnerFilters, exportWinnerListExcel, summarizeWinners } from './winnerListExport';

const writer = vi.hoisted(() => ({ toFile: vi.fn(), writeXlsxFile: vi.fn() }));
vi.mock('write-excel-file/browser', () => ({ default: writer.writeXlsxFile }));

const campaign: Campaign = {
  id: 'campaign-id', name: 'Autumn Circle', durationMonths: 5, drawCount: 10,
  totalAmountPaise: 300_000, perDrawAmountPaise: 30_000, status: 'ACTIVE',
};

function winner(overrides: Partial<WinnerRecord> & { drawNumber?: number }): WinnerRecord {
  const { drawNumber = 1, ...rest } = overrides;
  return {
    id: `w-${Math.random()}`,
    claimStatus: 'PENDING',
    claimNote: null,
    claimUpdatedAt: null,
    drawPosition: 1,
    participant: {
      id: 'p', participantNumber: 1000, name: 'Riya Sharma', email: 'riya@example.com', mobile: null,
      agent: { id: 'a', agentCode: 'AG-1000', name: 'Agent One' },
    },
    prize: { id: 'prize', name: 'Gold coin', rank: 1, valuePaise: 500_000 },
    draw: { id: `d${drawNumber}`, drawNumber, scheduledAt: '2026-09-01T12:00:00.000Z', executionMode: 'AUTOMATIC', heldAt: '2026-09-01T12:00:00.000Z' },
    ...rest,
  };
}

describe('winners list export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writer.writeXlsxFile.mockReturnValue({ toFile: writer.toFile });
  });

  it('AC-WIN-7/8 maps rows in draw then drawn order with IST dates, mode and rupee values', () => {
    const rows = buildWinnerListRows([
      winner({ drawNumber: 2, drawPosition: 1, participant: { id: 'b', participantNumber: 1004, name: 'Bala', email: null, mobile: '9876543210', agent: null }, prize: { id: 'x', name: 'Hamper', rank: 3, valuePaise: null } }),
      winner({ drawNumber: 1, drawPosition: 2, participant: { id: 'c', participantNumber: 1002, name: 'Chitra', email: null, mobile: null } }),
      winner({
        drawNumber: 1, drawPosition: 1, claimStatus: 'DELIVERED', claimNote: 'Handed over', claimUpdatedAt: '2026-09-02T20:00:00.000Z',
        draw: { id: 'd1', drawNumber: 1, scheduledAt: '2026-09-01T12:00:00.000Z', executionMode: 'MANUAL', heldAt: '2026-09-01T13:30:00.000Z' },
      }),
    ]);

    expect(rows.map(({ drawNumber, position, name }) => `${drawNumber}.${position} ${name}`)).toEqual(['1.1 Riya Sharma', '1.2 Chitra', '2.1 Bala']);
    expect(rows[0]).toEqual(expect.objectContaining({
      mode: 'Manual', serial: 1000, agent: 'AG-1000 · Agent One', prizeValueRupees: 5000, claimStatus: 'Delivered', claimNote: 'Handed over',
    }));
    // 13:30 UTC is 7:00 pm IST; 20:00 UTC on 2 Sept is 1:30 am IST on 3 Sept.
    expect(rows[0].heldOn).toMatch(/1 Sept 2026.*7:00\s?pm/i);
    expect(rows[0].claimUpdated).toContain('3 Sept 2026');
    expect(rows[2]).toEqual(expect.objectContaining({ agent: '', mobile: '9876543210', prizeValueRupees: null, mode: 'Automatic' }));
  });

  it('AC-WIN-9 summarises counts per claim status and total prize value', () => {
    const summary = summarizeWinners([
      winner({ claimStatus: 'PENDING' }),
      winner({ claimStatus: 'DELIVERED' }),
      winner({ claimStatus: 'DELIVERED', prize: { id: 'x', name: 'Hamper', rank: 3, valuePaise: null } }),
    ]);
    expect(summary).toEqual({ count: 3, byStatus: { PENDING: 1, CLAIMED: 0, DELIVERED: 2 }, totalValueRupees: 10_000 });
    expect(describeWinnerFilters({})).toBe('All winners');
    expect(describeWinnerFilters({ drawNumber: 3, claimStatus: 'CLAIMED' })).toBe('Draw 3 · Claim status: Claimed');
  });

  it('AC-WIN-6 writes a winners sheet and an export details sheet', async () => {
    await exportWinnerListExcel([winner({ claimStatus: 'CLAIMED' })], campaign, { claimStatus: 'CLAIMED' }, new Date('2026-10-05T06:30:00.000Z'));

    const [sheets] = writer.writeXlsxFile.mock.calls[0];
    expect(sheets[0]).toEqual(expect.objectContaining({ sheet: 'Winners', stickyRowsCount: 1 }));
    expect(sheets[0].data[0][0]).toEqual(expect.objectContaining({ value: 'Draw', fontWeight: 'bold' }));
    expect(sheets[0].data[1][11]).toEqual(expect.objectContaining({ value: 5000, type: Number }));
    expect(sheets[1].data).toEqual(expect.arrayContaining([
      ['Filters', 'Claim status: Claimed'],
      ['Winners', { value: 1, type: Number }],
      ['Claimed', { value: 1, type: Number }],
    ]));
    expect(writer.toFile).toHaveBeenCalledWith('winners-autumn-circle-2026-10-05.xlsx');
  });
});
