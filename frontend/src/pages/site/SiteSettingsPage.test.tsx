import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SiteSettingsPage from './SiteSettingsPage';
import { CampaignApiError, listCampaigns } from '../../api/campaigns';
import { getSiteSettings, saveSiteSettings } from '../../api/site';

vi.mock('../../api/campaigns', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/campaigns')>()),
  listCampaigns: vi.fn(),
}));
vi.mock('../../api/site', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/site')>()),
  getSiteSettings: vi.fn(),
  saveSiteSettings: vi.fn(),
}));

const empty = { featuredCampaignId: null, organizerName: null, contactPhone: null, whatsappNumber: null, contactEmail: null, joinNote: null, updatedAt: null };

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><SiteSettingsPage /></QueryClientProvider>);
}

describe('public website settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCampaigns).mockResolvedValue([
      { id: 'diwali', name: 'Diwali Circle', durationMonths: 3, drawCount: 3, totalAmountPaise: 90_000, perDrawAmountPaise: 30_000, status: 'ACTIVE' },
    ]);
    vi.mocked(getSiteSettings).mockResolvedValue(empty);
  });

  it('AC-PUB-1 features a campaign and saves contact details', async () => {
    vi.mocked(saveSiteSettings).mockImplementation(async (input) => ({ ...input, contactPhone: '+919876543210', updatedAt: '2026-10-06T10:00:00.000Z' }));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('No campaign is featured')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open public website/ })).toHaveAttribute('target', '_blank');
    await user.selectOptions(screen.getByLabelText('Featured campaign'), 'diwali');
    expect(screen.getByText('Diwali Circle', { selector: 'strong' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Organiser name'), 'Lakshmi Chits');
    await user.type(screen.getByLabelText('Phone'), '+91 98765 43210');
    await user.type(screen.getByLabelText('How to join'), 'Call us.');
    expect(screen.getByText('8/600')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(saveSiteSettings).toHaveBeenCalledWith({
      featuredCampaignId: 'diwali', organizerName: 'Lakshmi Chits', contactPhone: '+91 98765 43210', whatsappNumber: null, contactEmail: null, joinNote: 'Call us.',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Saved. The public website shows the change within a minute.');
    expect(screen.getByLabelText('Phone')).toHaveValue('+919876543210');
  });

  it('shows field messages from the server', async () => {
    vi.mocked(saveSiteSettings).mockRejectedValue(new CampaignApiError('Public website settings are invalid.', [
      { path: ['contactEmail'], message: 'Enter a valid email address.' },
    ], 400));
    const user = userEvent.setup();
    renderPage();

    // Passes the browser's email check but not the server's.
    await user.type(await screen.findByLabelText('Email'), 'a@b');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Public website settings are invalid.');
  });
});
