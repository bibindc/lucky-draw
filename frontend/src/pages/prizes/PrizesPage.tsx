import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Gift, Plus, Trash2 } from 'lucide-react';
import { listCampaignDraws, listCampaigns } from '../../api/campaigns';
import {
  createPrize,
  deletePrize,
  listPrizes,
  prizeImageUrl,
  removePrizeImage,
  updatePrize,
  uploadPrizeImage,
  type Prize,
  type PrizeInput,
} from '../../api/prizes';
import PrizeImage from '../../components/PrizeImage';
import ImageField, { noImageChange, type ImageChange } from '../../components/ImageField';

const prizeFormDefaults = {
  name: '',
  description: '',
  value: '',
  rank: '1',
  totalQuantity: '1',
};

function formatCurrency(amountPaise: number | null) {
  if (amountPaise === null) return 'Not set';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(amountPaise / 100);
}

export default function PrizesPage() {
  const queryClient = useQueryClient();
  const campaignsQuery = useQuery({ queryKey: ['campaigns'], queryFn: listCampaigns });
  const [campaignId, setCampaignId] = useState('');
  const [selectedDrawId, setSelectedDrawId] = useState('');
  const [formDrawId, setFormDrawId] = useState('');
  const [editing, setEditing] = useState<Prize | null>(null);
  const [form, setForm] = useState(prizeFormDefaults);
  const [notice, setNotice] = useState('');
  // AC-PRZ-8/10: an image chosen in the form is uploaded right after the prize itself is saved.
  const [imageChange, setImageChange] = useState<ImageChange>(noImageChange);
  const drawsQuery = useQuery({
    queryKey: ['campaign-draws', campaignId],
    queryFn: () => listCampaignDraws(campaignId),
    enabled: Boolean(campaignId),
  });
  const prizeQueryKey = ['prizes', campaignId];
  const prizesQuery = useQuery({
    queryKey: [...prizeQueryKey, selectedDrawId],
    queryFn: () => listPrizes(campaignId, selectedDrawId as string | 'unassigned'),
    enabled: Boolean(campaignId && selectedDrawId),
  });

  useEffect(() => {
    if (!campaignId && campaignsQuery.data?.length) setCampaignId(campaignsQuery.data[0].id);
  }, [campaignId, campaignsQuery.data]);

  useEffect(() => {
    if (!drawsQuery.data?.length || selectedDrawId === 'unassigned') return;
    if (!drawsQuery.data.some((draw) => draw.id === selectedDrawId)) {
      const firstDrawId = drawsQuery.data[0].id ?? 'unassigned';
      setSelectedDrawId(firstDrawId);
      setFormDrawId(firstDrawId === 'unassigned' ? '' : firstDrawId);
    }
  }, [drawsQuery.data, selectedDrawId]);

  function resetImage() {
    setImageChange(noImageChange);
  }

  const saveMutation = useMutation({
    mutationFn: async (prize: PrizeInput) => {
      let saved: Prize;
      if (!editing) {
        saved = await createPrize(campaignId, prize);
      } else {
        // Send only what changed: won prizes and prizes in a running draw refuse name/rank/quantity/draw
        // even when unchanged (AC-PRZ-2, AC-DRW-10), and an image-only change needs no prize update at all.
        const current: PrizeInput = {
          drawId: editing.drawId ?? '', name: editing.name, description: editing.description,
          valuePaise: editing.valuePaise, rank: editing.rank, totalQuantity: editing.totalQuantity,
        };
        const changes = Object.fromEntries(
          (Object.keys(prize) as (keyof PrizeInput)[]).filter((key) => prize[key] !== current[key]).map((key) => [key, prize[key]]),
        ) as Partial<PrizeInput>;
        saved = Object.keys(changes).length > 0 ? await updatePrize(editing.id, changes) : editing;
      }
      try {
        if (imageChange.file) await uploadPrizeImage(saved.id, imageChange.file);
        else if (imageChange.remove && editing?.imageUpdatedAt) await removePrizeImage(saved.id);
      } catch (error) {
        throw new Error(`The prize was saved, but its image was not: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
      return saved;
    },
    // The prize may have been saved even when its image failed, so refresh either way.
    onSettled: () => queryClient.invalidateQueries({ queryKey: prizeQueryKey }),
    onSuccess: async () => {
      resetImage();
      setEditing(null);
      setFormDrawId(selectedDrawId === 'unassigned' ? '' : selectedDrawId);
      setForm(prizeFormDefaults);
      setNotice(editing ? 'Prize updated.' : 'Prize added.');
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deletePrize,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: prizeQueryKey });
      setNotice('Prize removed.');
    },
  });

  function editPrize(prize: Prize) {
    setEditing(prize);
    resetImage();
    setNotice('');
    setFormDrawId(prize.drawId ?? '');
    setForm({
      name: prize.name,
      description: prize.description ?? '',
      value: prize.valuePaise === null ? '' : String(prize.valuePaise / 100),
      rank: String(prize.rank),
      totalQuantity: String(prize.totalQuantity),
    });
  }

  function cancelEdit(nextDrawId = selectedDrawId) {
    setEditing(null);
    resetImage();
    setFormDrawId(nextDrawId === 'unassigned' ? '' : nextDrawId);
    setForm(prizeFormDefaults);
    saveMutation.reset();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: PrizeInput = {
      drawId: formDrawId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      valuePaise: form.value === '' ? null : Math.round(Number(form.value) * 100),
      rank: Number(form.rank),
      totalQuantity: Number(form.totalQuantity),
    };
    saveMutation.mutate(input);
  }

  const currentCampaign = campaignsQuery.data?.find((campaign) => campaign.id === campaignId);
  const currentDraw = drawsQuery.data?.find((draw) => draw.id === selectedDrawId);

  return (
    <section className="prizes-page">
      <div className="campaign-page-heading">
        <div><div className="section-kicker">INVENTORY MANAGEMENT</div><h1>Prizes</h1><p>Track prize stock and assignments for each campaign.</p></div>
        <div className="prize-selectors">
          {campaignsQuery.data && campaignsQuery.data.length > 0 && (
            <label className="campaign-select-label">CAMPAIGN
              <select aria-label="Campaign" onChange={(event) => { setCampaignId(event.target.value); setSelectedDrawId(''); cancelEdit(''); }} value={campaignId}>
              {campaignsQuery.data.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
              </select>
            </label>
          )}
          {campaignId && <label className="campaign-select-label">DRAW
            <select aria-label="Draw inventory" onChange={(event) => { setSelectedDrawId(event.target.value); cancelEdit(event.target.value); }} value={selectedDrawId}>
              {drawsQuery.data?.map((draw) => <option key={draw.id} value={draw.id}>Draw {draw.drawNumber} · {new Date(draw.scheduledAt).toLocaleDateString('en-IN')}</option>)}
              <option value="unassigned">Unassigned legacy prizes</option>
            </select>
          </label>}
        </div>
      </div>

      {campaignsQuery.isPending ? <div className="campaign-loading">Loading campaigns…</div> : campaignsQuery.isError ? (
        <div className="campaign-error" role="alert">{campaignsQuery.error.message}</div>
      ) : !campaignId ? (
        <div className="campaign-empty"><span className="empty-mark"><Gift size={21} /></span><h2>Create a campaign first</h2><p>Prizes are tracked separately for each campaign.</p></div>
      ) : (
        <>
          <div className="prize-summary">
            <div><span>INVENTORY</span><strong>{selectedDrawId === 'unassigned' ? 'Unassigned' : currentDraw ? `Draw ${currentDraw.drawNumber}` : currentCampaign?.name}</strong></div>
            <div><span>PRIZES</span><strong>{prizesQuery.data?.length ?? 0}</strong></div>
            <div><span>AVAILABLE</span><strong>{prizesQuery.data?.reduce((total, prize) => total + prize.totalQuantity - prize.assignedQuantity, 0) ?? 0}</strong></div>
            <div><span>ASSIGNED</span><strong>{prizesQuery.data?.reduce((total, prize) => total + prize.assignedQuantity, 0) ?? 0}</strong></div>
          </div>

          <div className="prizes-layout">
            <div className="prize-inventory">
              <div className="prize-inventory-heading"><div><h2>{selectedDrawId === 'unassigned' ? 'Unassigned prizes' : `Draw ${currentDraw?.drawNumber ?? ''} prizes`}</h2><p>Each draw has an independent prize stock.</p></div>
                {!editing && <button className="primary-button" onClick={() => { setEditing(null); setFormDrawId(selectedDrawId === 'unassigned' ? '' : selectedDrawId); setForm(prizeFormDefaults); saveMutation.reset(); }}><Plus size={16} /> Add prize</button>}
              </div>
              {notice && <div className="prize-notice" role="status">{notice}</div>}
              {deleteMutation.isError && <div className="campaign-error" role="alert">{deleteMutation.error.message}</div>}
              {prizesQuery.isPending ? <div className="campaign-loading">Loading prizes…</div> : prizesQuery.isError ? (
                <div className="campaign-error" role="alert">{prizesQuery.error.message}</div>
              ) : prizesQuery.data.length === 0 ? (
                <div className="prize-empty"><Gift size={21} /><strong>{selectedDrawId === 'unassigned' ? 'No unassigned prizes' : 'No prizes assigned to this draw'}</strong><span>{selectedDrawId === 'unassigned' ? 'Legacy prizes will appear here until assigned.' : 'Add inventory for this draw before running it.'}</span><button className="text-button" onClick={() => { setEditing(null); setFormDrawId(selectedDrawId === 'unassigned' ? '' : selectedDrawId); setForm(prizeFormDefaults); }}>Add a prize <ArrowUpRight size={14} /></button></div>
              ) : (
                <div className="prize-list">
                  {prizesQuery.data.map((prize) => {
                    const available = prize.totalQuantity - prize.assignedQuantity;
                    const assigned = prize.assignedQuantity > 0;
                    return <article className="prize-row" key={prize.id}>
                      <span className="prize-rank">{String(prize.rank).padStart(2, '0')}</span>
                      <PrizeImage prize={prize} />
                      <div className="prize-copy"><strong>{prize.name}</strong><small>{prize.description || `Rank ${prize.rank}`}</small></div>
                      <div className="prize-value">{formatCurrency(prize.valuePaise)}</div>
                      <div className="stock-cell"><strong>{available}<small> / {prize.totalQuantity}</small></strong><span>available</span><div className="stock-track"><i style={{ width: `${prize.totalQuantity ? available / prize.totalQuantity * 100 : 0}%` }} /></div></div>
                      <div className="prize-row-actions"><button className="quiet-button" onClick={() => editPrize(prize)} type="button">Edit</button>
                        {!assigned && <button aria-label={`Delete ${prize.name}`} className="delete-button" onClick={() => { if (window.confirm(`Delete ${prize.name}?`)) deleteMutation.mutate(prize.id); }} type="button"><Trash2 size={15} /></button>}
                      </div>
                    </article>;
                  })}
                </div>
              )}
            </div>

            <form className="prize-form" onSubmit={submit}>
              <div className="prize-form-heading"><span className="form-icon"><Gift size={17} /></span><div><h2>{editing ? 'Edit prize' : 'Add a prize'}</h2><p>{editing?.assignedQuantity ? 'Assigned prize: description and value only.' : 'Choose the draw that owns this stock.'}</p></div></div>
              <label>Draw<select aria-label="Prize draw" disabled={Boolean(editing?.assignedQuantity)} onChange={(event) => setFormDrawId(event.target.value)} required value={formDrawId}><option value="">Select a scheduled draw</option>{drawsQuery.data?.filter((draw) => draw.status === 'SCHEDULED' || draw.id === formDrawId).map((draw) => <option key={draw.id} value={draw.id}>Draw {draw.drawNumber}</option>)}</select></label>
              <label>Prize name<input disabled={Boolean(editing?.assignedQuantity)} onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} /></label>
              <label>Description <span className="optional-label">OPTIONAL</span><textarea onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} value={form.description} /></label>
              <label>Value (₹) <span className="optional-label">OPTIONAL</span><input min="0" onChange={(event) => setForm({ ...form, value: event.target.value })} type="number" value={form.value} /></label>
              <div className="prize-form-split"><label>Rank<input disabled={Boolean(editing?.assignedQuantity)} min="1" onChange={(event) => setForm({ ...form, rank: event.target.value })} required type="number" value={form.rank} /></label>
                <label>Quantity<input disabled={Boolean(editing?.assignedQuantity)} min={editing?.assignedQuantity || 1} onChange={(event) => setForm({ ...form, totalQuantity: event.target.value })} required type="number" value={form.totalQuantity} /></label></div>
              <ImageField currentUrl={editing ? prizeImageUrl(editing) : null} itemName={form.name || 'Prize'} label="Prize image" onChange={setImageChange} value={imageChange} />
              {saveMutation.isError && <div className="campaign-error" role="alert">{saveMutation.error.message}</div>}
              <div className="prize-form-actions">{editing && <button className="quiet-button" onClick={() => cancelEdit()} type="button">Cancel</button>}<button className="primary-button" disabled={saveMutation.isPending || !campaignId || !formDrawId} type="submit">{saveMutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add prize'}</button></div>
            </form>
          </div>
        </>
      )}
    </section>
  );
}