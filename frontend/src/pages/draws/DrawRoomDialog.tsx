import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ClipboardList, Search, Shuffle, Sparkles, Trophy, X } from 'lucide-react';
import { drawRound, getDrawPool, getDrawResult, type DrawRoundResult } from '../../api/campaigns';
import PrizeImage from '../../components/PrizeImage';
import DrawSpinner, { type SpinEntry } from './DrawSpinner';
import { formatDrawDate, modeLabels, pad, rankLabel, suggestedPrizeId } from './drawFormat';

type DrawRoomDialogProps = {
  drawId: string;
  campaignName?: string;
  onClose: () => void;
  onCompleted: () => void;
};

export default function DrawRoomDialog({ drawId, campaignName, onClose, onCompleted }: DrawRoomDialogProps) {
  const queryClient = useQueryClient();
  // An automatic round spins over the round's pool; the winner, progress and history wait until it lands (AC-DRW-12).
  const [spin, setSpin] = useState<{ entries: SpinEntry[]; caption: string; result: DrawRoundResult | null } | null>(null);
  // Frozen while spinning so a background refetch cannot reveal the winner early.
  const poolQuery = useQuery({ queryKey: ['draw-pool', drawId], queryFn: () => getDrawPool(drawId), enabled: !spin });
  const resultQuery = useQuery({ queryKey: ['draw-result', drawId], queryFn: () => getDrawResult(drawId), enabled: !spin });
  const [prizeId, setPrizeId] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [search, setSearch] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [lastRound, setLastRound] = useState<DrawRoundResult | null>(null);

  const pool = poolQuery.data;
  const isManual = pool?.draw.executionMode === 'MANUAL';
  const totalRounds = pool?.totalRounds ?? 0;
  const roundsCompleted = pool?.roundsCompleted ?? 0;
  const round = roundsCompleted + 1;
  const completed = pool ? pool.draw.status === 'COMPLETED' || roundsCompleted >= totalRounds : false;

  // Keep the admin's prize choice while it still has units; otherwise fall back to the suggestion.
  useEffect(() => {
    if (!pool) return;
    if (!pool.prizes.some((prize) => prize.id === prizeId && prize.available > 0)) setPrizeId(suggestedPrizeId(pool.prizes));
  }, [pool, prizeId]);

  async function reveal(result: DrawRoundResult) {
    setSpin(null);
    setLastRound(result);
    setParticipantId('');
    setSearch('');
    setConfirming(false);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['draw-pool', drawId] }),
      queryClient.invalidateQueries({ queryKey: ['draw-result', drawId] }),
      queryClient.invalidateQueries({ queryKey: ['campaign-draws'] }),
    ]);
  }

  const roundMutation = useMutation({
    mutationFn: () => drawRound(drawId, { round, prizeId, ...(isManual ? { participantId } : {}) }),
    // The round is already saved; an automatic one is revealed when the spinner lands.
    onSuccess: async (result) => {
      if (isManual) await reveal(result);
      else setSpin((current) => current && { ...current, result });
    },
    // A conflict means another tab or admin moved the draw on; stop any spin and reload the real state.
    onError: () => {
      setSpin(null);
      void queryClient.invalidateQueries({ queryKey: ['draw-pool', drawId] });
    },
  });

  function drawAutomatically() {
    if (!pool) return;
    setLastRound(null);
    setSpin({
      entries: pool.participants.map(({ id, participantNumber, name }) => ({ id, participantNumber, name })),
      caption: `ROUND ${pad(round)} · ${chosenPrize?.name.toUpperCase() ?? 'PRIZE'}`,
      result: null,
    });
    roundMutation.mutate();
  }

  const busy = roundMutation.isPending || spin !== null;

  const term = search.trim().toLowerCase();
  const candidates = (pool?.participants ?? []).filter((participant) => !term || [
    String(participant.participantNumber), participant.name, participant.email ?? '', participant.mobile ?? '', participant.agent?.agentCode ?? '',
  ].some((value) => value.toLowerCase().includes(term)));
  const chosenPrize = pool?.prizes.find((prize) => prize.id === prizeId);
  const chosenParticipant = pool?.participants.find((participant) => participant.id === participantId);
  const winners = resultQuery.data?.winners ?? [];

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section aria-labelledby="draw-room-title" aria-modal="true" className="manual-draw-dialog draw-room-dialog" role="dialog">
        <div className="draw-dialog-heading"><span className="draw-dialog-icon">{isManual ? <ClipboardList size={18} /> : <Shuffle size={18} />}</span><button className="dots-button" aria-label="Close draw room" disabled={busy} onClick={onClose} type="button"><X size={16} /></button></div>
        <div className="section-kicker">{pool ? `DRAW ${pad(pool.draw.drawNumber)}` : 'DRAW'}{campaignName ? ` · ${campaignName}` : ''}{pool?.draw.executionMode ? ` · ${modeLabels[pool.draw.executionMode].toUpperCase()}` : ''}</div>
        <h2 id="draw-room-title">{completed ? 'Draw complete' : `Round ${round} of ${totalRounds}`}</h2>
        {pool && <div className="draw-round-progress" aria-label={`${roundsCompleted} of ${totalRounds} rounds drawn`} role="progressbar" aria-valuemax={totalRounds} aria-valuemin={0} aria-valuenow={roundsCompleted}><span style={{ width: `${totalRounds ? (roundsCompleted / totalRounds) * 100 : 100}%` }} /></div>}

        {poolQuery.isPending ? <div className="campaign-loading">Loading draw…</div> : poolQuery.isError ? <div className="campaign-error" role="alert">{poolQuery.error.message}</div> : (
          <>
            {lastRound && <div className="round-reveal" role="status">
              <Sparkles size={18} />
              <div><small>ROUND {pad(lastRound.winner.drawPosition ?? 0)} WINNER</small><strong>{lastRound.winner.participant.name}</strong><span>#{lastRound.winner.participant.participantNumber} · {lastRound.winner.prize.name}</span></div>
              {lastRound.winner.prize.imageUpdatedAt && <PrizeImage prize={lastRound.winner.prize} size="large" />}
            </div>}

            {spin ? (
              <DrawSpinner caption={spin.caption} entries={spin.entries} onLanded={() => { if (spin.result) void reveal(spin.result); }} winner={spin.result && { id: spin.result.winner.participant.id, participantNumber: spin.result.winner.participant.participantNumber, name: spin.result.winner.participant.name }} />
            ) : completed ? (
              <div className="draw-safe-note"><Check size={15} /><span>All {totalRounds} {totalRounds === 1 ? 'round has' : 'rounds have'} been drawn. The draw is complete.</span></div>
            ) : confirming && chosenParticipant && chosenPrize ? (
              <div className="round-confirm">
                <p>Record <strong>{chosenParticipant.name}</strong> (#{chosenParticipant.participantNumber}) as the winner of <strong>{chosenPrize.name}</strong> for round {round}? This cannot be undone.</p>
                <div className="draw-confirm-actions"><button className="quiet-button" disabled={roundMutation.isPending} onClick={() => setConfirming(false)} type="button"><ArrowLeft size={13} /> Back</button><button className="primary-button" disabled={roundMutation.isPending} onClick={() => roundMutation.mutate()} type="button"><Check size={14} />{roundMutation.isPending ? 'Saving…' : 'Confirm winner'}</button></div>
              </div>
            ) : (
              <div className="round-controls">
                <label>Prize for this round
                  <select aria-label="Prize for this round" onChange={(event) => setPrizeId(event.target.value)} value={prizeId}>
                    {pool?.prizes.filter((prize) => prize.available > 0).map((prize) => <option key={prize.id} value={prize.id}>{prize.name} · {rankLabel(prize.rank)} ({prize.available} left)</option>)}
                  </select>
                </label>
                {isManual ? (
                  <div className="manual-draw-candidates">
                    <div className="participant-search"><Search size={15} /><input aria-label="Search eligible participants" onChange={(event) => setSearch(event.target.value)} placeholder="Search serial, name, mobile or agent" value={search} /></div>
                    <ul aria-label="Eligible participants">
                      {candidates.map((participant) => <li className={participant.id === participantId ? 'selected' : ''} key={participant.id}>
                        <label className="round-candidate">
                          <input checked={participant.id === participantId} name="round-winner" onChange={() => setParticipantId(participant.id)} type="radio" value={participant.id} />
                          <span className="participant-serial">{participant.participantNumber}</span>
                          <span><strong>{participant.name}</strong><small>{[participant.agent?.agentCode, participant.mobile || participant.email].filter(Boolean).join(' · ')}</small></span>
                        </label>
                      </li>)}
                      {candidates.length === 0 && <li className="manual-draw-empty">No eligible participant matches.</li>}
                    </ul>
                    <button className="primary-button" disabled={!participantId || !prizeId} onClick={() => setConfirming(true)} type="button"><ClipboardList size={14} /> Record winner</button>
                  </div>
                ) : (
                  <button className="primary-button draw-winner-button" disabled={!prizeId || roundMutation.isPending} onClick={drawAutomatically} type="button"><Shuffle size={15} />{roundMutation.isPending ? 'Drawing…' : `Draw winner for round ${round}`}</button>
                )}
                <small className="round-pool-note">{pool?.participants.length ?? 0} eligible {pool?.participants.length === 1 ? 'participant' : 'participants'} in this round</small>
              </div>
            )}
            {roundMutation.isError && <div className="campaign-error" role="alert">{roundMutation.error.message}</div>}

            <div className="round-history">
              <h3>Winners so far</h3>
              {winners.length ? <ol className="winner-reveal-list">{winners.map((winner) => <li className="winner-reveal-row" key={winner.id}><span className="winner-place">{pad(winner.drawPosition ?? 0)}</span>{winner.prize.imageUpdatedAt ? <PrizeImage prize={winner.prize} /> : <span className="winner-medal"><Trophy size={15} /></span>}<div><strong>{winner.participant.name}</strong><small>{winner.prize.name}{winner.drawnAt ? ` · ${formatDrawDate(winner.drawnAt)}` : ''}</small></div><span className="winner-rank">{rankLabel(winner.prize.rank)}</span></li>)}</ol> : <p className="history-empty">No rounds drawn yet.</p>}
            </div>

            <div className="draw-confirm-actions">
              {completed
                ? <button className="primary-button" onClick={onCompleted} type="button"><Trophy size={14} /> View result</button>
                : <button className="quiet-button" disabled={busy} onClick={onClose} type="button">Continue later</button>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
