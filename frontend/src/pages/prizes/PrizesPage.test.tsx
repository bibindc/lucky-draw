import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PrizesPage from './PrizesPage';
import { listCampaignDraws, listCampaigns } from '../../api/campaigns';
import { createPrize, listPrizes, removePrizeImage, updatePrize, uploadPrizeImage } from '../../api/prizes';

vi.mock('../../api/campaigns', () => ({ listCampaignDraws: vi.fn(), listCampaigns: vi.fn() }));
vi.mock('../../api/prizes', async (importOriginal) => ({
  // Keep the real image checks and URL builder.
  ...(await importOriginal<typeof import('../../api/prizes')>()),
  createPrize: vi.fn(),
  deletePrize: vi.fn(),
  listPrizes: vi.fn(),
  updatePrize: vi.fn(),
  uploadPrizeImage: vi.fn(),
  removePrizeImage: vi.fn(),
}));

// jsdom has no object URLs; the preview only needs a stable value.
URL.createObjectURL = vi.fn(() => 'blob:preview');
URL.revokeObjectURL = vi.fn();

const pngFile = (name = 'watch.png', bytes = 100, type = 'image/png') => new File([new Uint8Array(bytes)], name, { type });

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PrizesPage />
    </QueryClientProvider>,
  );
}

describe('prize inventory screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCampaigns).mockResolvedValue([{
      id: 'campaign-id',
      name: 'Autumn Circle',
      durationMonths: 5,
      drawCount: 10,
      totalAmountPaise: 300_000,
      perDrawAmountPaise: 30_000,
      status: 'ACTIVE',
    }]);
    vi.mocked(listCampaignDraws).mockResolvedValue([{
      id: 'draw-id',
      drawNumber: 1,
      scheduledAt: '2026-10-20T13:00:00.000Z',
      prizeCount: 5,
      status: 'SCHEDULED',
    }]);
    vi.mocked(listPrizes).mockResolvedValue([{
      id: 'prize-id',
      campaignId: 'campaign-id',
      drawId: 'draw-id',
      name: 'Travel voucher',
      description: 'Weekend break',
      valuePaise: 25_000_00,
      rank: 1,
      totalQuantity: 3,
      assignedQuantity: 1,
    }]);
  });

  it('shows available stock and restricts editing after assignment', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Travel voucher')).toBeInTheDocument();
    expect(listPrizes).toHaveBeenCalledWith('campaign-id', 'draw-id');
    expect(screen.getByText('AVAILABLE').parentElement).toHaveTextContent('2');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Prize name')).toBeDisabled();
    expect(screen.getByLabelText('Rank')).toBeDisabled();
    expect(screen.getByLabelText('Quantity')).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /Description/ })).toBeEnabled();
    expect(screen.getByRole('spinbutton', { name: /Value/ })).toBeEnabled();
    expect(screen.getByLabelText('Prize draw')).toBeDisabled();
  });

  it('lets an unassigned legacy prize be allocated to a scheduled draw', async () => {
    const legacyPrize = {
      id: 'legacy-prize-id',
      campaignId: 'campaign-id',
      drawId: null,
      name: 'Legacy gift card',
      description: null,
      valuePaise: null,
      rank: 2,
      totalQuantity: 1,
      assignedQuantity: 0,
    };
    vi.mocked(listPrizes).mockImplementation(async (_campaignId, drawId) =>
      drawId === 'unassigned' ? [legacyPrize] : [],
    );
    vi.mocked(updatePrize).mockResolvedValue({ ...legacyPrize, drawId: 'draw-id' });

    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(await screen.findByLabelText('Draw inventory'), 'unassigned');
    expect(await screen.findByText('Legacy gift card')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.selectOptions(screen.getByLabelText('Prize draw'), 'draw-id');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(updatePrize).toHaveBeenCalledWith('legacy-prize-id', expect.objectContaining({ drawId: 'draw-id' }));
  });

  it('AC-PRZ-8/10 uploads the chosen image right after adding a prize, with a preview first', async () => {
    const created = { id: 'new-prize', campaignId: 'campaign-id', drawId: 'draw-id', name: 'Cooker', description: null, valuePaise: null, rank: 2, totalQuantity: 1, assignedQuantity: 0 };
    vi.mocked(createPrize).mockResolvedValue(created);
    vi.mocked(uploadPrizeImage).mockResolvedValue({ ...created, imageUpdatedAt: '2026-10-06T10:00:00.000Z' });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Travel voucher');

    await user.type(screen.getByLabelText('Prize name'), 'Cooker');
    const file = pngFile();
    await user.upload(screen.getByLabelText('Prize image'), file);
    expect(screen.getByRole('img', { name: 'New prize image preview' })).toHaveAttribute('src', 'blob:preview');
    // The heading also has an "Add prize" button; the last one submits the form.
    await user.click(screen.getAllByRole('button', { name: 'Add prize' }).at(-1)!);

    expect(createPrize).toHaveBeenCalled();
    expect(uploadPrizeImage).toHaveBeenCalledWith('new-prize', file);
    expect(await screen.findByText('Prize added.')).toBeInTheDocument();
  });

  it('AC-PRZ-8 rejects files of the wrong type or over 2 MB before uploading', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderPage();
    await screen.findByText('Travel voucher');

    await user.upload(screen.getByLabelText('Prize image'), pngFile('logo.gif', 100, 'image/gif'));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a JPG, PNG or WebP image.');
    await user.upload(screen.getByLabelText('Prize image'), pngFile('huge.png', 2 * 1024 * 1024 + 1));
    expect(screen.getByRole('alert')).toHaveTextContent('Images can be at most 2 MB.');
    expect(screen.queryByRole('img', { name: 'New prize image preview' })).not.toBeInTheDocument();
  });

  it('AC-PRZ-9 replaces the image of an assigned prize without sending locked fields', async () => {
    vi.mocked(uploadPrizeImage).mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Edit' }));

    await user.upload(screen.getByLabelText('Prize image'), pngFile());
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(updatePrize).not.toHaveBeenCalled();
    expect(uploadPrizeImage).toHaveBeenCalledWith('prize-id', expect.any(File));
  });

  it('sends only changed fields when editing an assigned prize', async () => {
    vi.mocked(updatePrize).mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Edit' }));

    await user.clear(screen.getByRole('textbox', { name: /Description/ }));
    await user.type(screen.getByRole('textbox', { name: /Description/ }), 'Two nights');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(updatePrize).toHaveBeenCalledWith('prize-id', { description: 'Two nights' });
  });

  it('AC-PRZ-8/10 shows thumbnails and removes an existing image on save', async () => {
    vi.mocked(listPrizes).mockResolvedValue([{
      id: 'prize-id', campaignId: 'campaign-id', drawId: 'draw-id', name: 'Travel voucher', description: null,
      valuePaise: null, rank: 1, totalQuantity: 3, assignedQuantity: 0, imageUpdatedAt: '2026-10-06T10:00:00.000Z',
    }]);
    vi.mocked(removePrizeImage).mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderPage();

    const thumbnail = await screen.findByRole('img', { name: 'Travel voucher' });
    expect(thumbnail.getAttribute('src')).toMatch(/\/prizes\/prize-id\/image\?v=2026-10-06T10%3A00%3A00.000Z$/);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(screen.getByText('The image will be removed when you save.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(removePrizeImage).toHaveBeenCalledWith('prize-id');
    expect(uploadPrizeImage).not.toHaveBeenCalled();
  });

  it('says the prize was saved when only its image failed', async () => {
    vi.mocked(uploadPrizeImage).mockRejectedValue(new Error('Upload a JPG, PNG or WebP image.'));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Edit' }));

    await user.upload(screen.getByLabelText('Prize image'), pngFile());
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The prize was saved, but its image was not: Upload a JPG, PNG or WebP image.');
  });
});