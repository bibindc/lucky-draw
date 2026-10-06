export type DrawStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type DrawSchedule = {
  id?: string;
  drawNumber?: number;
  scheduledAt: string;
  prizeCount: number;
  status?: DrawStatus;
  executionMode?: DrawExecutionMode | null;
  heldAt?: string | null;
  totalRounds?: number | null;
  roundsCompleted?: number;
  _count?: { drawPayments: number; winners: number };
  availablePrizeCount?: number;
};

export type DrawExecutionMode = 'AUTOMATIC' | 'MANUAL';

export type ManualDrawRecord = {
  conductedBy: string;
  drawMethod: string;
  venue: string | null;
  witnesses: string | null;
  notes: string | null;
  evidenceReference: string | null;
  createdAt: string;
};

export type DrawWinner = {
  id: string;
  drawPosition?: number;
  drawnAt?: string;
  recordedByAdmin?: { id: string; name: string } | null;
  participant: { id: string; name: string; participantNumber?: number };
  prize: { id: string; name: string; rank: number; imageUpdatedAt?: string | null };
};

export type DrawResult = DrawSchedule & {
  poolSnapshot: string[] | null;
  startedAt?: string | null;
  executedAt: string | null;
  executedByAdmin?: { id: string; name: string } | null;
  manualRecord?: ManualDrawRecord | null;
  winners?: DrawWinner[];
};

export type DrawPool = {
  draw: {
    id: string;
    drawNumber: number;
    scheduledAt: string;
    prizeCount: number;
    status: DrawStatus;
    executionMode: DrawExecutionMode | null;
    campaign: { id: string; name: string };
  };
  participants: {
    id: string;
    participantNumber: number;
    name: string;
    email: string | null;
    mobile: string | null;
    agent: { id: string; agentCode: string; name: string } | null;
  }[];
  prizes: { id: string; name: string; rank: number; available: number }[];
  /** Rounds the draw would get if started now (scheduled) or was fixed with at start. */
  totalRounds: number;
  roundsCompleted: number;
};

export type StartDrawInput =
  | { mode: 'AUTOMATIC' }
  | {
      mode: 'MANUAL';
      heldAt: string;
      conductedBy: string;
      drawMethod: string;
      venue?: string;
      witnesses?: string;
      notes?: string;
      evidenceReference?: string;
    };

export type StartDrawResult = { draw: DrawResult; warning: string | null };

export type DrawRoundResult = {
  winner: DrawWinner;
  progress: { roundsCompleted: number; totalRounds: number; completed: boolean };
  eligibleCount: number;
};

export type Campaign = {
  id: string;
  name: string;
  durationMonths: number;
  drawCount: number;
  totalAmountPaise: number;
  perDrawAmountPaise: number;
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  draws?: DrawSchedule[];
  _count?: { participants: number; draws: number; prizes: number };
};

export type NewCampaign = Omit<Campaign, 'id' | 'status' | 'draws' | '_count'> & {
  draws: DrawSchedule[];
};

export class CampaignApiError extends Error {
  details: unknown;
  status?: number;

  constructor(message: string, details: unknown, status?: number) {
    super(message);
    this.details = details;
    this.status = status;
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await response.json().catch(() => null)) as
    | { campaigns?: Campaign[]; campaign?: Campaign; error?: { message?: string; details?: unknown } }
    | null;

  if (!response.ok) {
    throw new CampaignApiError(
      body?.error?.message ?? 'The campaign request could not be completed.',
      body?.error?.details,
      response.status,
    );
  }
  return body as T;
}

export async function listCampaigns(): Promise<Campaign[]> {
  const body = await request<{ campaigns: Campaign[] }>('/campaigns');
  return body.campaigns;
}

export async function getCampaign(id: string): Promise<Campaign> {
  const body = await request<{ campaign: Campaign }>(`/campaigns/${id}`);
  return body.campaign;
}

export async function patchDraw(
  drawId: string,
  changes: Pick<DrawSchedule, 'scheduledAt' | 'prizeCount'>,
): Promise<DrawSchedule> {
  const body = await request<{ draw: DrawSchedule }>(`/draws/${drawId}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
  return body.draw;
}

export async function createCampaign(campaign: NewCampaign): Promise<Campaign> {
  const body = await request<{ campaign: Campaign }>('/campaigns', {
    method: 'POST',
    body: JSON.stringify(campaign),
  });
  return body.campaign;
}

export async function listCampaignDraws(campaignId: string): Promise<DrawSchedule[]> {
  const body = await request<{ draws: DrawSchedule[] }>(`/campaigns/${campaignId}/draws`);
  return body.draws;
}

export async function getDrawResult(drawId: string): Promise<DrawResult> {
  const body = await request<{ draw: DrawResult }>(`/draws/${drawId}/result`);
  return body.draw;
}

export async function getDrawPool(drawId: string): Promise<DrawPool> {
  return request(`/draws/${drawId}/pool`);
}

export async function startDraw(drawId: string, input: StartDrawInput): Promise<StartDrawResult> {
  return request(`/draws/${drawId}/start`, { method: 'POST', body: JSON.stringify(input) });
}

export async function drawRound(drawId: string, input: { round: number; prizeId: string; participantId?: string }): Promise<DrawRoundResult> {
  return request(`/draws/${drawId}/rounds`, { method: 'POST', body: JSON.stringify(input) });
}
