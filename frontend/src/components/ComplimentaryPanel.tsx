import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, Gift, PackageCheck } from 'lucide-react';
import {
  deliverComplimentaryChoice,
  getParticipantComplimentary,
  listComplimentaryOptions,
  optionImageUrl,
  recordComplimentaryChoice,
  type ComplimentaryChoice,
} from '../api/complimentary';
import { indiaDateTimeToIso, indiaDateTimeValue } from '../utils/indiaTime';
import { submitApprovalRequest } from '../api/approvals';
import ItemImage from './ItemImage';

export const complimentaryStatusLabels = {
  NOT_CHOSEN: 'Not chosen',
  CHOSEN: 'Chosen',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  DELIVERED_BEFORE_WINNING: 'Delivered before winning',
} as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value));
}

const byWhom = (admin: ComplimentaryChoice['chosenByAdmin'], agent: ComplimentaryChoice['chosenByAgent']) =>
  agent && admin ? `${agent.agentCode} ${agent.name}, approved by ${admin.name}` : admin ? admin.name : agent ? `${agent.agentCode} ${agent.name}` : 'unknown';

type ComplimentaryPanelProps = { participantId: string; campaignId: string; role?: 'SUPER_ADMIN' | 'AGENT' };

/** AC-CMP-8: eligibility, the choice and its delivery for one participant, with the actions the user may take. */
export default function ComplimentaryPanel({ participantId, campaignId, role = 'SUPER_ADMIN' }: ComplimentaryPanelProps) {
  // AC-APR-1: agents' choices and deliveries are approval requests (C5).
  const isAgent = role === 'AGENT';
  const [sentNotice, setSentNotice] = useState('');
  const queryClient = useQueryClient();
  const statusQuery = useQuery({ queryKey: ['complimentary', participantId], queryFn: () => getParticipantComplimentary(participantId) });
  const optionsQuery = useQuery({ queryKey: ['complimentary-options', campaignId], queryFn: () => listComplimentaryOptions(campaignId) });
  const [optionId, setOptionId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [deliveredAt, setDeliveredAt] = useState('');
  const [deliveredAtDefault, setDeliveredAtDefault] = useState('');
  const [note, setNote] = useState('');

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['complimentary', participantId] }),
      queryClient.invalidateQueries({ queryKey: ['complimentary-options', campaignId] }),
      queryClient.invalidateQueries({ queryKey: ['complimentary-list', campaignId] }),
      queryClient.invalidateQueries({ queryKey: ['approval-requests'] }),
    ]);
  }

  const chooseMutation = useMutation({
    mutationFn: async () => {
      if (isAgent) await submitApprovalRequest({ type: 'COMPLIMENTARY_CHOICE', participantId, payload: { optionId } });
      else await recordComplimentaryChoice(participantId, optionId);
    },
    onSuccess: async () => {
      setConfirming(false); setOptionId('');
      if (isAgent) setSentNotice('Sent for approval: the choice will be recorded once a super admin approves.');
      await refresh();
    },
  });
  const deliverMutation = useMutation({
    // An untouched prefilled time is left to the server ("now"), so it can never fall before the choice time.
    mutationFn: async () => {
      const details = {
        ...(deliveredAt && deliveredAt !== deliveredAtDefault ? { deliveredAt: indiaDateTimeToIso(deliveredAt) } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      if (isAgent) await submitApprovalRequest({ type: 'COMPLIMENTARY_DELIVERY', participantId, payload: details });
      else await deliverComplimentaryChoice(participantId, details);
    },
    onSuccess: async () => {
      setDelivering(false); setNote('');
      if (isAgent) setSentNotice('Sent for approval: the delivery will be recorded once a super admin approves.');
      await refresh();
    },
  });

  function openDelivery() {
    const nowValue = indiaDateTimeValue(new Date());
    setDeliveredAt(nowValue);
    setDeliveredAtDefault(nowValue);
    deliverMutation.reset();
    setDelivering(true);
  }

  function submitDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    deliverMutation.mutate();
  }

  const info = statusQuery.data;
  const choice = info?.choice;
  const activeOptions = optionsQuery.data?.filter((option) => option.isActive) ?? [];
  const chosenOption = activeOptions.find((option) => option.id === optionId);
  const canChoose = Boolean(info?.eligible) && (!choice || choice.status === 'CANCELLED');

  return (
    <section aria-labelledby={`complimentary-${participantId}`} className="participant-history-panel complimentary-panel">
      <div className="participant-panel-heading">
        <h2 id={`complimentary-${participantId}`}><Gift size={14} /> Complimentary prize</h2>
        {info && <span className={`complimentary-status ${info.status.toLowerCase()}`}>{complimentaryStatusLabels[info.status]}</span>}
      </div>
      <div className="complimentary-body">
        {statusQuery.isPending ? <p className="history-empty">Loading…</p> : statusQuery.isError ? <p className="payment-error" role="alert">{statusQuery.error.message}</p> : info && (
          <>
            {choice && choice.option.imageUpdatedAt && <ItemImage name={choice.option.name} size="large" url={optionImageUrl(choice.option)} />}
            {choice && <dl className="complimentary-choice">
              <div><dt>Choice</dt><dd>{choice.option.name}</dd></div>
              <div><dt>Recorded</dt><dd>{formatDate(choice.chosenAt)} by {byWhom(choice.chosenByAdmin, choice.chosenByAgent)}</dd></div>
              {choice.deliveredAt && <div><dt>Delivered</dt><dd>{formatDate(choice.deliveredAt)} by {byWhom(choice.deliveredByAdmin, choice.deliveredByAgent)}{choice.deliveryNote ? ` · ${choice.deliveryNote}` : ''}</dd></div>}
              {choice.status === 'CANCELLED' && <div><dt>Cancelled</dt><dd>{choice.cancelReason}{choice.cancelledAt ? ` · ${formatDate(choice.cancelledAt)}` : ''}</dd></div>}
            </dl>}
            {info.status === 'DELIVERED_BEFORE_WINNING' && <p className="draw-warning"><AlertTriangle size={14} /><span>This participant won a draw after receiving their complimentary prize.</span></p>}

            {!info.eligible && (!choice || choice.status === 'CANCELLED') && <p className="history-empty">
              {info.isWinner ? 'Winners don’t receive a complimentary prize.' : `Pay all ${info.totalDraws} draws to qualify (${info.paidDraws} paid).`}
            </p>}

            {canChoose && !confirming && <div className="complimentary-actions">
              {activeOptions.length === 0
                ? <p className="history-empty">Eligible. No complimentary options are available for this campaign yet.</p>
                : <>
                  <label>Eligible: choose a complimentary prize
                    <select aria-label="Complimentary prize option" onChange={(event) => setOptionId(event.target.value)} value={optionId}>
                      <option value="">Select an option</option>
                      {activeOptions.map((option) => <option key={option.id} value={option.id}>{option.name}{option.description ? ` · ${option.description}` : ''}</option>)}
                    </select>
                  </label>
                  {chosenOption && <ItemImage name={chosenOption.name} size="large" url={optionImageUrl(chosenOption)} />}
                  <button className="primary-button" disabled={!optionId} onClick={() => { chooseMutation.reset(); setConfirming(true); }} type="button"><Gift size={14} /> Record choice</button>
                </>}
            </div>}
            {canChoose && confirming && chosenOption && <div className="round-confirm">
              {chosenOption.imageUpdatedAt && <ItemImage name={chosenOption.name} size="large" url={optionImageUrl(chosenOption)} />}
              <p>Record <strong>{chosenOption.name}</strong> as this participant’s complimentary prize? The choice is final and cannot be changed.{isAgent ? ' It takes effect once a super admin approves.' : ''}</p>
              <div className="draw-confirm-actions">
                <button className="quiet-button" disabled={chooseMutation.isPending} onClick={() => setConfirming(false)} type="button"><ArrowLeft size={13} /> Back</button>
                <button className="primary-button" disabled={chooseMutation.isPending} onClick={() => chooseMutation.mutate()} type="button"><Check size={14} />{chooseMutation.isPending ? 'Sending…' : isAgent ? 'Send for approval' : 'Confirm choice'}</button>
              </div>
            </div>}

            {choice?.status === 'CHOSEN' && !delivering && <button className="quiet-button complimentary-deliver" onClick={openDelivery} type="button"><PackageCheck size={14} /> Mark delivered</button>}
            {choice?.status === 'CHOSEN' && delivering && <form className="complimentary-delivery-form" onSubmit={submitDelivery}>
              <label>Delivered at (Asia/Kolkata)<input aria-label="Delivered at" onChange={(event) => setDeliveredAt(event.target.value)} type="datetime-local" value={deliveredAt} /></label>
              <label>Note <span className="optional-label">OPTIONAL</span><input aria-label="Delivery note" maxLength={500} onChange={(event) => setNote(event.target.value)} value={note} /></label>
              <div className="draw-confirm-actions">
                <button className="quiet-button" disabled={deliverMutation.isPending} onClick={() => setDelivering(false)} type="button">Cancel</button>
                <button className="primary-button" disabled={deliverMutation.isPending} type="submit"><PackageCheck size={14} />{deliverMutation.isPending ? 'Sending…' : isAgent ? 'Send for approval' : 'Confirm delivery'}</button>
              </div>
            </form>}

            {sentNotice && <p className="prize-notice" role="status">{sentNotice}</p>}
            {(chooseMutation.isError || deliverMutation.isError) && <p className="payment-error" role="alert">{(chooseMutation.error ?? deliverMutation.error)?.message}</p>}
          </>
        )}
      </div>
    </section>
  );
}
