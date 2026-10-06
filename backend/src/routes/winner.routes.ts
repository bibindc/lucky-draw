import { Router } from 'express';
import { requireSuperAdmin } from '../middleware/auth';
import { listWinners, updateWinnerClaim } from '../controllers/winner.controller';

export const winnerRouter = Router();

// Per-route guards: a router-wide guard on this /api/v1-mounted router would block agents from later routes.
winnerRouter.get('/campaigns/:id/winners', requireSuperAdmin, listWinners);
winnerRouter.patch('/winners/:id/claim', requireSuperAdmin, updateWinnerClaim);
