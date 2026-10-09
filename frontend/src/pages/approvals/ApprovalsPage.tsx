import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardCheck, Pencil, X } from 'lucide-react';
import { listAgents } from '../../api/agents';
import {
  approveApprovalRequest,
  describePayload,
  getApprovalRequest,
  listApprovalRequests,
  rejectApprovalRequest,
  requestStatusLabels,
  requestTypeLabels,
  type ApprovalRequestDetail,
  type RequestPayload,
  type RequestType,
} from '../../api/approvals';
import { listComplimentaryOptions } from '../../api/complimentary';
import { indiaDateTimeToIso, indiaDateTimeValue, indiaDateValue } from '../../utils/indiaTime';
import { participantLabel } from './MyRequestsPage';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value));
}

type Field = { key: string; label: string; kind?: 'number' | 'textarea' | 'select' | 'date' | 'datetime'; options?: [string, string][] };

const participantFields: Field[] = [
  { key: 'name', label: 'Name' }, { key: 'mobile', label: 'Mobile' }, { key: 'email', label: 'Email' },
  { key: 'externalUserId', label: 'User ID' }, { key: 'address', label: 'Address', kind: 'textarea' },
];

function fieldsFor(type: RequestType, payload: RequestPayload, optionChoices: [string, string][]): Field[] {
  switch (type) {
    case 'PARTICIPANT_CREATE': return [{ key: 'participantNumber', label: 'Serial number', kind: 'number' }, ...participantFields];
    // Only the fields the agent asked to change.
    case 'PARTICIPANT_UPDATE': return participantFields.filter(({ key }) => key in payload);
    case 'PAYMENT': return [
      { key: 'count', label: 'Upcoming draws', kind: 'number' },
      { key: 'method', label: 'Method', kind: 'select', options: [['CASH', 'Cash'], ['UPI', 'UPI'], ['BANK_TRANSFER', 'Bank transfer'], ['OTHER', 'Other']] },
      { key: 'reference', label: 'Reference' },
      { key: 'paidOn', label: 'Paid on', kind: 'date' },
    ];
    case 'WINNER_CLAIM': return [
      { key: 'claimStatus', label: 'Claim status', kind: 'select', options: [['PENDING', 'Pending'], ['CLAIMED', 'Claimed'], ['DELIVERED', 'Delivered']] },
      { key: 'claimNote', label: 'Note', kind: 'textarea' },
    ];
    case 'COMPLIMENTARY_CHOICE': return [{ key: 'optionId', label: 'Complimentary option', kind: 'select', options: optionChoices }];
    case 'COMPLIMENTARY_DELIVERY': return [{ key: 'deliveredAt', label: 'Delivered at (Asia/Kolkata)', kind: 'datetime' }, { key: 'note', label: 'Note' }];
  }
}

/** Turns the edit form's text values back into the shape the API validates (numbers, ISO dates, no empty dates). */
function normalise(fields: Field[], values: Record<string, string>): RequestPayload {
  const payload: RequestPayload = {};
  for (const { key, kind } of fields) {
    const value = values[key] ?? '';
    if (kind === 'number') payload[key] = value === '' ? undefined : Number(value);
    else if (kind === 'datetime') { if (value) payload[key] = indiaDateTimeToIso(value); }
    else if (kind === 'date') { if (value) payload[key] = value; }
    else payload[key] = value;
  }
  return payload;
}

