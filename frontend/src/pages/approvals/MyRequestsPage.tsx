import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import {
  describePayload,
  listApprovalRequests,
  requestStatusLabels,
  requestTypeLabels,
  withdrawApprovalRequest,
  type ApprovalRequest,
} from '../../api/approvals';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value));
}

export function participantLabel(request: ApprovalRequest) {
  if (request.participant) return `#${request.participant.participantNumber} ${request.participant.name}`;
  return `New: ${String(request.payload.name ?? 'participant')}`;
}

/** AC-APR-4: an agent's own requests, their outcome, and withdrawal of pending ones. */
export default function MyRequestsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const requestsQuery = useQuery({ queryKey: ['approval-requests', 'mine', status], queryFn: () => listApprovalRequests({ status }) });
  const withdrawMutation = useMutation({
    mutationFn: (requestId: string) => withdrawApprovalRequest(requestId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approval-requests'] }),
  });

  return (
    <section className="approvals-page">
      <div className="campaign-page-heading">
        <div><div className="section-kicker">WAITING FOR A SUPER ADMIN</div><h1>My requests</h1><p>Your changes take effect once a super admin approves them.</p></div>
        <label className="campaign-select-label">STATUS<select aria-label="Filter by request status" onChange={(event) => setStatus(event.target.value)} value={status}>
          <option value="">All</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="WITHDRAWN">Withdrawn</option>
        </select></label>
      </div>
      {withdrawMutation.isError && <div className="campaign-error" role="alert">{withdrawMutation.error.message}</div>}
      <div className="participant-list-panel">
        {requestsQuery.isPending ? <div className="campaign-loading">Loading requests…</div> : requestsQuery.isError ? <div className="campaign-error">{requestsQuery.error.message}</div> : requestsQuery.data.length === 0 ? (
          <div className="prize-empty"><Inbox size={21} /><strong>No requests</strong><span>Changes you make to participants appear here until they are decided.</span></div>
        ) : <div className="schedule-table-wrap"><table className="participant-table"><thead><tr><th>SUBMITTED</th><th>REQUEST</th><th>PARTICIPANT</th><th>DETAILS</th><th>STATUS</th><th /></tr></thead>
          <tbody>{requestsQuery.data.map((request) => <tr key={request.id}>
            <td>{formatDate(request.submittedAt)}</td>
            <td>{requestTypeLabels[request.type]}</td>
            <td>{participantLabel(request)}</td>
            <td className="request-details">{describePayload(request.type, request.payload).join(' · ')}</td>
            <td>
              <span className={`request-status ${request.status.toLowerCase()}`}>{requestStatusLabels[request.status]}</span>
              {request.originalPayload && <small className="request-note">Edited by super admin</small>}
              {request.rejectionReason && <small className="request-note">Reason: {request.rejectionReason}</small>}
            </td>
            <td>{request.status === 'PENDING' && <button className="quiet-button" disabled={withdrawMutation.isPending} onClick={() => { if (window.confirm('Withdraw this request?')) withdrawMutation.mutate(request.id); }} type="button">Withdraw</button>}</td>
          </tr>)}</tbody></table></div>}
      </div>
    </section>
  );
}
