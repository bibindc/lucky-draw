import { CampaignApiError } from './campaigns';

export type ParticipantStatus = 'REGISTERED' | 'PAYMENT_PENDING' | 'ELIGIBLE' | 'WINNER' | 'COMPLETED';

export type ParticipantPayment = {
  id: string;
  status: 'NOT_PAID' | 'PAID' | 'WAIVED';
  retainedCredit: boolean;
  draw: { drawNumber: number; scheduledAt: string; status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' };
};

export type Participant = {
  id: string;
  participantNumber: number;
  agentId: string | null;
  agent?: { id: string; agentCode: string; name: string } | null;
  name: string;
  email: string | null;
  mobile: string | null;
  externalUserId: string | null;
  address?: string | null;
  status: ParticipantStatus;
  createdAt: string;
  drawPayments?: ParticipantPayment[];
};

export type PaymentHistoryEntry = {
  id: string;
  amountPaise: number;
  method: string;
  status: string;
  /** The day the money was received; createdAt is when it was entered. */
  paidOn: string;
  createdAt: string;
  allocations?: { drawPayment: { draw: { drawNumber: number; status: string } } }[];
};

export type ParticipantDetail = Participant & {
  agent?: { id: string; agentCode: string; name: string } | null;
  paymentTransactions: PaymentHistoryEntry[];
  winners: ParticipantWinner[];
};

export type ParticipantWinner = {
  id: string;
  claimStatus: 'PENDING' | 'CLAIMED' | 'DELIVERED';
  claimNote: string | null;
  claimUpdatedAt: string | null;
  prize: { name: string; rank: number };
  draw: { drawNumber: number };
};

export type NewParticipant = {
  name: string;
  email?: string;
  mobile?: string;
  externalUserId?: string;
  agentId?: string;
  address?: string;
  participantNumber?: number;
};

export const serialRange = { min: 1000, max: 9999 } as const;

/** Next available serial from a DUPLICATE_SERIAL error's details, if the server offered one. */
export function nextSerialFromError(error: unknown): number | null {
  const details = typeof error === 'object' && error !== null && 'details' in error ? error.details : null;
  const next = Array.isArray(details) ? (details[0] as { nextSerial?: unknown } | undefined)?.nextSerial : null;
  return typeof next === 'number' ? next : null;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await response.json().catch(() => null)) as
    | { participant?: Participant; participants?: Participant[]; pagination?: { total: number; pageCount: number }; error?: { message?: string; details?: unknown } }
    | null;

  if (!response.ok) {
    throw new CampaignApiError(
      body?.error?.message ?? 'The participant request could not be completed.',
      body?.error?.details,
      response.status,
    );
  }
  return body as T;
}

export type ParticipantSort = 'newest' | 'serial' | 'name';

export type ParticipantListQuery = {
  search?: string;
  status?: string;
  agentId?: string;
  page?: number;
  pageSize?: number;
  sort?: ParticipantSort;
  order?: 'asc' | 'desc';
};

export async function listParticipants(campaignId: string, options: ParticipantListQuery = {}) {
  const query = new URLSearchParams();
  if (options.search) query.set('search', options.search);
  if (options.status) query.set('status', options.status);
  if (options.agentId) query.set('agentId', options.agentId);
  if (options.page) query.set('page', String(options.page));
  if (options.pageSize) query.set('pageSize', String(options.pageSize));
  if (options.sort && options.sort !== 'newest') query.set('sort', options.sort);
  if (options.order) query.set('order', options.order);
  return request<{
    participants: Participant[];
    pagination: { page: number; pageSize: number; total: number; pageCount: number };
  }>(`/campaigns/${campaignId}/participants?${query}`);
}

export type ParticipantExportRow = Omit<Participant, 'drawPayments'> & {
  drawPayments: { status: ParticipantPayment['status'] }[];
};

export async function exportParticipants(campaignId: string, search = '', status = '', agentId = '') {
  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (status) query.set('status', status);
  if (agentId) query.set('agentId', agentId);
  return request<{ participants: ParticipantExportRow[]; total: number }>(
    `/campaigns/${campaignId}/participants/export?${query}`,
  );
}

export async function createParticipant(campaignId: string, participant: NewParticipant) {
  const body = await request<{ participant: Participant }>(`/campaigns/${campaignId}/participants`, {
    method: 'POST',
    body: JSON.stringify(participant),
  });
  return body.participant;
}

export async function getParticipant(id: string): Promise<ParticipantDetail> {
  const body = await request<{ participant: ParticipantDetail }>(`/participants/${id}`);
  return body.participant;
}

export async function updateParticipant(
  id: string,
  changes: Partial<Pick<NewParticipant, 'name' | 'email' | 'mobile' | 'externalUserId' | 'agentId' | 'address' | 'participantNumber'>>,
) {
  const body = await request<{ participant: Participant }>(`/participants/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
  return body.participant;
}

export async function getNextSerial(): Promise<number | null> {
  const body = await request<{ serial: number | null }>('/participants/next-serial');
  return body.serial;
}

export async function recordPayment(participantId: string, input: {
  count: number;
  method: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'OTHER';
  reference?: string;
  /** YYYY-MM-DD in India. */
  paidOn?: string;
}) {
  return request<{ payment: PaymentHistoryEntry }>(`/participants/${participantId}/payments`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

