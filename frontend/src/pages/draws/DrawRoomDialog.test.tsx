import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DrawRoomDialog from './DrawRoomDialog';
import { landedHoldMs, minimumSpinMs } from './DrawSpinner';
import { drawRound, getDrawPool, getDrawResult, type DrawPool } from '../../api/campaigns';
import { rankLabel, suggestedPrizeId } from './drawFormat';

// The spinner runs on timers; fake ones keep the 10-second spin instant in tests.
const setupUser = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const finishSpin = () => advance(minimumSpinMs + landedHoldMs + 500);

vi.mock('../../api/campaigns', () => ({ drawRound: vi.fn(), getDrawPool: vi.fn(), getDrawResult: vi.fn() }));

const scheduledAt = new Date(Date.now() - 3 * 3_600_000).toISOString();
function makePool(overrides: Partial<DrawPool> = {}, mode: 'AUTOMATIC' | 'MANUAL' = 'AUTOMATIC'): DrawPool {
  return {
    draw: { id: 'draw-id', drawNumber: 2, scheduledAt, prizeCount: 3, status: 'IN_PROGRESS', executionMode: mode, campaign: { id: 'c', name: 'Autumn Circle' } },
    participants: [
      { id: 'p-asha', participantNumber: 1000, name: 'Asha Rao', email: null, mobile: '9876543210', agent: null },
      { id: 'p-bala', participantNumber: 1001, name: 'Bala Iyer', email: null, mobile: null, agent: null },
    ],
    prizes: [{ id: 'gold', name: 'Gold coin', rank: 1, available: 1 }, { id: 'silver', name: 'Silver coin', rank: 2, available: 1 }],
    totalRounds: 3,
    roundsCompleted: 1,
    ...overrides,
  };
}

const roundResult = {
  winner: { id: 'w2', drawPosition: 2, participant: { id: 'p-bala', name: 'Bala Iyer', participantNumber: 1001 }, prize: { id: 'silver', name: 'Silver coin', rank: 2 } },
  progress: { roundsCompleted: 2, totalRounds: 3, completed: false },
  eligibleCount: 2,
};

function renderRoom() {
  const onCompleted = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><DrawRoomDialog campaignName="Autumn Circle" drawId="draw-id" onClose={vi.fn()} onCompleted={onCompleted} /></QueryClientProvider>);
  return onCompleted;
}

