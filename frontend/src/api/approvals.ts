import { CampaignApiError } from './campaigns';

export type RequestType = 'PARTICIPANT_CREATE' | 'PARTICIPANT_UPDATE' | 'PAYMENT' | 'WINNER_CLAIM' | 'COMPLIMENTARY_CHOICE' | 'COMPLIMENTARY_DELIVERY';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
export type RequestPayload = Record<string, unknown>;

export type ApprovalRequest = {
  id: string;
  type: RequestType;
  status: RequestStatus | 'APPROVING';
  campaignId: string;
  participantId: string | null;
  winnerId: string | null;
  agentId: string;
  payload: RequestPayload;
  originalPayload: RequestPayload | null;
  submittedAt: string;
  decidedAt: string | null;
  rejectionReason: string | null;
  agent: { id: string; agentCode: string; name: string };
  decidedByAdmin: { id: string; name: string } | null;
  participant: { id: string; participantNumber: number; name: string } | null;
  winner: { id: string; prize: { name: string }; draw: { drawNumber: number } } | null;
  campaign: { id: string; name: string };
};

export type ApprovalRequestDetail = ApprovalRequest & {
  current: {
    participantNumber: number;
    name: string;
    email: string | null;
    mobile: string | null;
    externalUserId: string | null;
    address: string | null;
    drawPayments: { status: string; draw: { drawNumber: number; status: string } }[];
    complimentaryChoice: { status: string; option: { name: string } } | null;
    winners: { id: string; claimStatus: string; claimNote: string | null; prize: { name: string } }[];
  } | null;
};

export type NewRequest =
  | { type: 'PARTICIPANT_CREATE'; campaignId: string; payload: RequestPayload }
  | { type: 'WINNER_CLAIM'; winnerId: string; payload: RequestPayload }
  | { type: Exclude<RequestType, 'PARTICIPANT_CREATE' | 'WINNER_CLAIM'>; participantId: string; payload: RequestPayload };

export const requestTypeLabels: Record<RequestType, string> = {
  PARTICIPANT_CREATE: 'New participant',
  PARTICIPANT_UPDATE: 'Participant details',
  PAYMENT: 'Payment',
  WINNER_CLAIM: 'Prize claim / delivery',
  COMPLIMENTARY_CHOICE: 'Complimentary choice',
  COMPLIMENTARY_DELIVERY: 'Complimentary delivery',
};

export const requestStatusLabels: Record<ApprovalRequest['status'], string> = {
  PENDING: 'Pending', APPROVING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn',
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await response.json().catch(() => null)) as (T & { error?: { message?: string; details?: unknown } }) | null;
  if (!response.ok) {
    throw new CampaignApiError(body?.error?.message ?? 'The approval request could not be completed.', body?.error?.details, response.status);
  }
  return body as T;
}

export async function submitApprovalRequest(input: NewRequest) {
  return (await request<{ request: ApprovalRequest }>('/approval-requests', { method: 'POST', body: JSON.stringify(input) })).request;
}

export async function listApprovalRequests(filters: { status?: string; type?: string; agentId?: string; participantId?: string } = {}) {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value) as [string, string][]);
  return (await request<{ requests: ApprovalRequest[] }>(`/approval-requests?${query}`)).requests;
}

export async function getApprovalRequest(id: string) {
  return (await request<{ request: ApprovalRequestDetail }>(`/approval-requests/${id}`)).request;
}

export async function getPendingApprovalCount() {
  return (await request<{ count: number }>('/approval-requests/pending-count')).count;
}

export async function approveApprovalRequest(id: string, payload?: RequestPayload) {
  return (await request<{ request: ApprovalRequest }>(`/approval-requests/${id}/approve`, { method: 'POST', body: JSON.stringify(payload ? { payload } : {}) })).request;
}

export async function rejectApprovalRequest(id: string, reason: string) {
  return (await request<{ request: ApprovalRequest }>(`/approval-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) })).request;
}

export async function withdrawApprovalRequest(id: string) {
  return (await request<{ request: ApprovalRequest }>(`/approval-requests/${id}/withdraw`, { method: 'POST' })).request;
}

/** Human-readable lines describing a request's details, shared by the agent and super-admin screens. */
export function describePayload(type: RequestType, payload: RequestPayload, optionNames: Record<string, string> = {}): string[] {
  const value = (key: string) => (payload[key] === undefined || payload[key] === null || payload[key] === '' ? null : String(payload[key]));
  const fields = (pairs: [string, string][]) => pairs.map(([key, label]) => (value(key) ? `${label}: ${value(key)}` : null)).filter((line): line is string => Boolean(line));
  switch (type) {
    case 'PARTICIPANT_CREATE':
      return fields([['participantNumber', 'Serial'], ['name', 'Name'], ['mobile', 'Mobile'], ['email', 'Email'], ['externalUserId', 'User ID'], ['address', 'Address']]);
    case 'PARTICIPANT_UPDATE':
      return fields([['name', 'Name'], ['mobile', 'Mobile'], ['email', 'Email'], ['externalUserId', 'User ID'], ['address', 'Address']]);
    case 'PAYMENT':
      return [`${value('count') ?? '?'} upcoming draw${payload.count === 1 ? '' : 's'}`, ...fields([['method', 'Method'], ['reference', 'Reference'], ['paidOn', 'Paid on']])];
    case 'WINNER_CLAIM':
      return fields([['claimStatus', 'Status'], ['claimNote', 'Note']]);
    case 'COMPLIMENTARY_CHOICE':
      return [optionNames[String(payload.optionId)] ?? 'Complimentary option'];
    case 'COMPLIMENTARY_DELIVERY':
      return fields([['deliveredAt', 'Delivered at'], ['note', 'Note']]).concat(value('deliveredAt') ? [] : ['Delivered now']);
  }
}
