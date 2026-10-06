import { useState } from 'react';
import { CalendarDays, ChevronDown, Gift, HandHeart, Mail, MessageCircle, Phone, ShieldCheck, TicketCheck, Trophy, UsersRound, Wallet } from 'lucide-react';
import { imageUrl, type DrawStatus, type PublicSite } from '../api';
import { compactRupees, drawDate, drawTime, initials, pad, rankLabel, rupees, shortDate, whatsappLink } from '../format';
import ItemVisual from './ItemVisual';

type Campaign = NonNullable<PublicSite['campaign']>;

const statusLabels: Record<DrawStatus, string> = {
  UPCOMING: 'Upcoming',
  IN_PROGRESS: 'Happening now',
  RESULTS_SOON: 'Results soon',
  COMPLETED: 'Completed',
};

/** Headline figures (AC-PUB-3). */
export function Stats({ stats }: { stats: NonNullable<PublicSite['stats']> }) {
  const figures = [
    { icon: UsersRound, value: stats.members.toLocaleString('en-IN'), label: 'Members' },
    { icon: CalendarDays, value: `${stats.drawsCompleted} / ${stats.totalDraws}`, label: 'Draws completed' },
    { icon: Trophy, value: stats.winners.toLocaleString('en-IN'), label: 'Winners so far' },
    stats.prizeValuePaise > 0
      ? { icon: Gift, value: compactRupees(stats.prizeValuePaise), label: 'In prizes' }
      : { icon: Gift, value: stats.prizeUnits.toLocaleString('en-IN'), label: 'Prizes to win' },
  ];
  return (
    <section aria-label="Lucky draw in numbers" className="stats-strip">
      {figures.map(({ icon: Icon, value, label }) => (
        <div className="stat" key={label}><Icon size={20} strokeWidth={1.8} /><strong>{value}</strong><span>{label}</span></div>
      ))}
    </section>
  );
}

