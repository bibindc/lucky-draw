import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { currentAdmin, login, logout } from './controllers/auth.controller';
import { requireAuth } from './middleware/auth';
import { campaignRouter } from './routes/campaign.routes';
import { drawRouter } from './routes/draw.routes';
import { prizeRouter } from './routes/prize.routes';
import { participantRouter } from './routes/participant.routes';
import { paymentRouter } from './routes/payment.routes';
import { winnerRouter } from './routes/winner.routes';
import { agentRouter } from './routes/agent.routes';
import { complimentaryRouter } from './routes/complimentary.routes';
import { approvalRouter } from './routes/approval.routes';
import { publicRouter, siteSettingsRouter } from './routes/site.routes';

export const app = express();

// The public website API is read-only and cookie-free, so any site may call it (07-public-website.md P4).
app.use('/api/v1/public', cors(), publicRouter);

// CORS_ORIGIN may list several origins, separated by commas.
const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/v1/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.post('/api/v1/auth/login', login);
// Logout needs no valid session: it must still clear the cookie after the session has expired.
app.post('/api/v1/auth/logout', logout);
app.get('/api/v1/auth/me', requireAuth, currentAdmin);
app.use('/api/v1', requireAuth);
app.use('/api/v1/campaigns', campaignRouter);
app.use('/api/v1/draws', drawRouter);
app.use('/api/v1', prizeRouter);
app.use('/api/v1', participantRouter);
app.use('/api/v1', paymentRouter);
app.use('/api/v1', winnerRouter);
app.use('/api/v1/agents', agentRouter);
app.use('/api/v1', complimentaryRouter);
app.use('/api/v1', approvalRouter);
app.use('/api/v1', siteSettingsRouter);

app.use('/api/v1', (_request, response) => {
  response.status(404).json({
    error: { code: 'NOT_FOUND', message: 'The requested API endpoint was not found.' },
  });
});

// Production serves the built admin app from this origin, so the SameSite=Strict session cookie works (02-design.md §Deployment).
const adminAppDir = process.env.ADMIN_APP_DIR ?? resolve(__dirname, '../../frontend/dist');
if (process.env.NODE_ENV === 'production' && existsSync(join(adminAppDir, 'index.html'))) {
  // Vite gives assets content-hashed names, so they can be cached for a long time; index.html must stay fresh.
  app.use('/assets', express.static(join(adminAppDir, 'assets'), { immutable: true, maxAge: '365d' }));
  app.use(express.static(adminAppDir, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/).*/, (_request, response) => {
    response.set('Cache-Control', 'no-cache');
    response.sendFile(join(adminAppDir, 'index.html'));
  });
}

const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  void next;
  const status =
    typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
      ? error.status
      : 500;
  const isClientError = status >= 400 && status < 500;

  response.status(status).json({
    error: {
      code: isClientError ? 'VALIDATION_ERROR' : 'INTERNAL_SERVER_ERROR',
      message: isClientError ? 'The request could not be processed.' : 'An unexpected server error occurred.',
    },
  });
};

app.use(errorHandler);