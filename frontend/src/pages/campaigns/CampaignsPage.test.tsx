import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CampaignsPage from './CampaignsPage';
import { getCampaign, listCampaigns, patchDraw } from '../../api/campaigns';

vi.mock('../../api/campaigns', () => ({
  CampaignApiError: class CampaignApiError extends Error {},
  createCampaign: vi.fn(),
  getCampaign: vi.fn(),
  listCampaigns: vi.fn(),
  patchDraw: vi.fn(),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CampaignsPage />
    </QueryClientProvider>,
  );
}

describe('campaign management screen', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers campaign creation when the list is empty', async () => {
    vi.mocked(listCampaigns).mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'No campaigns yet' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create campaign' }));

    expect(screen.getByRole('heading', { name: 'New campaign' })).toBeInTheDocument();
    expect(screen.getAllByLabelText('Date and time')).toHaveLength(10);
  });

  it('edits a scheduled draw date and prize count', async () => {
    const draw = {
      id: 'draw-id',
      drawNumber: 1,
      scheduledAt: '2026-10-20T13:00:00.000Z',
      prizeCount: 3,
      status: 'SCHEDULED' as const,
    };
    vi.mocked(listCampaigns).mockResolvedValue([{
      id: 'campaign-id',
      name: 'Autumn Circle',
      durationMonths: 5,
      drawCount: 1,
      totalAmountPaise: 30_000,
      perDrawAmountPaise: 30_000,
      status: 'ACTIVE',
    }]);
    vi.mocked(getCampaign).mockResolvedValue({
      id: 'campaign-id',
      name: 'Autumn Circle',
      durationMonths: 5,
      drawCount: 1,
      totalAmountPaise: 30_000,
      perDrawAmountPaise: 30_000,
      status: 'ACTIVE',
      draws: [draw],
    });
    vi.mocked(patchDraw).mockResolvedValue({
      ...draw,
      scheduledAt: '2026-10-21T13:45:00.000Z',
      prizeCount: 4,
    });

    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'View Autumn Circle' }));
    await user.click(await screen.findByRole('button', { name: 'Edit draw 1' }));

    expect(screen.getByLabelText('Draw date and time')).toHaveValue('2026-10-20T18:30');
    expect(screen.getByLabelText('Prize count')).toHaveValue(3);
    await user.clear(screen.getByLabelText('Draw date and time'));
    await user.type(screen.getByLabelText('Draw date and time'), '2026-10-21T19:15');
    await user.clear(screen.getByLabelText('Prize count'));
    await user.type(screen.getByLabelText('Prize count'), '4');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(patchDraw).toHaveBeenCalledWith('draw-id', {
      scheduledAt: '2026-10-21T13:45:00.000Z',
      prizeCount: 4,
    });
  });
});