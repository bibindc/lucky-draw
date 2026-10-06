import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Every lookup finds nothing, so allowed routes answer 404/400 while forbidden ones answer 403 before any lookup.
vi.mock('../src/lib/prisma', () => {
  const none = vi.fn().mockResolvedValue(null);
  return {
    prisma: {
      agent: { findUnique: vi.fn().mockResolvedValue({ id: 'agent-id', isActive: true }) },
      admin: { findUnique: none },
      campaign: { findUnique: none },
      participant: { findFirst: none, findUnique: none, findMany: vi.fn().mockResolvedValue([]) },
      sequenceCounter: { findUnique: none },
      approvalRequest: { findMany: vi.fn().mockResolvedValue([]), findFirst: none, updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    },
  };
});

import { app } from '../src/app';
import { authCookieName, createAuthToken } from '../src/utils/authToken';

const id = '00000000-0000-4000-8000-000000000001';
let agentCookie: string;

beforeAll(() => {
  const secret = 'a-test-secret-with-more-than-32-characters!!';
  process.env.JWT_SECRET = secret;
  agentCookie = `${authCookieName}=${createAuthToken('agent-id', secret, Date.now(), 'AGENT')}`;
});

describe('agent route access through the real router (AC-AGT-8, AC-CMP-10, AC-APR-2)', () => {
  it.each([
    ['GET', `/api/v1/campaigns/${id}/participants`],
    ['GET', `/api/v1/participants/${id}`],
    ['GET', '/api/v1/participants/next-serial'],
    ['GET', `/api/v1/participants/${id}/complimentary`],
    ['GET', `/api/v1/campaigns/${id}/complimentary-options`],
    ['POST', '/api/v1/approval-requests'],
    ['GET', '/api/v1/approval-requests'],
    ['POST', `/api/v1/approval-requests/${id}/withdraw`],
  ])('lets an agent reach %s %s', async (method, path) => {
    const response = await request(app)[method === 'GET' ? 'get' : 'post'](path).set('Cookie', agentCookie).send({});
    expect(response.status).not.toBe(403);
  });

  it.each([
    ['GET', `/api/v1/campaigns/${id}/prizes`],
    ['POST', `/api/v1/participants/${id}/payments`],
    ['POST', `/api/v1/payments/${id}/void`],
    ['GET', `/api/v1/campaigns/${id}/winners`],
    ['POST', `/api/v1/campaigns/${id}/complimentary-options`],
    ['PATCH', `/api/v1/complimentary-options/${id}`],
    ['GET', '/api/v1/agents'],
    ['POST', `/api/v1/draws/${id}/start`],
    // AC-APR-2: direct changes are super-admin only; agents use approval requests.
    ['POST', `/api/v1/campaigns/${id}/participants`],
    ['PATCH', `/api/v1/participants/${id}`],
    ['POST', `/api/v1/participants/${id}/complimentary`],
    ['POST', `/api/v1/participants/${id}/complimentary/deliver`],
    ['GET', '/api/v1/approval-requests/pending-count'],
    ['POST', `/api/v1/approval-requests/${id}/approve`],
    ['POST', `/api/v1/approval-requests/${id}/reject`],
  ])('blocks an agent from %s %s', async (method, path) => {
    const call = request(app);
    const response = await (method === 'GET' ? call.get(path) : method === 'PATCH' ? call.patch(path) : call.post(path)).set('Cookie', agentCookie).send({});
    expect(response.status).toBe(403);
  });
});
