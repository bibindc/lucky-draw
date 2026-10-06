import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OverviewPage, { drawStatusLabel, greetingFor, relativeTime } from './OverviewPage';
import { listCampaigns } from '../../api/campaigns';
import { getCampaignDashboard, type CampaignDashboard } from '../../api/dashboard';

vi.mock('../../api/campaigns', () => ({ listCampaigns: vi.fn() }));
vi.mock('../../api/dashboard', () => ({ getCampaignDashboard: vi.fn() }));

// 10:30 IST on Monday 5 October 2026.
const now = new Date('2026-10-05T05:00:00.000Z');

const campaign = (id: string, name: string) => ({
  id, name, durationMonths: 5, drawCount: 10, totalAmountPaise: 300_000, perDrawAmountPaise: 30_000, status: 'ACTIVE' as const,
});

const dashboard: CampaignDashboard = {
  campaign: { id: 'monsoon', name: 'Monsoon Savings', durationMonths: 5, drawCount: 10, perDrawAmountPaise: 30_000, firstDrawAt: '2026-08-17T13:00:00.000Z' },
  progress: { completedDraws: 3, cancelledDraws: 0, remainingDraws: 7, percentComplete: 30 },
  participants: { total: 146, addedLast7Days: 12, winners: 15 },
  eligibility: { nextDrawEligible: 118, activeParticipants: 131, percentOfActive: 90, pendingForNextDraw: 13 },
  prizes: { availableUnits: 23, assignedUnits: 15, totalUnits: 38, prizeCount: 8, unassignedPrizeCount: 2 },
  payments: { collectedPaise: 43_800_000, transactionCount: 640, dueForNextDrawPaise: 390_000, collectionRatePercent: 88 },
  upcomingDraws: [
    { id: 'd4', drawNumber: 4, scheduledAt: '2026-10-05T04:00:00.000Z', prizeCount: 5, eligibleCount: 118, isDue: true },
    { id: 'd5', drawNumber: 5, scheduledAt: '2026-10-06T13:00:00.000Z', prizeCount: 5, eligibleCount: 0, isDue: false },
    { id: 'd6', drawNumber: 6, scheduledAt: '2026-10-26T13:00:00.000Z', prizeCount: 8, eligibleCount: 4, isDue: false },
  ],
  activity: [
    { type: 'PAYMENT_RECORDED', at: '2026-10-05T04:48:00.000Z', participantName: 'Riya Sharma', amountPaise: 60_000, drawNumbers: [4, 5] },
    { type: 'PAYMENT_VOIDED', at: '2026-10-05T02:00:00.000Z', participantName: 'Kabir Nair', amountPaise: 30_000 },
    { type: 'CLAIM_UPDATED', at: '2026-10-04T10:00:00.000Z', participantName: 'Asha Rao', prizeName: 'Headphones', claimStatus: 'CLAIMED' },
  ],
  generatedAt: now.toISOString(),
};

function renderPage(onNavigate = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><OverviewPage adminName="Meera Iyer" now={now} onNavigate={onNavigate} /></QueryClientProvider>);
  return onNavigate;
}

