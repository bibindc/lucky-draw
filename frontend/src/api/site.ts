import { CampaignApiError } from './campaigns';

export type SiteSettings = {
  featuredCampaignId: string | null;
  organizerName: string | null;
  contactPhone: string | null;
  whatsappNumber: string | null;
  contactEmail: string | null;
  joinNote: string | null;
  updatedAt: string | null;
};

export type SiteSettingsInput = Omit<SiteSettings, 'updatedAt'>;

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';
/** Where the public website runs (07-public-website.md §7). */
export const publicSiteUrl = import.meta.env.VITE_SITE_URL ?? 'http://localhost:5180';

async function request<T>(init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/site-settings`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await response.json().catch(() => null)) as (T & { error?: { message?: string; details?: unknown } }) | null;
  if (!response.ok) {
    throw new CampaignApiError(body?.error?.message ?? 'The public website settings request could not be completed.', body?.error?.details, response.status);
  }
  return body as T;
}

export async function getSiteSettings() {
  return (await request<{ settings: SiteSettings }>()).settings;
}

export async function saveSiteSettings(input: SiteSettingsInput) {
  return (await request<{ settings: SiteSettings }>({ method: 'PUT', body: JSON.stringify(input) })).settings;
}
