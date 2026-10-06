import { CampaignApiError } from './campaigns';

// Shared by prize images (AC-PRZ-8) and complimentary option images (AC-CMP-11).

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
export const maxImageBytes = 2 * 1024 * 1024;

/** Client-side check for quick feedback; the server re-checks the file's actual contents. */
export function imageProblem(file: File): string {
  if (!allowedImageTypes.includes(file.type)) return 'Choose a JPG, PNG or WebP image.';
  if (file.size > maxImageBytes) return 'Images can be at most 2 MB.';
  return '';
}

/** `/prizes/:id/image` style URL that changes whenever the image does, so caches never serve a stale copy. */
export function imageUrl(collection: 'prizes' | 'complimentary-options', item: { id: string; imageUpdatedAt?: string | null }): string | null {
  return item.imageUpdatedAt ? `${apiBaseUrl}/${collection}/${item.id}/image?v=${encodeURIComponent(item.imageUpdatedAt)}` : null;
}

export async function uploadImage<T>(collection: 'prizes' | 'complimentary-options', id: string, file: File, resultKey: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/${collection}/${id}/image`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> & { error?: { message?: string } } | null;
  if (!response.ok || !body?.[resultKey]) {
    throw new CampaignApiError(body?.error?.message ?? 'The image could not be uploaded.', undefined, response.status);
  }
  return body[resultKey] as T;
}

export async function removeImage<T>(collection: 'prizes' | 'complimentary-options', id: string, resultKey: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/${collection}/${id}/image`, { method: 'DELETE', credentials: 'include' });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> & { error?: { message?: string } } | null;
  if (!response.ok) throw new CampaignApiError(body?.error?.message ?? 'The image could not be removed.', undefined, response.status);
  return body?.[resultKey] as T;
}
