import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApprovalsPage from './ApprovalsPage';
import MyRequestsPage from './MyRequestsPage';
import { listAgents } from '../../api/agents';
import {
  approveApprovalRequest,
  getApprovalRequest,
  listApprovalRequests,
  rejectApprovalRequest,
  withdrawApprovalRequest,
  type ApprovalRequest,
  type ApprovalRequestDetail,
} from '../../api/approvals';

vi.mock('../../api/agents', () => ({ listAgents: vi.fn() }));
vi.mock('../../api/complimentary', () => ({ listComplimentaryOptions: vi.fn().mockResolvedValue([]) }));
vi.mock('../../api/approvals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/approvals')>()),
  approveApprovalRequest: vi.fn(),
  getApprovalRequest: vi.fn(),
  listApprovalRequests: vi.fn(),
  rejectApprovalRequest: vi.fn(),
  withdrawApprovalRequest: vi.fn(),
}));

const base: ApprovalRequest = {
  id: 'r1', type: 'PAYMENT', status: 'PENDING', campaignId: 'c', participantId: 'p', winnerId: null, agentId: 'a',
  payload: { count: 2, method: 'CASH' }, originalPayload: null, submittedAt: '2026-10-05T06:30:00.000Z', decidedAt: null, rejectionReason: null,
  agent: { id: 'a', agentCode: 'AG-1000', name: 'Agent One' }, decidedByAdmin: null,
  participant: { id: 'p', participantNumber: 1005, name: 'Riya Sharma' }, winner: null, campaign: { id: 'c', name: 'Autumn Circle' },
};
const detail = (overrides: Partial<ApprovalRequestDetail> = {}): ApprovalRequestDetail => ({
  ...base,
  current: {
    participantNumber: 1005, name: 'Riya Sharma', email: null, mobile: '9876543210', externalUserId: null, address: 'Old address',
    drawPayments: [{ status: 'NOT_PAID', draw: { drawNumber: 2, status: 'SCHEDULED' } }, { status: 'NOT_PAID', draw: { drawNumber: 3, status: 'SCHEDULED' } }],
    complimentaryChoice: null, winners: [],
  },
  ...overrides,
});

function renderWith(element: JSX.Element) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
}

describe('super-admin approvals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listAgents).mockResolvedValue([]);
    vi.mocked(listApprovalRequests).mockResolvedValue([base]);
    vi.mocked(getApprovalRequest).mockResolvedValue(detail());
    vi.mocked(approveApprovalRequest).mockResolvedValue({ ...base, status: 'APPROVED' });
    vi.mocked(rejectApprovalRequest).mockResolvedValue({ ...base, status: 'REJECTED' });
  });

  it('AC-APR-5 lists pending requests by default with agent, participant and details', async () => {
    renderWith(<ApprovalsPage />);

    const row = (await screen.findAllByRole('row'))[1];
    expect(row).toHaveTextContent('Payment');
    expect(row).toHaveTextContent('#1005 Riya Sharma');
    expect(row).toHaveTextContent('AG-1000 · Agent One');
    expect(row).toHaveTextContent('2 upcoming draws · Method: CASH');
    expect(listApprovalRequests).toHaveBeenCalledWith({ status: 'PENDING', type: '', agentId: '' });
  });

  it('AC-APR-6 approves a request as submitted', async () => {
    const user = userEvent.setup();
    renderWith(<ApprovalsPage />);
    await user.click(await screen.findByRole('button', { name: /Review Payment/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Review request' });
    expect(dialog).toHaveTextContent('Unpaid upcoming draws now2, 3');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(approveApprovalRequest).toHaveBeenCalledWith('r1', undefined);
  });

  it('AC-APR-7 edits the details before approving', async () => {
    const user = userEvent.setup();
    renderWith(<ApprovalsPage />);
    await user.click(await screen.findByRole('button', { name: /Review Payment/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Review request' });

    await user.click(within(dialog).getByRole('button', { name: /Edit/ }));
    await user.clear(within(dialog).getByLabelText('Upcoming draws'));
    await user.type(within(dialog).getByLabelText('Upcoming draws'), '1');
    await user.selectOptions(within(dialog).getByLabelText('Method'), 'UPI');
    await user.click(within(dialog).getByRole('button', { name: 'Approve with edits' }));

    expect(approveApprovalRequest).toHaveBeenCalledWith('r1', { count: 1, method: 'UPI', reference: '' });
  });

  it('AC-APR-6 keeps the dialog open with the error when approval fails a rule', async () => {
    vi.mocked(approveApprovalRequest).mockRejectedValue(new Error('A draw cannot be paid once it has started or completed.'));
    const user = userEvent.setup();
    renderWith(<ApprovalsPage />);
    await user.click(await screen.findByRole('button', { name: /Review Payment/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Review request' });

    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('cannot be paid once it has started');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('still pending');
  });

  it('AC-APR-8 requires a reason to reject', async () => {
    const user = userEvent.setup();
    renderWith(<ApprovalsPage />);
    await user.click(await screen.findByRole('button', { name: /Review Payment/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Review request' });

    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(within(dialog).getByRole('button', { name: /Confirm rejection/ })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Rejection reason'), 'Cash not received');
    await user.click(within(dialog).getByRole('button', { name: /Confirm rejection/ }));
    expect(rejectApprovalRequest).toHaveBeenCalledWith('r1', 'Cash not received');
  });

  it('AC-APR-5 shows current and requested values for participant edits', async () => {
    vi.mocked(getApprovalRequest).mockResolvedValue(detail({ type: 'PARTICIPANT_UPDATE', payload: { address: 'New address' } }));
    vi.mocked(listApprovalRequests).mockResolvedValue([{ ...base, type: 'PARTICIPANT_UPDATE', payload: { address: 'New address' } }]);
    const user = userEvent.setup();
    renderWith(<ApprovalsPage />);
    await user.click(await screen.findByRole('button', { name: /Review Participant details/ }));

    expect(await screen.findByRole('dialog', { name: 'Review request' })).toHaveTextContent('AddressOld address → New address');
  });
});

describe('agent My requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listApprovalRequests).mockResolvedValue([
      base,
      { ...base, id: 'r2', status: 'REJECTED', rejectionReason: 'Cash not received' },
      { ...base, id: 'r3', type: 'PARTICIPANT_CREATE', status: 'APPROVED', participant: null, payload: { name: 'New Person', participantNumber: 1100 }, originalPayload: { name: 'New person' } },
    ]);
    vi.mocked(withdrawApprovalRequest).mockResolvedValue({ ...base, status: 'WITHDRAWN' });
  });

  it('AC-APR-4 shows outcomes and reasons, and withdraws a pending request', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWith(<MyRequestsPage />);

    const [pending, rejected, approved] = (await screen.findAllByRole('row')).slice(1);
    expect(rejected).toHaveTextContent('RejectedReason: Cash not received');
    expect(approved).toHaveTextContent('New: New Person');
    expect(approved).toHaveTextContent('Edited by super admin');
    expect(within(rejected).queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument();

    await user.click(within(pending).getByRole('button', { name: 'Withdraw' }));
    expect(withdrawApprovalRequest).toHaveBeenCalledWith('r1');
  });
});
