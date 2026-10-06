import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ComplimentaryPanel from './ComplimentaryPanel';
import { submitApprovalRequest } from '../api/approvals';
import {
  deliverComplimentaryChoice,
  getParticipantComplimentary,
  listComplimentaryOptions,
  recordComplimentaryChoice,
  type ComplimentaryChoice,
  type ParticipantComplimentary,
} from '../api/complimentary';

vi.mock('../api/approvals', () => ({ submitApprovalRequest: vi.fn() }));
vi.mock('../api/complimentary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/complimentary')>()),
  deliverComplimentaryChoice: vi.fn(),
  getParticipantComplimentary: vi.fn(),
  listComplimentaryOptions: vi.fn(),
  recordComplimentaryChoice: vi.fn(),
}));

const chosenAt = new Date(Date.now() - 3_600_000).toISOString();
const choice = (overrides: Partial<ComplimentaryChoice> = {}): ComplimentaryChoice => ({
  id: 'choice', status: 'CHOSEN', option: { id: 'cooker', name: 'Cooker', description: null, valuePaise: null, isActive: true },
  chosenAt, chosenByAdmin: { id: 'admin', name: 'Meera' }, chosenByAgent: null,
  deliveredAt: null, deliveryNote: null, deliveredByAdmin: null, deliveredByAgent: null, cancelledAt: null, cancelReason: null,
  ...overrides,
});
const info = (overrides: Partial<ParticipantComplimentary> = {}): ParticipantComplimentary => ({
  eligible: true, paidDraws: 10, totalDraws: 10, isWinner: false, status: 'NOT_CHOSEN', choice: null, ...overrides,
});

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><ComplimentaryPanel campaignId="campaign" participantId="participant" /></QueryClientProvider>);
}

