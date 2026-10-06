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
let featuredId: string;
let otherCampaignId: string;
let featuredPrizeId: string;
let otherPrizeId: string;
let activeOptionId: string;
let inactiveOptionId: string;

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const day = 86_400_000;

beforeAll(async () => {
  ({ cleanup } = createTestDatabase('public-site'));
  const secret = 'a-test-secret-with-more-than-32-characters!!';
  process.env.JWT_SECRET = secret;
  ({ prisma } = await import('../../src/lib/prisma'));
  ({ app } = await import('../../src/app'));
  const { authCookieName, createAuthToken } = await import('../../src/utils/authToken');

  const admin = await prisma.admin.create({ data: { email: 'admin@example.com', name: 'Admin', passwordHash: 'x' } });
  const agent = await prisma.agent.create({ data: { agentCode: 'AG-1000', name: 'Agent Kumar', email: 'agent@example.com', mobile: '9876500000', passwordHash: 'x' } });
  adminCookie = `${authCookieName}=${createAuthToken(admin.id, secret, Date.now(), 'SUPER_ADMIN')}`;
  agentCookie = `${authCookieName}=${createAuthToken(agent.id, secret, Date.now(), 'AGENT')}`;

  const now = Date.now();
  const featured = await prisma.campaign.create({
    data: {
      name: 'Diwali Circle', durationMonths: 3, drawCount: 3, totalAmountPaise: 90_000, perDrawAmountPaise: 30_000,
      draws: { create: [
        { drawNumber: 1, scheduledAt: new Date(now - 20 * day), prizeCount: 2, status: 'COMPLETED', executionMode: 'AUTOMATIC', totalRounds: 2, roundsCompleted: 2, executedAt: new Date(now - 20 * day) },
        { drawNumber: 2, scheduledAt: new Date(now + 10 * day), prizeCount: 1 },
        { drawNumber: 3, scheduledAt: new Date(now + 40 * day), prizeCount: 1 },
      ] },
    },
    include: { draws: { orderBy: { drawNumber: 'asc' } } },
  });
  featuredId = featured.id;
  const [first, second] = featured.draws;
  const gold = await prisma.prize.create({ data: { campaignId: featuredId, drawId: first.id, name: 'Gold coin', rank: 1, totalQuantity: 1, assignedQuantity: 1, valuePaise: 500_000 } });
  const silver = await prisma.prize.create({ data: { campaignId: featuredId, drawId: first.id, name: 'Silver coin', rank: 2, totalQuantity: 1, assignedQuantity: 1, valuePaise: 100_000 } });
  featuredPrizeId = (await prisma.prize.create({ data: { campaignId: featuredId, drawId: second.id, name: 'Scooter', description: 'Electric', rank: 1, totalQuantity: 1 } })).id;

  const asha = await prisma.participant.create({ data: { campaignId: featuredId, agentId: agent.id, name: 'Asha Ramanathan', participantNumber: 1001, mobile: '9123456780', email: 'asha@example.com', address: '12 Lake Road' } });
  const bala = await prisma.participant.create({ data: { campaignId: featuredId, agentId: agent.id, name: 'Bala', participantNumber: 1002 } });
  await prisma.participant.create({ data: { campaignId: featuredId, name: 'Chitra Nair', participantNumber: 1003 } });
  await prisma.winner.create({ data: { drawId: first.id, participantId: bala.id, prizeId: silver.id, drawPosition: 1, drawnAt: new Date(now - 20 * day), claimStatus: 'DELIVERED', claimNote: 'Handed over at office' } });
  await prisma.winner.create({ data: { drawId: first.id, participantId: asha.id, prizeId: gold.id, drawPosition: 2, drawnAt: new Date(now - 20 * day + 60_000) } });

  activeOptionId = (await prisma.complimentaryOption.create({ data: { campaignId: featuredId, name: 'Dinner set' } })).id;
  inactiveOptionId = (await prisma.complimentaryOption.create({ data: { campaignId: featuredId, name: 'Old mixer', isActive: false } })).id;

  const other = await prisma.campaign.create({ data: { name: 'Secret Summer', durationMonths: 1, drawCount: 1, totalAmountPaise: 1, perDrawAmountPaise: 1 } });
  otherCampaignId = other.id;
  otherPrizeId = (await prisma.prize.create({ data: { campaignId: other.id, name: 'Hidden TV', rank: 1, totalQuantity: 1 } })).id;

  for (const prizeId of [featuredPrizeId, otherPrizeId]) {
    await prisma.prizeImage.create({ data: { prizeId, mimeType: 'image/png', data: new Uint8Array(png), size: png.length } });
    await prisma.prize.update({ where: { id: prizeId }, data: { imageUpdatedAt: new Date() } });
  }
  for (const optionId of [activeOptionId, inactiveOptionId]) {
    await prisma.complimentaryOptionImage.create({ data: { optionId, mimeType: 'image/png', data: new Uint8Array(png), size: png.length } });
  }
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  cleanup?.();
});

