import { Router } from 'express';
import { requireSuperAdmin } from '../middleware/auth';
import { updateDraw } from '../controllers/campaign.controller';
import { drawPool, drawResult, round, start } from '../controllers/draw.controller';

export const drawRouter = Router();

drawRouter.use(requireSuperAdmin);

drawRouter.patch('/:id', updateDraw);
drawRouter.post('/:id/start', start);
drawRouter.post('/:id/rounds', round);
drawRouter.get('/:id/result', drawResult);
drawRouter.get('/:id/pool', drawPool);
