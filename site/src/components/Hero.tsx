import { ArrowRight, CalendarDays, Clock, Sparkles, Trophy } from 'lucide-react';
import { imageUrl, nextDrawWithPrizes, type PublicSite } from '../api';
import { drawDate, drawTime, pad, rankLabel, rupees } from '../format';
import Countdown from './Countdown';
import ItemVisual from './ItemVisual';

type HeroProps = { site: PublicSite; onCountdownElapsed: () => void };

/** Campaign headline with the next draw: countdown, happening now, results soon, or all done (AC-PUB-5). */
export default function Hero({ site, onCountdownElapsed }: HeroProps) {
  const { campaign, nextDraw } = site;
  const brand = site.contact.organizerName;

  if (!campaign) {
    return (
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-inner hero-empty">
          <div className="hero-copy">
            <span className="hero-kicker"><Sparkles size={15} /> {brand ?? 'Lucky Draw'}</span>
            <h1 id="hero-title">Our next lucky draw is <em>coming soon</em></h1>
            <p>No lucky draw is being showcased right now. Get in touch to hear about the next one first.</p>
            <div className="hero-actions"><a className="button gold" href="#contact">Contact us <ArrowRight size={16} /></a></div>
          </div>
        </div>
      </section>
    );
  }

  // Only a prize that can still be won is spotlighted, labelled with its own draw.
  const spotlightDraw = nextDrawWithPrizes(site);
  const spotlight = spotlightDraw?.prizes[0];
  const latestWinner = site.recentWinners[0];

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-inner">
        <div className="hero-copy">
          <span className="hero-kicker"><Sparkles size={15} /> {brand ? `${brand} · ` : ''}{campaign.name}</span>
          <h1 id="hero-title">Your chance to <em>win big</em>, every draw.</h1>
          <p>Just {rupees(campaign.perDrawAmountPaise)} per draw. {campaign.drawCount} draws over {campaign.durationMonths} {campaign.durationMonths === 1 ? 'month' : 'months'}, with winners drawn fairly from members who have paid.</p>

          <div className="next-draw-card">
            {!nextDraw ? (
              <div className="next-draw-state"><Trophy size={22} /><div><strong>All draws completed — thank you!</strong><span>See every result below.</span></div></div>
            ) : nextDraw.status === 'IN_PROGRESS' ? (
              <div className="next-draw-state live"><span className="live-dot" aria-hidden="true" /><div><strong>Draw {pad(nextDraw.drawNumber)} is happening now</strong><span>{nextDraw.roundsCompleted} of {nextDraw.totalRounds ?? nextDraw.prizeCount} winners drawn so far</span></div></div>
            ) : nextDraw.status === 'RESULTS_SOON' ? (
              <div className="next-draw-state"><Clock size={22} /><div><strong>Draw {pad(nextDraw.drawNumber)} results coming soon</strong><span>Held {drawDate(nextDraw.scheduledAt)}, {drawTime(nextDraw.scheduledAt)}</span></div></div>
            ) : (
              <>
                <div className="next-draw-meta"><span>NEXT DRAW · {pad(nextDraw.drawNumber)}</span><span><CalendarDays size={14} /> {drawDate(nextDraw.scheduledAt)} · {drawTime(nextDraw.scheduledAt)}</span></div>
                <Countdown onElapsed={onCountdownElapsed} target={nextDraw.scheduledAt} />
              </>
            )}
          </div>

          <div className="hero-actions">
            <a className="button gold" href="#prizes">See the prizes <ArrowRight size={16} /></a>
            <a className="button ghost" href="#how">How to join</a>
          </div>
        </div>

        <div className="hero-spotlight">
          {spotlight ? (
            <figure className="spotlight-card">
              <span className="spotlight-badge">{spotlightDraw ? `DRAW ${pad(spotlightDraw.drawNumber)} · ` : ''}{rankLabel(spotlight.rank).toUpperCase()}</span>
              <ItemVisual className="spotlight-image" name={spotlight.name} url={imageUrl('prizes', spotlight)} />
              <figcaption><strong>{spotlight.name}</strong>{spotlight.valuePaise ? <span>Worth {rupees(spotlight.valuePaise)}</span> : spotlight.description ? <span>{spotlight.description}</span> : null}</figcaption>
            </figure>
          ) : latestWinner ? (
            <figure className="spotlight-card winner-spotlight">
              <span className="spotlight-badge">LATEST WINNER</span>
              <div aria-hidden="true" className="winner-spotlight-art"><Trophy size={64} strokeWidth={1.4} /></div>
              <figcaption><strong>{latestWinner.name} · #{latestWinner.participantNumber}</strong><span>Won {latestWinner.prize.name} in draw {pad(latestWinner.drawNumber)}</span></figcaption>
            </figure>
          ) : null}
          {spotlight && latestWinner && (
            <div className="spotlight-winner">
              <Trophy size={16} />
              <span>Latest winner <strong>{latestWinner.name}</strong> · #{latestWinner.participantNumber} won {latestWinner.prize.name}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
