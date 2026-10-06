import { CampaignApiError } from './campaigns';

export type DashboardActivity = {
  type: 'PARTICIPANT_ADDED' | 'PAYMENT_RECORDED' | 'PAYMENT_VOIDED' | 'WINNER_DRAWN' | 'CLAIM_UPDATED';
  at: string;
  participantName: string;
  amountPaise?: number;
  drawNumbers?: number[];
  prizeName?: string;
  claimStatus?: string;
};

export type CampaignDashboard = {
  campaign: {
    id: string;
    name: string;
    durationMonths: number;
    drawCount: number;
    perDrawAmountPaise: number;
    firstDrawAt: string | null;
  };
  progress: { completedDraws: number; cancelledDraws: number; remainingDraws: number; percentComplete: number };
  participants: { total: number; addedLast7Days: number; winners: number };
  eligibility: { nextDrawEligible: number; activeParticipants: number; percentOfActive: number; pendingForNextDraw: number };
  prizes: { availableUnits: number; assignedUnits: number; totalUnits: number; prizeCount: number; unassignedPrizeCount: number };
  payments: { collectedPaise: number; transactionCount: number; dueForNextDrawPaise: number; collectionRatePercent: number };
  upcomingDraws: {
    id: string;
    drawNumber: number;
    scheduledAt: string;
    prizeCount: number;
    eligibleCount: number;
    isDue: boolean;
    status?: 'SCHEDULED' | 'IN_PROGRESS';
    roundsCompleted?: number;
    totalRounds?: number | null;
  }[];
  activity: DashboardActivity[];
  generatedAt: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export async function getCampaignDashboard(campaignId: string): Promise<CampaignDashboard> {
  const response = await fetch(`${apiBaseUrl}/campaigns/${campaignId}/dashboard`, { credentials: 'include' });
  const body = (await response.json().catch(() => null)) as
    | { dashboard?: CampaignDashboard; error?: { message?: string; details?: unknown } }
    | null;
  if (!response.ok || !body?.dashboard) {
    throw new CampaignApiError(body?.error?.message ?? 'The campaign overview could not be loaded.', body?.error?.details, response.status);
  }
  return body.dashboard;
}
