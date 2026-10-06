import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword } from '../utils/password';
import { authCookieName, createAuthToken, sessionDurationMilliseconds } from '../utils/authToken';

const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
});

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/v1',
  };
}

export async function login(request: Request, response: Response) {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Enter a valid email and password.',
        details: parsed.error.issues,
      },
    });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    return response.status(500).json({
      error: { code: 'SERVER_CONFIGURATION_ERROR', message: 'A 32-character JWT_SECRET is required.' },
    });
  }

  const [admin, agent] = await Promise.all([
    prisma.admin.findUnique({ where: { email: parsed.data.email } }),
    prisma.agent.findUnique({ where: { email: parsed.data.email } }),
  ]);
  const account = admin ?? agent;
  const validPassword = await verifyPassword(
    parsed.data.password,
    account?.passwordHash ?? await hashPassword('invalid-admin-password'),
  );

  if (!account || !validPassword || ('isActive' in account && !account.isActive)) {
    return response.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Email or password is incorrect.' },
    });
  }

  const role = admin ? 'SUPER_ADMIN' : 'AGENT';
  const token = createAuthToken(account.id, secret, Date.now(), role);
  response.cookie(authCookieName, token, {
    ...cookieOptions(),
    maxAge: sessionDurationMilliseconds,
  });

  return response.json({
    admin: {
      id: account.id,
      name: account.name,
      email: account.email,
      role,
      ...(agent ? { agentCode: agent.agentCode } : {}),
    },
  });
}

export function logout(_request: Request, response: Response) {
  response.clearCookie(authCookieName, cookieOptions());
  return response.status(204).send();
}

export async function currentAdmin(request: Request, response: Response) {
  const admin = request.role === 'AGENT'
    ? await prisma.agent.findUnique({
        where: { id: request.agentId },
        select: { id: true, name: true, email: true, agentCode: true, isActive: true },
      }).then((agent) => agent?.isActive ? { id: agent.id, name: agent.name, email: agent.email, role: 'AGENT' as const, agentCode: agent.agentCode } : null)
    : await prisma.admin.findUnique({
        where: { id: request.adminId },
        select: { id: true, name: true, email: true, role: true },
      }).then((record) => record ? { ...record, role: 'SUPER_ADMIN' as const } : null);

  if (!admin) {
    return response.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Admin authentication is required.' },
    });
  }

  return response.json({ admin });
}