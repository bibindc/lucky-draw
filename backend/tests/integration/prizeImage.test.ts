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
let prizeId: string;

// Smallest valid headers for each allowed format, padded so they look like real files.
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(64, 3)]);

beforeAll(async () => {
  ({ cleanup } = createTestDatabase('prize-images'));
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
  // Already assigned to a winner: images may still change (AC-PRZ-9).
  prizeId = (await prisma.prize.create({ data: { campaignId: campaign.id, drawId: campaign.draws[0].id, name: 'Watch', rank: 1, totalQuantity: 2, assignedQuantity: 1 } })).id;
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  cleanup?.();
});

const upload = (body: Buffer, contentType = 'image/png', cookie = adminCookie) =>
  request(app).put(`/api/v1/prizes/${prizeId}/image`).set('Cookie', cookie).set('Content-Type', contentType).send(body);

describe('prize images through the API (live database)', () => {
  it('AC-PRZ-8/12 stores an image and serves it only to signed-in users', async () => {
    const response = await upload(png);
    expect(response.status).toBe(200);
    expect(response.body.prize.imageUpdatedAt).toEqual(expect.any(String));

    const served = await request(app).get(`/api/v1/prizes/${prizeId}/image`).set('Cookie', agentCookie);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(served.body as Buffer, png)).toBe(0);

    expect((await request(app).get(`/api/v1/prizes/${prizeId}/image`)).status).toBe(401);
  });

  it('AC-PRZ-8 replaces the image and detects the type from the contents, not the declared type', async () => {
    // Declared as PNG but actually a JPEG: stored as what it really is.
    expect((await upload(jpeg, 'image/png')).status).toBe(200);
    const served = await request(app).get(`/api/v1/prizes/${prizeId}/image`).set('Cookie', adminCookie);
    expect(served.headers['content-type']).toBe('image/jpeg');

    expect((await upload(webp, 'application/octet-stream')).status).toBe(200);
    expect((await request(app).get(`/api/v1/prizes/${prizeId}/image`).set('Cookie', adminCookie)).headers['content-type']).toBe('image/webp');
    expect(await prisma.prizeImage.count({ where: { prizeId } })).toBe(1);
  });

  it('AC-PRZ-8 rejects files that are not allowed images, empty uploads and files over 2 MB', async () => {
    const fake = await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/png');
    expect(fake.status).toBe(415);
    expect(fake.body.error).toMatchObject({ code: 'INVALID_IMAGE', message: 'Upload a JPG, PNG or WebP image.' });

    expect((await upload(Buffer.from('GIF89a........'), 'image/gif')).body.error.code).toBe('INVALID_IMAGE');
    expect((await upload(Buffer.alloc(0))).status).toBe(400);

    const huge = await upload(Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]));
    expect(huge.status).toBe(413);
    expect(huge.body.error.code).toBe('IMAGE_TOO_LARGE');
  });

  it('AC-PRZ-8 lets only super admins change images', async () => {
    expect((await upload(png, 'image/png', agentCookie)).status).toBe(403);
    expect((await request(app).delete(`/api/v1/prizes/${prizeId}/image`).set('Cookie', agentCookie)).status).toBe(403);
  });

  it('AC-PRZ-8 removes the image', async () => {
    await upload(png);
    const removed = await request(app).delete(`/api/v1/prizes/${prizeId}/image`).set('Cookie', adminCookie);
    expect(removed.status).toBe(200);
    expect(removed.body.prize.imageUpdatedAt).toBeNull();
    expect((await request(app).get(`/api/v1/prizes/${prizeId}/image`).set('Cookie', adminCookie)).status).toBe(404);
  });

  it('AC-PRZ-9 deletes the image together with an unassigned prize', async () => {
    const prize = await prisma.prize.create({ data: { campaignId: (await prisma.campaign.findFirstOrThrow()).id, name: 'Cooker', rank: 2, totalQuantity: 1 } });
    await request(app).put(`/api/v1/prizes/${prize.id}/image`).set('Cookie', adminCookie).set('Content-Type', 'image/png').send(png);
    expect(await prisma.prizeImage.count({ where: { prizeId: prize.id } })).toBe(1);

    expect((await request(app).delete(`/api/v1/prizes/${prize.id}`).set('Cookie', adminCookie)).status).toBe(204);
    expect(await prisma.prizeImage.count({ where: { prizeId: prize.id } })).toBe(0);
  });
});
