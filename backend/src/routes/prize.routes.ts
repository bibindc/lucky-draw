import { Router } from 'express';
import { requireSuperAdmin } from '../middleware/auth';
import { createPrize, deletePrize, listPrizes, updatePrize } from '../controllers/prize.controller';
import { deleteImage, serveImage, uploadImage } from '../controllers/prizeImage.controller';
import { readImageBody } from '../middleware/readImageBody';

export const prizeRouter = Router();

// Guard each route rather than using prizeRouter.use(): this router is mounted on /api/v1, so a router-wide guard
// would also block agents from unrelated routes mounted after it (such as participants).
prizeRouter.post('/campaigns/:id/prizes', requireSuperAdmin, createPrize);
prizeRouter.get('/campaigns/:id/prizes', requireSuperAdmin, listPrizes);
prizeRouter.patch('/prizes/:id', requireSuperAdmin, updatePrize);
prizeRouter.delete('/prizes/:id', requireSuperAdmin, deletePrize);

// Prize images (AC-PRZ-8..12): any signed-in user may view; only super admins change them.
prizeRouter.get('/prizes/:id/image', serveImage);
prizeRouter.put('/prizes/:id/image', requireSuperAdmin, readImageBody, uploadImage);
prizeRouter.delete('/prizes/:id/image', requireSuperAdmin, deleteImage);
