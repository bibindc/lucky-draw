import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, CalendarDays, Gift, Plus, TicketCheck, Trophy, UsersRound } from 'lucide-react';
import { listCampaigns } from '../../api/campaigns';
import { getCampaignDashboard, type DashboardActivity } from '../../api/dashboard';

export type OverviewTarget = 'Campaigns' | 'Participants' | 'Draws' | 'Prizes' | 'Winners';

const timeZone = 'Asia/Kolkata';
const dayMs = 86_400_000;

// Midnight (UTC) of the Asia/Kolkata calendar day, so day differences ignore the time of day.
function istDay(value: Date | string) {
  return Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(value)));
}

export function istDaysUntil(value: string, now: Date) {
  return Math.round((istDay(value) - istDay(now)) / dayMs);
}

export function greetingFor(now: Date) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export function drawStatusLabel(
  draw: { scheduledAt: string; isDue: boolean; status?: string; roundsCompleted?: number; totalRounds?: number | null },
  now: Date,
) {
  if (draw.status === 'IN_PROGRESS') return `In progress · ${draw.roundsCompleted ?? 0}/${draw.totalRounds ?? 0}`;
  if (draw.isDue) return 'Ready';
  const days = istDaysUntil(draw.scheduledAt, now);
  return days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
}

export function relativeTime(value: string, now: Date) {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60 && istDaysUntil(value, now) === 0) return `${Math.floor(minutes / 60)} h ago`;
  if (istDaysUntil(value, now) === -1) return 'Yesterday';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone }).format(new Date(value));
}

const rupees = (paise: number) => (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const date = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { ...options, timeZone }).format(new Date(value));
const pad = (value: number) => String(value).padStart(2, '0');
const percent = (value: number, total: number) => (total ? Math.min(100, Math.round((value / total) * 100)) : 0);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

const claimLabels: Record<string, string> = { PENDING: 'Pending', CLAIMED: 'Claimed', DELIVERED: 'Delivered' };

function ActivityItem({ event, now }: { event: DashboardActivity; now: Date }) {
  const draws = event.drawNumbers?.length ? ` · Draw ${event.drawNumbers.join(', ')}` : '';
  const content = {
    PARTICIPANT_ADDED: { icon: 'participant', Icon: UsersRound, title: 'New participant', detail: `${event.participantName} joined` },
    PAYMENT_RECORDED: { icon: 'payment', Icon: TicketCheck, title: 'Payment recorded', detail: `${event.participantName}${draws}` },
    PAYMENT_VOIDED: { icon: 'payment', Icon: TicketCheck, title: 'Payment voided', detail: event.participantName },
    WINNER_DRAWN: { icon: 'winner', Icon: Trophy, title: 'Winner drawn', detail: `${event.participantName}${draws} · ${event.prizeName}` },
    CLAIM_UPDATED: { icon: 'winner', Icon: Trophy, title: `Prize ${claimLabels[event.claimStatus ?? ''] ?? 'updated'}`.trim(), detail: `${event.prizeName} · ${event.participantName}` },
  }[event.type];
  const { Icon } = content;

  return (
    <div className="activity-item">
      <span className={`activity-icon ${content.icon}`}><Icon size={15} /></span>
      <div><strong>{content.title}</strong><p>{content.detail}</p><small>{relativeTime(event.at, now)}</small></div>
      {event.amountPaise !== undefined && (
        <span className={`activity-amount ${event.type === 'PAYMENT_VOIDED' ? 'voided' : ''}`}>
          {event.type === 'PAYMENT_VOIDED' ? '−' : '+'}₹{rupees(event.amountPaise)}
        </span>
      )}
    </div>
  );
}

type OverviewPageProps = {
  adminName: string;
  onNavigate: (page: OverviewTarget) => void;
  now?: Date;
};

