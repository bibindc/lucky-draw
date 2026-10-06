import { useQuery } from '@tanstack/react-query';
import { Hourglass } from 'lucide-react';
import { describePayload, listApprovalRequests, requestTypeLabels } from '../api/approvals';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value));
}

/** AC-APR-4: a participant's open requests, so nobody mistakes a pending change for an applied one. */
export default function PendingRequestsPanel({ participantId }: { participantId: string }) {
  const requestsQuery = useQuery({
    queryKey: ['approval-requests', 'participant', participantId],
    queryFn: () => listApprovalRequests({ participantId, status: 'PENDING' }),
  });
  const requests = requestsQuery.data ?? [];
  if (requests.length === 0) return null;

  return (
    <section aria-label="Pending approval" className="pending-requests-panel">
      <h2><Hourglass size={14} /> Pending approval</h2>
      <ul>
        {requests.map((request) => <li key={request.id}>
          <strong>{requestTypeLabels[request.type]}</strong>
          <span>{describePayload(request.type, request.payload).join(' · ')}</span>
          <small>Submitted {formatDate(request.submittedAt)} by {request.agent.agentCode} {request.agent.name}</small>
        </li>)}
      </ul>
    </section>
  );
}
