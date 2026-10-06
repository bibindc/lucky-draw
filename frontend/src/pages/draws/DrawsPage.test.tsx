import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DrawsPage from './DrawsPage';
import { getDrawPool, getDrawResult, listCampaignDraws, listCampaigns, startDraw, type DrawPool } from '../../api/campaigns';

vi.mock('../../api/campaigns', () => ({
  drawRound: vi.fn(),
  getDrawPool: vi.fn(),
  getDrawResult: vi.fn(),
  listCampaignDraws: vi.fn(),
  listCampaigns: vi.fn(),
  startDraw: vi.fn(),
}));

const past = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

const pool: DrawPool = {
  draw: { id: 'draw-id', drawNumber: 1, scheduledAt: past(1), prizeCount: 2, status: 'SCHEDULED', executionMode: null, campaign: { id: 'campaign-id', name: 'Autumn Circle' } },
  participants: [],
  prizes: [],
  totalRounds: 0,
  roundsCompleted: 0,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><DrawsPage /></QueryClientProvider>);
}

describe('draw schedule screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCampaigns).mockResolvedValue([{
      id: 'campaign-id', name: 'Autumn Circle', durationMonths: 5, drawCount: 3,
      totalAmountPaise: 90_000, perDrawAmountPaise: 30_000, status: 'ACTIVE',
    }]);
    vi.mocked(listCampaignDraws).mockResolvedValue([{
      id: 'draw-id', drawNumber: 1, scheduledAt: past(1), prizeCount: 5, status: 'SCHEDULED', _count: { drawPayments: 0, winners: 0 },
    }]);
    vi.mocked(getDrawPool).mockResolvedValue(pool);
  });

  it('AC-DRW-1/4 starts a due draw after confirmation and shows the zero-winner result', async () => {
    vi.mocked(startDraw).mockResolvedValue({
      draw: { id: 'draw-id', drawNumber: 1, scheduledAt: past(1), prizeCount: 5, status: 'COMPLETED', executionMode: 'AUTOMATIC', poolSnapshot: [], executedAt: past(0), winners: [] },
      warning: 'There were no eligible participants, so the draw completed with zero winners.',
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Start draw/ }));
    expect(await screen.findByText(/Starting will complete the draw with zero winners/)).toBeInTheDocument();
    expect(startDraw).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Complete with no winners/ }));
    expect(startDraw).toHaveBeenCalledWith('draw-id', { mode: 'AUTOMATIC' });
    expect(await screen.findByText(/completed with zero winners/)).toBeInTheDocument();
  });

  it('AC-DRW-9 shows round progress for an in-progress draw and opens the draw room to continue', async () => {
    vi.mocked(listCampaignDraws).mockResolvedValue([{
      id: 'draw-id', drawNumber: 1, scheduledAt: past(2), prizeCount: 3, status: 'IN_PROGRESS', executionMode: 'AUTOMATIC',
      roundsCompleted: 1, totalRounds: 3, _count: { drawPayments: 4, winners: 1 },
    }]);
    vi.mocked(getDrawPool).mockResolvedValue({ ...pool, draw: { ...pool.draw, status: 'IN_PROGRESS', executionMode: 'AUTOMATIC' }, totalRounds: 3, roundsCompleted: 1 });
    vi.mocked(getDrawResult).mockResolvedValue({ id: 'draw-id', drawNumber: 1, scheduledAt: past(2), prizeCount: 3, poolSnapshot: [], executedAt: null, winners: [] });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('In progress · Round 1/3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start draw/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    expect(await screen.findByRole('heading', { name: 'Round 2 of 3' })).toBeInTheDocument();
  });

  it('AC-MDR-6 shows the mode on completed draws and manual details with rounds in the result', async () => {
    const heldAt = past(1);
    vi.mocked(listCampaignDraws).mockResolvedValue([{
      id: 'draw-id', drawNumber: 1, scheduledAt: past(2), prizeCount: 1, status: 'COMPLETED', executionMode: 'MANUAL', heldAt,
      roundsCompleted: 1, totalRounds: 1, _count: { drawPayments: 1, winners: 1 },
    }]);
    vi.mocked(getDrawResult).mockResolvedValue({
      id: 'draw-id', drawNumber: 1, scheduledAt: past(2), prizeCount: 1, status: 'COMPLETED', executionMode: 'MANUAL', heldAt,
      poolSnapshot: ['p'], executedAt: past(0), executedByAdmin: { id: 'admin', name: 'Meera' },
      manualRecord: { conductedBy: 'Ravi Kumar', drawMethod: 'Chits from a box', venue: 'Hall', witnesses: null, notes: null, evidenceReference: null, createdAt: heldAt },
      winners: [{ id: 'w', drawPosition: 1, drawnAt: heldAt, recordedByAdmin: { id: 'admin', name: 'Meera' }, participant: { id: 'p', name: 'Asha Rao' }, prize: { id: 'gold', name: 'Gold coin', rank: 1 } }],
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Completed · Manual')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /View result/ }));

    expect(await screen.findByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.getByText(/DRAW 01 RESULT · MANUAL/)).toBeInTheDocument();
    expect(screen.getByText(/Gold coin · .* · by Meera/)).toBeInTheDocument();
    expect(screen.getByText('1st prize')).toBeInTheDocument();
  });
});
