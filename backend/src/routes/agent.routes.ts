import { Router } from 'express';
import { createAgent, listAgents, updateAgent } from '../controllers/agent.controller';
import { requireSuperAdmin } from '../middleware/auth';

export const agentRouter = Router();

agentRouter.use(requireSuperAdmin);
agentRouter.get('/', listAgents);
agentRouter.post('/', createAgent);
agentRouter.patch('/:id', updateAgent);