describe('complimentary prize panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listComplimentaryOptions).mockResolvedValue([
      { id: 'cooker', campaignId: 'campaign', name: 'Cooker', description: null, valuePaise: null, isActive: true },
      { id: 'dinner', campaignId: 'campaign', name: 'Dinner set', description: '24-piece', valuePaise: 150_000, isActive: true },
      { id: 'old', campaignId: 'campaign', name: 'Old mixer', description: null, valuePaise: null, isActive: false },
    ]);
    vi.mocked(recordComplimentaryChoice).mockResolvedValue(choice());
    vi.mocked(deliverComplimentaryChoice).mockResolvedValue(choice({ status: 'DELIVERED' }));
  });

  it('AC-CMP-8 explains why a participant is not eligible', async () => {
    vi.mocked(getParticipantComplimentary).mockResolvedValue(info({ eligible: false, paidDraws: 7 }));
    renderPanel();
    expect(await screen.findByText('Pay all 10 draws to qualify (7 paid).')).toBeInTheDocument();
    expect(screen.queryByLabelText('Complimentary prize option')).not.toBeInTheDocument();
  });

  it('AC-CMP-8 tells winners they do not get a complimentary prize', async () => {
    vi.mocked(getParticipantComplimentary).mockResolvedValue(info({ eligible: false, isWinner: true }));
    renderPanel();
    expect(await screen.findByText('Winners don’t receive a complimentary prize.')).toBeInTheDocument();
  });

  it('AC-CMP-3/5 records a final choice from active options after confirmation', async () => {
    vi.mocked(getParticipantComplimentary).mockResolvedValue(info());
    const user = userEvent.setup();
    renderPanel();

    const select = await screen.findByLabelText('Complimentary prize option');
    expect(screen.queryByRole('option', { name: /Old mixer/ })).not.toBeInTheDocument();
    await user.selectOptions(select, 'dinner');
    await user.click(screen.getByRole('button', { name: /Record choice/ }));
    expect(screen.getByText(/The choice is final/)).toHaveTextContent('Record Dinner set as this participant’s complimentary prize?');
    expect(recordComplimentaryChoice).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Confirm choice/ }));
    expect(recordComplimentaryChoice).toHaveBeenCalledWith('participant', 'dinner');
  });

  it('AC-CMP-4 marks a chosen prize delivered, leaving an untouched time to the server', async () => {
    vi.mocked(getParticipantComplimentary).mockResolvedValue(info({ status: 'CHOSEN', choice: choice() }));
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByText('Cooker')).toBeInTheDocument();
    expect(screen.getByText(/by Meera/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Complimentary prize option')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Mark delivered/ }));
    await user.type(screen.getByLabelText('Delivery note'), 'Handed over');
    await user.click(screen.getByRole('button', { name: /Confirm delivery/ }));
    expect(deliverComplimentaryChoice).toHaveBeenCalledWith('participant', { note: 'Handed over' });

    await user.click(await screen.findByRole('button', { name: /Mark delivered/ }));
    fireEvent.change(screen.getByLabelText('Delivered at'), { target: { value: '2026-10-05T10:30' } });
    await user.click(screen.getByRole('button', { name: /Confirm delivery/ }));
    expect(deliverComplimentaryChoice).toHaveBeenLastCalledWith('participant', { deliveredAt: '2026-10-05T05:00:00.000Z' });
  });

  it('AC-CMP-6/7 shows cancellations, lets an eligible participant choose again, and flags delivered winners', async () => {
    vi.mocked(getParticipantComplimentary).mockResolvedValue(info({ status: 'CANCELLED', choice: choice({ status: 'CANCELLED', cancelReason: 'Payment voided', cancelledAt: chosenAt }) }));
    renderPanel();
    expect(await screen.findByText(/Payment voided/)).toBeInTheDocument();
    expect(screen.getByLabelText('Complimentary prize option')).toBeInTheDocument();
  });

  it('AC-CMP-6 warns when a delivered participant later won', async () => {
    vi.mocked(getParticipantComplimentary).mockResolvedValue(info({
      eligible: false, isWinner: true, status: 'DELIVERED_BEFORE_WINNING', choice: choice({ status: 'DELIVERED', deliveredAt: chosenAt, deliveredByAdmin: { id: 'admin', name: 'Meera' } }),
    }));
    renderPanel();
    expect(await screen.findByText('Delivered before winning')).toBeInTheDocument();
    expect(screen.getByText(/won a draw after receiving/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark delivered/ })).not.toBeInTheDocument();
  });

  it('shows server errors from recording', async () => {
    vi.mocked(getParticipantComplimentary).mockResolvedValue(info());
    vi.mocked(recordComplimentaryChoice).mockRejectedValue(new Error('This participant has already chosen a complimentary prize; the choice is final.'));
    const user = userEvent.setup();
    renderPanel();

    await user.selectOptions(await screen.findByLabelText('Complimentary prize option'), 'cooker');
    await user.click(screen.getByRole('button', { name: /Record choice/ }));
    await user.click(screen.getByRole('button', { name: /Confirm choice/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already chosen');
  });
});

describe('complimentary panel for agents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listComplimentaryOptions).mockResolvedValue([{ id: 'cooker', campaignId: 'campaign', name: 'Cooker', description: null, valuePaise: null, isActive: true }]);
    vi.mocked(submitApprovalRequest).mockResolvedValue({} as never);
  });

  function renderAgentPanel() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><ComplimentaryPanel campaignId="campaign" participantId="participant" role="AGENT" /></QueryClientProvider>);
  }

  it('AC-APR-1 sends an agent’s choice for approval instead of recording it', async () => {
    vi.mocked(getParticipantComplimentary).mockResolvedValue(info());
    const user = userEvent.setup();
    renderAgentPanel();

    await user.selectOptions(await screen.findByLabelText('Complimentary prize option'), 'cooker');
    await user.click(screen.getByRole('button', { name: /Record choice/ }));
    expect(screen.getByText(/takes effect once a super admin approves/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Send for approval/ }));

    expect(submitApprovalRequest).toHaveBeenCalledWith({ type: 'COMPLIMENTARY_CHOICE', participantId: 'participant', payload: { optionId: 'cooker' } });
    expect(recordComplimentaryChoice).not.toHaveBeenCalled();
    expect(await screen.findByText(/Sent for approval: the choice/)).toBeInTheDocument();
  });

  it('AC-APR-1 sends an agent’s delivery for approval', async () => {
    vi.mocked(getParticipantComplimentary).mockResolvedValue(info({ status: 'CHOSEN', choice: choice() }));
    const user = userEvent.setup();
    renderAgentPanel();

    await user.click(await screen.findByRole('button', { name: /Mark delivered/ }));
    await user.click(screen.getByRole('button', { name: /Send for approval/ }));
    expect(submitApprovalRequest).toHaveBeenCalledWith({ type: 'COMPLIMENTARY_DELIVERY', participantId: 'participant', payload: {} });
    expect(deliverComplimentaryChoice).not.toHaveBeenCalled();
  });

  it('A6 shows both the agent and the approving admin', async () => {
    vi.mocked(getParticipantComplimentary).mockResolvedValue(info({
      status: 'CHOSEN', choice: choice({ chosenByAgent: { id: 'a', agentCode: 'AG-1000', name: 'Agent One' } }),
    }));
    renderAgentPanel();
    expect(await screen.findByText(/by AG-1000 Agent One, approved by Meera/)).toBeInTheDocument();
  });
});

describe('complimentary option images in the panel', () => {
  it('AC-CMP-13 shows the selected option’s image while choosing and the chosen option’s image after', async () => {
    vi.clearAllMocks();
    vi.mocked(listComplimentaryOptions).mockResolvedValue([
      { id: 'dinner', campaignId: 'campaign', name: 'Dinner set', description: null, valuePaise: null, isActive: true, imageUpdatedAt: '2026-10-06T10:00:00.000Z' },
    ]);
    vi.mocked(getParticipantComplimentary).mockResolvedValue(info());
    const user = userEvent.setup();
    renderPanel();

    await user.selectOptions(await screen.findByLabelText('Complimentary prize option'), 'dinner');
    expect(screen.getByRole('img', { name: 'Dinner set' }).getAttribute('src')).toContain('/complimentary-options/dinner/image?v=');
  });

  it('AC-CMP-13 shows the recorded choice’s image', async () => {
    vi.clearAllMocks();
    vi.mocked(listComplimentaryOptions).mockResolvedValue([]);
    vi.mocked(getParticipantComplimentary).mockResolvedValue(info({
      status: 'CHOSEN', choice: choice({ option: { id: 'cooker', name: 'Cooker', description: null, valuePaise: null, isActive: true, imageUpdatedAt: '2026-10-06T10:00:00.000Z' } }),
    }));
    renderPanel();
    expect((await screen.findByRole('img', { name: 'Cooker' })).getAttribute('src')).toContain('/complimentary-options/cooker/image?v=');
  });
});
