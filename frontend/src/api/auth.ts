export type Admin = {
  id: string;
  name: string;
  email: string;
  role?: 'SUPER_ADMIN' | 'AGENT';
  agentCode?: string;
};

export type Credentials = {
  email: string;
  password: string;
};

export const sessionQueryKey = ['admin-session'];

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export class AuthApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function readError(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return new AuthApiError(body?.error?.message ?? 'The request could not be completed.', response.status);
}

export async function getCurrentAdmin(): Promise<Admin | null> {
  const response = await fetch(`${apiBaseUrl}/auth/me`, { credentials: 'include' });
  if (response.status === 401) return null;
  if (!response.ok) throw await readError(response);
  const body = (await response.json()) as { admin: Admin };
  return body.admin;
}

export async function login(credentials: Credentials): Promise<Admin> {
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  if (!response.ok) throw await readError(response);
  const body = (await response.json()) as { admin: Admin };
  return body.admin;
}

export async function logout(): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  // 401 means the session had already ended, which is what signing out wants.
  if (!response.ok && response.status !== 401) throw await readError(response);
}