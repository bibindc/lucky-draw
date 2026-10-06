import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, ClipboardList, Gift, Play, Shuffle, Trophy, UsersRound, X } from 'lucide-react';
import { getDrawPool, startDraw, type DrawExecutionMode, type StartDrawInput, type StartDrawResult } from '../../api/campaigns';
import { indiaDateTimeToIso, indiaDateTimeValue } from '../../utils/indiaTime';
import { formatDrawDate, pad } from './drawFormat';

type StartDrawDialogProps = {
  drawId: string;
  campaignName?: string;
  onClose: () => void;
  onStarted: (result: StartDrawResult) => void;
};

export default function StartDrawDialog({ drawId, campaignName, onClose, onStarted }: StartDrawDialogProps) {
  const poolQuery = useQuery({ queryKey: ['draw-pool', drawId], queryFn: () => getDrawPool(drawId) });
  const [mode, setMode] = useState<DrawExecutionMode>('AUTOMATIC');
  const [heldAt, setHeldAt] = useState(() => indiaDateTimeValue(new Date()));
  const [conductedBy, setConductedBy] = useState('');
  const [drawMethod, setDrawMethod] = useState('');
  const [venue, setVenue] = useState('');
  const [witnesses, setWitnesses] = useState('');
  const [notes, setNotes] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [formError, setFormError] = useState('');
  const startMutation = useMutation({ mutationFn: (input: StartDrawInput) => startDraw(drawId, input), onSuccess: onStarted });

  const pool = poolQuery.data;
  const totalRounds = pool?.totalRounds ?? 0;
  const prizeUnits = pool?.prizes.reduce((sum, prize) => sum + prize.available, 0) ?? 0;

  function buildInput(): StartDrawInput | string {
    if (mode === 'AUTOMATIC') return { mode };
    let heldAtIso: string;
    try {
      heldAtIso = indiaDateTimeToIso(heldAt);
    } catch {
      return 'Enter when the draw was held.';
    }
    if (pool && new Date(heldAtIso) < new Date(pool.draw.scheduledAt)) return 'The draw cannot have been held before its scheduled date and time.';
    if (new Date(heldAtIso) > new Date()) return 'The time the draw was held cannot be in the future.';
    if (!conductedBy.trim()) return 'Enter who conducted the draw.';
    if (!drawMethod.trim()) return 'Describe how winners are drawn.';
    return {
      mode,
      heldAt: heldAtIso,
      conductedBy: conductedBy.trim(),
      drawMethod: drawMethod.trim(),
      venue: venue.trim() || undefined,
      witnesses: witnesses.trim() || undefined,
      notes: notes.trim() || undefined,
      evidenceReference: evidenceReference.trim() || undefined,
    };
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = buildInput();
    if (typeof input === 'string') {
      setFormError(input);
      return;
    }
    setFormError('');
    startMutation.mutate(input);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !startMutation.isPending) onClose(); }}>
      <section aria-labelledby="start-draw-title" aria-modal="true" className="manual-draw-dialog start-draw-dialog" role="dialog">
        <div className="draw-dialog-heading"><span className="draw-dialog-icon"><Play size={18} /></span><button className="dots-button" aria-label="Close start draw" onClick={onClose} type="button"><X size={16} /></button></div>
        <div className="section-kicker">{pool ? `DRAW ${pad(pool.draw.drawNumber)}` : 'DRAW'}{campaignName ? ` · ${campaignName}` : ''}</div>
        <h2 id="start-draw-title">Start draw</h2>
        {pool && <p className="draw-confirm-date">Scheduled {formatDrawDate(pool.draw.scheduledAt)}</p>}

        {poolQuery.isPending ? <div className="campaign-loading">Loading eligibility…</div> : poolQuery.isError ? <div className="campaign-error" role="alert">{poolQuery.error.message}</div> : (
          <form noValidate onSubmit={submit}>
            <div className="draw-review-stats">
              <div><UsersRound size={15} /><strong>{pool?.participants.length ?? 0}</strong><span>eligible people</span></div>
              <div><Gift size={15} /><strong>{prizeUnits}</strong><span>prizes available</span></div>
              <div><Trophy size={15} /><strong>{totalRounds}</strong><span>{totalRounds === 1 ? 'round' : 'rounds'}, one prize each</span></div>
            </div>

            <fieldset className="draw-mode-options">
              <legend>How will winners be drawn?</legend>
              <label className={mode === 'AUTOMATIC' ? 'selected' : ''}>
                <input checked={mode === 'AUTOMATIC'} name="draw-mode" onChange={() => setMode('AUTOMATIC')} type="radio" value="AUTOMATIC" />
                <Shuffle size={16} /><span><strong>Automatic</strong><small>The system picks each round’s winner at random.</small></span>
              </label>
              <label className={mode === 'MANUAL' ? 'selected' : ''}>
                <input checked={mode === 'MANUAL'} name="draw-mode" onChange={() => setMode('MANUAL')} type="radio" value="MANUAL" />
                <ClipboardList size={16} /><span><strong>Manual</strong><small>Winners are drawn offline; you record each round.</small></span>
              </label>
            </fieldset>

            {mode === 'MANUAL' && <fieldset className="manual-draw-section">
              <legend>How the draw is held</legend>
              <div className="manual-draw-fields">
                <label>Held at (Asia/Kolkata)<input aria-label="Held at" onChange={(event) => setHeldAt(event.target.value)} type="datetime-local" value={heldAt} /></label>
                <label>Conducted by<input onChange={(event) => setConductedBy(event.target.value)} placeholder="Name of the person drawing" value={conductedBy} /></label>
                <label className="wide">Draw method<input onChange={(event) => setDrawMethod(event.target.value)} placeholder="e.g. Chits drawn from a sealed box" value={drawMethod} /></label>
                <label>Venue <span className="optional-label">OPTIONAL</span><input onChange={(event) => setVenue(event.target.value)} value={venue} /></label>
                <label>Witnesses <span className="optional-label">OPTIONAL</span><input onChange={(event) => setWitnesses(event.target.value)} placeholder="Names, separated by commas" value={witnesses} /></label>
                <label className="wide">Evidence reference <span className="optional-label">OPTIONAL</span><input onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Video link, photo or register page" value={evidenceReference} /></label>
                <label className="wide">Notes <span className="optional-label">OPTIONAL</span><textarea onChange={(event) => setNotes(event.target.value)} rows={2} value={notes} /></label>
              </div>
            </fieldset>}

            {totalRounds === 0
              ? <div className="draw-warning"><AlertTriangle size={16} /><span>{pool?.participants.length ? 'No prizes are available for this draw.' : 'No participants are eligible.'} Starting will complete the draw with zero winners.</span></div>
              : <div className="draw-safe-note"><Check size={15} /><span>The draw runs one prize at a time over {totalRounds} {totalRounds === 1 ? 'round' : 'rounds'}. Once started, the mode cannot change and the draw cannot be finished early.</span></div>}
            {(formError || startMutation.isError) && <div className="campaign-error" role="alert">{formError || startMutation.error?.message}</div>}
            <div className="draw-confirm-actions">
              <button className="quiet-button" disabled={startMutation.isPending} onClick={onClose} type="button">Cancel</button>
              <button className="primary-button" disabled={startMutation.isPending} type="submit"><Play size={14} />{startMutation.isPending ? 'Starting…' : totalRounds === 0 ? 'Complete with no winners' : 'Confirm and start'}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
