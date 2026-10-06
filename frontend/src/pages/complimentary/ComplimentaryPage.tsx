import { useDeferredValue, useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandHeart, Pencil, Plus, Search, X } from 'lucide-react';
import { listCampaigns } from '../../api/campaigns';
import {
  createComplimentaryOption,
  listCampaignComplimentary,
  listComplimentaryOptions,
  optionImageUrl,
  removeOptionImage,
  updateComplimentaryOption,
  uploadOptionImage,
  type ComplimentaryOption,
  type ComplimentaryRow,
} from '../../api/complimentary';
import ComplimentaryPanel, { complimentaryStatusLabels } from '../../components/ComplimentaryPanel';
import ImageField, { noImageChange, type ImageChange } from '../../components/ImageField';
import ItemImage from '../../components/ItemImage';

type OptionForm = { name: string; description: string; value: string };
const emptyForm: OptionForm = { name: '', description: '', value: '' };

const rupees = (paise: number | null) =>
  paise === null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);

/** AC-CMP-1 and AC-CMP-9: super-admin view of a campaign's complimentary options and participants. */
export default function ComplimentaryPage() {
  const queryClient = useQueryClient();
  const campaignsQuery = useQuery({ queryKey: ['campaigns'], queryFn: listCampaigns });
  const [campaignId, setCampaignId] = useState('');
  const [editing, setEditing] = useState<ComplimentaryOption | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  // AC-CMP-12: the chosen image is uploaded right after the option itself is saved.
  const [imageChange, setImageChange] = useState<ImageChange>(noImageChange);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [managing, setManaging] = useState<ComplimentaryRow | null>(null);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    if (!campaignId && campaignsQuery.data?.length) setCampaignId(campaignsQuery.data[0].id);
  }, [campaignId, campaignsQuery.data]);

  const optionsQuery = useQuery({
    queryKey: ['complimentary-options', campaignId],
    queryFn: () => listComplimentaryOptions(campaignId),
    enabled: Boolean(campaignId),
  });
  const listQuery = useQuery({
    queryKey: ['complimentary-list', campaignId, deferredSearch, status],
    queryFn: () => listCampaignComplimentary(campaignId, { search: deferredSearch.trim(), status }),
    enabled: Boolean(campaignId),
  });

  const refreshOptions = () => queryClient.invalidateQueries({ queryKey: ['complimentary-options', campaignId] });
  const saveMutation = useMutation({
    mutationFn: async () => {
      const input = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        valuePaise: form.value.trim() ? Math.round(Number(form.value) * 100) : null,
      };
      const existing = editing && editing !== 'new' ? editing : null;
      const saved = existing ? await updateComplimentaryOption(existing.id, input) : await createComplimentaryOption(campaignId, input);
      try {
        if (imageChange.file) await uploadOptionImage(saved.id, imageChange.file);
        else if (imageChange.remove && existing?.imageUpdatedAt) await removeOptionImage(saved.id);
      } catch (error) {
        throw new Error(`The option was saved, but its image was not: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
      return saved;
    },
    // The option may have been saved even when its image failed, so refresh either way.
    onSettled: refreshOptions,
    onSuccess: () => { setEditing(null); setForm(emptyForm); setImageChange(noImageChange); },
  });
  const toggleMutation = useMutation({
    mutationFn: (option: ComplimentaryOption) => updateComplimentaryOption(option.id, { isActive: !option.isActive }),
    onSuccess: refreshOptions,
  });

  function openEditor(option: ComplimentaryOption | 'new') {
    setEditing(option);
    setForm(option === 'new' ? emptyForm : { name: option.name, description: option.description ?? '', value: option.valuePaise === null ? '' : String(option.valuePaise / 100) });
    setImageChange(noImageChange);
    saveMutation.reset();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMutation.mutate();
  }

  const valueInvalid = form.value.trim() !== '' && !(Number(form.value) >= 0);

  return (
    <section className="complimentary-page">
      <div className="campaign-page-heading">
        <div><div className="section-kicker">LOYALTY REWARDS</div><h1>Complimentary prizes</h1><p>Participants who pay every draw and don’t win choose a complimentary prize.</p></div>
        {campaignsQuery.data?.length ? <label className="campaign-select-label">CAMPAIGN<select aria-label="Campaign" onChange={(event) => { setCampaignId(event.target.value); setManaging(null); }} value={campaignId}>{campaignsQuery.data.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label> : null}
      </div>

      {campaignsQuery.isPending ? <div className="campaign-loading">Loading campaigns…</div> : !campaignId ? (
        <div className="campaign-empty"><span className="empty-mark"><HandHeart size={21} /></span><h2>Create a campaign first</h2><p>Complimentary prizes belong to a campaign.</p></div>
      ) : (
        <div className="complimentary-layout">
          <article className="participant-history-panel">
            <div className="participant-panel-heading"><h2>Options</h2>{!editing && <button className="text-button" onClick={() => openEditor('new')} type="button"><Plus size={14} /> Add option</button>}</div>
            {editing && <form aria-label={editing === 'new' ? 'New option' : 'Edit option'} className="complimentary-option-form" onSubmit={submit}>
              <label>Name<input aria-label="Option name" maxLength={120} onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} /></label>
              <label>Description <span className="optional-label">OPTIONAL</span><input aria-label="Option description" maxLength={500} onChange={(event) => setForm({ ...form, description: event.target.value })} value={form.description} /></label>
              <label>Value (₹) <span className="optional-label">OPTIONAL</span><input aria-label="Option value" inputMode="decimal" onChange={(event) => setForm({ ...form, value: event.target.value })} value={form.value} /></label>
              <ImageField currentUrl={editing !== 'new' ? optionImageUrl(editing) : null} itemName={form.name || 'Option'} label="Option image" onChange={setImageChange} value={imageChange} />
              {(valueInvalid || saveMutation.isError) && <p className="payment-error" role="alert">{valueInvalid ? 'Enter a value of 0 or more.' : saveMutation.error?.message}</p>}
              <div className="draw-confirm-actions">
                <button className="quiet-button" onClick={() => { setEditing(null); setImageChange(noImageChange); }} type="button">Cancel</button>
                <button className="primary-button" disabled={saveMutation.isPending || valueInvalid || !form.name.trim()} type="submit">{saveMutation.isPending ? 'Saving…' : editing === 'new' ? 'Add option' : 'Save option'}</button>
              </div>
            </form>}
            {optionsQuery.isPending ? <p className="history-empty">Loading options…</p> : optionsQuery.isError ? <p className="payment-error" role="alert">{optionsQuery.error.message}</p> : optionsQuery.data.length === 0 ? (
              <p className="history-empty">No options yet. Add the items participants can choose from.</p>
            ) : <ul aria-label="Complimentary options" className="complimentary-option-list">
              {optionsQuery.data.map((option) => <li className={option.isActive ? '' : 'inactive'} key={option.id}>
                <ItemImage name={option.name} url={optionImageUrl(option)} />
                <div><strong>{option.name}</strong><small>{[option.description, option.valuePaise !== null ? rupees(option.valuePaise) : null].filter(Boolean).join(' · ') || 'No description'}</small></div>
                <span className="complimentary-counts">{option.chosenCount ?? 0} chosen · {option.deliveredCount ?? 0} delivered</span>
                <button aria-label={`Edit ${option.name}`} className="dots-button" onClick={() => openEditor(option)} type="button"><Pencil size={13} /></button>
                <button className="agent-toggle" disabled={toggleMutation.isPending} onClick={() => toggleMutation.mutate(option)} type="button">{option.isActive ? 'Deactivate' : 'Activate'}</button>
              </li>)}
            </ul>}
            {toggleMutation.isError && <p className="payment-error" role="alert">{toggleMutation.error.message}</p>}
          </article>

          <article className="participant-list-panel">
            <div className="participant-toolbar complimentary-toolbar">
              <div className="participant-search"><Search size={16} /><input aria-label="Search complimentary participants" onChange={(event) => setSearch(event.target.value)} placeholder="Search serial, name, mobile or email" value={search} /></div>
              <label className="participant-filter">STATUS<select aria-label="Filter by complimentary status" onChange={(event) => setStatus(event.target.value)} value={status}><option value="">All</option>{Object.entries(complimentaryStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            {listQuery.isPending ? <div className="campaign-loading">Loading participants…</div> : listQuery.isError ? <div className="campaign-error">{listQuery.error.message}</div> : listQuery.data.length === 0 ? (
              <div className="prize-empty"><HandHeart size={21} /><strong>{search || status ? 'No matching participants' : 'Nobody is eligible yet'}</strong><span>Participants qualify once every draw is paid and they haven’t won.</span></div>
            ) : <div className="schedule-table-wrap"><table className="participant-table"><thead><tr><th>NUMBER</th><th>PARTICIPANT</th><th>AGENT</th><th>MOBILE</th><th>CHOICE</th><th>STATUS</th><th /></tr></thead>
              <tbody>{listQuery.data.map((row) => <tr key={row.id}>
                <td><span className="participant-serial">{row.participantNumber}</span></td>
                <td><strong>{row.name}</strong></td>
                <td>{row.agent ? `${row.agent.agentCode} · ${row.agent.name}` : '—'}</td>
                <td>{row.mobile || row.email || '—'}</td>
                <td>{row.choice && row.choice.status !== 'CANCELLED' ? row.choice.option.name : '—'}</td>
                <td><span className={`complimentary-status ${row.status.toLowerCase()}`}>{complimentaryStatusLabels[row.status]}</span></td>
                <td><button aria-label={`Manage ${row.name}`} className="quiet-button" onClick={() => setManaging(row)} type="button">Manage</button></td>
              </tr>)}</tbody></table></div>}
          </article>
        </div>
      )}

      {managing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setManaging(null); }}>
        <section aria-label={`Complimentary prize for ${managing.name}`} aria-modal="true" className="manual-draw-dialog complimentary-dialog" role="dialog">
          <div className="draw-dialog-heading"><div><div className="section-kicker">PARTICIPANT #{managing.participantNumber}</div><h2>{managing.name}</h2></div><button aria-label="Close" className="dots-button" onClick={() => setManaging(null)} type="button"><X size={16} /></button></div>
          <ComplimentaryPanel campaignId={campaignId} participantId={managing.id} />
        </section>
      </div>}
    </section>
  );
}
