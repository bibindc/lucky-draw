import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, CalendarDays, Check, Pencil, Plus, UsersRound, X } from 'lucide-react';
import {
  CampaignApiError,
  createCampaign,
  getCampaign,
  listCampaigns,
  patchDraw,
  type DrawSchedule,
  type NewCampaign,
} from '../../api/campaigns';
import { spreadDrawDates } from '../../utils/drawSchedule';
import { indiaDateTimeToIso, indiaDateTimeValue } from '../../utils/indiaTime';

const campaignQueryKey = ['campaigns'];

type ScheduleField = { dateTime: string; prizeCount: string };
type CampaignForm = {
  name: string;
  durationMonths: string;
  drawCount: string;
  firstDraw: string;
  totalAmount: string;
  perDrawAmount: string;
  draws: ScheduleField[];
};

function localDateTime(date: Date): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function defaultFirstDraw(): string {
  const firstDraw = new Date();
  firstDraw.setDate(firstDraw.getDate() + 14);
  firstDraw.setHours(18, 30, 0, 0);
  return localDateTime(firstDraw);
}

const maxDrawCount = 60;

/** Rebuilds the schedule evenly across the duration (AC-CAM-9), keeping prize counts already entered. */
function withEvenSchedule(form: CampaignForm): CampaignForm {
  const drawCount = Math.max(1, Math.min(maxDrawCount, Number(form.drawCount) || 1));
  const durationMonths = Math.max(1, Number(form.durationMonths) || 1);
  const dates = spreadDrawDates(form.firstDraw, durationMonths, drawCount);
  if (dates.length === 0) return form;
  return {
    ...form,
    draws: dates.map((dateTime, index) => ({ dateTime, prizeCount: form.draws[index]?.prizeCount ?? '5' })),
  };
}

function initialForm(): CampaignForm {
  return withEvenSchedule({
    name: '',
    durationMonths: '5',
    drawCount: '10',
    firstDraw: defaultFirstDraw(),
    totalAmount: '3000',
    perDrawAmount: '300',
    draws: [],
  });
}

function formatCurrency(amountPaise: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amountPaise / 100);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(date));
}


