import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WinnersPage from './WinnersPage';
import { listCampaignDraws, listCampaigns } from '../../api/campaigns';
import { listWinners, updateWinner } from '../../api/winners';
import { exportWinnerListExcel, exportWinnerListPdf } from '../../utils/winnerListExport';

vi.mock('../../api/campaigns', () => ({ listCampaignDraws: vi.fn(), listCampaigns: vi.fn() }));
vi.mock('../../api/winners', () => ({ listWinners: vi.fn(), updateWinner: vi.fn() }));
vi.mock('../../utils/winnerListExport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/winnerListExport')>()),
  exportWinnerListExcel: vi.fn(),
  exportWinnerListPdf: vi.fn(),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><WinnersPage /></QueryClientProvider>);
}

describe('winner claim management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCampaigns).mockResolvedValue([{
      id: 'campaign-id', name: 'Autumn Circle', durationMonths: 5, drawCount: 1,
      totalAmountPaise: 30_000, perDrawAmountPaise: 30_000, status: 'ACTIVE',
    }]);
    vi.mocked(listCampaignDraws).mockResolvedValue([{
      id: 'draw-id', drawNumber: 1, scheduledAt: '2026-09-01T12:00:00.000Z', prizeCount: 1, status: 'COMPLETED',
    }]);
    vi.mocked(listWinners).mockResolvedValue([{
      id: 'winner-id', claimStatus: 'PENDING', claimNote: null, claimUpdatedAt: null,
      participant: { id: 'participant-id', name: 'Riya Sharma', email: 'riya@example.com', mobile: null },
      prize: { id: 'prize-id', name: 'Travel voucher', rank: 1, valuePaise: 25_000_00 },
      draw: { id: 'draw-id', drawNumber: 1, scheduledAt: '2026-09-01T12:00:00.000Z' },
    }]);
    vi.mocked(updateWinner).mockResolvedValue({
      id: 'winner-id', claimStatus: 'DELIVERED', claimNote: 'Handed over', claimUpdatedAt: new Date().toISOString(),
      participant: { id: 'participant-id', name: 'Riya Sharma', email: 'riya@example.com', mobile: null },
      prize: { id: 'prize-id', name: 'Travel voucher', rank: 1, valuePaise: 25_000_00 },
      draw: { id: 'draw-id', drawNumber: 1, scheduledAt: '2026-09-01T12:00:00.000Z' },
    });
  });

  it('saves delivery state and a claim note', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Update Riya Sharma claim' }));
    await user.selectOptions(screen.getByLabelText('Claim / delivery status'), 'DELIVERED');
    await user.type(screen.getByLabelText(/Note/), 'Handed over');
    await user.click(screen.getByRole('button', { name: 'Save update' }));

    expect(updateWinner).toHaveBeenCalledWith('winner-id', { claimStatus: 'DELIVERED', claimNote: 'Handed over' });
  });

  it('AC-WIN-6/7 exports the filtered winners list to Excel and PDF with fresh data', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: 'Update Riya Sharma claim' });
    await user.selectOptions(screen.getByLabelText('Filter by draw'), 'draw-id');
    await user.selectOptions(screen.getByLabelText('Filter by claim status'), 'PENDING');
    vi.mocked(listWinners).mockClear();
    await user.click(screen.getByRole('button', { name: 'Export Excel' }));

    expect(listWinners).toHaveBeenCalledWith('campaign-id', { drawId: 'draw-id', claimStatus: 'PENDING' });
    expect(exportWinnerListExcel).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'winner-id' })],
      expect.objectContaining({ id: 'campaign-id' }),
      { drawNumber: 1, claimStatus: 'PENDING' },
    );
    expect(await screen.findByText('Exported 1 winner to Excel.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(exportWinnerListPdf).toHaveBeenCalled();
  });

  it('AC-WIN-10 disables export when no winners match and reports failures', async () => {
    vi.mocked(listWinners).mockResolvedValueOnce([]);
    const user = userEvent.setup();
    const { unmount } = renderPage();

    expect(await screen.findByText('No winners match these filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export Excel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDisabled();
    unmount();

    vi.mocked(exportWinnerListPdf).mockRejectedValueOnce(new Error('PDF could not be created.'));
    renderPage();
    await screen.findByRole('button', { name: 'Update Riya Sharma claim' });
    await user.click(screen.getByRole('button', { name: 'Export PDF' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('PDF could not be created.');
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
  });
});