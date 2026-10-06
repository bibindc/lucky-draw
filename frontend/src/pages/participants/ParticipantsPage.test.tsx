import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ParticipantsPage from './ParticipantsPage';
import { listAgents } from '../../api/agents';
import { listCampaigns } from '../../api/campaigns';
import { CampaignApiError } from '../../api/campaigns';
import { createParticipant, exportParticipants, getNextSerial, getParticipant, listParticipants, recordPayment, updateParticipant } from '../../api/participants';
import { exportParticipantPdf } from '../../utils/participantPdf';
import { listApprovalRequests, submitApprovalRequest } from '../../api/approvals';
import { exportParticipantListExcel, exportParticipantListPdf } from '../../utils/participantListExport';

vi.mock('../../api/agents', () => ({ listAgents: vi.fn() }));
vi.mock('../../api/campaigns', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/campaigns')>()),
  listCampaigns: vi.fn(),
}));
vi.mock('../../api/participants', async (importOriginal) => ({
  // Keep the real serial helpers (range and nextSerialFromError).
  ...(await importOriginal<typeof import('../../api/participants')>()),
  createParticipant: vi.fn(),
  exportParticipants: vi.fn(),
  getNextSerial: vi.fn(),
  getParticipant: vi.fn(),
  listParticipants: vi.fn(),
  recordPayment: vi.fn(),
  updateParticipant: vi.fn(),
}));
vi.mock('../../utils/participantPdf', () => ({ exportParticipantPdf: vi.fn() }));
// The complimentary panel has its own tests; here it only needs to render.
vi.mock('../../components/ComplimentaryPanel', () => ({ default: () => <section aria-label="Complimentary prize" /> }));
vi.mock('../../api/approvals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/approvals')>()),
  submitApprovalRequest: vi.fn(),
  listApprovalRequests: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../utils/participantListExport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/participantListExport')>()),
  exportParticipantListExcel: vi.fn(),
  exportParticipantListPdf: vi.fn(),
}));

function renderPage(role: 'SUPER_ADMIN' | 'AGENT' = 'SUPER_ADMIN') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><ParticipantsPage agentCode="AG-1000" role={role} /></QueryClientProvider>);
}

