import { Router } from 'express';
import { createParticipant, exportParticipants, getParticipant, listParticipants, nextSerial, updateParticipant } from '../controllers/participant.controller';

export const participantRouter = Router();

participantRouter.post('/campaigns/:id/participants', createParticipant);
participantRouter.get('/campaigns/:id/participants', listParticipants);
participantRouter.get('/campaigns/:id/participants/export', exportParticipants);
// Registered before /participants/:id so the literal path is not read as an id.
participantRouter.get('/participants/next-serial', nextSerial);
participantRouter.get('/participants/:id', getParticipant);
participantRouter.patch('/participants/:id', updateParticipant);
