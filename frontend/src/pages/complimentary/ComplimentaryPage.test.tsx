import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ComplimentaryPage from './ComplimentaryPage';
import { listCampaigns } from '../../api/campaigns';
import {
  createComplimentaryOption,
  listCampaignComplimentary,
  listComplimentaryOptions,
  removeOptionImage,
  updateComplimentaryOption,
  uploadOptionImage,
  type ComplimentaryRow,
} from '../../api/complimentary';

vi.mock('../../api/campaigns', () => ({ listCampaigns: vi.fn() }));
vi.mock('../../api/complimentary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/complimentary')>()),
  uploadOptionImage: vi.fn(),
  removeOptionImage: vi.fn(),
  createComplimentaryOption: vi.fn(),
  listCampaignComplimentary: vi.fn(),
  listComplimentaryOptions: vi.fn(),
  updateComplimentaryOption: vi.fn(),
}));
vi.mock('../../components/ComplimentaryPanel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/ComplimentaryPanel')>()),
  default: ({ participantId }: { participantId: string }) => <p>Panel for {participantId}</p>,
}));

const row = (overrides: Partial<ComplimentaryRow>): ComplimentaryRow => ({
  id: 'p1', participantNumber: 1001, name: 'Asha Rao', mobile: '9876543210', email: null,
  agent: { id: 'a', agentCode: 'AG-1000', name: 'Agent One' },
  eligible: true, paidDraws: 10, totalDraws: 10, isWinner: false, status: 'NOT_CHOSEN', choice: null, ...overrides,
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><ComplimentaryPage /></QueryClientProvider>);
}

describe('complimentary prizes screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCampaigns).mockResolvedValue([{
      id: 'campaign', name: 'Autumn Circle', durationMonths: 5, drawCount: 10, totalAmountPaise: 300_000, perDrawAmountPaise: 30_000, status: 'ACTIVE',
    }]);
    vi.mocked(listComplimentaryOptions).mockResolvedValue([
      { id: 'dinner', campaignId: 'campaign', name: 'Dinner set', description: '24-piece', valuePaise: 150_000, isActive: true, chosenCount: 3, deliveredCount: 1 },
      { id: 'old', campaignId: 'campaign', name: 'Old mixer', description: null, valuePaise: null, isActive: false, chosenCount: 0, deliveredCount: 0 },
    ]);
    vi.mocked(listCampaignComplimentary).mockResolvedValue([
      row({}),
      row({ id: 'p2', participantNumber: 1002, name: 'Bala Iyer', status: 'CHOSEN', choice: { id: 'c', status: 'CHOSEN', option: { id: 'dinner', name: 'Dinner set', description: null, valuePaise: null, isActive: true }, chosenAt: '', chosenByAdmin: null, chosenByAgent: null, deliveredAt: null, deliveryNote: null, deliveredByAdmin: null, deliveredByAgent: null, cancelledAt: null, cancelReason: null } }),
    ]);
    vi.mocked(createComplimentaryOption).mockResolvedValue({ id: 'new', campaignId: 'campaign', name: 'Cooker', description: null, valuePaise: 250_050, isActive: true });
    vi.mocked(updateComplimentaryOption).mockResolvedValue({ id: 'old', campaignId: 'campaign', name: 'Old mixer', description: null, valuePaise: null, isActive: true });
  });

  it('AC-CMP-1 lists options with counts, adds one in rupees, and toggles active state', async () => {
    const user = userEvent.setup();
    renderPage();

    const options = within(await screen.findByRole('list', { name: 'Complimentary options' }));
    expect(options.getByText('24-piece · ₹1,500')).toBeInTheDocument();
    expect(options.getByText('3 chosen · 1 delivered')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Add option/ }));
    await user.type(screen.getByLabelText('Option name'), 'Cooker');
    await user.type(screen.getByLabelText('Option value'), '2500.50');
    await user.click(within(screen.getByRole('form', { name: 'New option' })).getByRole('button', { name: 'Add option' }));
    expect(createComplimentaryOption).toHaveBeenCalledWith('campaign', { name: 'Cooker', description: null, valuePaise: 250_050 });

    await user.click(options.getByRole('button', { name: 'Activate' }));
    expect(updateComplimentaryOption).toHaveBeenCalledWith('old', { isActive: true });
  });

  it('AC-CMP-9 lists participants with choice and status, filters, and opens the panel', async () => {
    const user = userEvent.setup();
    renderPage();

    const rows = (await screen.findAllByRole('row')).slice(1);
    expect(within(rows[0]).getByText('Not chosen')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Dinner set')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Chosen')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filter by complimentary status'), 'CHOSEN');
    expect(listCampaignComplimentary).toHaveBeenLastCalledWith('campaign', { search: '', status: 'CHOSEN' });

    await user.click(screen.getByRole('button', { name: 'Manage Bala Iyer' }));
    expect(screen.getByRole('dialog', { name: 'Complimentary prize for Bala Iyer' })).toHaveTextContent('Panel for p2');
  });
});

describe('complimentary option images on the screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    vi.mocked(listCampaigns).mockResolvedValue([{
      id: 'campaign', name: 'Autumn Circle', durationMonths: 5, drawCount: 10, totalAmountPaise: 300_000, perDrawAmountPaise: 30_000, status: 'ACTIVE',
    }]);
    vi.mocked(listCampaignComplimentary).mockResolvedValue([]);
    vi.mocked(listComplimentaryOptions).mockResolvedValue([
      { id: 'dinner', campaignId: 'campaign', name: 'Dinner set', description: null, valuePaise: null, isActive: true, imageUpdatedAt: '2026-10-06T10:00:00.000Z', chosenCount: 0, deliveredCount: 0 },
    ]);
  });

  it('AC-CMP-12 shows option thumbnails and uploads an image right after adding an option', async () => {
    const created = { id: 'new-option', campaignId: 'campaign', name: 'Cooker', description: null, valuePaise: null, isActive: true };
    vi.mocked(createComplimentaryOption).mockResolvedValue(created);
    vi.mocked(uploadOptionImage).mockResolvedValue({ ...created, imageUpdatedAt: '2026-10-06T11:00:00.000Z' });
    const user = userEvent.setup();
    renderPage();

    const options = within(await screen.findByRole('list', { name: 'Complimentary options' }));
    expect(options.getByRole('img', { name: 'Dinner set' }).getAttribute('src')).toContain('/complimentary-options/dinner/image?v=');

    await user.click(screen.getByRole('button', { name: /Add option/ }));
    await user.type(screen.getByLabelText('Option name'), 'Cooker');
    const file = new File([new Uint8Array(100)], 'cooker.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Option image'), file);
    expect(screen.getByRole('img', { name: 'New option image preview' })).toBeInTheDocument();
    await user.click(within(screen.getByRole('form', { name: 'New option' })).getByRole('button', { name: 'Add option' }));

    expect(createComplimentaryOption).toHaveBeenCalled();
    expect(uploadOptionImage).toHaveBeenCalledWith('new-option', file);
  });

  it('AC-CMP-11 removes an option’s image on save', async () => {
    vi.mocked(updateComplimentaryOption).mockResolvedValue({ id: 'dinner', campaignId: 'campaign', name: 'Dinner set', description: null, valuePaise: null, isActive: true });
    vi.mocked(removeOptionImage).mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Edit Dinner set' }));
    await user.click(screen.getByRole('button', { name: 'Remove image' }));
    await user.click(screen.getByRole('button', { name: 'Save option' }));
    expect(removeOptionImage).toHaveBeenCalledWith('dinner');
    expect(uploadOptionImage).not.toHaveBeenCalled();
  });
});