describe('public website', () => {
  it('shows only contact details while no campaign is featured', async () => {
    const response = await request(app).get('/api/v1/public/site');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ campaign: null, draws: [], recentWinners: [], pastResults: [], nextDraw: null });
  });

  it('AC-PUB-1 lets only super admins save settings, with validation', async () => {
    expect((await request(app).get('/api/v1/site-settings').set('Cookie', agentCookie)).status).toBe(403);
    expect((await request(app).put('/api/v1/site-settings').set('Cookie', agentCookie).send({ featuredCampaignId: featuredId })).status).toBe(403);
    expect((await request(app).put('/api/v1/site-settings').send({ featuredCampaignId: featuredId })).status).toBe(401);

    const invalid = await request(app).put('/api/v1/site-settings').set('Cookie', adminCookie).send({ featuredCampaignId: featuredId, contactPhone: '12ab', contactEmail: 'nope' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.details.map((issue: { path: string[] }) => issue.path[0]).sort()).toEqual(['contactEmail', 'contactPhone']);

    const unknown = await request(app).put('/api/v1/site-settings').set('Cookie', adminCookie).send({ featuredCampaignId: '00000000-0000-4000-8000-000000000000' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('CAMPAIGN_NOT_FOUND');

    const saved = await request(app).put('/api/v1/site-settings').set('Cookie', adminCookie).send({
      featuredCampaignId: featuredId, organizerName: ' Lakshmi Chits ', contactPhone: '+91 98765-43210', whatsappNumber: '', contactEmail: 'hello@lakshmi.example', joinNote: 'Call us to join.',
    });
    expect(saved.status).toBe(200);
    expect(saved.body.settings).toMatchObject({ featuredCampaignId: featuredId, organizerName: 'Lakshmi Chits', contactPhone: '+919876543210', whatsappNumber: null, joinNote: 'Call us to join.' });
    expect((await request(app).get('/api/v1/site-settings').set('Cookie', adminCookie)).body.settings.contactPhone).toBe('+919876543210');
  });

  it('AC-PUB-3..8 summarises the featured campaign without signing in', async () => {
    const response = await request(app).get('/api/v1/public/site').set('Origin', 'https://www.example.org');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=60');
    expect(response.headers['access-control-allow-origin']).toBe('*');
    const site = response.body;

    expect(site.contact).toEqual({ organizerName: 'Lakshmi Chits', contactPhone: '+919876543210', whatsappNumber: null, contactEmail: 'hello@lakshmi.example', joinNote: 'Call us to join.' });
    expect(site.campaign).toEqual({ name: 'Diwali Circle', status: 'ACTIVE', durationMonths: 3, drawCount: 3, perDrawAmountPaise: 30_000, totalAmountPaise: 90_000 });
    expect(site.stats).toEqual({ members: 3, drawsCompleted: 1, totalDraws: 3, winners: 2, prizeUnits: 3, prizeValuePaise: 600_000 });
    expect(site.draws.map((draw: { drawNumber: number; status: string }) => [draw.drawNumber, draw.status])).toEqual([[1, 'COMPLETED'], [2, 'UPCOMING'], [3, 'UPCOMING']]);
    expect(site.draws[1].prizes[0]).toMatchObject({ id: featuredPrizeId, name: 'Scooter', description: 'Electric', rank: 1, quantity: 1 });
    expect(site.nextDraw).toMatchObject({ drawNumber: 2, status: 'UPCOMING' });
    expect(site.complimentaryOptions.map((option: { name: string }) => option.name)).toEqual(['Dinner set']);

    expect(site.recentWinners.map((winner: { name: string; participantNumber: number; prize: { name: string } }) => [winner.name, winner.participantNumber, winner.prize.name]))
      .toEqual([['Asha R.', 1001, 'Gold coin'], ['Bala', 1002, 'Silver coin']]);
    expect(site.pastResults).toHaveLength(1);
    expect(site.pastResults[0]).toMatchObject({ drawNumber: 1, mode: 'AUTOMATIC' });
    expect(site.pastResults[0].winners.map((winner: { round: number; name: string }) => [winner.round, winner.name])).toEqual([[1, 'Bala'], [2, 'Asha R.']]);
  });

  it('AC-PUB-9 never exposes private participant, agent or admin data', async () => {
    const raw = (await request(app).get('/api/v1/public/site')).text;
    for (const secret of ['Ramanathan', '9123456780', 'asha@example.com', '12 Lake Road', 'AG-1000', 'Agent Kumar', '9876500000', 'claimStatus', 'DELIVERED', 'Handed over', 'admin@example.com', 'Secret Summer', 'Hidden TV', 'Chitra', 'poolSnapshot', 'participantId', otherCampaignId, featuredId]) {
      expect(raw, `public response leaks ${secret}`).not.toContain(secret);
    }
  });

  it('AC-PUB-5 reports a draw in progress, or one whose time has passed', async () => {
    const draw2 = await prisma.draw.findFirstOrThrow({ where: { campaignId: featuredId, drawNumber: 2 } });
    await prisma.draw.update({ where: { id: draw2.id }, data: { scheduledAt: new Date(Date.now() - 60_000) } });
    expect((await request(app).get('/api/v1/public/site')).body.nextDraw).toMatchObject({ drawNumber: 2, status: 'RESULTS_SOON' });
    await prisma.draw.update({ where: { id: draw2.id }, data: { status: 'IN_PROGRESS', totalRounds: 1 } });
    expect((await request(app).get('/api/v1/public/site')).body.nextDraw).toMatchObject({ drawNumber: 2, status: 'IN_PROGRESS', roundsCompleted: 0, totalRounds: 1 });
  });

  it('AC-PUB-10 serves images of the featured campaign only', async () => {
    const prizeImage = await request(app).get(`/api/v1/public/prizes/${featuredPrizeId}/image`);
    expect(prizeImage.status).toBe(200);
    expect(prizeImage.headers['content-type']).toBe('image/png');
    expect(prizeImage.headers['cache-control']).toBe('public, max-age=86400');
    expect((await request(app).get(`/api/v1/public/complimentary-options/${activeOptionId}/image`)).status).toBe(200);

    expect((await request(app).get(`/api/v1/public/prizes/${otherPrizeId}/image`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/public/complimentary-options/${inactiveOptionId}/image`)).status).toBe(404);
    expect((await request(app).get('/api/v1/public/prizes/not-a-uuid/image')).status).toBe(404);
  });

  it('turning the feature off hides the campaign again', async () => {
    await request(app).put('/api/v1/site-settings').set('Cookie', adminCookie).send({ featuredCampaignId: null, organizerName: 'Lakshmi Chits' });
    const site = (await request(app).get('/api/v1/public/site')).body;
    expect(site.campaign).toBeNull();
    expect(site.contact.organizerName).toBe('Lakshmi Chits');
    expect((await request(app).get(`/api/v1/public/prizes/${featuredPrizeId}/image`)).status).toBe(404);
  });
});

describe('public names', () => {
  it('P2 keeps the first name and the initial of the last name', async () => {
    const { publicName } = await import('../../src/services/site.service');
    expect(publicName('Asha Ramanathan')).toBe('Asha R.');
    expect(publicName('  Mary  Anne   de souza ')).toBe('Mary S.');
    expect(publicName('Bala')).toBe('Bala');
  });
});
