import type { Request, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestDatabase } from './testDatabase';

let cleanup: (() => void) | undefined;
let prisma: PrismaClient;
let listWinners: typeof import('../../src/controllers/winner.controller').listWinners;
let campaignId: string;
let draw1Id: string;

beforeAll(async () => {
  ({ cleanup } = createTestDatabase('winners'));
  ({ prisma } = await import('../../src/lib/prisma'));
  ({ listWinners } = await import('../../src/controllers/winner.controller'));

  const agent = await prisma.agent.create({ data: { agentCode: 'AG-1000', name: 'Agent One', email: 'agent@example.com', mobile: '9876543210', passwordHash: 'x' } });
  const campaign = await prisma.campaign.create({ data: { name: 'Autumn Circle', durationMonths: 5, drawCount: 2, totalAmountPaise: 60_000, perDrawAmountPaise: 30_000 } });
  campaignId = campaign.id;
  const draws = await Promise.all([1, 2].map((drawNumber) => prisma.draw.create({
    data: { campaignId, drawNumber, scheduledAt: new Date(Date.UTC(2026, 8, drawNumber)), prizeCount: 2, status: 'COMPLETED', executionMode: drawNumber === 1 ? 'MANUAL' : 'AUTOMATIC' },
  })));
  draw1Id = draws[0].id;
  const prize = await prisma.prize.create({ data: { campaignId, drawId: draw1Id, name: 'Gold coin', rank: 1, totalQuantity: 4, assignedQuantity: 3 } });

  // Created out of order on purpose: the list must sort by draw number, then drawn position.
  const entries = [
    { name: 'Chitra', number: 1002, draw: 1, position: 1, claimStatus: 'PENDING', agentId: null },
    { name: 'Asha', number: 1000, draw: 0, position: 2, claimStatus: 'DELIVERED', agentId: agent.id },
    { name: 'Bala', number: 1001, draw: 0, position: 1, claimStatus: 'PENDING', agentId: agent.id },
  ];
  for (const entry of entries) {
    const participant = await prisma.participant.create({
      data: { campaignId, name: entry.name, participantNumber: entry.number, email: `${entry.name}@example.com`, agentId: entry.agentId, status: 'WINNER' },
    });
    await prisma.winner.create({
      data: { drawId: draws[entry.draw].id, participantId: participant.id, prizeId: prize.id, drawPosition: entry.position, claimStatus: entry.claimStatus },
    });
  }
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  cleanup?.();
});

async function callList(query: Record<string, string> = {}) {
  const json = vi.fn();
  const response = { status: vi.fn().mockReturnThis(), json } as unknown as Response;
  await listWinners({ params: { id: campaignId }, query } as unknown as Request, response);
  return json.mock.calls[0][0].winners as Array<{
    drawPosition: number;
    participant: { name: string; participantNumber: number; agent: { agentCode: string } | null };
    draw: { drawNumber: number; executionMode: string };
  }>;
}

describe('winners list for display and export (live database)', () => {
  it('AC-WIN-7/8 orders by draw then drawn position and includes serial, agent and mode', async () => {
    const winners = await callList();

    expect(winners.map(({ draw, drawPosition, participant }) => `${draw.drawNumber}.${drawPosition} ${participant.name}`)).toEqual([
      '1.1 Bala', '1.2 Asha', '2.1 Chitra',
    ]);
    expect(winners[0].participant).toMatchObject({ participantNumber: 1001, agent: { agentCode: 'AG-1000' } });
    expect(winners[2].participant.agent).toBeNull();
    expect(winners[0].draw.executionMode).toBe('MANUAL');
  });

  it('AC-WIN-7 applies the draw and claim-status filters', async () => {
    expect((await callList({ drawId: draw1Id })).map(({ participant }) => participant.name)).toEqual(['Bala', 'Asha']);
    expect((await callList({ claimStatus: 'PENDING' })).map(({ participant }) => participant.name)).toEqual(['Bala', 'Chitra']);
  });
});
