import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StartDrawDialog from './StartDrawDialog';
import { getDrawPool, startDraw, type DrawPool } from '../../api/campaigns';

vi.mock('../../api/campaigns', () => ({ getDrawPool: vi.fn(), startDraw: vi.fn() }));

const scheduledAt = new Date(Date.now() - 3 * 3_600_000).toISOString();
const pool: DrawPool = {
  draw: { id: 'draw-id', drawNumber: 2, scheduledAt, prizeCount: 5, status: 'SCHEDULED', executionMode: null, campaign: { id: 'c', name: 'Autumn Circle' } },
  participants: [
    { id: 'p1', participantNumber: 1000, name: 'Asha Rao', email: null, mobile: null, agent: null },
    { id: 'p2', participantNumber: 1001, name: 'Bala Iyer', email: null, mobile: null, agent: null },
    { id: 'p3', participantNumber: 1002, name: 'Chitra Nair', email: null, mobile: null, agent: null },
  ],
  prizes: [{ id: 'gold', name: 'Gold coin', rank: 1, available: 1 }, { id: 'silver', name: 'Silver coin', rank: 2, available: 2 }],
  totalRounds: 3,
  roundsCompleted: 0,
};

function renderDialog() {
  const onStarted = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><StartDrawDialog campaignName="Autumn Circle" drawId="draw-id" onClose={vi.fn()} onStarted={onStarted} /></QueryClientProvider>);
  return onStarted;
}

describe('start draw dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDrawPool).mockResolvedValue(pool);
    vi.mocked(startDraw).mockResolvedValue({ draw: { id: 'draw-id', scheduledAt, prizeCount: 5, status: 'IN_PROGRESS', poolSnapshot: [], executedAt: null }, warning: null });
  });

  it('AC-DRW-3 shows the rounds the draw will have and starts it automatically on confirmation', async () => {
    const user = userEvent.setup();
    const onStarted = renderDialog();

    expect(await screen.findByText('rounds, one prize each')).toBeInTheDocument();
    expect(screen.getByText(/one prize at a time over 3 rounds/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Confirm and start/ }));

    expect(startDraw).toHaveBeenCalledWith('draw-id', { mode: 'AUTOMATIC' });
    expect(onStarted).toHaveBeenCalled();
  });

  it('AC-MDR-1/2 requires manual details and sends the held time in UTC', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByRole('radio', { name: /Manual/ }));

    await user.click(screen.getByRole('button', { name: /Confirm and start/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter who conducted the draw.');
    expect(startDraw).not.toHaveBeenCalled();

    const held = new Date(Date.now() - 3_600_000);
    const istValue = new Date(held.getTime() + 330 * 60_000).toISOString().slice(0, 16);
    fireEvent.change(screen.getByLabelText('Held at'), { target: { value: istValue } });
    await user.type(screen.getByLabelText('Conducted by'), 'Ravi Kumar');
    await user.type(screen.getByLabelText('Draw method'), 'Chits from a box');
    await user.click(screen.getByRole('button', { name: /Confirm and start/ }));

    expect(startDraw).toHaveBeenCalledWith('draw-id', expect.objectContaining({
      mode: 'MANUAL',
      heldAt: new Date(Date.parse(`${istValue}:00.000Z`) - 330 * 60_000).toISOString(),
      conductedBy: 'Ravi Kumar',
      drawMethod: 'Chits from a box',
    }));
  });
});