/** Every draw with its date, status and prizes count (AC-PUB-4). */
export function DrawSchedule({ draws }: { draws: PublicSite['draws'] }) {
  return (
    <section aria-labelledby="draws-title" className="section" id="draws">
      <div className="section-heading">
        <span className="section-kicker">SCHEDULE</span>
        <h2 id="draws-title">Draw calendar</h2>
        <p>Every draw of the campaign: when it happens and how many prizes it has.</p>
      </div>
      <ol className="draw-timeline">
        {draws.map((draw) => (
          <li className={`draw-tile status-${draw.status.toLowerCase()}`} key={draw.id}>
            <div className="draw-number"><span>DRAW</span><strong>{pad(draw.drawNumber)}</strong></div>
            <div className="draw-info">
              <span className={`status-chip ${draw.status.toLowerCase()}`}>{statusLabels[draw.status]}</span>
              <strong>{drawDate(draw.scheduledAt)}</strong>
              <span>{drawTime(draw.scheduledAt)} · {draw.prizeCount} {draw.prizeCount === 1 ? 'prize' : 'prizes'}</span>
              {draw.prizes[0] && <span className="draw-top-prize"><Gift size={13} /> {draw.prizes[0].name}</span>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Prizes per draw, with images (AC-PUB-6). */
export function Prizes({ draws, initialDrawId }: { draws: PublicSite['draws']; initialDrawId?: string }) {
  const withPrizes = draws.filter((draw) => draw.prizes.length > 0);
  const [selectedId, setSelectedId] = useState(() => (withPrizes.some((draw) => draw.id === initialDrawId) ? initialDrawId! : withPrizes[0]?.id));
  const selected = withPrizes.find((draw) => draw.id === selectedId) ?? withPrizes[0];
  if (!selected) return null;
  return (
    <section aria-labelledby="prizes-title" className="section" id="prizes">
      <div className="section-heading">
        <span className="section-kicker">PRIZES</span>
        <h2 id="prizes-title">What you can win</h2>
        <p>Each draw has its own prizes, drawn one at a time.</p>
      </div>
      {withPrizes.length > 1 && (
        <div aria-label="Choose a draw" className="draw-tabs" role="group">
          {withPrizes.map((draw) => (
            <button aria-pressed={draw.id === selected.id} className="draw-tab" key={draw.id} onClick={() => setSelectedId(draw.id)} type="button">
              Draw {pad(draw.drawNumber)}<small>{shortDate(draw.scheduledAt)}</small>
            </button>
          ))}
        </div>
      )}
      <ul aria-label={`Prizes of draw ${pad(selected.drawNumber)}`} className="prize-grid">
        {selected.prizes.map((prize) => (
          <li className={`prize-card${prize.rank === 1 ? ' top' : ''}`} key={prize.id}>
            <div className="prize-media">
              <ItemVisual name={prize.name} url={imageUrl('prizes', prize)} />
              <span className="rank-badge">{rankLabel(prize.rank)}</span>
              {prize.quantity > 1 && <span className="quantity-badge">× {prize.quantity}</span>}
            </div>
            <div className="prize-body">
              <h3>{prize.name}</h3>
              {prize.description && <p>{prize.description}</p>}
              {prize.valuePaise ? <strong className="prize-value">Worth {rupees(prize.valuePaise)}</strong> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Active complimentary gifts (AC-PUB-6). */
export function Gifts({ options }: { options: PublicSite['complimentaryOptions'] }) {
  if (!options.length) return null;
  return (
    <section aria-labelledby="gifts-title" className="section gifts-section" id="gifts">
      <div className="section-heading">
        <span className="section-kicker"><HandHeart size={14} /> EVERYONE WINS SOMETHING</span>
        <h2 id="gifts-title">Complimentary gifts</h2>
        <p>Pay every draw without winning a prize and you choose one of these gifts — our thank-you for staying with us.</p>
      </div>
      <ul className="gift-grid">
        {options.map((option) => (
          <li className="gift-card" key={option.id}>
            <ItemVisual name={option.name} url={imageUrl('complimentary-options', option)} />
            <div><h3>{option.name}</h3>{option.description && <p>{option.description}</p>}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Latest winners, newest first (AC-PUB-7). */
export function RecentWinners({ winners }: { winners: PublicSite['recentWinners'] }) {
  return (
    <section aria-labelledby="winners-title" className="section" id="winners">
      <div className="section-heading">
        <span className="section-kicker">CONGRATULATIONS</span>
        <h2 id="winners-title">Recent winners</h2>
        <p>Real members, real prizes.</p>
      </div>
      {winners.length ? (
        <ul className="winner-grid">
          {winners.map((winner) => (
            <li className="winner-card" key={winner.id}>
              <span aria-hidden="true" className="winner-avatar">{initials(winner.name)}</span>
              <div className="winner-text">
                <strong>{winner.name}</strong>
                <span>Serial #{winner.participantNumber}</span>
              </div>
              <div className="winner-prize"><Trophy size={14} /><span>{winner.prize.name}</span></div>
              <small>Draw {pad(winner.drawNumber)} · {shortDate(winner.drawnAt)}</small>
            </li>
          ))}
        </ul>
      ) : <p className="empty-note">The first winners will appear here after the first draw.</p>}
    </section>
  );
}

/** Every completed draw with its winners in round order (AC-PUB-8). */
export function PastResults({ results }: { results: PublicSite['pastResults'] }) {
  if (!results.length) return null;
  return (
    <section aria-labelledby="results-title" className="section" id="results">
      <div className="section-heading">
        <span className="section-kicker">RESULTS ARCHIVE</span>
        <h2 id="results-title">Past draw results</h2>
      </div>
      <div className="results-list">
        {results.map((result, index) => (
          <details className="result-item" key={result.drawNumber} open={index === 0}>
            <summary>
              <span className="result-number">Draw {pad(result.drawNumber)}</span>
              <span className="result-date">{drawDate(result.heldAt ?? result.scheduledAt)}</span>
              {result.mode && <span className="mode-chip">{result.mode === 'MANUAL' ? 'Manual draw' : 'Automatic draw'}</span>}
              <span className="result-count">{result.winners.length} {result.winners.length === 1 ? 'winner' : 'winners'}</span>
              <ChevronDown aria-hidden="true" className="result-chevron" size={18} />
            </summary>
            {result.winners.length ? (
              <ol className="result-winners">
                {result.winners.map((winner) => (
                  <li key={winner.id}>
                    <span className="result-round">{pad(winner.round)}</span>
                    <strong>{winner.name}</strong>
                    <span className="result-serial">#{winner.participantNumber}</span>
                    <span className="result-prize">{winner.prize.name} <small>{rankLabel(winner.prize.rank)}</small></span>
                  </li>
                ))}
              </ol>
            ) : <p className="empty-note">No winners were drawn in this draw.</p>}
          </details>
        ))}
      </div>
    </section>
  );
}

/** How it works, with the campaign's own figures (AC-PUB-11). */
export function HowItWorks({ campaign }: { campaign: Campaign }) {
  const steps = [
    { icon: UsersRound, title: 'Join through an agent', text: 'Register with your area agent and receive your own serial number.' },
    { icon: Wallet, title: `Pay ${rupees(campaign.perDrawAmountPaise)} per draw`, text: `${campaign.drawCount} draws over ${campaign.durationMonths} ${campaign.durationMonths === 1 ? 'month' : 'months'} — ${rupees(campaign.totalAmountPaise)} in all.` },
    { icon: TicketCheck, title: 'Winners drawn every draw', text: 'Each prize is drawn one at a time, only from members who have paid for that draw.' },
    { icon: Trophy, title: 'Win and stop paying', text: 'Once you win, you do not pay for the remaining draws.' },
    { icon: HandHeart, title: 'Everyone else gets a gift', text: 'Pay every draw without winning and choose a complimentary gift.' },
  ];
  return (
    <section aria-labelledby="how-title" className="section how-section" id="how">
      <div className="section-heading">
        <span className="section-kicker">HOW IT WORKS</span>
        <h2 id="how-title">Simple, fair and transparent</h2>
      </div>
      <ol className="steps">
        {steps.map(({ icon: Icon, title, text }, index) => (
          <li className="step" key={title}>
            <span className="step-number">{index + 1}</span>
            <Icon size={22} strokeWidth={1.7} />
            <h3>{title}</h3>
            <p>{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Join note and whichever contact details are set (AC-PUB-12). */
export function Contact({ contact }: { contact: PublicSite['contact'] }) {
  const { contactPhone, whatsappNumber, contactEmail, joinNote, organizerName } = contact;
  if (!contactPhone && !whatsappNumber && !contactEmail && !joinNote) return null;
  return (
    <section aria-labelledby="contact-title" className="section" id="contact">
      <div className="contact-card">
        <div className="contact-copy">
          <span className="section-kicker light">JOIN US</span>
          <h2 id="contact-title">Ready to be our next winner?</h2>
          {joinNote && <p className="join-note">{joinNote}</p>}
          {organizerName && <p className="contact-org">{organizerName}</p>}
        </div>
        <div className="contact-actions">
          {contactPhone && <a className="contact-link" href={`tel:${contactPhone}`}><Phone size={18} /><span><small>Call us</small>{contactPhone}</span></a>}
          {whatsappNumber && <a className="contact-link" href={whatsappLink(whatsappNumber)} rel="noreferrer" target="_blank"><MessageCircle size={18} /><span><small>Chat on WhatsApp</small>{whatsappNumber}</span></a>}
          {contactEmail && <a className="contact-link" href={`mailto:${contactEmail}`}><Mail size={18} /><span><small>Email us</small>{contactEmail}</span></a>}
        </div>
      </div>
    </section>
  );
}

export function Footer({ contact }: { contact: PublicSite['contact'] }) {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <span className="footer-brand"><TicketCheck size={18} /> {contact.organizerName ?? 'Lucky Draw'}</span>
        <p><ShieldCheck size={14} /> Winners are shown by first name and last initial to protect their privacy.</p>
        <small>© {new Date().getFullYear()} {contact.organizerName ?? 'Lucky Draw'}. Draw times are in IST.</small>
      </div>
    </footer>
  );
}
