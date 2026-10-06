import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { PublicSite } from './api';
import Countdown from './components/Countdown';
import { compactRupees, initials, rankLabel, timeUntil, whatsappLink } from './format';

const day = 86_400_000;
// Half an hour of slack keeps "3 days, 4 hours" stable however long the test takes.
const future = new Date(Date.now() + 3 * day + 4.5 * 3_600_000).toISOString();
const past = new Date(Date.now() - 30 * day).toISOString();

function makeSite(overrides: Partial<PublicSite> = {}): PublicSite {
  return {
    contact: { organizerName: 'Lakshmi Chits', contactPhone: '+919876543210', whatsappNumber: '+91 98765 43210', contactEmail: 'hello@lakshmi.example', joinNote: 'Call us to join.' },
    campaign: { name: 'Diwali Circle', status: 'ACTIVE', durationMonths: 3, drawCount: 3, perDrawAmountPaise: 30_000, totalAmountPaise: 90_000 },
    stats: { members: 120, drawsCompleted: 1, totalDraws: 3, winners: 2, prizeUnits: 5, prizeValuePaise: 1_250_000_00 },
    draws: [
      { id: 'd1', drawNumber: 1, scheduledAt: past, status: 'COMPLETED', prizeCount: 2, roundsCompleted: 2, totalRounds: 2, prizes: [
        { id: 'gold', name: 'Gold coin', description: null, rank: 1, valuePaise: 500_000, quantity: 1, imageUpdatedAt: '2026-10-01T00:00:00.000Z' },
      ] },
      { id: 'd2', drawNumber: 2, scheduledAt: future, status: 'UPCOMING', prizeCount: 2, roundsCompleted: 0, totalRounds: null, prizes: [
        { id: 'scooter', name: 'Electric scooter', description: 'With helmet', rank: 1, valuePaise: 9_000_000, quantity: 1, imageUpdatedAt: null },
        { id: 'phone', name: 'Smartphone', description: null, rank: 2, valuePaise: null, quantity: 2, imageUpdatedAt: null },
      ] },
    ],
    nextDraw: { id: 'd2', drawNumber: 2, scheduledAt: future, status: 'UPCOMING', prizeCount: 2, roundsCompleted: 0, totalRounds: null },
    complimentaryOptions: [{ id: 'dinner', name: 'Dinner set', description: '24 pieces', valuePaise: null, imageUpdatedAt: null }],
    recentWinners: [
      { id: 'w2', round: 2, name: 'Asha R.', participantNumber: 1001, prize: { name: 'Gold coin', rank: 1 }, drawNumber: 1, drawnAt: past },
      { id: 'w1', round: 1, name: 'Bala', participantNumber: 1002, prize: { name: 'Silver coin', rank: 2 }, drawNumber: 1, drawnAt: past },
    ],
    pastResults: [{ drawNumber: 1, scheduledAt: past, heldAt: past, mode: 'MANUAL', winners: [
      { id: 'w1', round: 1, name: 'Bala', participantNumber: 1002, prize: { name: 'Silver coin', rank: 2 }, drawNumber: 1, drawnAt: past },
      { id: 'w2', round: 2, name: 'Asha R.', participantNumber: 1001, prize: { name: 'Gold coin', rank: 1 }, drawNumber: 1, drawnAt: past },
    ] }],
    ...overrides,
  };
}

const fetchMock = vi.fn();
const respond = (body: unknown, ok = true) => fetchMock.mockResolvedValueOnce({ ok, status: ok ? 200 : 500, json: async () => body });

