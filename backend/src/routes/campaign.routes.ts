import { Router } from 'express';
import { requireSuperAdmin } from '../middleware/auth';
import {
  createCampaign,
  getCampaign,
  getCampaignDraws,
  getDashboard,
  listCampaigns,
} from '../controllers/campaign.controller';

export const campaignRouter = Router();

campaignRouter.post('/', requireSuperAdmin, createCampaign);
campaignRouter.get('/', listCampaigns);
campaignRouter.get('/:id/dashboard', requireSuperAdmin, getDashboard);
campaignRouter.get('/:id/draws', requireSuperAdmin, getCampaignDraws);
campaignRouter.get('/:id', requireSuperAdmin, getCampaign);