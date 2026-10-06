import { Router } from 'express';
import { requireSuperAdmin } from '../middleware/auth';
import {
  addOption,
  campaignComplimentary,
  chooseComplimentary,
  deliverComplimentary,
  editOption,
  getOptions,
  participantComplimentary,
} from '../controllers/complimentary.controller';
import { imageHandlers } from '../controllers/imageHandlers';
import { readImageBody } from '../middleware/readImageBody';
import { loadOptionImage, removeOptionImage, saveOptionImage } from '../services/complimentaryImage.service';

const optionImages = imageHandlers({ save: saveOptionImage, remove: removeOptionImage, load: loadOptionImage, resultKey: 'option' });

export const complimentaryRouter = Router();

// Options: everyone signed in can read (agents see active ones); only super admins manage them (AC-CMP-1).
complimentaryRouter.get('/campaigns/:id/complimentary-options', getOptions);
complimentaryRouter.post('/campaigns/:id/complimentary-options', requireSuperAdmin, addOption);
complimentaryRouter.patch('/complimentary-options/:id', requireSuperAdmin, editOption);
// Option images (AC-CMP-11, AC-CMP-13): any signed-in user may view; only super admins change them.
complimentaryRouter.get('/complimentary-options/:id/image', optionImages.serve);
complimentaryRouter.put('/complimentary-options/:id/image', requireSuperAdmin, readImageBody, optionImages.upload);
complimentaryRouter.delete('/complimentary-options/:id/image', requireSuperAdmin, optionImages.remove);

// Participants: agents are limited to their own participants inside the service (AC-CMP-10).
complimentaryRouter.get('/campaigns/:id/complimentary', campaignComplimentary);
complimentaryRouter.get('/participants/:id/complimentary', participantComplimentary);
complimentaryRouter.post('/participants/:id/complimentary', chooseComplimentary);
complimentaryRouter.post('/participants/:id/complimentary/deliver', deliverComplimentary);
