import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Gift,
  Globe,
  ClipboardCheck,
  HandHeart,
  Inbox,
  LayoutDashboard,
  LogOut,
  Search,
  TicketCheck,
  Trophy,
  UsersRound,
} from 'lucide-react';
import CampaignsPage from './pages/campaigns/CampaignsPage';
import PrizesPage from './pages/prizes/PrizesPage';
import ParticipantsPage from './pages/participants/ParticipantsPage';
import DrawsPage from './pages/draws/DrawsPage';
import WinnersPage from './pages/winners/WinnersPage';
import AgentsPage from './pages/agents/AgentsPage';
import OverviewPage from './pages/overview/OverviewPage';
import ComplimentaryPage from './pages/complimentary/ComplimentaryPage';
import ApprovalsPage from './pages/approvals/ApprovalsPage';
import MyRequestsPage from './pages/approvals/MyRequestsPage';
import SiteSettingsPage from './pages/site/SiteSettingsPage';
import { getPendingApprovalCount } from './api/approvals';

const superAdminNavigation = [
  { label: 'Campaigns', icon: CalendarDays },
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Participants', icon: UsersRound },
  { label: 'Draws', icon: TicketCheck },
  { label: 'Prizes', icon: Gift },
  { label: 'Winners', icon: Trophy },
  { label: 'Complimentary', icon: HandHeart },
  { label: 'Approvals', icon: ClipboardCheck },
  { label: 'Agents', icon: UsersRound },
  { label: 'Public website', icon: Globe },
];

const agentNavigation = [{ label: 'Participants', icon: UsersRound }, { label: 'My requests', icon: Inbox }];

function todayInIndia() {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date());
}

type AppProps = {
  adminName?: string;
  agentCode?: string;
  onLogout?: () => void;
  role?: 'SUPER_ADMIN' | 'AGENT';
  signingOut?: boolean;
  signOutError?: string;
};

function App({ adminName = 'Admin', agentCode, onLogout, role = 'SUPER_ADMIN', signingOut = false, signOutError = '' }: AppProps) {
  const [activePage, setActivePage] = useState(role === 'AGENT' ? 'Participants' : 'Overview');
  const initials = adminName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  const navigation = role === 'SUPER_ADMIN' ? superAdminNavigation : agentNavigation;
  // AC-APR-5: pending count beside the Approvals menu item.
  const pendingQuery = useQuery({
    queryKey: ['approval-count'],
    queryFn: getPendingApprovalCount,
    enabled: role === 'SUPER_ADMIN',
    refetchInterval: 60_000,
  });

  function renderPage() {
    if (role === 'AGENT') return activePage === 'My requests' ? <MyRequestsPage /> : <ParticipantsPage role={role} agentCode={agentCode} />;
    switch (activePage) {
      case 'Agents': return <AgentsPage />;
      case 'Campaigns': return <CampaignsPage />;
      case 'Prizes': return <PrizesPage />;
      case 'Participants': return <ParticipantsPage role={role} agentCode={agentCode} />;
      case 'Draws': return <DrawsPage />;
      case 'Winners': return <WinnersPage />;
      case 'Approvals': return <ApprovalsPage />;
      case 'Complimentary': return <ComplimentaryPage />;
      case 'Public website': return <SiteSettingsPage />;
      default: return <OverviewPage adminName={adminName} onNavigate={setActivePage} />;
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        {/* Scrolls on short windows so the bottom section with Sign out stays visible. */}
        <div className="sidebar-scroll">
          <a className="brand" href="#overview" aria-label="Lucky Draw home">
            <span className="brand-mark"><TicketCheck size={21} strokeWidth={2.2} /></span>
            <span className="brand-name">lucky<span>draw</span></span>
          </a>

          <div className="workspace-label">WORKSPACE</div>
          <button className="campaign-switcher">
            <span className="switcher-dot" />
            <span className="switcher-copy"><strong>{role === 'AGENT' ? 'My participants' : 'Campaign workspace'}</strong><small>{role === 'AGENT' ? 'Agent access' : 'Super admin'}</small></span>
            <ChevronDown size={16} />
          </button>

          <div className="workspace-label nav-label">MANAGE</div>
          <nav className="main-nav" aria-label="Main navigation">
            {navigation.map(({ label, icon: Icon }) => (
              <button
                className={`nav-item ${activePage === label ? 'active' : ''}`}
                key={label}
                onClick={() => setActivePage(label)}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{label}</span>
                {label === 'Approvals' && Boolean(pendingQuery.data) && <span aria-label={`${pendingQuery.data} pending`} className="nav-count">{pendingQuery.data}</span>}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="help-panel">
            <span className="help-icon"><CircleHelp size={17} /></span>
            <div><strong>Need a hand?</strong><small>Visit the help center</small></div>
            <ArrowUpRight size={15} />
          </div>
          <div className="profile-card">
            <span className="avatar">{initials}</span>
            <span className="profile-copy"><strong>{adminName}</strong><small>{role === 'AGENT' ? `Agent${agentCode ? ` · ${agentCode}` : ''}` : 'Super admin'}</small></span>
          </div>
          <button
            aria-label={signingOut ? 'Signing out…' : 'Sign out'}
            className="sign-out-button"
            disabled={signingOut}
            onClick={onLogout}
            title="Sign out"
            type="button"
          >
            <LogOut size={16} />
            <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
          </button>
          {signOutError && <p className="sign-out-error" role="alert">{signOutError}</p>}
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Campaigns <span>/</span> <strong>{activePage}</strong></div>
          <div className="top-actions">
            <button className="icon-button search-button" aria-label="Search"><Search size={18} /></button>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /></button>
            <span className="top-divider" />
            <span className="today-label">{todayInIndia()}</span>
          </div>
        </header>

        <div className="page-wrap">{renderPage()}</div>
      </main>
    </div>
  );
}

export default App;
