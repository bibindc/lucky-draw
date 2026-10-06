import { Router } from 'express';
import { requireSuperAdmin } from '../middleware/auth';
import { getPaymentHistory, recordPayment, voidPayment } from '../controllers/payment.controller';

export const paymentRouter = Router();

// Per-route guards: a router-wide guard on this /api/v1-mounted router would block agents from later routes.
paymentRouter.post('/participants/:id/payments', requireSuperAdmin, recordPayment);
paymentRouter.get('/participants/:id/payments', requireSuperAdmin, getPaymentHistory);
paymentRouter.post('/payments/:transactionId/void', requireSuperAdmin, voidPayment);
