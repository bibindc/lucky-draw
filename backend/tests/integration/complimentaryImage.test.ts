import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import { createTestDatabase } from './testDatabase';

let cleanup: (() => void) | undefined;
let prisma: PrismaClient;
let app: Express;
let adminCookie: string;
let agentCookie: string;
let optionId: string;
let participantId: string;

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);

beforeAll(async () => {
  ({ cleanup } = createTestDatabase('option-images'));
  const secret = 'a-test-secret-with-more-than-32-characters!!';
  process.env.JWT_SECRET = secret;
  ({ prisma } = await import('../../src/lib/prisma'));
  ({ app } = await import('../../src/app'));
  const { authCookieName, createAuthToken } = await import('../../src/utils/authToken');

  const admin = await prisma.admin.create({ data: { email: 'admin@example.com', name: 'Admin', passwordHash: 'x' } });
  const agent = await prisma.agent.create({ data: { agentCode: 'AG-1000', name: 'Agent', email: 'agent@example.com', mobile: '9876543210', passwordHash: 'x' } });
  adminCookie = `${authCookieName}=${createAuthToken(admin.id, secret, Date.now(), 'SUPER_ADMIN')}`;
  agentCookie = `${authCookieName}=${createAuthToken(agent.id, secret, Date.now(), 'AGENT')}`;

  const campaign = await prisma.campaign.create({
    data: { name: 'Autumn', durationMonths: 5, drawCount: 1, totalAmountPaise: 30_000, perDrawAmountPaise: 30_000, draws: { create: [{ drawNumber: 1, scheduledAt: new Date('2027-01-01'), prizeCount: 1 }] } },
    include: { draws: true },
  });
  optionId = (await prisma.complimentaryOption.create({ data: { campaignId: campaign.id, name: 'Dinner set' } })).id;
  // A fully paid participant of the agent, so the complimentary panel has something to show.
  participantId = (await prisma.participant.create({
    data: { campaignId: campaign.id, agentId: agent.id, name: 'Asha', participantNumber: 1000, mobile: '9123456780', drawPayments: { create: [{ drawId: campaign.draws[0].id, status: 'PAID' }] } },
  })).id;
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  cleanup?.();
});

const upload = (body: Buffer, cookie = adminCookie, contentType = 'image/png') =>
  request(app).put(`/api/v1/complimentary-options/${optionId}/image`).set('Cookie', cookie).set('Content-Type', contentType).send(body);
const view = (cookie?: string) => {
  const call = request(app).get(`/api/v1/complimentary-options/${optionId}/image`);
  return cookie ? call.set('Cookie', cookie) : call;
};

describe('complimentary option images through the API (live database)', () => {
  it('AC-CMP-11/13 stores an image that signed-in users, agents included, can view', async () => {
    const response = await upload(png);
    expect(response.status).toBe(200);
    expect(response.body.option.imageUpdatedAt).toEqual(expect.any(String));

    const served = await view(agentCookie);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect((await view()).status).toBe(401);

    const options = await request(app).get(`/api/v1/campaigns/${(await prisma.complimentaryOption.findUniqueOrThrow({ where: { id: optionId } })).campaignId}/complimentary-options`).set('Cookie', agentCookie);
    expect(options.body.options[0].imageUpdatedAt).toEqual(response.body.option.imageUpdatedAt);
  });

  it('AC-CMP-11 checks the contents and lets only super admins change images', async () => {
    expect((await upload(Buffer.from('<svg/>'))).body.error.code).toBe('INVALID_IMAGE');
    expect((await upload(png, agentCookie)).status).toBe(403);
    expect((await request(app).delete(`/api/v1/complimentary-options/${optionId}/image`).set('Cookie', agentCookie)).status).toBe(403);
  });

  it('AC-CMP-11/13 replaces the image after the option was chosen, and the choice carries it', async () => {
    await request(app).post(`/api/v1/participants/${participantId}/complimentary`).set('Cookie', adminCookie).send({ optionId }).expect(201);

    const replaced = await upload(jpeg, adminCookie, 'image/jpeg');
    expect(replaced.status).toBe(200);
    expect((await view(adminCookie)).headers['content-type']).toBe('image/jpeg');

    const panel = await request(app).get(`/api/v1/participants/${participantId}/complimentary`).set('Cookie', agentCookie);
    expect(panel.body.complimentary.choice.option).toMatchObject({ name: 'Dinner set', imageUpdatedAt: replaced.body.option.imageUpdatedAt });
  });

  it('AC-CMP-11 removes the image', async () => {
    const removed = await request(app).delete(`/api/v1/complimentary-options/${optionId}/image`).set('Cookie', adminCookie);
    expect(removed.status).toBe(200);
    expect(removed.body.option.imageUpdatedAt).toBeNull();
    expect((await view(adminCookie)).status).toBe(404);
    expect(await prisma.complimentaryOptionImage.count()).toBe(0);
  });
});