describe('participant management screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listAgents).mockResolvedValue([{
      id: 'agent-id', agentCode: 'AG-1000', name: 'Agent One', email: 'agent@example.com',
      mobile: '9876543210', isActive: true, createdAt: new Date().toISOString(),
    }]);
    vi.mocked(listCampaigns).mockResolvedValue([{
      id: 'campaign-id', name: 'Autumn Circle', durationMonths: 5, drawCount: 10,
      totalAmountPaise: 300_000, perDrawAmountPaise: 30_000, status: 'ACTIVE',
    }]);
    vi.mocked(listParticipants).mockResolvedValue({
      participants: [],
      pagination: { page: 1, pageSize: 25, total: 0, pageCount: 0 },
    });
    vi.mocked(getNextSerial).mockResolvedValue(1005);
  });

  it('loads the first campaign and allows cancelling participant entry', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('No participants yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add participant' }));
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);

    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(listParticipants).toHaveBeenCalledWith('campaign-id', '', '', '');
  });

  it('requires and submits the selected agent assignment for a super admin', async () => {
    vi.mocked(createParticipant).mockResolvedValue({
      id: 'participant-id',
      participantNumber: 1005,
      agentId: 'agent-id',
      name: 'Riya Sharma',
      email: 'riya@example.com',
      mobile: null,
      externalUserId: null,
      status: 'REGISTERED',
      createdAt: new Date().toISOString(),
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add participant' }));
    await user.type(screen.getByLabelText('Name'), 'Riya Sharma');
    await user.selectOptions(screen.getByLabelText('Assigned agent'), 'agent-id');
    await user.type(screen.getByLabelText(/Email/), 'riya@example.com');
    await user.click(screen.getByRole('button', { name: 'Add participant' }));

    expect(createParticipant).toHaveBeenCalledWith('campaign-id', expect.objectContaining({
      name: 'Riya Sharma',
      email: 'riya@example.com',
      agentId: 'agent-id',
    }));
  });

  it('edits profile details and exports the participant record to PDF', async () => {
    const participant = {
      id: 'participant-id',
      participantNumber: 1005,
      agentId: 'agent-id',
      agent: { id: 'agent-id', agentCode: 'AG-1000', name: 'Agent One' },
      name: 'Riya Sharma',
      email: 'riya@example.com',
      mobile: null,
      externalUserId: null,
      status: 'REGISTERED' as const,
      createdAt: '2026-10-05T00:00:00.000Z',
      drawPayments: [],
      paymentTransactions: [],
      winners: [],
    };
    vi.mocked(listParticipants).mockResolvedValue({
      participants: [participant],
      pagination: { page: 1, pageSize: 25, total: 1, pageCount: 1 },
    });
    vi.mocked(getParticipant).mockResolvedValue(participant);
    vi.mocked(updateParticipant).mockResolvedValue({ ...participant, name: 'Riya Mehta' });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'View Riya Sharma' }));
    expect(await screen.findByText('PARTICIPANT #1005')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Riya Mehta');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(updateParticipant).toHaveBeenCalledWith('participant-id', expect.objectContaining({ name: 'Riya Mehta' }));

    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(exportParticipantPdf).toHaveBeenCalled();
  });

  it('AC-PAR-17/18 exports the filtered list to Excel and PDF with the current filters', async () => {
    const row = {
      id: 'participant-id', participantNumber: 1005, agentId: 'agent-id',
      agent: { id: 'agent-id', agentCode: 'AG-1000', name: 'Agent One' },
      name: 'Riya Sharma', email: 'riya@example.com', mobile: null, externalUserId: null,
      status: 'ELIGIBLE' as const, createdAt: '2026-10-05T00:00:00.000Z', drawPayments: [],
    };
    vi.mocked(listParticipants).mockResolvedValue({
      participants: [row],
      pagination: { page: 1, pageSize: 25, total: 30, pageCount: 2 },
    });
    vi.mocked(exportParticipants).mockResolvedValue({ participants: [row], total: 1 });
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: 'View Riya Sharma' });
    await user.selectOptions(screen.getByLabelText('Filter by agent'), 'agent-id');
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'ELIGIBLE');
    await user.type(screen.getByLabelText('Search participants'), 'riya');
    await user.click(screen.getByRole('button', { name: 'Export Excel' }));

    expect(exportParticipants).toHaveBeenCalledWith('campaign-id', 'riya', 'ELIGIBLE', 'agent-id');
    expect(exportParticipantListExcel).toHaveBeenCalledWith(
      [row],
      expect.objectContaining({ id: 'campaign-id' }),
      { search: 'riya', status: 'ELIGIBLE', agentLabel: 'AG-1000 · Agent One' },
    );
    expect(await screen.findByText('Exported 1 participant to Excel.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(exportParticipantListPdf).toHaveBeenCalledWith([row], expect.objectContaining({ id: 'campaign-id' }), expect.any(Object));
  });

  it('AC-PAR-22 disables export when nothing matches and reports export failures', async () => {
    const user = userEvent.setup();
    const { unmount } = renderPage();

    await screen.findByText('No participants yet');
    expect(screen.getByRole('button', { name: 'Export Excel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDisabled();
    unmount();

    vi.mocked(listParticipants).mockResolvedValue({
      participants: [],
      pagination: { page: 1, pageSize: 25, total: 12_000, pageCount: 480 },
    });
    vi.mocked(exportParticipants).mockRejectedValue(new Error('12000 participants match these filters; narrow them to 10,000 or fewer to export.'));
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Export PDF' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('narrow them to 10,000 or fewer');
    expect(exportParticipantListPdf).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
  });
});

describe('participant serial numbers and address', () => {
  const created = {
    id: 'participant-id', participantNumber: 1500, agentId: 'agent-id', name: 'Riya Sharma', email: 'riya@example.com',
    mobile: null, externalUserId: null, address: null, status: 'REGISTERED' as const, createdAt: '2026-10-05T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listAgents).mockResolvedValue([{
      id: 'agent-id', agentCode: 'AG-1000', name: 'Agent One', email: 'agent@example.com',
      mobile: '9876543210', isActive: true, createdAt: new Date().toISOString(),
    }]);
    vi.mocked(listCampaigns).mockResolvedValue([{
      id: 'campaign-id', name: 'Autumn Circle', durationMonths: 5, drawCount: 10,
      totalAmountPaise: 300_000, perDrawAmountPaise: 30_000, status: 'ACTIVE',
    }]);
    vi.mocked(listParticipants).mockResolvedValue({ participants: [], pagination: { page: 1, pageSize: 25, total: 0, pageCount: 0 } });
    vi.mocked(getNextSerial).mockResolvedValue(1005);
    vi.mocked(createParticipant).mockResolvedValue(created);
  });

  async function openAddForm(role: 'SUPER_ADMIN' | 'AGENT' = 'SUPER_ADMIN') {
    const user = userEvent.setup();
    renderPage(role);
    await user.click(await screen.findByRole('button', { name: 'Add participant' }));
    await user.type(screen.getByLabelText('Name'), 'Riya Sharma');
    await user.type(screen.getByLabelText(/Email/), 'riya@example.com');
    if (role === 'SUPER_ADMIN') await user.selectOptions(screen.getByLabelText('Assigned agent'), 'agent-id');
    return user;
  }

  it('AC-PAR-23/AC-APR-1 prefills the serial, lets an agent change it, and sends the new participant for approval', async () => {
    const user = await openAddForm('AGENT');

    expect(await screen.findByDisplayValue('1005')).toBe(screen.getByLabelText('Serial number'));
    await user.clear(screen.getByLabelText('Serial number'));
    await user.type(screen.getByLabelText('Serial number'), '15a00');
    expect(screen.getByLabelText('Serial number')).toHaveValue('1500');
    await user.type(screen.getByLabelText(/Address/), '12, MG Road{Enter}Kochi');
    // AC-APR-1: an agent's new participant is a request until a super admin approves it.
    await user.click(screen.getByRole('button', { name: 'Send for approval' }));

    expect(submitApprovalRequest).toHaveBeenCalledWith({
      type: 'PARTICIPANT_CREATE',
      campaignId: 'campaign-id',
      payload: expect.objectContaining({ participantNumber: 1500, address: '12, MG Road\nKochi' }),
    });
    expect(createParticipant).not.toHaveBeenCalled();
    expect(await screen.findByText('Sent for approval: Riya Sharma will be added once a super admin approves.')).toBeInTheDocument();
  });

  it('AC-PAR-23 blocks a serial outside 1000–9999 before saving', async () => {
    const user = await openAddForm();
    await screen.findByDisplayValue('1005');

    await user.clear(screen.getByLabelText('Serial number'));
    await user.type(screen.getByLabelText('Serial number'), '999');
    await user.click(screen.getByRole('button', { name: 'Add participant' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Serial number must be a whole number between 1000 and 9999.');
    expect(createParticipant).not.toHaveBeenCalled();
  });

  it('AC-PAR-23 explains a used serial and offers the next available number', async () => {
    vi.mocked(createParticipant).mockRejectedValueOnce(new CampaignApiError(
      'Serial number 1005 is already used by another participant. The next available number is 1006.',
      [{ path: ['participantNumber'], message: 'Serial number 1005 is already used.', nextSerial: 1006 }],
      409,
    ));
    const user = await openAddForm();
    await screen.findByDisplayValue('1005');

    await user.click(screen.getByRole('button', { name: 'Add participant' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Serial number 1005 is already used');
    await user.click(screen.getByRole('button', { name: 'Use 1006' }));
    expect(screen.getByLabelText('Serial number')).toHaveValue('1006');

    await user.click(screen.getByRole('button', { name: 'Add participant' }));
    expect(createParticipant).toHaveBeenLastCalledWith('campaign-id', expect.objectContaining({ participantNumber: 1006 }));
  });

  it('AC-PAR-27 lists the address beside the name, mobile before email, and no added date', async () => {
    vi.mocked(listParticipants).mockResolvedValue({
      participants: [
        { ...created, participantNumber: 1005, address: '12, MG Road\nKochi 682016', mobile: '9876543210' },
        { ...created, id: 'other', participantNumber: 1006, name: 'Kabir Nair', address: null },
      ],
      pagination: { page: 1, pageSize: 25, total: 2, pageCount: 1 },
    });
    renderPage();

    await screen.findByRole('button', { name: 'View Riya Sharma' });
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(
      ['NUMBER', 'PARTICIPANT', 'ADDRESS', 'AGENT', 'CONTACT', 'STATUS', 'PAID DRAWS', ''],
    );
    const [riya, kabir] = screen.getAllByRole('row').slice(1);
    const address = within(riya).getAllByRole('cell')[2];
    expect(address).toHaveTextContent('12, MG Road, Kochi 682016');
    expect(address.querySelector('span')).toHaveAttribute('title', '12, MG Road\nKochi 682016');
    expect(within(kabir).getAllByRole('cell')[2]).toHaveTextContent('—');
    // Contact puts the mobile first and falls back to email.
    expect(within(riya).getAllByRole('cell')[4]).toHaveTextContent('9876543210');
    expect(within(kabir).getAllByRole('cell')[4]).toHaveTextContent('riya@example.com');
  });

  it('AC-PAY-5 shows payment history without a Void action', async () => {
    const participant = {
      ...created, participantNumber: 1005, agent: { id: 'agent-id', agentCode: 'AG-1000', name: 'Agent One' }, winners: [],
      drawPayments: [{ id: 'dp', status: 'PAID' as const, retainedCredit: false, draw: { drawNumber: 1, scheduledAt: '2027-01-01T12:00:00.000Z', status: 'SCHEDULED' as const } }],
      paymentTransactions: [{ id: 'tx', amountPaise: 30_000, method: 'CASH', status: 'RECORDED', createdAt: '2026-10-05T00:00:00.000Z', allocations: [{ drawPayment: { draw: { drawNumber: 1, status: 'SCHEDULED' } } }] }],
    };
    vi.mocked(listParticipants).mockResolvedValue({ participants: [participant], pagination: { page: 1, pageSize: 25, total: 1, pageCount: 1 } });
    vi.mocked(getParticipant).mockResolvedValue(participant);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'View Riya Sharma' }));
    expect(await screen.findByText('₹300')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Void' })).not.toBeInTheDocument();
  });

  it('AC-PAR-26 says when every serial number is in use', async () => {
    vi.mocked(getNextSerial).mockResolvedValue(null);
    await openAddForm();

    expect(await screen.findByText('All serial numbers 1000–9999 are in use.')).toBeInTheDocument();
    expect(screen.getByLabelText('Serial number')).toHaveValue('');
  });

  it('AC-PAR-24/25 lets super admins change the serial and edit the address; agents see the serial read-only', async () => {
    const participant = {
      ...created, participantNumber: 1005, address: 'Old address', agent: { id: 'agent-id', agentCode: 'AG-1000', name: 'Agent One' },
      drawPayments: [], paymentTransactions: [], winners: [],
    };
    vi.mocked(listParticipants).mockResolvedValue({ participants: [participant], pagination: { page: 1, pageSize: 25, total: 1, pageCount: 1 } });
    vi.mocked(getParticipant).mockResolvedValue(participant);
    vi.mocked(updateParticipant).mockResolvedValue(participant);
    const user = userEvent.setup();
    const { unmount } = renderPage('SUPER_ADMIN');

    await user.click(await screen.findByRole('button', { name: 'View Riya Sharma' }));
    expect(await screen.findByLabelText('Address')).toHaveTextContent('Old address');
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    // Unchanged serial is not sent.
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(vi.mocked(updateParticipant).mock.calls[0][1]).not.toHaveProperty('participantNumber');

    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    await user.clear(screen.getByLabelText('Serial number'));
    await user.type(screen.getByLabelText('Serial number'), '2001');
    await user.clear(screen.getByRole('textbox', { name: /Address/ }));
    await user.type(screen.getByRole('textbox', { name: /Address/ }), 'New address');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(updateParticipant).toHaveBeenLastCalledWith('participant-id', expect.objectContaining({ participantNumber: 2001, address: 'New address' }));
    unmount();

    renderPage('AGENT');
    await user.click(await screen.findByRole('button', { name: 'View Riya Sharma' }));
    await user.click(await screen.findByRole('button', { name: 'Edit details' }));
    expect(screen.getByLabelText('Serial number')).toHaveAttribute('readonly');
  });
});

describe('agent changes go to approval', () => {
  const participant = {
    id: 'participant-id', participantNumber: 1005, agentId: 'agent-id', agent: { id: 'agent-id', agentCode: 'AG-1000', name: 'Agent One' },
    name: 'Riya Sharma', email: 'riya@example.com', mobile: '9876543210', externalUserId: null, address: 'Old address',
    status: 'REGISTERED' as const, createdAt: '2026-10-05T00:00:00.000Z', paymentTransactions: [], winners: [],
    drawPayments: [{ id: 'dp1', status: 'NOT_PAID' as const, retainedCredit: false, draw: { drawNumber: 1, scheduledAt: '2027-01-01T12:00:00.000Z', status: 'SCHEDULED' as const } }],
  };

  async function openAsAgent() {
    vi.mocked(listParticipants).mockResolvedValue({ participants: [participant], pagination: { page: 1, pageSize: 25, total: 1, pageCount: 1 } });
    vi.mocked(getParticipant).mockResolvedValue(participant);
    const user = userEvent.setup();
    renderPage('AGENT');
    await user.click(await screen.findByRole('button', { name: 'View Riya Sharma' }));
    return user;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCampaigns).mockResolvedValue([{
      id: 'campaign-id', name: 'Autumn Circle', durationMonths: 5, drawCount: 1, totalAmountPaise: 30_000, perDrawAmountPaise: 30_000, status: 'ACTIVE',
    }]);
    vi.mocked(listApprovalRequests).mockResolvedValue([]);
    vi.mocked(submitApprovalRequest).mockResolvedValue({} as never);
  });

  it('AC-APR-1 sends only the changed details for approval', async () => {
    const user = await openAsAgent();
    await user.click(await screen.findByRole('button', { name: 'Edit details' }));
    await user.clear(screen.getByRole('textbox', { name: /Address/ }));
    await user.type(screen.getByRole('textbox', { name: /Address/ }), 'New address');
    await user.click(screen.getByRole('button', { name: 'Send for approval' }));

    expect(submitApprovalRequest).toHaveBeenCalledWith({ type: 'PARTICIPANT_UPDATE', participantId: 'participant-id', payload: { address: 'New address' } });
    expect(updateParticipant).not.toHaveBeenCalled();
    expect(await screen.findByText(/Sent for approval: the changes will apply/)).toBeInTheDocument();
  });

  it('AC-APR-1 requests a payment instead of recording it', async () => {
    const user = await openAsAgent();
    await user.click(await screen.findByRole('button', { name: /Request payment/ }));
    expect(screen.getByText('REQUEST PAYMENT · NEEDS APPROVAL')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send for approval' }));

    expect(submitApprovalRequest).toHaveBeenCalledWith({ type: 'PAYMENT', participantId: 'participant-id', payload: { count: 1, method: 'CASH', reference: undefined } });
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it('AC-APR-4 shows the participant’s pending requests', async () => {
    vi.mocked(listApprovalRequests).mockResolvedValue([{
      id: 'r1', type: 'PAYMENT', status: 'PENDING', campaignId: 'campaign-id', participantId: 'participant-id', winnerId: null, agentId: 'agent-id',
      payload: { count: 2, method: 'UPI' }, originalPayload: null, submittedAt: '2026-10-05T06:30:00.000Z', decidedAt: null, rejectionReason: null,
      agent: { id: 'agent-id', agentCode: 'AG-1000', name: 'Agent One' }, decidedByAdmin: null, participant: null, winner: null, campaign: { id: 'campaign-id', name: 'Autumn Circle' },
    }]);
    await openAsAgent();

    const panel = await screen.findByRole('region', { name: 'Pending approval' });
    expect(panel).toHaveTextContent('Payment');
    expect(panel).toHaveTextContent('2 upcoming draws · Method: UPI');
    expect(listApprovalRequests).toHaveBeenCalledWith({ participantId: 'participant-id', status: 'PENDING' });
  });
});
