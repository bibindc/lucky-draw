import { Router } from 'express';
import { requireSuperAdmin } from '../middleware/auth';
import { publicOptionImage, publicPrizeImage, publicSite, readSiteSettings, updateSiteSettings } from '../controllers/site.controller';

/** Unauthenticated, read-only routes for the public website (07-public-website.md P4). */
export const publicRouter = Router();
publicRouter.get('/site', publicSite);
publicRouter.get('/prizes/:id/image', publicPrizeImage);
publicRouter.get('/complimentary-options/:id/image', publicOptionImage);

// Per-route guards: a router-wide guard on this /api/v1-mounted router would block agents from later routes.
export const siteSettingsRouter = Router();
siteSettingsRouter.get('/site-settings', requireSuperAdmin, readSiteSettings);
siteSettingsRouter.put('/site-settings', requireSuperAdmin, updateSiteSettings);
