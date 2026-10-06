import { CampaignApiError } from './campaigns';
import { imageUrl, removeImage, uploadImage } from './images';

export type Prize = {
  id: string;
  campaignId: string;
  drawId: string | null;
  name: string;
  description: string | null;
  valuePaise: number | null;
  rank: number;
  totalQuantity: number;
  assignedQuantity: number;
  imageUpdatedAt?: string | null;
};

export type PrizeInput = Omit<Prize, 'id' | 'campaignId' | 'assignedQuantity' | 'drawId' | 'imageUpdatedAt'> & {
  drawId: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await response.json().catch(() => null)) as
    | { prize?: Prize; prizes?: Prize[]; error?: { message?: string; details?: unknown } }
    | null;

  if (!response.ok) {
    throw new CampaignApiError(
      body?.error?.message ?? 'The prize request could not be completed.',
      body?.error?.details,
      response.status,
    );
  }
  return body as T;
}

export async function listPrizes(campaignId: string, drawId: string | 'unassigned'): Promise<Prize[]> {
  const body = await request<{ prizes: Prize[] }>(`/campaigns/${campaignId}/prizes?drawId=${encodeURIComponent(drawId)}`);
  return body.prizes;
}

export async function createPrize(campaignId: string, prize: PrizeInput): Promise<Prize> {
  const body = await request<{ prize: Prize }>(`/campaigns/${campaignId}/prizes`, {
    method: 'POST',
    body: JSON.stringify(prize),
  });
  return body.prize;
}

export async function updatePrize(id: string, prize: Partial<PrizeInput>): Promise<Prize> {
  const body = await request<{ prize: Prize }>(`/prizes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(prize),
  });
  return body.prize;
}

export async function deletePrize(id: string): Promise<void> {
  await request<void>(`/prizes/${id}`, { method: 'DELETE' });
}

// ---- Prize images (AC-PRZ-8..12), via the shared image helpers ----

export { allowedImageTypes as allowedPrizeImageTypes, maxImageBytes as maxPrizeImageBytes, imageProblem as prizeImageProblem } from './images';

export function prizeImageUrl(prize: { id: string; imageUpdatedAt?: string | null }): string | null {
  return imageUrl('prizes', prize);
}

export async function uploadPrizeImage(id: string, file: File): Promise<Prize> {
  return uploadImage<Prize>('prizes', id, file, 'prize');
}

export async function removePrizeImage(id: string): Promise<Prize> {
  return removeImage<Prize>('prizes', id, 'prize');
}
