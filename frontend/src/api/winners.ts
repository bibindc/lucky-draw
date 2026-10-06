import { CampaignApiError } from './campaigns';

export type WinnerClaimStatus = 'PENDING' | 'CLAIMED' | 'DELIVERED';

export type WinnerRecord = {
  id: string;
  claimStatus: WinnerClaimStatus;
  claimNote: string | null;
  claimUpdatedAt: string | null;
  drawPosition?: number;
  participant: {
    id: string;
    participantNumber?: number;
    name: string;
    email: string | null;
    mobile: string | null;
    agent?: { id: string; agentCode: string; name: string } | null;
  };
  prize: { id: string; name: string; rank: number; valuePaise: number | null };
  draw: { id: string; drawNumber: number; scheduledAt: string; executionMode?: 'AUTOMATIC' | 'MANUAL' | null; heldAt?: string | null };
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await response.json().catch(() => null)) as
    | { winners?: WinnerRecord[]; winner?: WinnerRecord; error?: { message?: string; details?: unknown } }
    | null;
  if (!response.ok) {
    throw new CampaignApiError(body?.error?.message ?? 'The winner request could not be completed.', body?.error?.details, response.status);
  }
  return body as T;
}

export async function listWinners(campaignId: string, filters: { drawId?: string; claimStatus?: string } = {}) {
  const query = new URLSearchParams();
  if (filters.drawId) query.set('drawId', filters.drawId);
  if (filters.claimStatus) query.set('claimStatus', filters.claimStatus);
  const body = await request<{ winners: WinnerRecord[] }>(`/campaigns/${campaignId}/winners?${query}`);
  return body.winners;
}

export async function updateWinner(winnerId: string, data: { claimStatus: WinnerClaimStatus; claimNote?: string | null }) {
  const body = await request<{ winner: WinnerRecord }>(`/winners/${winnerId}/claim`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return body.winner;
}