function mutationMessages(error: unknown): string[] {
  if (!(error instanceof CampaignApiError) || !Array.isArray(error.details)) {
    return [error instanceof Error ? error.message : 'Campaign could not be saved.'];
  }

  return error.details.map((issue: { path?: (string | number)[]; message?: string }) =>
    `${issue.path?.join('.') || 'campaign'}: ${issue.message ?? 'Invalid value'}`,
  );
}

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const campaignsQuery = useQuery({ queryKey: campaignQueryKey, queryFn: listCampaigns });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingDraw, setEditingDraw] = useState<DrawSchedule | null>(null);
  const [drawEditForm, setDrawEditForm] = useState({ scheduledAt: '', prizeCount: '1' });
  const selectedQuery = useQuery({
    queryKey: [...campaignQueryKey, selectedId],
    queryFn: () => getCampaign(selectedId!),
    enabled: selectedId !== null,
  });
  const updateDrawMutation = useMutation({
    mutationFn: ({ drawId, scheduledAt, prizeCount }: { drawId: string; scheduledAt: string; prizeCount: number }) =>
      patchDraw(drawId, { scheduledAt, prizeCount }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...campaignQueryKey, selectedId] });
      await queryClient.invalidateQueries({ queryKey: campaignQueryKey });
      setEditingDraw(null);
    },
  });

  function openDrawEditor(draw: DrawSchedule) {
    setEditingDraw(draw);
    setDrawEditForm({ scheduledAt: indiaDateTimeValue(draw.scheduledAt), prizeCount: String(draw.prizeCount) });
    updateDrawMutation.reset();
  }

  function saveDrawEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingDraw?.id) return;
    updateDrawMutation.mutate({
      drawId: editingDraw.id,
      scheduledAt: indiaDateTimeToIso(drawEditForm.scheduledAt),
      prizeCount: Number(drawEditForm.prizeCount),
    });
  }
  const [form, setForm] = useState(initialForm);
  const createMutation = useMutation({
    mutationFn: createCampaign,
    onSuccess: async (campaign) => {
      await queryClient.invalidateQueries({ queryKey: campaignQueryKey });
      setCreating(false);
      setForm(initialForm());
      setSelectedId(campaign.id);
    },
  });

  function updateField(field: keyof Omit<CampaignForm, 'draws'>, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateDraw(index: number, field: keyof ScheduleField, value: string) {
    setForm((current) => ({
      ...current,
      draws: current.draws.map((draw, drawIndex) =>
        drawIndex === index ? { ...draw, [field]: value } : draw,
      ),
    }));
  }

  function updateScheduleField(field: 'durationMonths' | 'drawCount' | 'firstDraw', value: string) {
    setForm((current) => withEvenSchedule({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const campaign: NewCampaign = {
      name: form.name,
      durationMonths: Number(form.durationMonths),
      drawCount: Number(form.drawCount),
      totalAmountPaise: Math.round(Number(form.totalAmount) * 100),
      perDrawAmountPaise: Math.round(Number(form.perDrawAmount) * 100),
      draws: form.draws.map((draw): DrawSchedule => ({
        scheduledAt: new Date(draw.dateTime).toISOString(),
        prizeCount: Number(draw.prizeCount),
      })),
    };
    createMutation.mutate(campaign);
  }

  if (selectedId) {
    const campaign = selectedQuery.data;
    return (
      <section className="campaign-page">
        <button className="campaign-back" onClick={() => setSelectedId(null)}><ArrowLeft size={15} /> All campaigns</button>
        {selectedQuery.isPending ? <div className="campaign-loading">Loading schedule…</div> : campaign ? (
          <>
            <div className="campaign-page-heading">
              <div><div className="section-kicker">CAMPAIGN SCHEDULE</div><h1>{campaign.name}</h1><p>{campaign.durationMonths} months <i /> {campaign.drawCount} draws <i /> {formatCurrency(campaign.totalAmountPaise)}</p></div>
              <span className="campaign-status"><i /> {campaign.status.toLowerCase()}</span>
            </div>
            <div className="schedule-summary"><CalendarDays size={16} /><span>Draw schedule</span><strong>{campaign.draws?.length ?? 0} dates</strong></div>
            <div className="schedule-table-wrap">
              <table className="campaign-table"><thead><tr><th>DRAW</th><th>DATE & TIME (IST)</th><th>PRIZE COUNT</th><th>STATUS</th><th /></tr></thead>
                <tbody>{campaign.draws?.map((draw) => <tr key={draw.id}>
                  <td><span className="draw-number">{String(draw.drawNumber).padStart(2, '0')}</span></td>
                  <td>{formatDate(draw.scheduledAt)}</td><td>{draw.prizeCount}</td>
                  <td><span className={`status-pill ${draw.status === 'COMPLETED' ? 'ready' : 'waiting'}`}><i />{draw.status === 'IN_PROGRESS' ? `in progress · round ${draw.roundsCompleted ?? 0}/${draw.totalRounds ?? 0}` : draw.status?.toLowerCase()}</span></td>
                  <td>{draw.status === 'SCHEDULED' && draw.id && <button className="draw-edit-button" onClick={() => openDrawEditor(draw)} aria-label={`Edit draw ${draw.drawNumber}`}><Pencil size={14} /><span>Edit</span></button>}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </>
        ) : <p className="campaign-error">{selectedQuery.error?.message ?? 'Campaign could not be loaded.'}</p>}
        {editingDraw && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingDraw(null); }}>
          <form aria-labelledby="draw-edit-title" aria-modal="true" className="draw-edit-dialog" onSubmit={saveDrawEdit} role="dialog">
            <div className="draw-edit-heading"><span className="form-icon"><CalendarDays size={17} /></span><button className="dots-button" aria-label="Close draw editor" onClick={() => setEditingDraw(null)} type="button"><X size={16} /></button></div>
            <div className="section-kicker">SCHEDULED DRAW</div>
            <h2 id="draw-edit-title">Edit draw {String(editingDraw.drawNumber).padStart(2, '0')}</h2>
            <p className="draw-edit-caption">Update its schedule or how many prizes will be awarded.</p>
            <label>Date and time (Asia/Kolkata)<input aria-label="Draw date and time" onChange={(event) => setDrawEditForm({ ...drawEditForm, scheduledAt: event.target.value })} required type="datetime-local" value={drawEditForm.scheduledAt} /></label>
            <label>Prize count<input aria-label="Prize count" min="1" onChange={(event) => setDrawEditForm({ ...drawEditForm, prizeCount: event.target.value })} required type="number" value={drawEditForm.prizeCount} /></label>
            {updateDrawMutation.isError && <div className="campaign-error-list" role="alert">{mutationMessages(updateDrawMutation.error).map((message) => <p key={message}>{message}</p>)}</div>}
            <div className="draw-confirm-actions"><button className="quiet-button" onClick={() => setEditingDraw(null)} type="button"><X size={14} /> Cancel</button><button className="primary-button" disabled={updateDrawMutation.isPending} type="submit"><Check size={14} />{updateDrawMutation.isPending ? 'Saving…' : 'Save changes'}</button></div>
          </form>
        </div>}
      </section>
    );
  }

  return (
    <section className="campaign-page">
      <div className="campaign-page-heading">
        <div><div className="section-kicker">PROGRAMME MANAGEMENT</div><h1>Campaigns</h1><p>Create a programme and manage its draw schedule.</p></div>
        {!creating && <button className="primary-button" onClick={() => setCreating(true)}><Plus size={16} /> New campaign</button>}
      </div>

      {creating ? (
        <form className="campaign-form" onSubmit={submit}>
          <div className="campaign-form-title"><div><h2>New campaign</h2><p>Set the campaign terms and schedule each draw.</p></div><button className="quiet-button" onClick={() => setCreating(false)} type="button">Cancel</button></div>
          <div className="campaign-fields">
            <label className="field-wide">Campaign name<input autoFocus onChange={(event) => updateField('name', event.target.value)} required value={form.name} /></label>
            <label>Duration (months)<input min="1" onChange={(event) => updateScheduleField('durationMonths', event.target.value)} required type="number" value={form.durationMonths} /></label>
            <label>Number of draws<input max={maxDrawCount} min="1" onChange={(event) => updateScheduleField('drawCount', event.target.value)} required type="number" value={form.drawCount} /></label>
            <label>First draw<input onChange={(event) => updateScheduleField('firstDraw', event.target.value)} required type="datetime-local" value={form.firstDraw} /></label>
            <label>Total amount (₹)<input min="1" onChange={(event) => updateField('totalAmount', event.target.value)} required type="number" value={form.totalAmount} /></label>
            <label>Per-draw amount (₹)<input min="1" onChange={(event) => updateField('perDrawAmount', event.target.value)} required type="number" value={form.perDrawAmount} /></label>
          </div>
          <div className="schedule-form-heading"><div><h3>Draw schedule</h3><p>Spread evenly across the duration from the first draw. Adjust any date if needed; dates must be unique, future-facing, and in order.</p></div><span>{form.draws.length} draws</span></div>
          <div className="schedule-inputs">
            {form.draws.map((draw, index) => <div className="schedule-input-row" key={index}>
              <span className="draw-number">{String(index + 1).padStart(2, '0')}</span>
              <label>Date and time<input onChange={(event) => updateDraw(index, 'dateTime', event.target.value)} required type="datetime-local" value={draw.dateTime} /></label>
              <label>Prizes<input min="1" onChange={(event) => updateDraw(index, 'prizeCount', event.target.value)} required type="number" value={draw.prizeCount} /></label>
            </div>)}
          </div>
          {createMutation.isError && <div className="campaign-error-list" role="alert">{mutationMessages(createMutation.error).map((message) => <p key={message}>{message}</p>)}</div>}
          <div className="campaign-form-actions"><button className="quiet-button" onClick={() => setCreating(false)} type="button">Cancel</button><button className="primary-button" disabled={createMutation.isPending} type="submit">{createMutation.isPending ? 'Saving…' : 'Create campaign'} <ArrowUpRight size={15} /></button></div>
        </form>
      ) : campaignsQuery.isPending ? <div className="campaign-loading">Loading campaigns…</div> : campaignsQuery.isError ? (
        <div className="campaign-error" role="alert">{campaignsQuery.error.message}</div>
      ) : campaignsQuery.data.length === 0 ? (
        <div className="campaign-empty"><span className="empty-mark"><CalendarDays size={21} /></span><h2>No campaigns yet</h2><p>Create your first programme to begin scheduling draws and enrolling participants.</p><button className="primary-button" onClick={() => setCreating(true)}><Plus size={16} /> Create campaign</button></div>
      ) : (
        <div className="campaign-list">
          <div className="campaign-list-meta"><span>{campaignsQuery.data.length} campaigns</span><span><UsersRound size={14} /> Participant counts</span></div>
          <div className="schedule-table-wrap"><table className="campaign-table"><thead><tr><th>CAMPAIGN</th><th>DRAWS</th><th>PARTICIPANTS</th><th>VALUE</th><th>STATUS</th><th /></tr></thead>
            <tbody>{campaignsQuery.data.map((campaign) => <tr key={campaign.id}>
              <td><button className="campaign-name-link" onClick={() => setSelectedId(campaign.id)}>{campaign.name}<small>{campaign.durationMonths} month programme</small></button></td>
              <td>{campaign._count?.draws ?? campaign.drawCount}</td><td>{campaign._count?.participants ?? 0}</td><td>{formatCurrency(campaign.totalAmountPaise)}</td>
              <td><span className="campaign-status"><i />{campaign.status.toLowerCase()}</span></td>
              <td><button className="row-more" aria-label={`View ${campaign.name}`} onClick={() => setSelectedId(campaign.id)}><ArrowUpRight size={16} /></button></td>
            </tr>)}</tbody></table></div>
        </div>
      )}
    </section>
  );
}