import { useDeferredValue, useEffect, useState, type FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, ArrowUpRight, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, Pencil, Plus, Search, UserRoundPlus, UsersRound, X } from 'lucide-react';
import { listAgents } from '../../api/agents';
import { listCampaigns } from '../../api/campaigns';
import {
  createParticipant,
  exportParticipants,
  getNextSerial,
  getParticipant,
  nextSerialFromError,
  serialRange,
  listParticipants,
  recordPayment,
  updateParticipant,
  type NewParticipant,
  type Participant,
  type ParticipantSort,
} from '../../api/participants';
import ComplimentaryPanel from '../../components/ComplimentaryPanel';
import PendingRequestsPanel from '../../components/PendingRequestsPanel';
import PrizeClaimPanel from '../../components/PrizeClaimPanel';
import { submitApprovalRequest } from '../../api/approvals';
import { exportParticipantPdf } from '../../utils/participantPdf';
import {
  exportParticipantListExcel,
  exportParticipantListPdf,
  participantStatusLabels as statusLabels,
} from '../../utils/participantListExport';

function statusClass(status: Participant['status']) {
  return status.toLowerCase().replace('_', '-');
}

function serialProblem(value: string): string {
  if (!value.trim()) return 'Enter a serial number.';
  const serial = Number(value);
  if (!/^\d+$/.test(value.trim()) || serial < serialRange.min || serial > serialRange.max) {
    return `Serial number must be a whole number between ${serialRange.min} and ${serialRange.max}.`;
  }
  return '';
}

function formError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Participant could not be added.';
}

const pageSizes = [25, 50, 100] as const;

type ParticipantsPageProps = {
  role: 'SUPER_ADMIN' | 'AGENT';
  agentCode?: string;
};