export default function OverviewPage({ adminName, onNavigate, now = new Date() }: OverviewPageProps) {
  const campaignsQuery = useQuery({ queryKey: ['campaigns'], queryFn: listCampaigns });
  const [campaignId, setCampaignId] = useState('');
  const dashboardQuery = useQuery({
    queryKey: ['campaign-dashboard', campaignId],
    queryFn: () => getCampaignDashboard(campaignId),
    enabled: Boolean(campaignId),
  });
  const firstName = adminName.trim().split(/\s+/)[0] || 'Admin';

  useEffect(() => {
    // Campaigns are listed newest first, so this defaults to the most recent campaign.
    if (!campaignId && campaignsQuery.data?.length) setCampaignId(campaignsQuery.data[0].id);
  }, [campaignId, campaignsQuery.data]);

  const heading = (
    <section className="page-heading">
      <div>
        <div className="eyebrow"><span /> CAMPAIGN AT A GLANCE</div>
        <h1>{greetingFor(now)}, {firstName}</h1>
        <p>Here’s what’s happening with your campaign today.</p>
      </div>
      <div className="overview-heading-actions">
        {campaignsQuery.data && campaignsQuery.data.length > 1 && (
          <label className="campaign-select-label">CAMPAIGN
            <select aria-label="Overview campaign" onChange={(event) => setCampaignId(event.target.value)} value={campaignId}>
              {campaignsQuery.data.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </select>
          </label>
        )}
        {campaignId && <button className="primary-button" onClick={() => onNavigate('Participants')}><Plus size={17} /> Add participant</button>}
      </div>
    </section>
  );

  if (campaignsQuery.isPending || (campaignId && dashboardQuery.isPending)) {
    return <>{heading}<div className="campaign-loading">Loading campaign overview…</div></>;
  }
  if (campaignsQuery.isError || dashboardQuery.isError) {
    return <>{heading}<div className="campaign-error" role="alert">{(campaignsQuery.error ?? dashboardQuery.error)?.message}</div></>;
  }
  if (!campaignId || !dashboardQuery.data) {
    return (
      <>{heading}
        <div className="campaign-empty">
          <span className="empty-mark"><CalendarDays size={21} /></span>
          <h2>No campaigns yet</h2>
          <p>Create a campaign to start tracking participants, payments and draws.</p>
          <button className="primary-button" onClick={() => onNavigate('Campaigns')}><Plus size={16} /> Create campaign</button>
        </div>
      </>
    );
  }

  const { campaign, progress, participants, eligibility, prizes, payments, upcomingDraws, activity } = dashboardQuery.data;
  const nextDraw = upcomingDraws[0];
  const currentDrawNumber = nextDraw?.drawNumber ?? campaign.drawCount;

  return (
    <>
      {heading}

      <section className="campaign-banner" aria-label="Campaign progress">
        <div className="banner-main">
          <div className="banner-kicker"><span className="live-dot" /> {progress.remainingDraws ? 'CAMPAIGN IN PROGRESS' : 'CAMPAIGN COMPLETE'}</div>
          <div className="banner-title-row"><h2>{campaign.name}</h2><span className="season-tag">{campaign.durationMonths} months · {plural(campaign.drawCount, 'draw')}</span></div>
          <p>
            {nextDraw ? `Next: draw ${nextDraw.drawNumber} of ${campaign.drawCount}` : `All ${plural(campaign.drawCount, 'draw')} finished`}
            {campaign.firstDrawAt && <><span className="banner-separator">/</span> {new Date(campaign.firstDrawAt) <= now ? 'Started' : 'Starts'} {date(campaign.firstDrawAt, { dateStyle: 'medium' })}</>}
          </p>
        </div>
        <div className="banner-progress">
          <div className="progress-label"><span>Campaign progress</span><strong>{progress.percentComplete}%</strong></div>
          <div className="progress-track"><span style={{ width: `${progress.percentComplete}%` }} /></div>
          <div className="progress-caption">
            <span>{plural(progress.completedDraws, 'draw')} complete</span>
            <span>{progress.remainingDraws} remaining{progress.cancelledDraws ? ` · ${progress.cancelledDraws} cancelled` : ''}</span>
          </div>
        </div>
        <div className="banner-art" aria-hidden="true"><div className="art-ring ring-one" /><div className="art-ring ring-two" /><div className="art-spark">✳</div><div className="art-number">{pad(currentDrawNumber)}</div></div>
      </section>

      <section className="metric-grid" aria-label="Campaign statistics">
        <article className="metric-card">
          <div className="metric-top"><span>Participants</span><span className="metric-icon coral"><UsersRound size={17} /></span></div>
          <div className="metric-value">{participants.total.toLocaleString('en-IN')} <small>{participants.total === 1 ? 'person' : 'people'}</small></div>
          <div className="metric-foot"><span className="trend good">+{participants.addedLast7Days}</span><span>in the last 7 days</span><span className="foot-note">{plural(participants.winners, 'winner')}</span></div>
          <div className="mini-track" title="Share of participants who have won"><span className="coral-fill" style={{ width: `${percent(participants.winners, participants.total)}%` }} /></div>
        </article>
        <article className="metric-card">
          <div className="metric-top"><span>{nextDraw ? `Draw ${nextDraw.drawNumber} eligibility` : 'Eligibility'}</span><span className="metric-icon green"><TicketCheck size={17} /></span></div>
          <div className="metric-value">{eligibility.nextDrawEligible.toLocaleString('en-IN')} <small>eligible</small></div>
          <div className="metric-foot"><span className="trend good">{eligibility.percentOfActive}%</span><span>of active participants</span><span className="foot-note">{eligibility.pendingForNextDraw} unpaid</span></div>
          <div className="mini-track"><span className="green-fill" style={{ width: `${eligibility.percentOfActive}%` }} /></div>
        </article>
        <article className="metric-card">
          <div className="metric-top"><span>Prize inventory</span><span className="metric-icon yellow"><Gift size={17} /></span></div>
          <div className="metric-value">{prizes.availableUnits.toLocaleString('en-IN')} <small>available</small></div>
          <div className="metric-foot"><span className="trend neutral">{prizes.assignedUnits} assigned</span><span>across {plural(prizes.prizeCount, 'prize')}</span>{prizes.unassignedPrizeCount > 0 && <span className="foot-note">{prizes.unassignedPrizeCount} unassigned</span>}</div>
          <div className="mini-track" title="Share of prize units still available"><span className="yellow-fill" style={{ width: `${percent(prizes.availableUnits, prizes.totalUnits)}%` }} /></div>
        </article>
        <article className="metric-card revenue-card">
          <div className="metric-top"><span>Payments collected</span><span className="metric-icon blue"><span className="rupee">₹</span></span></div>
          <div className="metric-value"><small className="currency">₹</small>{rupees(payments.collectedPaise)}</div>
          <div className="metric-foot"><span className="trend good">{payments.collectionRatePercent}%</span><span>of payable draws paid</span><span className="foot-note">₹{rupees(payments.dueForNextDrawPaise)} due next draw</span></div>
          <div className="mini-track"><span className="blue-fill" style={{ width: `${payments.collectionRatePercent}%` }} /></div>
        </article>
      </section>

      <section className="content-grid">
        <article className="draws-panel">
          <div className="section-heading">
            <div><div className="section-kicker">UP NEXT</div><h2>Upcoming draws</h2></div>
            <button className="text-button" onClick={() => onNavigate('Draws')}>View schedule <ArrowUpRight size={15} /></button>
          </div>
          {upcomingDraws.length === 0 ? <p className="history-empty">No scheduled draws remain in this campaign.</p> : (
            <div className="draw-table-wrap">
              <table className="draw-table">
                <thead><tr><th>DRAW</th><th>DATE & TIME</th><th>PRIZES</th><th>ELIGIBLE</th><th>STATUS</th><th /></tr></thead>
                <tbody>{upcomingDraws.map((draw, index) => (
                  <tr className={index === 0 ? 'next-draw' : ''} key={draw.id}>
                    <td><span className="draw-number">{pad(draw.drawNumber)}</span></td>
                    <td><span className="draw-date">{date(draw.scheduledAt, { dateStyle: 'medium' })}</span><small className="draw-time">{date(draw.scheduledAt, { timeStyle: 'short' })}</small></td>
                    <td><span className="prize-count"><Gift size={14} /> {draw.prizeCount}</span></td>
                    <td><span className={draw.eligibleCount ? 'eligible-number' : 'muted-number'}>{draw.eligibleCount || '—'}</span></td>
                    <td><span className={`status-pill ${draw.isDue ? 'ready' : 'waiting'}`}><i />{drawStatusLabel(draw, now)}</span></td>
                    <td><button className="row-more" aria-label={`Open draw ${draw.drawNumber}`} onClick={() => onNavigate('Draws')}><ArrowUpRight size={16} /></button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </article>

        <aside className="side-column">
          <article className="next-draw-card">
            {nextDraw ? (
              <>
                <div className="next-card-top"><span className="next-label"><CalendarDays size={14} /> NEXT DRAW</span><span className="draw-index">{pad(nextDraw.drawNumber)} / {pad(campaign.drawCount)}</span></div>
                <h3>{date(nextDraw.scheduledAt, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
                <p>{date(nextDraw.scheduledAt, { timeStyle: 'short' })} <span>·</span> Asia/Kolkata</p>
                <div className="next-card-divider" />
                <div className="next-card-stats">
                  <div><strong>{nextDraw.eligibleCount}</strong><span>Eligible</span></div>
                  <div><strong>{nextDraw.prizeCount}</strong><span>Prizes</span></div>
                  <div><strong>{Math.max(0, istDaysUntil(nextDraw.scheduledAt, now))}</strong><span>Days left</span></div>
                </div>
                <button className="draw-action" onClick={() => onNavigate('Draws')}>{nextDraw.status === 'IN_PROGRESS' ? 'Continue draw' : nextDraw.isDue ? 'Start draw' : 'Review draw'} <ArrowUpRight size={16} /></button>
              </>
            ) : (
              <>
                <div className="next-card-top"><span className="next-label"><CalendarDays size={14} /> NEXT DRAW</span></div>
                <h3>All draws complete</h3>
                <p>No scheduled draws remain.</p>
                <button className="draw-action" onClick={() => onNavigate('Winners')}>View winners <ArrowUpRight size={16} /></button>
              </>
            )}
          </article>
          <article className="activity-panel">
            <div className="activity-heading"><h3>Recent activity</h3></div>
            {activity.length === 0 ? <p className="history-empty">No activity yet.</p> : activity.map((event, index) => <ActivityItem event={event} key={`${event.type}-${event.at}-${index}`} now={now} />)}
          </article>
        </aside>
      </section>
      <footer className="page-footer"><span>Lucky Draw Admin</span><span>All amounts in Indian rupees <i /> Asia/Kolkata time</span></footer>
    </>
  );
}
