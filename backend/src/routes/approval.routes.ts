import { Router } from 'express';
import { requireSuperAdmin } from '../middleware/auth';
import { approve, count, detail, list, reject, submit, withdraw } from '../controllers/approval.controller';

export const approvalRouter = Router();

// Per-route guards only: this router is mounted on /api/v1 (see 02-design.md).
approvalRouter.post('/approval-requests', submit);
approvalRouter.get('/approval-requests', list);
approvalRouter.get('/approval-requests/pending-count', requireSuperAdmin, count);
approvalRouter.get('/approval-requests/:id', detail);
approvalRouter.post('/approval-requests/:id/approve', requireSuperAdmin, approve);
approvalRouter.post('/approval-requests/:id/reject', requireSuperAdmin, reject);
approvalRouter.post('/approval-requests/:id/withdraw', withdraw);
