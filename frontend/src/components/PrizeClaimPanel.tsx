import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { submitApprovalRequest } from '../api/approvals';
import type { ParticipantDetail } from '../api/participants';
import { updateWinner, type WinnerClaimStatus } from '../api/winners';
import { claimStatusLabels } from '../utils/winnerListExport';

type PrizeClaimPanelProps = { participant: ParticipantDetail; role: 'SUPER_ADMIN' | 'AGENT' };

/** AC-APR-10: a winner's prize and claim status; super admins update it, agents request the update. */
export default function PrizeClaimPanel({ participant, role }: PrizeClaimPanelProps) {
  const queryClient = useQueryClient();
  const winner = participant.winners?.[0];
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<WinnerClaimStatus>('PENDING');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');
  const isAgent = role === 'AGENT';

  const saveMutation = useMutation({
    mutationFn: async () => {
      const details = { claimStatus: status, claimNote: note.trim() || null };
      if (isAgent) await submitApprovalRequest({ type: 'WINNER_CLAIM', winnerId: winner!.id, payload: details });
      else await updateWinner(winner!.id, details);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['participant', participant.id] });
      await queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
      setEditing(false);
      setNotice(isAgent ? 'Sent for approval: the claim status will change once a super admin approves.' : 'Claim status updated.');
    },
  });

  if (!winner) return null;

  function open() {
    setStatus(winner!.claimStatus);
    setNote(winner!.claimNote ?? '');
    setNotice('');
    saveMutation.reset();
    setEditing(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMutation.mutate();
  }

  return (
    <section aria-label="Prize won" className="participant-history-panel complimentary-panel">
      <div className="participant-panel-heading">
        <h2><Trophy size={14} /> Prize won</h2>
        <span className={`claim-status ${winner.claimStatus.toLowerCase()}`}><i />{claimStatusLabels[winner.claimStatus]}</span>
      </div>
      <div className="complimentary-body">
        <dl className="complimentary-choice">
          <div><dt>Prize</dt><dd>{winner.prize.name} · Draw {winner.draw.drawNumber}</dd></div>
          {winner.claimNote && <div><dt>Note</dt><dd>{winner.claimNote}</dd></div>}
        </dl>
        {notice && <p className="prize-notice" role="status">{notice}</p>}
        {!editing && <button className="quiet-button complimentary-deliver" onClick={open} type="button">{isAgent ? 'Request claim update' : 'Update claim'}</button>}
        {editing && <form className="complimentary-delivery-form" onSubmit={submit}>
          <label>Claim / delivery status
            <select aria-label="Claim status" onChange={(event) => setStatus(event.target.value as WinnerClaimStatus)} value={status}>
              {(Object.keys(claimStatusLabels) as WinnerClaimStatus[]).map((value) => <option key={value} value={value}>{claimStatusLabels[value]}</option>)}
            </select>
          </label>
          <label>Note <span className="optional-label">OPTIONAL</span><input aria-label="Claim note" maxLength={1000} onChange={(event) => setNote(event.target.value)} value={note} /></label>
          {saveMutation.isError && <p className="payment-error" role="alert">{saveMutation.error.message}</p>}
          <div className="draw-confirm-actions">
            <button className="quiet-button" onClick={() => setEditing(false)} type="button">Cancel</button>
            <button className="primary-button" disabled={saveMutation.isPending} type="submit">{saveMutation.isPending ? 'Sending…' : isAgent ? 'Send for approval' : 'Save update'}</button>
          </div>
        </form>}
      </div>
    </section>
  );
}
