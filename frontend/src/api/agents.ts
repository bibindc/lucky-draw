import { CampaignApiError } from './campaigns';

export type Agent = {
  id: string;
  agentCode: string;
  name: string;
  email: string;
  mobile: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  _count?: { participants: number };
};

export type NewAgent = {
  name: string;
  email: string;
  mobile: string;
  password: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await response.json().catch(() => null)) as
    | { agents?: Agent[]; agent?: Agent; error?: { message?: string; details?: unknown } }
    | null;
  if (!response.ok) {
    throw new CampaignApiError(body?.error?.message ?? 'The agent request could not be completed.', body?.error?.details, response.status);
  }
  return body as T;
}

export async function listAgents(search = ''): Promise<Agent[]> {
  const query = new URLSearchParams();
  if (search) query.set('search', search);
  const body = await request<{ agents: Agent[] }>(`/agents?${query}`);
  return body.agents;
}

export async function createAgent(agent: NewAgent): Promise<Agent> {
  const body = await request<{ agent: Agent }>('/agents', {
    method: 'POST',
    body: JSON.stringify(agent),
  });
  return body.agent;
}

export async function updateAgent(id: string, changes: Partial<Pick<Agent, 'name' | 'email' | 'mobile' | 'isActive'>>): Promise<Agent> {
  const body = await request<{ agent: Agent }>(`/agents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
  return body.agent;
}