describe('draw room', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDrawPool).mockResolvedValue(makePool());
    vi.mocked(getDrawResult).mockResolvedValue({
      id: 'draw-id', scheduledAt, prizeCount: 3, poolSnapshot: [], executedAt: null,
      winners: [{ id: 'w1', drawPosition: 1, participant: { id: 'p-chitra', name: 'Chitra Nair' }, prize: { id: 'bronze', name: 'Bronze coin', rank: 3 } }],
    });
    vi.mocked(drawRound).mockResolvedValue(roundResult);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it('AC-DRW-5/9 suggests the lowest prize and draws the next round automatically', async () => {
    const user = setupUser();
    renderRoom();

    expect(await screen.findByRole('heading', { name: 'Round 2 of 3' })).toBeInTheDocument();
    expect(screen.getByLabelText('Prize for this round')).toHaveValue('silver');
    expect(screen.getByText('Chitra Nair')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Draw winner for round 2' }));
    expect(drawRound).toHaveBeenCalledWith('draw-id', { round: 2, prizeId: 'silver' });
    await finishSpin();
    expect(await screen.findByRole('status')).toHaveTextContent('ROUND 02 WINNERBala Iyer#1001 · Silver coin');
  });

  it('AC-DRW-12 spins over the eligible serials for at least 10 seconds before revealing the winner', async () => {
    const user = setupUser();
    renderRoom();

    await user.click(await screen.findByRole('button', { name: 'Draw winner for round 2' }));
    const spinner = within(screen.getByRole('group', { name: 'Lucky draw spinner' }));
    expect(spinner.getByText('ROUND 02 · SILVER COIN')).toBeInTheDocument();
    expect(spinner.getByText('Drawing from 2 eligible participants…')).toBeInTheDocument();
    expect(['1000', '1001']).toContain(spinner.getByText(/^\d{4}$/).textContent);
    expect(screen.getByRole('button', { name: 'Close draw room' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue later' })).toBeDisabled();

    // The round is already saved, but nothing gives the winner away before the spin ends.
    await advance(minimumSpinMs - 500);
    expect(screen.getByRole('group', { name: 'Lucky draw spinner' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Round 2 of 3' })).toBeInTheDocument();
    expect(getDrawResult).toHaveBeenCalledTimes(1);

    // It lands on the server's winner, then reveals it and refreshes progress and history.
    await advance(700);
    expect(spinner.getByText('1001')).toBeInTheDocument();
    expect(spinner.getByText('Bala Iyer')).toBeInTheDocument();
    expect(spinner.getByText('We have a winner!')).toBeInTheDocument();
    await advance(landedHoldMs);
    expect(screen.queryByRole('group', { name: 'Lucky draw spinner' })).not.toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('Bala Iyer#1001 · Silver coin');
    expect(vi.mocked(getDrawResult).mock.calls.length).toBeGreaterThan(1);
    expect(screen.getByRole('button', { name: 'Continue later' })).toBeEnabled();
  });

  it('AC-DRW-12 keeps spinning until a slow round request returns', async () => {
    let finish: (value: typeof roundResult) => void = () => undefined;
    vi.mocked(drawRound).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const user = setupUser();
    renderRoom();

    await user.click(await screen.findByRole('button', { name: 'Draw winner for round 2' }));
    await finishSpin();
    expect(screen.getByRole('group', { name: 'Lucky draw spinner' })).toBeInTheDocument();
    await act(async () => finish(roundResult));
    await finishSpin();
    expect(await screen.findByRole('status')).toHaveTextContent('Bala Iyer#1001 · Silver coin');
  });

  it('AC-MDR-5 records a manual winner without a spinner', async () => {
    vi.mocked(getDrawPool).mockResolvedValue(makePool({}, 'MANUAL'));
    const user = setupUser();
    renderRoom();

    await user.click(await screen.findByRole('radio', { name: /Bala Iyer/ }));
    await user.click(screen.getByRole('button', { name: /Record winner/ }));
    await user.click(screen.getByRole('button', { name: /Confirm winner/ }));
    expect(screen.queryByRole('group', { name: 'Lucky draw spinner' })).not.toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('Bala Iyer#1001 · Silver coin');
  });

  it('AC-DRW-5 lets the admin choose a different prize for the round', async () => {
    const user = setupUser();
    renderRoom();

    await user.selectOptions(await screen.findByLabelText('Prize for this round'), 'gold');
    await user.click(screen.getByRole('button', { name: 'Draw winner for round 2' }));
    expect(drawRound).toHaveBeenCalledWith('draw-id', { round: 2, prizeId: 'gold' });
  });

  it('AC-MDR-3/5 records the offline winner after confirmation', async () => {
    vi.mocked(getDrawPool).mockResolvedValue(makePool({}, 'MANUAL'));
    const user = setupUser();
    renderRoom();

    expect(await screen.findByRole('button', { name: /Record winner/ })).toBeDisabled();
    await user.type(screen.getByLabelText('Search eligible participants'), '1001');
    expect(screen.queryByText('Asha Rao')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Bala Iyer/ }));
    await user.click(screen.getByRole('button', { name: /Record winner/ }));
    expect(screen.getByText(/as the winner of/)).toHaveTextContent('Record Bala Iyer (#1001) as the winner of Silver coin for round 2?');
    expect(drawRound).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Confirm winner/ }));
    expect(drawRound).toHaveBeenCalledWith('draw-id', { round: 2, prizeId: 'silver', participantId: 'p-bala' });
  });

  it('AC-DRW-8 shows a conflict error and reloads the draw state', async () => {
    vi.mocked(drawRound).mockRejectedValue(new Error('Round 2 cannot be drawn now; 2 rounds have been drawn. Reload and continue.'));
    const user = setupUser();
    renderRoom();

    await user.click(await screen.findByRole('button', { name: 'Draw winner for round 2' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Reload and continue.');
    // The spinner stops at once instead of running out its 10 seconds.
    expect(screen.queryByRole('group', { name: 'Lucky draw spinner' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue later' })).toBeEnabled();
    expect(vi.mocked(getDrawPool).mock.calls.length).toBeGreaterThan(1);
  });

  it('AC-DRW-9 shows completion and offers the result after the last round', async () => {
    vi.mocked(getDrawPool).mockResolvedValue(makePool({ roundsCompleted: 3, draw: { ...makePool().draw, status: 'COMPLETED' } }));
    const user = setupUser();
    const onCompleted = renderRoom();

    expect(await screen.findByRole('heading', { name: 'Draw complete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Draw winner/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /View result/ }));
    expect(onCompleted).toHaveBeenCalled();
  });
});

describe('draw helpers', () => {
  it('suggests the lowest-ranked prize that still has units and labels ranks', () => {
    expect(suggestedPrizeId([
      { id: 'gold', name: 'Gold', rank: 1, available: 1 },
      { id: 'bronze', name: 'Bronze', rank: 3, available: 0 },
      { id: 'silver', name: 'Silver', rank: 2, available: 2 },
    ])).toBe('silver');
    expect(suggestedPrizeId([])).toBe('');
    expect([1, 2, 3, 4, 11, 21].map(rankLabel)).toEqual(['1st prize', '2nd prize', '3rd prize', '4th prize', '11th prize', '21st prize']);
  });
});

describe('prize images in the draw room', () => {
  afterEach(() => vi.useRealTimers());

  it('AC-PRZ-11 shows the prize image when a winner is revealed', async () => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(getDrawPool).mockResolvedValue(makePool());
    vi.mocked(getDrawResult).mockResolvedValue({ id: 'draw-id', scheduledAt, prizeCount: 3, poolSnapshot: [], executedAt: null, winners: [] });
    vi.mocked(drawRound).mockResolvedValue({
      ...roundResult,
      winner: { ...roundResult.winner, prize: { ...roundResult.winner.prize, imageUpdatedAt: '2026-10-06T10:00:00.000Z' } },
    });
    const user = setupUser();
    renderRoom();

    await user.click(await screen.findByRole('button', { name: 'Draw winner for round 2' }));
    await finishSpin();
    const image = await screen.findByRole('img', { name: 'Silver coin' });
    expect(image.getAttribute('src')).toContain('/prizes/silver/image?v=');
  });
});
