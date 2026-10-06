import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./api/approvals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/approvals')>()),
  getPendingApprovalCount: vi.fn().mockResolvedValue(0),
}));
vi.mock('./api/campaigns', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/campaigns')>()),
  listCampaigns: vi.fn().mockResolvedValue([]),
}));

function renderApp(role: 'SUPER_ADMIN' | 'AGENT' = 'SUPER_ADMIN') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><App adminName="Meera Iyer" role={role} /></QueryClientProvider>);
}

describe('app shell', () => {
  it('opens the live overview for a super admin with no placeholder campaign', async () => {
    renderApp();

    expect(await screen.findByRole('heading', { name: 'No campaigns yet' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /, Meera$/ })).toBeInTheDocument();
    expect(screen.queryByText('Autumn Circle')).not.toBeInTheDocument();
  });

  it('shows today in Asia/Kolkata in the top bar', () => {
    renderApp();

    const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date());
    expect(screen.getByText(today)).toBeInTheDocument();
  });

  it('does not offer the overview to agents', () => {
    renderApp('AGENT');

    expect(screen.queryByRole('button', { name: 'Overview' })).not.toBeInTheDocument();
  });

  it('AC-AUTH-2/6 shows a labelled sign-out control for both roles', async () => {
    for (const role of ['SUPER_ADMIN', 'AGENT'] as const) {
      const onLogout = vi.fn();
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const { unmount } = render(<QueryClientProvider client={queryClient}><App adminName="Meera Iyer" onLogout={onLogout} role={role} /></QueryClientProvider>);

      await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
      expect(onLogout).toHaveBeenCalledTimes(1);
      unmount();
    }

    const queryClient = new QueryClient();
    render(<QueryClientProvider client={queryClient}><App adminName="Meera Iyer" signingOut signOutError="Could not sign out." /></QueryClientProvider>);
    expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not sign out.');
  });
});

describe('approval menus', () => {
  it('AC-APR-4/5 shows My requests to agents and Approvals with a pending count to super admins', async () => {
    const { getPendingApprovalCount } = await import('./api/approvals');
    vi.mocked(getPendingApprovalCount).mockResolvedValue(3);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(<QueryClientProvider client={queryClient}><App adminName="Agent One" role="AGENT" /></QueryClientProvider>);
    expect(screen.getByRole('button', { name: 'My requests' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approvals/ })).not.toBeInTheDocument();
    unmount();

    render(<QueryClientProvider client={new QueryClient()}><App adminName="Meera Iyer" /></QueryClientProvider>);
    expect(await screen.findByLabelText('3 pending')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'My requests' })).not.toBeInTheDocument();
  });
});