export default function ParticipantsPage({ role = 'SUPER_ADMIN', agentCode }: Partial<ParticipantsPageProps>) {
  const queryClient = useQueryClient();
  const campaignsQuery = useQuery({ queryKey: ['campaigns'], queryFn: listCampaigns });
  const [campaignId, setCampaignId] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  // AC-PAR-29/30: list order and page; any change to filters or order returns to the first page.
  const [sort, setSort] = useState<{ key: ParticipantSort; order: 'asc' | 'desc' }>({ key: 'newest', order: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(pageSizes[0]);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [listExporting, setListExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const [listExportError, setListExportError] = useState('');
  const [notice, setNotice] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentCount, setPaymentCount] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'UPI' | 'BANK_TRANSFER' | 'OTHER'>('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const [form, setForm] = useState<NewParticipant>({ name: '', email: '', mobile: '', externalUserId: '', agentId: '', address: '' });
  const [profileForm, setProfileForm] = useState<NewParticipant>({ name: '', email: '', mobile: '', externalUserId: '', agentId: '', address: '' });
  // Serial numbers are edited as text so a half-typed value can be shown and validated.
  const [serialInput, setSerialInput] = useState('');
  const [profileSerial, setProfileSerial] = useState('');
  const [serialError, setSerialError] = useState('');
  // Prefill once per opening of the form, so clearing the field to type another number is not undone.
  const [serialPrefilled, setSerialPrefilled] = useState(false);
  const nextSerialQuery = useQuery({ queryKey: ['next-serial'], queryFn: getNextSerial, enabled: adding, staleTime: 0 });
  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: () => listAgents(),
    enabled: role === 'SUPER_ADMIN',
  });
  const deferredSearch = useDeferredValue(search);
  const listKey = ['participants', campaignId, deferredSearch, status, agentFilter, sort.key, sort.order, page, pageSize];
  const participantQuery = useQuery({
    queryKey: listKey,
    queryFn: () => listParticipants(campaignId, {
      search: deferredSearch.trim(),
      status,
      agentId: role === 'SUPER_ADMIN' ? agentFilter : '',
      page,
      pageSize,
      sort: sort.key,
      order: sort.key === 'newest' ? undefined : sort.order,
    }),
    enabled: Boolean(campaignId) && !selectedId,
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
  const pagination = participantQuery.data?.pagination;
  const pageCount = Math.max(1, pagination?.pageCount ?? 1);

  // A page past the end (e.g. after a filter shrinks the list) falls back to the last page.
  useEffect(() => {
    if (pagination && pagination.total > 0 && page > pagination.pageCount) setPage(pagination.pageCount);
  }, [page, pagination]);

  function toggleSort(key: Exclude<ParticipantSort, 'newest'>) {
    setSort((current) => current.key === key ? { key, order: current.order === 'asc' ? 'desc' : 'asc' } : { key, order: 'asc' });
    setPage(1);
  }

  function sortHeader(key: Exclude<ParticipantSort, 'newest'>, label: string) {
    const active = sort.key === key;
    const Icon = !active ? ArrowUpDown : sort.order === 'asc' ? ArrowUp : ArrowDown;
    return <th aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className={`sort-header${active ? ' active' : ''}`} onClick={() => toggleSort(key)} type="button">{label}<Icon aria-hidden size={11} /></button>
    </th>;
  }
  const detailQuery = useQuery({
    queryKey: ['participant', selectedId],
    queryFn: () => getParticipant(selectedId!),
    enabled: selectedId !== null,
  });

  useEffect(() => {
    if (!campaignId && campaignsQuery.data?.length) setCampaignId(campaignsQuery.data[0].id);
  }, [campaignId, campaignsQuery.data]);

  // AC-PAR-23: prefill the suggested serial when the form opens; the user can overwrite it.
  useEffect(() => {
    if (adding && !serialPrefilled && typeof nextSerialQuery.data === 'number') {
      setSerialInput(String(nextSerialQuery.data));
      setSerialPrefilled(true);
    }
  }, [adding, serialPrefilled, nextSerialQuery.data]);

  // AC-APR-1: agents' changes become approval requests; super admins change records directly.
  const isAgent = role === 'AGENT';
  const refreshRequests = () => queryClient.invalidateQueries({ queryKey: ['approval-requests'] });

  const createMutation = useMutation({
    mutationFn: async (participant: NewParticipant) => {
      if (isAgent) {
        await submitApprovalRequest({ type: 'PARTICIPANT_CREATE', campaignId, payload: participant });
        return null;
      }
      return createParticipant(campaignId, participant);
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['participants', campaignId] });
      await queryClient.invalidateQueries({ queryKey: ['next-serial'] });
      await refreshRequests();
      setNotice(created
        ? `${form.name} was added successfully with serial number ${created.participantNumber}.`
        : `Sent for approval: ${form.name} will be added once a super admin approves.`);
      closeAddForm();
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: ['next-serial'] }),
  });

  function closeAddForm() {
    setAdding(false);
    setForm({ name: '', email: '', mobile: '', externalUserId: '', agentId: '', address: '' });
    setSerialInput('');
    setSerialPrefilled(false);
    setSerialError('');
    createMutation.reset();
  }
  const paymentMutation = useMutation({
    mutationFn: async () => {
      const details = { count: Number(paymentCount), method: paymentMethod, reference: paymentReference.trim() || undefined };
      if (isAgent) await submitApprovalRequest({ type: 'PAYMENT', participantId: selectedId!, payload: details });
      else await recordPayment(selectedId!, details);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['participant', selectedId] });
      await queryClient.invalidateQueries({ queryKey: ['participants', campaignId] });
      await refreshRequests();
      setPaymentOpen(false);
      setPaymentReference('');
      if (isAgent) setNotice('Sent for approval: the payment will be recorded once a super admin approves.');
    },
  });
  const editMutation = useMutation({
    mutationFn: async (changes: Partial<NewParticipant>) => {
      if (!isAgent) return updateParticipant(selectedId!, changes);
      // Agents cannot change ownership or the serial number (AC-PAR-13, AC-PAR-24).
      const { agentId: _agent, participantNumber: _serial, ...details } = changes;
      void _agent; void _serial;
      // Send only what changed, so the request shows the actual edit.
      const current = detailQuery.data as Record<string, unknown> | undefined;
      const changed = Object.fromEntries(Object.entries(details).filter(([key, value]) => (current?.[key] ?? '') !== (value ?? '')));
      if (Object.keys(changed).length === 0) throw new Error('No changes to send for approval.');
      await submitApprovalRequest({ type: 'PARTICIPANT_UPDATE', participantId: selectedId!, payload: changed });
      return null;
    },
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['participant', selectedId] });
      await queryClient.invalidateQueries({ queryKey: ['participants', campaignId] });
      await refreshRequests();
      setEditingProfile(false);
      setNotice(updated ? 'Participant details updated.' : 'Sent for approval: the changes will apply once a super admin approves.');
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = serialProblem(serialInput);
    setSerialError(problem);
    if (problem) return;
    const participant = Object.fromEntries(
      Object.entries(form).filter(([, value]) => typeof value === 'string' && value.trim()),
    ) as NewParticipant;
    if (role !== 'SUPER_ADMIN') delete participant.agentId;
    createMutation.mutate({ ...participant, participantNumber: Number(serialInput) });
  }

  const currentCampaign = campaignsQuery.data?.find((campaign) => campaign.id === campaignId);
  const unpaidScheduledDraws = detailQuery.data?.drawPayments?.filter(
    (payment) => payment.status === 'NOT_PAID' && payment.draw.status === 'SCHEDULED',
  ) ?? [];
  const paymentAmount = Number(paymentCount) * (currentCampaign?.perDrawAmountPaise ?? 0);
  const exportDisabled = listExporting !== null || !currentCampaign || participantQuery.isPending || participantQuery.isError
    || !participantQuery.data?.pagination.total;
  const formattedPaymentAmount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paymentAmount / 100);

  async function exportPdf(participant: NonNullable<typeof detailQuery.data>) {
    if (!currentCampaign) return;
    setPdfError('');
    setExportingPdf(true);
    try {
      await exportParticipantPdf(participant, currentCampaign);
      setNotice(`PDF exported for participant ${participant.participantNumber}.`);
    } catch (error) {
      setPdfError(formError(error));
    } finally {
      setExportingPdf(false);
    }
  }

  async function exportList(format: 'xlsx' | 'pdf') {
    if (!currentCampaign) return;
    setListExportError('');
    setNotice('');
    setListExporting(format);
    try {
      // Use the live search text rather than the deferred one so the file matches what was typed.
      const agentId = role === 'SUPER_ADMIN' ? agentFilter : '';
      const { participants } = await exportParticipants(campaignId, search.trim(), status, agentId);
      const selectedAgent = agentsQuery.data?.find((agent) => agent.id === agentId);
      const filters = {
        search,
        status,
        agentLabel: role === 'AGENT' ? agentCode : selectedAgent ? `${selectedAgent.agentCode} · ${selectedAgent.name}` : undefined,
      };
      if (format === 'xlsx') await exportParticipantListExcel(participants, currentCampaign, filters);
      else await exportParticipantListPdf(participants, currentCampaign, filters);
      setNotice(`Exported ${participants.length} ${participants.length === 1 ? 'participant' : 'participants'} to ${format === 'xlsx' ? 'Excel' : 'PDF'}.`);
    } catch (error) {
      setListExportError(error instanceof Error ? error.message : 'Participant list could not be exported.');
    } finally {
      setListExporting(null);
    }
  }

  function openProfileEditor(participant: NonNullable<typeof detailQuery.data>) {
    setEditingProfile(true);
    setNotice('');
    setProfileForm({
      name: participant.name,
      email: participant.email ?? '',
      mobile: participant.mobile ?? '',
      externalUserId: participant.externalUserId ?? '',
      agentId: participant.agentId ?? '',
      address: participant.address ?? '',
    });
    setProfileSerial(String(participant.participantNumber));
    setSerialError('');
    editMutation.reset();
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const changes = Object.fromEntries(
      Object.entries(profileForm)
        .filter(([key]) => key === 'agentId' ? role === 'SUPER_ADMIN' : true)
        .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]),
    ) as Partial<NewParticipant>;
    // AC-PAR-24: only a super admin can change the serial, and only send it when it actually changed.
    if (role === 'SUPER_ADMIN' && profileSerial.trim() !== String(detailQuery.data?.participantNumber)) {
      const problem = serialProblem(profileSerial);
      setSerialError(problem);
      if (problem) return;
      changes.participantNumber = Number(profileSerial);
    }
    editMutation.mutate(changes);
  }

  if (selectedId) {
    const participant = detailQuery.data;
    return (
      <section className="participants-page">
        <button className="campaign-back" onClick={() => setSelectedId(null)}><ArrowLeft size={15} /> Participants</button>
        {detailQuery.isPending ? <div className="campaign-loading">Loading participant…</div> : participant ? (
          <>
            <div className="participant-detail-heading">
              <span className="participant-avatar">{participant.name.slice(0, 1).toUpperCase()}</span>
              <div><div className="section-kicker">PARTICIPANT #{participant.participantNumber}</div><h1>{participant.name}</h1><p>{participant.mobile || participant.email || 'No contact details'}{participant.agent ? ` · ${participant.agent.agentCode} ${participant.agent.name}` : ''}</p>{participant.address && <p className="participant-address" aria-label="Address">{participant.address}</p>}</div>
              <span className={`participant-status ${statusClass(participant.status)}`}>{statusLabels[participant.status]}</span>
              <div className="participant-detail-actions"><button className="quiet-button" onClick={() => openProfileEditor(participant)}><Pencil size={14} /> Edit details</button><button className="primary-button" disabled={!currentCampaign || exportingPdf} onClick={() => void exportPdf(participant)}><Download size={15} />{exportingPdf ? 'Exporting…' : 'Export PDF'}</button></div>
            </div>
            {notice && <div className="prize-notice participant-notice" role="status">{notice}</div>}
            {pdfError && <div className="campaign-error participant-notice" role="alert">{pdfError}</div>}
            {editingProfile && <form className="participant-edit-form" onSubmit={saveProfile}>
              <div className="participant-form-heading"><div><h2>Edit participant</h2><p>{role === 'SUPER_ADMIN' ? 'Campaign and participation history cannot be changed.' : 'Serial number, campaign and participation history cannot be changed.'}</p></div><button className="quiet-button" onClick={() => { setEditingProfile(false); editMutation.reset(); }} type="button"><X size={14} /> Cancel</button></div>
              <div className="participant-form-fields">
                {role === 'SUPER_ADMIN'
                  ? <label>Serial number<input aria-describedby="profile-serial-help" aria-label="Serial number" inputMode="numeric" maxLength={4} onChange={(event) => { setProfileSerial(event.target.value.replace(/\D/g, '')); setSerialError(''); }} required value={profileSerial} /><small className="field-help" id="profile-serial-help">{serialRange.min}–{serialRange.max}, unique across all campaigns</small></label>
                  : <label>Serial number<input aria-label="Serial number" readOnly value={participant.participantNumber} /></label>}
                <label>Name<input autoFocus onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} required value={profileForm.name} /></label>
                {role === 'SUPER_ADMIN' ? <label>Assigned agent<select aria-label="Assigned agent" onChange={(event) => setProfileForm({ ...profileForm, agentId: event.target.value })} required value={profileForm.agentId}><option value="">Select an active agent</option>{agentsQuery.data?.filter((agent) => agent.isActive || agent.id === profileForm.agentId).map((agent) => <option key={agent.id} value={agent.id}>{agent.agentCode} · {agent.name}{agent.isActive ? '' : ' (inactive)'}</option>)}</select></label> : <label>Agent<input aria-label="Assigned agent" readOnly value={participant.agent ? `${participant.agent.agentCode} · ${participant.agent.name}` : agentCode ?? 'Current agent'} /></label>}
                <label>Email <span className="optional-label">OPTIONAL</span><input onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })} type="email" value={profileForm.email} /></label>
                <label>Mobile <span className="optional-label">OPTIONAL</span><input inputMode="numeric" maxLength={10} onChange={(event) => setProfileForm({ ...profileForm, mobile: event.target.value.replace(/\D/g, '') })} pattern="[6-9][0-9]{9}" value={profileForm.mobile} /></label>
                <label>User ID <span className="optional-label">OPTIONAL</span><input onChange={(event) => setProfileForm({ ...profileForm, externalUserId: event.target.value })} value={profileForm.externalUserId} /></label>
                <label className="participant-address-field">Address <span className="optional-label">OPTIONAL</span><textarea maxLength={500} onChange={(event) => setProfileForm({ ...profileForm, address: event.target.value })} rows={3} value={profileForm.address} /></label>
              </div>
              {(serialError || editMutation.isError) && <div className="campaign-error" role="alert">
                {serialError || formError(editMutation.error)}
                {!serialError && nextSerialFromError(editMutation.error) !== null && <button className="text-button serial-suggestion" onClick={() => { setProfileSerial(String(nextSerialFromError(editMutation.error))); editMutation.reset(); }} type="button">Use {nextSerialFromError(editMutation.error)}</button>}
              </div>}
              <div className="participant-form-actions"><button className="quiet-button" onClick={() => { setEditingProfile(false); editMutation.reset(); }} type="button">Cancel</button><button className="primary-button" disabled={editMutation.isPending} type="submit">{editMutation.isPending ? 'Sending…' : isAgent ? 'Send for approval' : 'Save changes'}</button></div>
            </form>}
            <div className="participant-detail-grid">
              <section className="participant-history-panel"><div className="participant-panel-heading"><h2>Draw participation</h2><span>{participant.drawPayments?.length ?? 0} draws</span></div>
                <div className="participant-draw-list">{participant.drawPayments?.map((payment) => <div className="participant-draw-row" key={payment.id}>
                  <span className="draw-number">{String(payment.draw.drawNumber).padStart(2, '0')}</span><div><strong>Draw {payment.draw.drawNumber}</strong><small>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(payment.draw.scheduledAt))}</small></div>
                  {payment.retainedCredit && <span className="retained-note">Retained credit</span>}
                  <span className={`payment-status ${payment.status.toLowerCase().replace('_', '-')}`}>{payment.status.replace('_', ' ').toLowerCase()}</span>
                </div>)}</div>
              </section>
              <section className="participant-history-panel"><div className="participant-panel-heading"><div><h2>Payment history</h2><span>{participant.paymentTransactions?.length ?? 0} entries</span></div>{participant.status !== 'WINNER' && unpaidScheduledDraws.length > 0 && <button className="text-button" onClick={() => setPaymentOpen(true)}><Plus size={14} /> {isAgent ? 'Request payment' : 'Record payment'}</button>}</div>
                {participant.paymentTransactions?.length ? <div className="payment-history-list">{participant.paymentTransactions.map((entry) => <div className="payment-history-row" key={entry.id}><strong>₹{(entry.amountPaise / 100).toLocaleString('en-IN')}</strong><span>{entry.method.replaceAll('_', ' ').toLowerCase()}</span><small>{entry.status.toLowerCase()} · {new Date(entry.createdAt).toLocaleDateString('en-IN')}</small></div>)}</div> : <p className="history-empty">No payments recorded yet.</p>}
              </section>
            </div>
            <PendingRequestsPanel participantId={participant.id} />
            <PrizeClaimPanel participant={participant} role={role} />
            {campaignId && <ComplimentaryPanel campaignId={campaignId} participantId={participant.id} role={role} />}
            {paymentOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaymentOpen(false); }}>
              <form className="payment-dialog" onSubmit={(event) => { event.preventDefault(); paymentMutation.mutate(); }}>
                <div className="payment-dialog-heading"><div><div className="section-kicker">{isAgent ? 'REQUEST PAYMENT · NEEDS APPROVAL' : 'RECORD PAYMENT'}</div><h2>{participant.name}</h2></div><button className="dots-button" aria-label="Close payment dialog" onClick={() => setPaymentOpen(false)} type="button">×</button></div>
                <label>Draws to cover<select aria-label="Draws to cover" onChange={(event) => setPaymentCount(event.target.value)} value={paymentCount}>{unpaidScheduledDraws.map((_, index) => <option key={index} value={index + 1}>{index + 1} {index === 0 ? 'draw' : 'draws'} · {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(((index + 1) * (currentCampaign?.perDrawAmountPaise ?? 0)) / 100)}</option>)}</select></label>
                <div className="payment-amount"><span>AMOUNT DUE</span><strong>{formattedPaymentAmount}</strong><small>{paymentCount} × {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((currentCampaign?.perDrawAmountPaise ?? 0) / 100)} per draw</small></div>
                <label>Payment method<select onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)} value={paymentMethod}><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="BANK_TRANSFER">Bank transfer</option><option value="OTHER">Other</option></select></label>
                <label>Reference note <span className="optional-label">OPTIONAL</span><input onChange={(event) => setPaymentReference(event.target.value)} value={paymentReference} /></label>
                {paymentMutation.isError && <p className="payment-error" role="alert">{paymentMutation.error.message}</p>}
                <div className="payment-dialog-actions"><button className="quiet-button" onClick={() => setPaymentOpen(false)} type="button">Cancel</button><button className="primary-button" disabled={paymentMutation.isPending} type="submit">{paymentMutation.isPending ? 'Sending…' : isAgent ? 'Send for approval' : 'Confirm payment'}</button></div>
              </form>
            </div>}
          </>
        ) : <div className="campaign-error">{detailQuery.error?.message}</div>}
      </section>
    );
  }

  return (
    <section className="participants-page">
      <div className="campaign-page-heading">
        <div><div className="section-kicker">PEOPLE & ELIGIBILITY</div><h1>Participants</h1><p>Manage enrolment, payment status, and draw history.</p></div>
        <div className="participant-filters">
          {campaignsQuery.data?.length ? <label className="campaign-select-label">CAMPAIGN<select aria-label="Campaign" onChange={(event) => { setCampaignId(event.target.value); setAgentFilter(''); setPage(1); }} value={campaignId}>{campaignsQuery.data.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label> : null}
          {role === 'SUPER_ADMIN' && <label className="campaign-select-label">AGENT<select aria-label="Filter by agent" onChange={(event) => { setAgentFilter(event.target.value); setPage(1); }} value={agentFilter}><option value="">All agents</option>{agentsQuery.data?.map((agent) => <option key={agent.id} value={agent.id}>{agent.agentCode} · {agent.name}</option>)}</select></label>}
        </div>
      </div>

      {campaignsQuery.isPending ? <div className="campaign-loading">Loading campaigns…</div> : campaignsQuery.isError ? <div className="campaign-error">{campaignsQuery.error.message}</div> : !campaignId ? (
        <div className="campaign-empty"><span className="empty-mark"><UsersRound size={21} /></span><h2>Create a campaign first</h2><p>Participants are enrolled in a specific campaign.</p></div>
      ) : (
        <>
          {notice && <div className="prize-notice participant-notice" role="status">{notice}</div>}
          <div className="participant-toolbar">
            <div className="participant-search"><Search size={16} /><input aria-label="Search participants" onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search serial no., name, email, mobile, or ID" value={search} /></div>
            <label className="participant-filter">STATUS<select aria-label="Filter by status" onChange={(event) => { setStatus(event.target.value); setPage(1); }} value={status}><option value="">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <div className="participant-export-actions" role="group" aria-label="Export participant list">
              <button className="quiet-button" disabled={exportDisabled} onClick={() => void exportList('xlsx')} title="Export the filtered list to Excel" type="button"><FileSpreadsheet size={14} />{listExporting === 'xlsx' ? 'Exporting…' : 'Export Excel'}</button>
              <button className="quiet-button" disabled={exportDisabled} onClick={() => void exportList('pdf')} title="Export the filtered list to PDF" type="button"><FileText size={14} />{listExporting === 'pdf' ? 'Exporting…' : 'Export PDF'}</button>
            </div>
            {!adding && <button className="primary-button" onClick={() => { setNotice(''); setAdding(true); }}><UserRoundPlus size={16} /> Add participant</button>}
          </div>
          {listExportError && <div className="campaign-error participant-notice" role="alert">{listExportError}</div>}

          {adding && <form className="participant-add-form" onSubmit={submit}>
            <div className="participant-form-heading"><div><h2>Add participant</h2><p>At least one contact method is required.</p></div><button className="quiet-button" onClick={closeAddForm} type="button">Cancel</button></div>
            <div className="participant-form-fields">
              <label>Serial number
                <input aria-describedby="new-serial-help" aria-label="Serial number" inputMode="numeric" maxLength={4} onChange={(event) => { setSerialInput(event.target.value.replace(/\D/g, '')); setSerialError(''); }} placeholder={nextSerialQuery.isPending ? 'Loading…' : undefined} required value={serialInput} />
                <small className="field-help" id="new-serial-help">
                  {nextSerialQuery.data === null
                    ? `All serial numbers ${serialRange.min}–${serialRange.max} are in use.`
                    : `Suggested ${nextSerialQuery.data ?? '…'} · you can type another unused number (${serialRange.min}–${serialRange.max})`}
                </small>
              </label>
              <label>Name<input autoFocus onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} /></label>
              {role === 'SUPER_ADMIN' ? <label>Assigned agent<select aria-label="Assigned agent" onChange={(event) => setForm({ ...form, agentId: event.target.value })} required value={form.agentId}><option value="">Select an agent</option>{agentsQuery.data?.filter((agent) => agent.isActive).map((agent) => <option key={agent.id} value={agent.id}>{agent.agentCode} · {agent.name}</option>)}</select></label> : <label>Agent<input aria-label="Assigned agent" readOnly value={agentCode ?? 'Current agent'} /></label>}
              <label>Email <span className="optional-label">OPTIONAL</span><input onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" value={form.email} /></label>
              <label>Mobile <span className="optional-label">OPTIONAL</span><input inputMode="numeric" maxLength={10} onChange={(event) => setForm({ ...form, mobile: event.target.value.replace(/\D/g, '') })} pattern="[6-9][0-9]{9}" value={form.mobile} /></label>
              <label>User ID <span className="optional-label">OPTIONAL</span><input onChange={(event) => setForm({ ...form, externalUserId: event.target.value })} value={form.externalUserId} /></label>
              <label className="participant-address-field">Address <span className="optional-label">OPTIONAL</span><textarea maxLength={500} onChange={(event) => setForm({ ...form, address: event.target.value })} rows={3} value={form.address} /></label>
            </div>
            {(serialError || createMutation.isError) && <div className="campaign-error" role="alert">
              {serialError || formError(createMutation.error)}
              {!serialError && nextSerialFromError(createMutation.error) !== null && <button className="text-button serial-suggestion" onClick={() => { setSerialInput(String(nextSerialFromError(createMutation.error))); createMutation.reset(); }} type="button">Use {nextSerialFromError(createMutation.error)}</button>}
            </div>}
            <div className="participant-form-actions"><button className="quiet-button" onClick={closeAddForm} type="button">Cancel</button><button className="primary-button" disabled={createMutation.isPending} type="submit">{createMutation.isPending ? 'Sending…' : isAgent ? 'Send for approval' : 'Add participant'}</button></div>
          </form>}

          <div className="participant-list-panel">
            <div className="participant-list-heading"><div><h2>{currentCampaign?.name}</h2><p>{pagination?.total ?? 0} participants</p></div><div className="participant-list-tools">{sort.key !== 'newest' && <button className="text-button" onClick={() => { setSort({ key: 'newest', order: 'desc' }); setPage(1); }} type="button">Show newest first</button>}<span className="participant-list-note">Payment status for each scheduled draw</span></div></div>
            {participantQuery.isPending ? <div className="campaign-loading">Loading participants…</div> : participantQuery.isError ? <div className="campaign-error">{participantQuery.error.message}</div> : participantQuery.data.participants.length === 0 ? (
              <div className="prize-empty"><UsersRound size={21} /><strong>{search || status ? 'No matching participants' : 'No participants yet'}</strong><span>{search || status ? 'Try another search or status.' : 'Add the first participant to this campaign.'}</span></div>
            ) : <div className="schedule-table-wrap"><table className="participant-table"><thead><tr>{sortHeader('serial', 'NUMBER')}{sortHeader('name', 'PARTICIPANT')}<th>ADDRESS</th>{role === 'SUPER_ADMIN' && <th>AGENT</th>}<th>CONTACT</th><th>STATUS</th><th>PAID DRAWS</th><th /></tr></thead>
              <tbody>{participantQuery.data.participants.map((participant) => <tr key={participant.id}>
                <td><span className="participant-serial">{participant.participantNumber}</span></td>
                <td><button className="participant-name-link" onClick={() => setSelectedId(participant.id)}><span className="participant-avatar small">{participant.name.slice(0, 1).toUpperCase()}</span><strong>{participant.name}</strong></button></td>
                {/* AC-PAR-27: one line beside the name; the full address is on hover. */}
                <td>{participant.address ? <span className="participant-list-address" title={participant.address}>{participant.address.replace(/\s*\n\s*/g, ', ')}</span> : '—'}</td>
                {role === 'SUPER_ADMIN' && <td>{participant.agent ? <span className="participant-agent-tag">{participant.agent.agentCode} · {participant.agent.name}</span> : '—'}</td>}
                <td><span className="participant-contact">{participant.mobile || participant.email || '—'}</span></td>
                <td><span className={`participant-status ${statusClass(participant.status)}`}>{statusLabels[participant.status]}</span></td>
                <td>{participant.drawPayments?.filter((payment) => payment.status === 'PAID').length ?? 0} / {participant.drawPayments?.length ?? 0}</td>
                <td><button className="row-more" aria-label={`View ${participant.name}`} onClick={() => setSelectedId(participant.id)}><ArrowUpRight size={16} /></button></td>
              </tr>)}</tbody></table></div>}
            {pagination && pagination.total > 0 && <nav aria-label="Participant pages" className="participant-pagination">
              <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, pagination.total)} of {pagination.total}</span>
              <label>Rows per page<select aria-label="Rows per page" onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} value={pageSize}>{pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
              <div className="participant-page-buttons">
                <button aria-label="Previous page" className="quiet-button" disabled={page <= 1} onClick={() => setPage(page - 1)} type="button"><ChevronLeft size={14} /> Previous</button>
                <span aria-current="page">Page {page} of {pageCount}</span>
                <button aria-label="Next page" className="quiet-button" disabled={page >= pageCount} onClick={() => setPage(page + 1)} type="button">Next <ChevronRight size={14} /></button>
              </div>
            </nav>}
          </div>
        </>
      )}
    </section>
  );
}