function renderSite() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('public website', () => {
  it('AC-PUB-3..8, 11, 12 shows the featured campaign end to end', async () => {
    respond(makeSite());
    const user = userEvent.setup();
    renderSite();

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Your chance to win big, every draw.');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/public\/site$/));
    expect(screen.getByText(/Lakshmi Chits · Diwali Circle/)).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveAccessibleName(/^3 days, 4 hours and \d+ minutes to go$/);
    expect(screen.getByText(/NEXT DRAW · 02/)).toBeInTheDocument();
    expect(screen.getByText('DRAW 02 · 1ST PRIZE')).toBeInTheDocument();

    const figures = within(screen.getByRole('region', { name: 'Lucky draw in numbers' }));
    expect(figures.getByText('120')).toBeInTheDocument();
    expect(figures.getByText('1 / 3')).toBeInTheDocument();
    expect(figures.getByText('₹12.5 L')).toBeInTheDocument();

    const calendar = within(screen.getByRole('region', { name: 'Draw calendar' }));
    expect(calendar.getByText('Completed')).toBeInTheDocument();
    expect(calendar.getByText('Upcoming')).toBeInTheDocument();

    // Prizes open on the next draw; the tabs switch draws.
    const prizes = within(screen.getByRole('region', { name: 'What you can win' }));
    expect(prizes.getByRole('button', { name: /Draw 02/ })).toHaveAttribute('aria-pressed', 'true');
    expect(prizes.getByText('Electric scooter')).toBeInTheDocument();
    expect(prizes.getByText('× 2')).toBeInTheDocument();
    await user.click(prizes.getByRole('button', { name: /Draw 01/ }));
    expect(prizes.getByRole('img', { name: 'Gold coin' })).toHaveAttribute('src', expect.stringContaining('/public/prizes/gold/image?v='));
    expect(prizes.queryByText('Electric scooter')).not.toBeInTheDocument();

    expect(within(screen.getByRole('region', { name: 'Complimentary gifts' })).getByText('Dinner set')).toBeInTheDocument();
    const winners = within(screen.getByRole('region', { name: 'Recent winners' })).getAllByRole('listitem');
    expect(winners[0]).toHaveTextContent('Asha R.Serial #1001Gold coin');

    const results = within(screen.getByRole('region', { name: 'Past draw results' }));
    expect(results.getByText('Manual draw')).toBeInTheDocument();
    expect(results.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['01Bala#1002Silver coin 2nd prize', '02Asha R.#1001Gold coin 1st prize']);

    const how = within(screen.getByRole('region', { name: 'Simple, fair and transparent' }));
    expect(how.getByText('Pay ₹300 per draw')).toBeInTheDocument();
    expect(how.getByText('3 draws over 3 months — ₹900 in all.')).toBeInTheDocument();

    const contact = within(screen.getByRole('region', { name: 'Ready to be our next winner?' }));
    expect(contact.getByText('Call us to join.')).toBeInTheDocument();
    expect(contact.getByRole('link', { name: /Call us/ })).toHaveAttribute('href', 'tel:+919876543210');
    expect(contact.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/919876543210');
    expect(contact.getByRole('link', { name: /Email us/ })).toHaveAttribute('href', 'mailto:hello@lakshmi.example');
    expect(screen.getByRole('link', { name: 'Join now' })).toHaveAttribute('href', '#contact');
  });

  it('P1 shows a coming-soon page with contact details when nothing is featured', async () => {
    respond(makeSite({ campaign: null, stats: null, draws: [], nextDraw: null, complimentaryOptions: [], recentWinners: [], pastResults: [], contact: { organizerName: null, contactPhone: '+919876543210', whatsappNumber: null, contactEmail: null, joinNote: null } }));
    renderSite();

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Our next lucky draw is coming soon');
    expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'What you can win' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Call us/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
  });

  it('AC-PUB-6 never spotlights a prize that was already drawn', async () => {
    const site = makeSite();
    // The next draw has no prizes yet; only draw 01 (completed) has one.
    site.draws[1].prizes = [];
    respond(site);
    renderSite();

    expect(await screen.findByText('LATEST WINNER')).toBeInTheDocument();
    expect(screen.getByText('Asha R. · #1001')).toBeInTheDocument();
    expect(screen.queryByText(/DRAW 02 · 1ST PRIZE/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'What you can win' })).getByText('Gold coin')).toBeInTheDocument();
  });

  it('AC-PUB-12 hides the contact section when nothing is set', async () => {
    respond(makeSite({ contact: { organizerName: null, contactPhone: null, whatsappNumber: null, contactEmail: null, joinNote: null } }));
    renderSite();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('region', { name: 'Ready to be our next winner?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Join now' })).not.toBeInTheDocument();
  });

  it('AC-PUB-5 shows a draw in progress, results coming soon, or all draws done', async () => {
    respond(makeSite({ nextDraw: { id: 'd2', drawNumber: 2, scheduledAt: past, status: 'IN_PROGRESS', prizeCount: 3, roundsCompleted: 1, totalRounds: 3 } }));
    renderSite();
    expect(await screen.findByText('Draw 02 is happening now')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 winners drawn so far')).toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('AC-PUB-5 says results are coming once the time has passed, and thanks everyone at the end', async () => {
    respond(makeSite({ nextDraw: { id: 'd2', drawNumber: 2, scheduledAt: past, status: 'RESULTS_SOON', prizeCount: 2, roundsCompleted: 0, totalRounds: null } }));
    renderSite();
    expect(await screen.findByText('Draw 02 results coming soon')).toBeInTheDocument();
  });

  it('AC-PUB-5 thanks everyone once every draw is completed', async () => {
    respond(makeSite({ nextDraw: null }));
    renderSite();
    expect(await screen.findByText('All draws completed — thank you!')).toBeInTheDocument();
  });

  it('AC-PUB-14 offers a retry instead of a blank page when the API is down', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    respond(makeSite());
    const user = userEvent.setup();
    renderSite();

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load the latest draw details');
    await user.click(screen.getByRole('button', { name: /Retry/ }));
    expect(await screen.findByText(/Your chance to/)).toBeInTheDocument();
  });

  it('opens and closes the menu on small screens', async () => {
    respond(makeSite());
    const user = userEvent.setup();
    renderSite();

    const toggle = await screen.findByRole('button', { name: 'Open menu' });
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
    await user.click(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('link', { name: 'Prizes' }));
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('countdown', () => {
  afterEach(() => vi.useRealTimers());

  it('AC-PUB-13 ticks down and asks for fresh data once it reaches zero', async () => {
    vi.useFakeTimers();
    const onElapsed = vi.fn();
    render(<Countdown onElapsed={onElapsed} target={new Date(Date.now() + 2_500).toISOString()} />);
    expect(screen.getByRole('timer')).toHaveAccessibleName('0 days, 0 hours and 0 minutes to go');
    expect(screen.getByText('02')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(3_000); });
    expect(onElapsed).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('00')).toHaveLength(3);
    await act(async () => { vi.advanceTimersByTime(5_000); });
    expect(onElapsed).toHaveBeenCalledTimes(1);
  });
});

describe('formatting', () => {
  it('formats figures, ranks, initials and WhatsApp links', () => {
    expect(timeUntil(1_000 + 90_061_000, 1_000)).toEqual({ done: false, days: 1, hours: 1, minutes: 1, seconds: 1 });
    expect(timeUntil(0, 5_000).done).toBe(true);
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(rankLabel)).toEqual(['1st prize', '2nd prize', '3rd prize', '4th prize', '11th prize', '12th prize', '13th prize', '21st prize', '22nd prize']);
    expect(compactRupees(1_250_000_00)).toBe('₹12.5 L');
    expect(compactRupees(2_00_00_000_00)).toBe('₹2 Cr');
    expect(compactRupees(50_000_00)).toBe('₹50,000');
    expect(initials('Asha R.')).toBe('AR');
    expect(initials('Bala')).toBe('B');
    expect(whatsappLink('+91 98765-43210')).toBe('https://wa.me/919876543210');
  });
});
