import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuthGate from './AuthGate';
import { getCurrentAdmin, login, logout } from '../api/auth';
import { createAppQueryClient } from '../session';

vi.mock('../api/auth', () => ({
  getCurrentAdmin: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  sessionQueryKey: ['admin-session'],
}));

const admin = { id: 'admin-id', name: 'Admin User', email: 'admin@example.com' };

function renderGate() {
  const queryClient = createAppQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <AuthGate>{(_admin, signOut) => (
        <>
          <h1>Protected campaign desk</h1>
          <button disabled={signOut.pending} onClick={signOut.signOut}>Sign out</button>
          {signOut.error && <p role="alert">{signOut.error}</p>}
        </>
      )}</AuthGate>
    </QueryClientProvider>,
  );
  return queryClient;
}

describe('admin auth gate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows sign-in when there is no active session', async () => {
    vi.mocked(getCurrentAdmin).mockResolvedValue(null);
    renderGate();

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Protected campaign desk' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the protected app for an authenticated admin', async () => {
    vi.mocked(getCurrentAdmin).mockResolvedValue(admin);
    renderGate();

    expect(await screen.findByRole('heading', { name: 'Protected campaign desk' })).toBeInTheDocument();
  });

  it('AC-AUTH-3/4 signs out to the sign-in screen with a notice and clears cached data', async () => {
    vi.mocked(getCurrentAdmin).mockResolvedValue(admin);
    vi.mocked(logout).mockResolvedValue();
    const user = userEvent.setup();
    const queryClient = renderGate();
    queryClient.setQueryData(['participants', 'campaign-id'], { participants: [{ name: 'Riya' }] });

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('You have been signed out.');
    expect(queryClient.getQueryData(['participants', 'campaign-id'])).toBeUndefined();
  });

  it('AC-AUTH-5 stays signed in and explains when the server cannot be reached', async () => {
    vi.mocked(getCurrentAdmin).mockResolvedValue(admin);
    vi.mocked(logout).mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    renderGate();

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign out. Check your connection');
    expect(screen.getByRole('heading', { name: 'Protected campaign desk' })).toBeInTheDocument();
  });

  it('clears the sign-out notice once the next user signs in', async () => {
    vi.mocked(getCurrentAdmin).mockResolvedValue(admin);
    vi.mocked(logout).mockResolvedValue();
    vi.mocked(login).mockResolvedValue(admin);
    const user = userEvent.setup();
    renderGate();

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await user.type(await screen.findByLabelText('Email address'), 'admin@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-long-password');
    await user.click(screen.getByRole('button', { name: /Sign in/ }));

    expect(await screen.findByRole('heading', { name: 'Protected campaign desk' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('status')).toHaveTextContent('You have been signed out.');
  });
});
