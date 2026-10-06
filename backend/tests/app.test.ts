import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    admin: { findUnique: vi.fn().mockResolvedValue({ id: 'admin-id', role: 'SUPER_ADMIN' }) },
    agent: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

import { app } from '../src/app';
import { authCookieName, createAuthToken } from '../src/utils/authToken';

describe('GET /api/v1/health', () => {
  it('returns the API health status', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns the standard JSON error shape for unknown API routes', async () => {
    const secret = 'a-test-secret-with-more-than-32-characters';
    process.env.JWT_SECRET = secret;
    const token = createAuthToken('admin-id', secret);
    const response = await request(app)
      .get('/api/v1/not-a-route')
      .set('Cookie', `${authCookieName}=${token}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'The requested API endpoint was not found.' },
    });
  });
});