describe('campaign overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCampaigns).mockResolvedValue([campaign('monsoon', 'Monsoon Savings')]);
    vi.mocked(getCampaignDashboard).mockResolvedValue(dashboard);
  });

  it('AC-DSH-2/3 renders progress and metrics from the dashboard API, not placeholders', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Monsoon Savings' })).toBeInTheDocument();
    expect(getCampaignDashboard).toHaveBeenCalledWith('monsoon');
    expect(screen.getByRole('heading', { name: 'Good morning, Meera' })).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('3 draws complete')).toBeInTheDocument();
    expect(screen.getByText(/Started 17 Aug 2026/)).toBeInTheDocument();

    const metrics = within(screen.getByRole('region', { name: 'Campaign statistics' }));
    expect(metrics.getByText('146')).toBeInTheDocument();
    expect(metrics.getByText('15 winners')).toBeInTheDocument();
    expect(metrics.getByText('Draw 4 eligibility')).toBeInTheDocument();
    expect(metrics.getByText('13 unpaid')).toBeInTheDocument();
    expect(metrics.getByText('2 unassigned')).toBeInTheDocument();
    expect(metrics.getByText('4,38,000')).toBeInTheDocument();
    expect(metrics.getByText('₹3,900 due next draw')).toBeInTheDocument();
    expect(screen.queryByText('Autumn Circle')).not.toBeInTheDocument();
  });

  it('AC-DSH-4/5 shows upcoming draw statuses and the next draw card', async () => {
    renderPage();

    const rows = (await screen.findAllByRole('row')).slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[4].textContent)).toEqual(['Ready', 'Tomorrow', 'In 21 days']);
    expect(screen.getByRole('heading', { name: 'Monday, 5 October' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start draw/ })).toBeInTheDocument();
  });

  it('AC-DSH-6 lists recent activity with relative times and amounts', async () => {
    renderPage();

    expect(await screen.findByText('Payment recorded')).toBeInTheDocument();
    expect(screen.getByText('Riya Sharma · Draw 4, 5')).toBeInTheDocument();
    expect(screen.getByText('+₹600')).toBeInTheDocument();
    expect(screen.getByText('12 min ago')).toBeInTheDocument();
    expect(screen.getByText('−₹300')).toBeInTheDocument();
    expect(screen.getByText('Prize Claimed')).toBeInTheDocument();
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
  });

  it('AC-DSH-1/7 switches campaigns and navigates to the matching screens', async () => {
    vi.mocked(listCampaigns).mockResolvedValue([campaign('monsoon', 'Monsoon Savings'), campaign('winter', 'Winter Circle')]);
    const user = userEvent.setup();
    const onNavigate = renderPage();

    await screen.findByRole('heading', { name: 'Monsoon Savings' });
    await user.selectOptions(screen.getByLabelText('Overview campaign'), 'winter');
    expect(getCampaignDashboard).toHaveBeenLastCalledWith('winter');

    await user.click(screen.getByRole('button', { name: /Add participant/ }));
    await user.click(screen.getByRole('button', { name: 'Open draw 5' }));
    expect(onNavigate.mock.calls).toEqual([['Participants'], ['Draws']]);
  });

  it('AC-DSH-1 prompts to create a campaign when none exist', async () => {
    vi.mocked(listCampaigns).mockResolvedValue([]);
    const user = userEvent.setup();
    const onNavigate = renderPage();

    expect(await screen.findByRole('heading', { name: 'No campaigns yet' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Campaign statistics' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Create campaign/ }));
    expect(onNavigate).toHaveBeenCalledWith('Campaigns');
  });

  it('AC-DSH-7 shows an error instead of figures when the dashboard fails to load', async () => {
    vi.mocked(getCampaignDashboard).mockRejectedValue(new Error('Only a super admin can perform this action.'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Only a super admin');
    expect(screen.queryByRole('region', { name: 'Campaign statistics' })).not.toBeInTheDocument();
  });

  it('AC-DSH-7 shows an all-complete state when no draws are scheduled', async () => {
    vi.mocked(getCampaignDashboard).mockResolvedValue({
      ...dashboard,
      progress: { completedDraws: 10, cancelledDraws: 0, remainingDraws: 0, percentComplete: 100 },
      upcomingDraws: [],
    });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'All draws complete' })).toBeInTheDocument();
    expect(screen.getByText('CAMPAIGN COMPLETE', { exact: false })).toBeInTheDocument();
  });
});

describe('overview time helpers (Asia/Kolkata)', () => {
  it('greets by Indian time of day', () => {
    expect(greetingFor(new Date('2026-10-05T05:00:00.000Z'))).toBe('Good morning');
    expect(greetingFor(new Date('2026-10-05T09:00:00.000Z'))).toBe('Good afternoon');
    // 23:30 UTC is 05:00 IST the next morning.
    expect(greetingFor(new Date('2026-10-05T23:30:00.000Z'))).toBe('Good morning');
    expect(greetingFor(new Date('2026-10-05T14:00:00.000Z'))).toBe('Good evening');
  });

  it('labels draws by IST calendar day and formats relative times', () => {
    expect(drawStatusLabel({ scheduledAt: '2026-10-05T13:00:00.000Z', isDue: false }, now)).toBe('Today');
    expect(drawStatusLabel({ scheduledAt: '2026-10-08T13:00:00.000Z', isDue: false }, now)).toBe('In 3 days');
    expect(relativeTime('2026-10-05T04:59:40.000Z', now)).toBe('Just now');
    expect(relativeTime('2026-10-05T01:00:00.000Z', now)).toBe('4 h ago');
    expect(relativeTime('2026-09-28T05:00:00.000Z', now)).toBe('28 Sept');
  });
});