function ReviewDialog({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const requestQuery = useQuery({ queryKey: ['approval-requests', 'detail', requestId], queryFn: () => getApprovalRequest(requestId) });
  const request = requestQuery.data;
  const optionsQuery = useQuery({
    queryKey: ['complimentary-options', request?.campaignId],
    queryFn: () => listComplimentaryOptions(request!.campaignId),
    enabled: request?.type === 'COMPLIMENTARY_CHOICE',
  });
  const optionNames = Object.fromEntries((optionsQuery.data ?? []).map((option) => [option.id, option.name]));
  const optionChoices = (optionsQuery.data ?? []).filter((option) => option.isActive).map((option): [string, string] => [option.id, option.name]);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
    await queryClient.invalidateQueries({ queryKey: ['approval-count'] });
    onClose();
  };
  const approveMutation = useMutation({
    mutationFn: (payload?: RequestPayload) => approveApprovalRequest(requestId, payload),
    onSuccess: done,
    // A rule failed and the request stayed pending; show the current state again.
    onError: () => void queryClient.invalidateQueries({ queryKey: ['approval-requests', 'detail', requestId] }),
  });
  const rejectMutation = useMutation({ mutationFn: () => rejectApprovalRequest(requestId, reason.trim()), onSuccess: done });

  function startEditing(detail: ApprovalRequestDetail) {
    const initial: Record<string, string> = {};
    for (const { key, kind } of fieldsFor(detail.type, detail.payload, optionChoices)) {
      const raw = detail.payload[key];
      initial[key] = raw === undefined || raw === null ? '' : kind === 'datetime' ? indiaDateTimeValue(String(raw)) : String(raw);
    }
    setValues(initial);
    approveMutation.reset();
    setEditing(true);
  }

  function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!request) return;
    approveMutation.mutate(editing ? normalise(fieldsFor(request.type, request.payload, optionChoices), values) : undefined);
  }

  const current = request?.current;
  const pending = request?.status === 'PENDING';

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-label="Review request" aria-modal="true" className="manual-draw-dialog approval-dialog" role="dialog">
        <div className="draw-dialog-heading"><span className="draw-dialog-icon"><ClipboardCheck size={18} /></span><button aria-label="Close review" className="dots-button" onClick={onClose} type="button"><X size={16} /></button></div>
        {requestQuery.isPending ? <div className="campaign-loading">Loading request…</div> : requestQuery.isError || !request ? <div className="campaign-error" role="alert">{requestQuery.error?.message}</div> : (
          <form onSubmit={approve}>
            <div className="section-kicker">{requestTypeLabels[request.type].toUpperCase()} · {request.campaign.name}</div>
            <h2>{participantLabel(request)}</h2>
            <p className="draw-confirm-date">Submitted {formatDate(request.submittedAt)} by {request.agent.agentCode} {request.agent.name} · <span className={`request-status ${request.status.toLowerCase()}`}>{requestStatusLabels[request.status]}</span></p>

            {!editing && <dl className="manual-draw-summary compact" aria-label="Requested change">
              {request.type === 'PARTICIPANT_UPDATE' && current
                ? Object.keys(request.payload).map((key) => <div key={key}><dt>{participantFields.find((field) => field.key === key)?.label ?? key}</dt><dd><s className="current-value">{String((current as Record<string, unknown>)[key] ?? '—')}</s> → <strong>{String(request.payload[key] || '—')}</strong></dd></div>)
                : describePayload(request.type, request.payload, optionNames).map((line) => <div key={line}><dd>{line}</dd></div>)}
              {request.type === 'PAYMENT' && current && <div><dt>Unpaid upcoming draws now</dt><dd>{current.drawPayments.filter(({ status, draw }) => status === 'NOT_PAID' && draw.status === 'SCHEDULED').map(({ draw }) => draw.drawNumber).join(', ') || 'none'}</dd></div>}
              {request.originalPayload && <div><dt>Agent’s original</dt><dd>{describePayload(request.type, request.originalPayload, optionNames).join(' · ')}</dd></div>}
              {request.rejectionReason && <div><dt>Rejection reason</dt><dd>{request.rejectionReason}</dd></div>}
              {request.decidedByAdmin && request.decidedAt && <div><dt>Decided</dt><dd>{formatDate(request.decidedAt)} by {request.decidedByAdmin.name}</dd></div>}
            </dl>}

            {editing && <fieldset className="manual-draw-section"><legend>Edit before approving</legend><div className="manual-draw-fields">
              {fieldsFor(request.type, request.payload, optionChoices).map(({ key, label, kind, options }) => <label className={kind === 'textarea' ? 'wide' : ''} key={key}>{label}
                {kind === 'select'
                  ? <select aria-label={label} onChange={(event) => setValues({ ...values, [key]: event.target.value })} value={values[key] ?? ''}>{options?.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
                  : kind === 'textarea'
                    ? <textarea aria-label={label} onChange={(event) => setValues({ ...values, [key]: event.target.value })} rows={2} value={values[key] ?? ''} />
                    : <input aria-label={label} inputMode={kind === 'number' ? 'numeric' : undefined} onChange={(event) => setValues({ ...values, [key]: event.target.value })} max={kind === 'date' ? indiaDateValue() : undefined} type={kind === 'datetime' ? 'datetime-local' : kind === 'date' ? 'date' : 'text'} value={values[key] ?? ''} />}
              </label>)}
            </div></fieldset>}

            {rejecting && <label className="reject-reason">Reason for rejecting (the agent sees this)<textarea aria-label="Rejection reason" maxLength={500} onChange={(event) => setReason(event.target.value)} rows={2} value={reason} /></label>}
            {(approveMutation.isError || rejectMutation.isError) && <div className="campaign-error" role="alert">{(approveMutation.error ?? rejectMutation.error)?.message} {approveMutation.isError && 'The request is still pending; edit or reject it.'}</div>}

            {pending && <div className="draw-confirm-actions">
              {rejecting ? <>
                <button className="quiet-button" onClick={() => setRejecting(false)} type="button">Back</button>
                <button className="primary-button danger" disabled={!reason.trim() || rejectMutation.isPending} onClick={() => rejectMutation.mutate()} type="button"><X size={14} />{rejectMutation.isPending ? 'Rejecting…' : 'Confirm rejection'}</button>
              </> : <>
                <button className="quiet-button" onClick={() => { setRejecting(true); setEditing(false); }} type="button">Reject</button>
                {!editing && <button className="quiet-button" onClick={() => startEditing(request)} type="button"><Pencil size={13} /> Edit</button>}
                {editing && <button className="quiet-button" onClick={() => setEditing(false)} type="button">Discard edits</button>}
                <button className="primary-button" disabled={approveMutation.isPending} type="submit"><Check size={14} />{approveMutation.isPending ? 'Approving…' : editing ? 'Approve with edits' : 'Approve'}</button>
              </>}
            </div>}
          </form>
        )}
      </section>
    </div>
  );
}

