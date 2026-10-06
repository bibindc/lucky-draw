import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PrizeClaimPanel from './PrizeClaimPanel';
import { submitApprovalRequest } from '../api/approvals';
import { updateWinner } from '../api/winners';
import type { ParticipantDetail } from '../api/participants';

vi.mock('../api/approvals', () => ({ submitApprovalRequest: vi.fn() }));
vi.mock('../api/winners', () => ({ updateWinner: vi.fn() }));

const participant = {
  id: 'p', participantNumber: 1005, agentId: 'a', name: 'Riya Sharma', email: null, mobile: '9876543210', externalUserId: null,
  status: 'WINNER', createdAt: '', paymentTransactions: [],
  winners: [{ id: 'w', claimStatus: 'PENDING', claimNote: null, claimUpdatedAt: null, prize: { name: 'Watch', rank: 1 }, draw: { drawNumber: 2 } }],
} as ParticipantDetail;

function renderPanel(role: 'SUPER_ADMIN' | 'AGENT', subject: ParticipantDetail = participant) {
  const queryClient = new QueryClient();
  render(<QueryClientProvider client={queryClient}><PrizeClaimPanel participant={subject} role={role} /></QueryClientProvider>);
}

describe('prize claim panel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('AC-APR-10 lets an agent request a claim update for approval', async () => {
    const user = userEvent.setup();
    renderPanel('AGENT');

    expect(screen.getByRole('region', { name: 'Prize won' })).toHaveTextContent('Watch · Draw 2');
    await user.click(screen.getByRole('button', { name: 'Request claim update' }));
    await user.selectOptions(screen.getByLabelText('Claim status'), 'DELIVERED');
    await user.type(screen.getByLabelText('Claim note'), 'Handed over');
    await user.click(screen.getByRole('button', { name: 'Send for approval' }));

    expect(submitApprovalRequest).toHaveBeenCalledWith({ type: 'WINNER_CLAIM', winnerId: 'w', payload: { claimStatus: 'DELIVERED', claimNote: 'Handed over' } });
    expect(updateWinner).not.toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent('Sent for approval');
  });

  it('lets a super admin update the claim directly', async () => {
    const user = userEvent.setup();
    renderPanel('SUPER_ADMIN');

    await user.click(screen.getByRole('button', { name: 'Update claim' }));
    await user.selectOptions(screen.getByLabelText('Claim status'), 'CLAIMED');
    await user.click(screen.getByRole('button', { name: 'Save update' }));
    expect(updateWinner).toHaveBeenCalledWith('w', { claimStatus: 'CLAIMED', claimNote: null });
  });

  it('is hidden for participants who have not won', () => {
    renderPanel('AGENT', { ...participant, winners: [] });
    expect(screen.queryByRole('region', { name: 'Prize won' })).not.toBeInTheDocument();
  });
});
