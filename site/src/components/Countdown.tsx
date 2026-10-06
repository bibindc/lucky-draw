import { useEffect, useRef, useState } from 'react';
import { pad, timeUntil } from '../format';

type CountdownProps = {
  target: string;
  /** Called once when the countdown reaches zero, so the page can fetch the latest state. */
  onElapsed?: () => void;
};

/** Live days/hours/minutes/seconds to the next draw (AC-PUB-5). */
export default function Countdown({ target, onElapsed }: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());
  const targetMs = new Date(target).getTime();
  const left = timeUntil(targetMs, now);
  const reported = useRef(false);

  useEffect(() => {
    if (left.done) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [left.done]);

  useEffect(() => {
    if (left.done && !reported.current) {
      reported.current = true;
      onElapsed?.();
    }
  }, [left.done, onElapsed]);

  const units = [['days', left.days], ['hours', left.hours], ['minutes', left.minutes], ['seconds', left.seconds]] as const;
  return (
    // The visible digits tick every second; screen readers get one stable summary instead.
    <div aria-label={`${left.days} days, ${left.hours} hours and ${left.minutes} minutes to go`} className="countdown" role="timer">
      {units.map(([label, value]) => (
        <div aria-hidden="true" className="countdown-unit" key={label}>
          <strong>{label === 'days' ? value : pad(value)}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
