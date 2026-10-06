import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

export type SpinEntry = { id: string; participantNumber?: number; name: string };

type DrawSpinnerProps = {
  /** Participants eligible for this round; the spinner cycles through them. */
  entries: SpinEntry[];
  /** The winner the server picked, or null while the round request is still running. */
  winner: SpinEntry | null;
  caption: string;
  onLanded: () => void;
};

/** The spin lasts at least this long before it stops on the winner (AC-DRW-12). */
export const minimumSpinMs = 10_000;
const fastTickMs = 70;
// Growing gaps make the spinner visibly slow down before it stops.
const landingDelaysMs = [90, 120, 160, 210, 270, 340, 420, 520, 650];
const landingMs = landingDelaysMs.reduce((total, delay) => total + delay, 0);
/** How long the landed number stays highlighted before the winner is revealed. */
export const landedHoldMs = 1_200;

function pick(entries: SpinEntry[], avoid?: SpinEntry | null) {
  const choices = entries.length > 1 && avoid ? entries.filter((entry) => entry.id !== avoid.id) : entries;
  // Display only: the winner is chosen on the server with secure randomness.
  return choices[Math.floor(Math.random() * choices.length)] ?? null;
}

/** Presentation-only lucky draw spinner over the eligible serial numbers (AC-DRW-12). */
export default function DrawSpinner({ entries, winner, caption, onLanded }: DrawSpinnerProps) {
  const [shown, setShown] = useState<SpinEntry | null>(() => pick(entries));
  const [tick, setTick] = useState(0);
  const [landed, setLanded] = useState(false);
  const startedAt = useRef(Date.now());
  const latest = useRef({ entries, winner, onLanded });
  latest.current = { entries, winner, onLanded };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let landingStep = -1;
    const show = (entry: SpinEntry | null) => { setShown(entry); setTick((count) => count + 1); };
    const step = () => {
      const { entries: pool, winner: picked } = latest.current;
      if (landingStep < 0 && picked && Date.now() - startedAt.current >= minimumSpinMs - landingMs) landingStep = 0;
      if (landingStep < 0) { show(pick(pool)); timer = setTimeout(step, fastTickMs); return; }
      if (landingStep < landingDelaysMs.length) { show(pick(pool, picked)); timer = setTimeout(step, landingDelaysMs[landingStep++]); return; }
      show(picked);
      setLanded(true);
      timer = setTimeout(() => latest.current.onLanded(), landedHoldMs);
    };
    timer = setTimeout(step, fastTickMs);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div aria-label="Lucky draw spinner" className={`draw-spinner${landed ? ' landed' : ''}`} role="group">
      <small className="draw-spinner-caption">{landed ? 'WINNING NUMBER' : caption}</small>
      <div className="draw-spinner-window">
        <strong className="draw-spinner-number" key={tick}>{shown?.participantNumber ?? '----'}</strong>
        <span className="draw-spinner-name">{shown?.name ?? ''}</span>
      </div>
      <span className="draw-spinner-note">{landed ? <><Sparkles size={13} /> We have a winner!</> : `Drawing from ${entries.length} eligible ${entries.length === 1 ? 'participant' : 'participants'}…`}</span>
    </div>
  );
}
