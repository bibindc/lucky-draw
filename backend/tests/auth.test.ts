import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../src/utils/password';
import { authCookieName, createAuthToken } from '../src/utils/authToken';

const { adminFindUnique, agentFindUnique } = vi.hoisted(() => ({
  adminFindUnique: vi.fn(),
  agentFindUnique: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    admin: { findUnique: adminFindUnique },
    agent: { findUnique: agentFindUnique },
  },
}));

import { app } from '../src/app';

const password = 'a-strong-test-password';
const jwtSecret = 'a-test-jwt-secret-that-is-at-least-32-chars';

describe('admin authentication routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = jwtSecret;
  });

  it('creates an HTTP-only session cookie for a valid admin', async () => {
    adminFindUnique.mockResolvedValue({
      id: 'admin-id',
      email: 'admin@example.com',
      name: 'Admin User',
      passwordHash: await hashPassword(password),
    });
    agentFindUnique.mockResolvedValue(null);

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ADMIN@example.com', password });

    expect(response.status).toBe(200);
    expect(response.body.admin).toMatchObject({ id: 'admin-id', email: 'admin@example.com' });
    expect(response.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect(response.headers['set-cookie'][0]).toMatch(/Path=\/api\/v1/);
    expect(response.headers['set-cookie'][0]).toMatch(/SameSite=Strict/);
  });

  it('rejects unauthenticated requests to protected API routes', async () => {
    const response = await request(app).get('/api/v1/campaigns');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns the current admin for a valid session', async () => {
    const passwordHash = await hashPassword(password);
    adminFindUnique
      .mockResolvedValueOnce({
        id: 'admin-id',
        email: 'admin@example.com',
        name: 'Admin User',
        passwordHash,
      })
      .mockResolvedValueOnce({ id: 'admin-id', email: 'admin@example.com', name: 'Admin User', role: 'SUPER_ADMIN' });
    agentFindUnique.mockResolvedValue(null);

    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password });
    const sessionCookie = loginResponse.headers['set-cookie'][0].split(';')[0];
    const sessionResponse = await request(app).get('/api/v1/auth/me').set('Cookie', sessionCookie);

    expect(sessionResponse.status).toBe(200);
    expect(sessionResponse.body.admin).toMatchObject({ id: 'admin-id', email: 'admin@example.com' });
  });

  it('authenticates an active agent but blocks agent management routes', async () => {
    const passwordHash = await hashPassword(password);
    agentFindUnique.mockResolvedValue({
      id: 'agent-id',
      agentCode: 'AG-1000',
      name: 'Agent One',
      email: 'agent@example.com',
      mobile: '9876543210',
      passwordHash,
      isActive: true,
    });
    adminFindUnique.mockResolvedValue(null);

    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'agent@example.com', password });
    const sessionCookie = loginResponse.headers['set-cookie'][0].split(';')[0];
    const sessionResponse = await request(app).get('/api/v1/auth/me').set('Cookie', sessionCookie);
    const agentsResponse = await request(app).get('/api/v1/agents').set('Cookie', sessionCookie);
    const campaignResponse = await request(app)
      .get('/api/v1/campaigns/00000000-0000-4000-8000-000000000001')
      .set('Cookie', sessionCookie);

    expect(loginResponse.body.admin).toMatchObject({ role: 'AGENT', agentCode: 'AG-1000' });
    expect(sessionResponse.body.admin.role).toBe('AGENT');
    expect(agentsResponse.status).toBe(403);
    expect(campaignResponse.status).toBe(403);
  });

  it('AC-AUTH-3/5 logout clears the session cookie, even when the session has already expired', async () => {
    const expiredToken = createAuthToken('admin-id', jwtSecret, Date.now() - 9 * 60 * 60 * 1000);
    const cleared = /lucky_draw_session=;.*Path=\/api\/v1.*Expires=Thu, 01 Jan 1970/;

    const withoutSession = await request(app).post('/api/v1/auth/logout');
    const withExpiredSession = await request(app).post('/api/v1/auth/logout').set('Cookie', `${authCookieName}=${expiredToken}`);

    for (const response of [withoutSession, withExpiredSession]) {
      expect(response.status).toBe(204);
      expect(response.headers['set-cookie'][0]).toMatch(cleared);
    }
  });

  it('AC-AUTH-3 a signed-out session can no longer reach protected routes', async () => {
    adminFindUnique.mockResolvedValue({
      id: 'admin-id', email: 'admin@example.com', name: 'Admin User', role: 'SUPER_ADMIN', passwordHash: await hashPassword(password),
    });
    agentFindUnique.mockResolvedValue(null);
    const agent = request.agent(app);

    await agent.post('/api/v1/auth/login').send({ email: 'admin@example.com', password });
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
    await agent.post('/api/v1/auth/logout');
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('rejects an already-issued token after its agent account is deactivated', async () => {
    agentFindUnique.mockResolvedValue({ id: 'agent-id', isActive: false });
    const token = createAuthToken('agent-id', jwtSecret, Date.now(), 'AGENT');

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${authCookieName}=${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});