/** AC-APR-5..9: super-admin queue of agents' requests. */
export default function ApprovalsPage() {
  const [status, setStatus] = useState('PENDING');
  const [type, setType] = useState('');
  const [agentId, setAgentId] = useState('');
  const [reviewing, setReviewing] = useState<string | null>(null);
  const agentsQuery = useQuery({ queryKey: ['agents'], queryFn: () => listAgents() });
  const requestsQuery = useQuery({
    queryKey: ['approval-requests', 'queue', status, type, agentId],
    queryFn: () => listApprovalRequests({ status, type, agentId }),
  });

  return (
    <section className="approvals-page">
      <div className="campaign-page-heading">
        <div><div className="section-kicker">AGENT CHANGES</div><h1>Approvals</h1><p>Agents’ changes take effect only when you approve them.</p></div>
      </div>
      <div className="participant-toolbar">
        <label className="participant-filter">STATUS<select aria-label="Filter by status" onChange={(event) => setStatus(event.target.value)} value={status}>
          <option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="WITHDRAWN">Withdrawn</option><option value="">All</option>
        </select></label>
        <label className="participant-filter">TYPE<select aria-label="Filter by type" onChange={(event) => setType(event.target.value)} value={type}>
          <option value="">All types</option>{Object.entries(requestTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="participant-filter">AGENT<select aria-label="Filter by agent" onChange={(event) => setAgentId(event.target.value)} value={agentId}>
          <option value="">All agents</option>{agentsQuery.data?.map((agent) => <option key={agent.id} value={agent.id}>{agent.agentCode} · {agent.name}</option>)}
        </select></label>
      </div>
      <div className="participant-list-panel">
        {requestsQuery.isPending ? <div className="campaign-loading">Loading requests…</div> : requestsQuery.isError ? <div className="campaign-error">{requestsQuery.error.message}</div> : requestsQuery.data.length === 0 ? (
          <div className="prize-empty"><ClipboardCheck size={21} /><strong>{status === 'PENDING' ? 'Nothing waiting for approval' : 'No requests match'}</strong><span>Agents’ changes appear here as they submit them.</span></div>
        ) : <div className="schedule-table-wrap"><table className="participant-table"><thead><tr><th>SUBMITTED</th><th>REQUEST</th><th>PARTICIPANT</th><th>AGENT</th><th>DETAILS</th><th>STATUS</th><th /></tr></thead>
          <tbody>{requestsQuery.data.map((request) => <tr key={request.id}>
            <td>{formatDate(request.submittedAt)}</td>
            <td>{requestTypeLabels[request.type]}</td>
            <td>{participantLabel(request)}</td>
            <td>{request.agent.agentCode} · {request.agent.name}</td>
            <td className="request-details">{describePayload(request.type, request.payload).join(' · ')}</td>
            <td><span className={`request-status ${request.status.toLowerCase()}`}>{requestStatusLabels[request.status]}</span></td>
            <td><button aria-label={`Review ${requestTypeLabels[request.type]} for ${participantLabel(request)}`} className="quiet-button" onClick={() => setReviewing(request.id)} type="button">{request.status === 'PENDING' ? 'Review' : 'View'}</button></td>
          </tr>)}</tbody></table></div>}
      </div>
      {reviewing && <ReviewDialog onClose={() => setReviewing(null)} requestId={reviewing} />}
    </section>
  );
}
