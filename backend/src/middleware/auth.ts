import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authCookieName, verifyAuthToken } from '../utils/authToken';

function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;

    const key = part.slice(0, separator).trim();
    if (key !== name) continue;

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    return response.status(500).json({
      error: { code: 'SERVER_CONFIGURATION_ERROR', message: 'A 32-character JWT_SECRET is required.' },
    });
  }

  const token = readCookie(request, authCookieName);
  const claims = token ? verifyAuthToken(token, secret) : null;
  if (!claims) {
    return response.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Admin authentication is required.' },
    });
  }

  const role = claims.role ?? 'SUPER_ADMIN';
  if (role === 'AGENT') {
    const agent = await prisma.agent.findUnique({
      where: { id: claims.sub },
      select: { id: true, isActive: true },
    });
    if (!agent?.isActive) {
      return response.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'This agent account is inactive or unavailable.' },
      });
    }
    request.agentId = agent.id;
    request.role = 'AGENT';
  } else {
    const admin = await prisma.admin.findUnique({
      where: { id: claims.sub },
      select: { id: true, role: true },
    });
    if (!admin || admin.role !== 'SUPER_ADMIN') {
      return response.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'This super-admin account is unavailable.' },
      });
    }
    request.adminId = admin.id;
    request.role = 'SUPER_ADMIN';
  }
  next();
}

export function requireSuperAdmin(request: Request, response: Response, next: NextFunction) {
  if (request.role !== 'SUPER_ADMIN') {
    return response.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Only a super admin can perform this action.' },
    });
  }
  next();
}