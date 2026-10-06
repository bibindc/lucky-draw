import { CampaignApiError } from './campaigns';
import { imageUrl, removeImage, uploadImage } from './images';

export type ComplimentaryStatus = 'NOT_CHOSEN' | 'CHOSEN' | 'DELIVERED' | 'CANCELLED' | 'DELIVERED_BEFORE_WINNING';

export type ComplimentaryOption = {
  id: string;
  campaignId: string;
  name: string;
  description: string | null;
  valuePaise: number | null;
  isActive: boolean;
  imageUpdatedAt?: string | null;
  chosenCount?: number;
  deliveredCount?: number;
};

type Person = { id: string; name: string; agentCode?: string };

export type ComplimentaryChoice = {
  id: string;
  status: 'CHOSEN' | 'DELIVERED' | 'CANCELLED';
  option: Pick<ComplimentaryOption, 'id' | 'name' | 'description' | 'valuePaise' | 'isActive' | 'imageUpdatedAt'>;
  chosenAt: string;
  chosenByAdmin: Person | null;
  chosenByAgent: Person | null;
  deliveredAt: string | null;
  deliveryNote: string | null;
  deliveredByAdmin: Person | null;
  deliveredByAgent: Person | null;
  cancelledAt: string | null;
  cancelReason: string | null;
};

export type ParticipantComplimentary = {
  eligible: boolean;
  paidDraws: number;
  totalDraws: number;
  isWinner: boolean;
  status: ComplimentaryStatus;
  choice: ComplimentaryChoice | null;
};

export type ComplimentaryRow = ParticipantComplimentary & {
  id: string;
  participantNumber: number;
  name: string;
  mobile: string | null;
  email: string | null;
  agent: { id: string; agentCode: string; name: string } | null;
};

export type OptionInput = { name: string; description?: string | null; valuePaise?: number | null };

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await response.json().catch(() => null)) as (T & { error?: { message?: string; details?: unknown } }) | null;
  if (!response.ok) {
    throw new CampaignApiError(body?.error?.message ?? 'The complimentary prize request could not be completed.', body?.error?.details, response.status);
  }
  return body as T;
}

export async function listComplimentaryOptions(campaignId: string) {
  return (await request<{ options: ComplimentaryOption[] }>(`/campaigns/${campaignId}/complimentary-options`)).options;
}

export async function createComplimentaryOption(campaignId: string, input: OptionInput) {
  return (await request<{ option: ComplimentaryOption }>(`/campaigns/${campaignId}/complimentary-options`, { method: 'POST', body: JSON.stringify(input) })).option;
}

export async function updateComplimentaryOption(optionId: string, changes: Partial<OptionInput & { isActive: boolean }>) {
  return (await request<{ option: ComplimentaryOption }>(`/complimentary-options/${optionId}`, { method: 'PATCH', body: JSON.stringify(changes) })).option;
}

export async function listCampaignComplimentary(campaignId: string, filters: { status?: string; search?: string } = {}) {
  const query = new URLSearchParams();
  if (filters.status) query.set('status', filters.status);
  if (filters.search) query.set('search', filters.search);
  return (await request<{ participants: ComplimentaryRow[] }>(`/campaigns/${campaignId}/complimentary?${query}`)).participants;
}

export async function getParticipantComplimentary(participantId: string) {
  return (await request<{ complimentary: ParticipantComplimentary }>(`/participants/${participantId}/complimentary`)).complimentary;
}

export async function recordComplimentaryChoice(participantId: string, optionId: string) {
  return (await request<{ choice: ComplimentaryChoice }>(`/participants/${participantId}/complimentary`, { method: 'POST', body: JSON.stringify({ optionId }) })).choice;
}

export async function deliverComplimentaryChoice(participantId: string, input: { deliveredAt?: string; note?: string }) {
  return (await request<{ choice: ComplimentaryChoice }>(`/participants/${participantId}/complimentary/deliver`, { method: 'POST', body: JSON.stringify(input) })).choice;
}

// ---- Option images (AC-CMP-11..13) ----

export function optionImageUrl(option: { id: string; imageUpdatedAt?: string | null }): string | null {
  return imageUrl('complimentary-options', option);
}

export async function uploadOptionImage(optionId: string, file: File): Promise<ComplimentaryOption> {
  return uploadImage<ComplimentaryOption>('complimentary-options', optionId, file, 'option');
}

export async function removeOptionImage(optionId: string): Promise<ComplimentaryOption> {
  return removeImage<ComplimentaryOption>('complimentary-options', optionId, 'option');
}
