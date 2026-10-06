import type { Request, Response } from 'express';
import { z } from 'zod';
import { SiteError, getPublicSite, getSiteSettings, loadPublicOptionImage, loadPublicPrizeImage, saveSiteSettings } from '../services/site.service';
import { siteSettingsSchema } from '../validators/site.validator';

export async function readSiteSettings(_request: Request, response: Response) {
  return response.json({ settings: await getSiteSettings() });
}

export async function updateSiteSettings(request: Request, response: Response) {
  const parsed = siteSettingsSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Public website settings are invalid.', details: parsed.error.issues } });
  }
  try {
    const settings = await saveSiteSettings(parsed.data, request.adminId);
    return response.json({ settings });
  } catch (error) {
    if (error instanceof SiteError) return response.status(error.status).json({ error: { code: error.code, message: error.message } });
    throw error;
  }
}

/** AC-PUB-2: cached for at most a minute so settings and new winners show up quickly. */
export async function publicSite(_request: Request, response: Response) {
  const site = await getPublicSite();
  response.set('Cache-Control', 'public, max-age=60');
  return response.json(site);
}

function publicImage(load: (id: string) => Promise<{ mimeType: string; data: Uint8Array; size: number } | null>) {
  return async (request: Request, response: Response) => {
    const parsed = z.uuid().safeParse(request.params.id);
    const image = parsed.success ? await load(parsed.data) : null;
    if (!image) return response.status(404).json({ error: { code: 'NOT_FOUND', message: 'There is no image.' } });
    // URLs carry ?v=<imageUpdatedAt>, so a cached copy is never stale.
    response.set({ 'Content-Type': image.mimeType, 'Content-Length': String(image.size), 'Cache-Control': 'public, max-age=86400' });
    return response.send(Buffer.from(image.data));
  };
}

export const publicPrizeImage = publicImage(loadPublicPrizeImage);
export const publicOptionImage = publicImage(loadPublicOptionImage);
