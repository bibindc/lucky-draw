import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Menu, RefreshCw, TicketCheck, X } from 'lucide-react';
import { getPublicSite, nextDrawWithPrizes } from './api';
import Hero from './components/Hero';
import { Contact, DrawSchedule, Footer, Gifts, HowItWorks, PastResults, Prizes, RecentWinners, Stats } from './components/Sections';

/** Refresh every minute so new winners and draw states appear without a reload (AC-PUB-13). */
export const refreshMs = 60_000;

export default function App() {
  const siteQuery = useQuery({ queryKey: ['public-site'], queryFn: getPublicSite, refetchInterval: refreshMs });
  const [menuOpen, setMenuOpen] = useState(false);
  const site = siteQuery.data;
  const brand = site?.contact.organizerName ?? 'Lucky Draw';

  const links = site?.campaign
    ? [
        ['#draws', 'Draws'],
        ['#prizes', 'Prizes'],
        ['#winners', 'Winners'],
        ...(site.pastResults.length ? [['#results', 'Results']] : []),
        ['#how', 'How it works'],
      ]
    : [];
  const hasContact = Boolean(site && (site.contact.contactPhone || site.contact.whatsappNumber || site.contact.contactEmail || site.contact.joinNote));

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <div className="header-inner">
          <a className="site-brand" href="#top"><span className="brand-mark"><TicketCheck size={19} strokeWidth={2.2} /></span><span>{brand}</span></a>
          {links.length > 0 && (
            <>
              <button aria-controls="site-nav" aria-expanded={menuOpen} aria-label={menuOpen ? 'Close menu' : 'Open menu'} className="menu-button" onClick={() => setMenuOpen((open) => !open)} type="button">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
              <nav aria-label="Sections" className={`site-nav${menuOpen ? ' open' : ''}`} id="site-nav">
                {links.map(([href, label]) => <a href={href} key={href} onClick={() => setMenuOpen(false)}>{label}</a>)}
                {hasContact && <a className="nav-cta" href="#contact" onClick={() => setMenuOpen(false)}>Join now</a>}
              </nav>
            </>
          )}
        </div>
      </header>

      <main id="main">
        <span id="top" />
        {siteQuery.isPending ? (
          <div aria-label="Loading the latest draw details" className="page-loading" role="status"><span /><span /><span /></div>
        ) : siteQuery.isError || !site ? (
          <div className="page-error" role="alert">
            <h1>We could not load the latest draw details</h1>
            <p>Please check your connection and try again.</p>
            <button className="button gold" disabled={siteQuery.isFetching} onClick={() => void siteQuery.refetch()} type="button"><RefreshCw size={16} /> {siteQuery.isFetching ? 'Retrying…' : 'Retry'}</button>
          </div>
        ) : (
          <>
            <Hero onCountdownElapsed={() => void siteQuery.refetch()} site={site} />
            {site.campaign && site.stats && (
              <>
                <Stats stats={site.stats} />
                <DrawSchedule draws={site.draws} />
                <Prizes draws={site.draws} initialDrawId={nextDrawWithPrizes(site)?.id} />
                <Gifts options={site.complimentaryOptions} />
                <RecentWinners winners={site.recentWinners} />
                <PastResults results={site.pastResults} />
                <HowItWorks campaign={site.campaign} />
              </>
            )}
            <Contact contact={site.contact} />
          </>
        )}
      </main>
      {site && <Footer contact={site.contact} />}
    </>
  );
}
