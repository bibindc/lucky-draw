import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Check, FileSpreadsheet, FileText, Pencil, Trophy, X } from 'lucide-react';
import { listCampaignDraws, listCampaigns } from '../../api/campaigns';
import { listWinners, updateWinner, type WinnerClaimStatus, type WinnerRecord } from '../../api/winners';
import { claimStatusLabels as claimLabels, exportWinnerListExcel, exportWinnerListPdf } from '../../utils/winnerListExport';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value));
}

export default function WinnersPage() {
  const queryClient = useQueryClient();
  const campaignsQuery = useQuery({ queryKey: ['campaigns'], queryFn: listCampaigns });
  const [campaignId, setCampaignId] = useState('');
  const [drawId, setDrawId] = useState('');
  const [claimStatus, setClaimStatus] = useState('');
  const [editing, setEditing] = useState<WinnerRecord | null>(null);
  const [editStatus, setEditStatus] = useState<WinnerClaimStatus>('PENDING');
  const [editNote, setEditNote] = useState('');
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState('');
  const [exportNotice, setExportNotice] = useState('');
  const drawsQuery = useQuery({
    queryKey: ['campaign-draws', campaignId],
    queryFn: () => listCampaignDraws(campaignId),
    enabled: Boolean(campaignId),
  });

  useEffect(() => {
    if (!campaignId && campaignsQuery.data?.length) setCampaignId(campaignsQuery.data[0].id);
  }, [campaignId, campaignsQuery.data]);

  const winnersQueryKey = ['winners', campaignId, drawId, claimStatus];
  const winnersQuery = useQuery({
    queryKey: winnersQueryKey,
    queryFn: () => listWinners(campaignId, { drawId: drawId || undefined, claimStatus: claimStatus || undefined }),
    enabled: Boolean(campaignId),
  });
  const updateMutation = useMutation({
    mutationFn: (data: { claimStatus: WinnerClaimStatus; claimNote?: string | null }) => updateWinner(editing!.id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: winnersQueryKey });
      setEditing(null);
    },
  });

  function openEditor(winner: WinnerRecord) {
    setEditing(winner);
    setEditStatus(winner.claimStatus);
    setEditNote(winner.claimNote ?? '');
    updateMutation.reset();
  }

  function saveClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateMutation.mutate({ claimStatus: editStatus, claimNote: editNote.trim() || null });
  }

  const campaign = campaignsQuery.data?.find((item) => item.id === campaignId);
  const exportDisabled = exporting !== null || !campaign || winnersQuery.isPending || winnersQuery.isError || !winnersQuery.data?.length;

  async function exportList(format: 'xlsx' | 'pdf') {
    if (!campaign) return;
    setExportError('');
    setExportNotice('');
    setExporting(format);
    try {
      // Fetch again so the file includes the latest claim updates for the current filters.
      const winners = await listWinners(campaignId, { drawId: drawId || undefined, claimStatus: claimStatus || undefined });
      const filters = {
        drawNumber: drawsQuery.data?.find((draw) => draw.id === drawId)?.drawNumber,
        claimStatus: claimStatus || undefined,
      };
      if (format === 'xlsx') await exportWinnerListExcel(winners, campaign, filters);
      else await exportWinnerListPdf(winners, campaign, filters);
      setExportNotice(`Exported ${winners.length} ${winners.length === 1 ? 'winner' : 'winners'} to ${format === 'xlsx' ? 'Excel' : 'PDF'}.`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Winners list could not be exported.');
    } finally {
      setExporting(null);
    }
  }

  return (
    <section className="winners-page">
      <div className="campaign-page-heading">
        <div><div className="section-kicker">RESULTS & PRIZE DELIVERY</div><h1>Winners</h1><p>Track prize claims and delivery across your campaign.</p></div>
        {campaignsQuery.data?.length ? <label className="campaign-select-label">CAMPAIGN<select aria-label="Campaign" onChange={(event) => { setCampaignId(event.target.value); setDrawId(''); }} value={campaignId}>{campaignsQuery.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
      </div>

      {campaignsQuery.isPending ? <div className="campaign-loading">Loading campaigns…</div> : campaignsQuery.isError ? <div className="campaign-error">{campaignsQuery.error.message}</div> : !campaignId ? (
        <div className="campaign-empty"><span className="empty-mark"><Trophy size={21} /></span><h2>Create a campaign first</h2><p>Winner records are grouped by campaign.</p></div>
      ) : (
        <>
          <div className="winners-filters">
            <label>DRAW<select aria-label="Filter by draw" onChange={(event) => setDrawId(event.target.value)} value={drawId}><option value="">All draws</option>{drawsQuery.data?.map((draw) => <option key={draw.id} value={draw.id}>Draw {draw.drawNumber}</option>)}</select></label>
            <label>CLAIM STATUS<select aria-label="Filter by claim status" onChange={(event) => setClaimStatus(event.target.value)} value={claimStatus}><option value="">All statuses</option><option value="PENDING">Pending</option><option value="CLAIMED">Claimed</option><option value="DELIVERED">Delivered</option></select></label>
            <div className="winner-filter-total"><Award size={15} /> {winnersQuery.data?.length ?? 0} winners <span>·</span> {campaign?.name}</div>
            <div className="participant-export-actions" role="group" aria-label="Export winners list">
              <button className="quiet-button" disabled={exportDisabled} onClick={() => void exportList('xlsx')} title="Export the filtered winners to Excel" type="button"><FileSpreadsheet size={14} />{exporting === 'xlsx' ? 'Exporting…' : 'Export Excel'}</button>
              <button className="quiet-button" disabled={exportDisabled} onClick={() => void exportList('pdf')} title="Export the filtered winners to PDF" type="button"><FileText size={14} />{exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}</button>
            </div>
          </div>
          {exportNotice && <div className="prize-notice winners-notice" role="status">{exportNotice}</div>}
          {exportError && <div className="campaign-error winners-notice" role="alert">{exportError}</div>}

          <div className="winners-panel">
            {winnersQuery.isPending ? <div className="campaign-loading">Loading winners…</div> : winnersQuery.isError ? <div className="campaign-error">{winnersQuery.error.message}</div> : winnersQuery.data.length === 0 ? (
              <div className="prize-empty"><Trophy size={21} /><strong>No winners match these filters</strong><span>Completed draw results will appear here.</span></div>
            ) : <div className="schedule-table-wrap"><table className="winners-table"><thead><tr><th>WINNER</th><th>DRAW</th><th>PRIZE</th><th>CLAIM STATUS</th><th>UPDATED</th><th /></tr></thead>
              <tbody>{winnersQuery.data.map((winner) => <tr key={winner.id}>
                <td><div className="winner-person"><span>{winner.participant.name.slice(0, 1).toUpperCase()}</span><div><strong>{winner.participant.name}</strong><small>{winner.participant.email || winner.participant.mobile || '—'}</small></div></div></td>
                <td><span className="draw-number">{String(winner.draw.drawNumber).padStart(2, '0')}</span><small className="winner-date">{formatDate(winner.draw.heldAt ?? winner.draw.scheduledAt)}</small>{winner.draw.executionMode && <small className={`draw-mode-tag ${winner.draw.executionMode.toLowerCase()}`}>{winner.draw.executionMode === 'MANUAL' ? 'Manual' : 'Automatic'}</small>}</td>
                <td><div className="winner-prize"><Trophy size={14} /><span><strong>{winner.prize.name}</strong><small>Rank {winner.prize.rank}</small></span></div></td>
                <td><span className={`claim-status ${winner.claimStatus.toLowerCase()}`}><i />{claimLabels[winner.claimStatus]}</span></td>
                <td>{winner.claimUpdatedAt ? formatDate(winner.claimUpdatedAt) : '—'}</td>
                <td><button className="edit-claim-button" onClick={() => openEditor(winner)} aria-label={`Update ${winner.participant.name} claim`}><Pencil size={14} /></button></td>
              </tr>)}</tbody></table></div>}
          </div>
        </>
      )}

      {editing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
        <form className="claim-dialog" onSubmit={saveClaim}>
          <div className="claim-dialog-heading"><span className="result-trophy"><Trophy size={18} /></span><button className="dots-button" aria-label="Close claim editor" onClick={() => setEditing(null)} type="button"><X size={16} /></button></div>
          <div className="section-kicker">WINNER FOLLOW-UP</div><h2>{editing.participant.name}</h2><p className="claim-dialog-prize">{editing.prize.name} · Draw {editing.draw.drawNumber}</p>
          <label>Claim / delivery status<select onChange={(event) => setEditStatus(event.target.value as WinnerClaimStatus)} value={editStatus}><option value="PENDING">Pending</option><option value="CLAIMED">Claimed</option><option value="DELIVERED">Delivered</option></select></label>
          <label>Note <span className="optional-label">OPTIONAL</span><textarea onChange={(event) => setEditNote(event.target.value)} rows={3} value={editNote} /></label>
          {updateMutation.isError && <div className="campaign-error" role="alert">{updateMutation.error.message}</div>}
          <div className="draw-confirm-actions"><button className="quiet-button" onClick={() => setEditing(null)} type="button">Cancel</button><button className="primary-button" disabled={updateMutation.isPending} type="submit"><Check size={14} />{updateMutation.isPending ? 'Saving…' : 'Save update'}</button></div>
        </form>
      </div>}
    </section>
  );
}