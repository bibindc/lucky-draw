import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight, CalendarClock, Gift, Play, Trophy, UsersRound, X } from 'lucide-react';
import { getDrawResult, listCampaignDraws, listCampaigns, type DrawSchedule, type StartDrawResult } from '../../api/campaigns';
import DrawRoomDialog from './DrawRoomDialog';
import PrizeImage from '../../components/PrizeImage';
import StartDrawDialog from './StartDrawDialog';
import { formatDrawDate as formatDate, modeLabels, pad, rankLabel } from './drawFormat';

const statusLabels = { SCHEDULED: 'Scheduled', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled' } as const;

function statusPill(draw: DrawSchedule, due: boolean) {
  if (draw.status === 'COMPLETED') return { tone: 'ready', label: `Completed${draw.executionMode ? ` · ${modeLabels[draw.executionMode]}` : ''}` };
  if (draw.status === 'IN_PROGRESS') return { tone: 'due', label: `In progress · Round ${draw.roundsCompleted ?? 0}/${draw.totalRounds ?? 0}` };
  if (draw.status === 'CANCELLED') return { tone: 'waiting', label: 'Cancelled' };
  if (due) return { tone: 'due', label: 'Ready to start' };
  return { tone: 'waiting', label: `In ${Math.ceil((new Date(draw.scheduledAt).getTime() - Date.now()) / 86_400_000)} days` };
}

export default function DrawsPage() {
  const queryClient = useQueryClient();
  const campaignsQuery = useQuery({ queryKey: ['campaigns'], queryFn: listCampaigns });
  const [campaignId, setCampaignId] = useState('');
  const [startingDrawId, setStartingDrawId] = useState<string | null>(null);
  const [roomDrawId, setRoomDrawId] = useState<string | null>(null);
  const [resultDrawId, setResultDrawId] = useState<string | null>(null);
  const [startWarning, setStartWarning] = useState<string | null>(null);
  const drawsQueryKey = ['campaign-draws', campaignId];
  const drawsQuery = useQuery({
    queryKey: drawsQueryKey,
    queryFn: () => listCampaignDraws(campaignId),
    enabled: Boolean(campaignId),
  });
  const resultQuery = useQuery({
    queryKey: ['draw-result', resultDrawId],
    queryFn: () => getDrawResult(resultDrawId!),
    enabled: resultDrawId !== null,
  });
  useEffect(() => {
    if (!campaignId && campaignsQuery.data?.length) setCampaignId(campaignsQuery.data[0].id);
  }, [campaignId, campaignsQuery.data]);

  async function refreshDraws() {
    await queryClient.invalidateQueries({ queryKey: drawsQueryKey });
    await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
  }

  async function handleStarted({ draw, warning }: StartDrawResult) {
    setStartingDrawId(null);
    await refreshDraws();
    if (!draw.id) return;
    queryClient.setQueryData(['draw-result', draw.id], draw);
    if (draw.status === 'COMPLETED') {
      setStartWarning(warning);
      setResultDrawId(draw.id);
    } else {
      setRoomDrawId(draw.id);
    }
  }

  function closeRoom() {
    setRoomDrawId(null);
    void refreshDraws();
  }

  function showResult(drawId: string) {
    setRoomDrawId(null);
    setStartWarning(null);
    setResultDrawId(drawId);
    void refreshDraws();
  }

  const campaign = campaignsQuery.data?.find((item) => item.id === campaignId);
  const result = resultQuery.data;

  return (
    <section className="draws-page">
      <div className="campaign-page-heading">
        <div><div className="section-kicker">SCHEDULE & RESULTS</div><h1>Draws</h1><p>Start each draw when it is due and draw its prizes one round at a time.</p></div>
        {campaignsQuery.data?.length ? <label className="campaign-select-label">CAMPAIGN<select aria-label="Campaign" onChange={(event) => setCampaignId(event.target.value)} value={campaignId}>{campaignsQuery.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
      </div>

      {campaignsQuery.isPending ? <div className="campaign-loading">Loading campaigns…</div> : campaignsQuery.isError ? <div className="campaign-error">{campaignsQuery.error.message}</div> : !campaignId ? (
        <div className="campaign-empty"><span className="empty-mark"><CalendarClock size={21} /></span><h2>Create a campaign first</h2><p>Draws are scheduled as part of a campaign.</p></div>
      ) : drawsQuery.isPending ? <div className="campaign-loading">Loading draw schedule…</div> : drawsQuery.isError ? <div className="campaign-error">{drawsQuery.error.message}</div> : (
        <>
          <div className="draws-summary-bar"><div><span className="live-dot" /><strong>{campaign?.name}</strong></div><span>{drawsQuery.data.filter((draw) => draw.status === 'COMPLETED').length} of {drawsQuery.data.length} draws complete</span></div>
          <div className="draw-list-panel">
            {drawsQuery.data.map((draw) => {
              const due = new Date(draw.scheduledAt).getTime() <= Date.now();
              const canStart = draw.status === 'SCHEDULED' && due;
              const pill = statusPill(draw, due);
              return <article className={`draw-list-row ${canStart || draw.status === 'IN_PROGRESS' ? 'draw-due' : ''}`} key={draw.id}>
                <span className="draw-number">{pad(draw.drawNumber ?? 0)}</span>
                <div className="draw-list-date"><strong>{formatDate(draw.scheduledAt)}</strong><small>Draw {draw.drawNumber} · {statusLabels[draw.status ?? 'SCHEDULED']}</small></div>
                <div className="draw-list-metric"><UsersRound size={14} /><strong>{draw._count?.drawPayments ?? 0}</strong><span>eligible</span></div>
                <div className="draw-list-metric"><Gift size={14} /><strong>{draw.prizeCount}</strong><span>prizes</span></div>
                <span className={`status-pill ${pill.tone}`}><i />{pill.label}</span>
                {draw.status === 'COMPLETED'
                  ? <button className="text-button" onClick={() => draw.id && showResult(draw.id)}>View result <ArrowUpRight size={14} /></button>
                  : draw.status === 'IN_PROGRESS'
                    ? <button className="draw-run-button" onClick={() => draw.id && setRoomDrawId(draw.id)}><Play size={14} /> Continue</button>
                    : <button className="draw-run-button" disabled={!canStart || !draw.id} onClick={() => draw.id && setStartingDrawId(draw.id)}><Play size={14} /> Start draw</button>}
              </article>;
            })}
          </div>
        </>
      )}

      {startingDrawId && <StartDrawDialog campaignName={campaign?.name} drawId={startingDrawId} onClose={() => setStartingDrawId(null)} onStarted={(started) => void handleStarted(started)} />}
      {roomDrawId && <DrawRoomDialog campaignName={campaign?.name} drawId={roomDrawId} onClose={closeRoom} onCompleted={() => showResult(roomDrawId)} />}

      {resultDrawId && result && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setResultDrawId(null); }}>
        <section aria-labelledby="draw-result-title" aria-modal="true" className="draw-result-dialog" role="dialog">
          <div className="draw-result-top"><span className="result-trophy"><Trophy size={21} /></span><button className="dots-button" aria-label="Close draw result" onClick={() => setResultDrawId(null)}><X size={17} /></button></div>
          <div className="section-kicker">DRAW {pad(result.drawNumber ?? 0)} RESULT{result.executionMode ? ` · ${modeLabels[result.executionMode].toUpperCase()}` : ''}</div>
          <h2 id="draw-result-title">The winners</h2>
          <p className="draw-result-meta">
            {result.heldAt ? `${result.executionMode === 'MANUAL' ? 'Held' : 'Started'} ${formatDate(result.heldAt)}` : 'Result'}
            {result.executedAt ? ` · Completed ${formatDate(result.executedAt)}` : ''}
            {result.executedByAdmin ? ` · Started by ${result.executedByAdmin.name}` : ''}
          </p>
          {result.manualRecord && <dl className="manual-draw-summary compact" aria-label="Manual draw details">
            <div><dt>Conducted by</dt><dd>{result.manualRecord.conductedBy}</dd></div>
            <div><dt>Method</dt><dd>{result.manualRecord.drawMethod}</dd></div>
            {result.manualRecord.venue && <div><dt>Venue</dt><dd>{result.manualRecord.venue}</dd></div>}
            {result.manualRecord.witnesses && <div><dt>Witnesses</dt><dd>{result.manualRecord.witnesses}</dd></div>}
            {result.manualRecord.evidenceReference && <div><dt>Evidence</dt><dd>{result.manualRecord.evidenceReference}</dd></div>}
            {result.manualRecord.notes && <div><dt>Notes</dt><dd>{result.manualRecord.notes}</dd></div>}
          </dl>}
          {startWarning && <div className="draw-warning"><AlertTriangle size={16} /><span>{startWarning}</span></div>}
          {result.winners?.length ? <div className="winner-reveal-list">{result.winners.map((winner) => <div className="winner-reveal-row" key={winner.id}><span className="winner-place" title="Round">{pad(winner.drawPosition ?? 0)}</span>{winner.prize.imageUpdatedAt ? <PrizeImage prize={winner.prize} /> : <span className="winner-medal"><Trophy size={15} /></span>}<div><strong>{winner.participant.name}</strong><small>{winner.prize.name}{winner.drawnAt ? ` · ${formatDate(winner.drawnAt)}` : ''}{winner.recordedByAdmin ? ` · by ${winner.recordedByAdmin.name}` : ''}</small></div><span className="winner-rank">{rankLabel(winner.prize.rank)}</span></div>)}</div> : <div className="draw-no-winners">No winners were drawn for this draw.</div>}
          <div className="draw-result-footer"><span>Eligible at start: {result.poolSnapshot?.length ?? 0}</span><button className="primary-button" onClick={() => setResultDrawId(null)}>Done</button></div>
        </section>
      </div>}
    </section>
  );
}
