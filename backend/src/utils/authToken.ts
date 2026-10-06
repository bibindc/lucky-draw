import { createHmac, timingSafeEqual } from 'node:crypto';

const sessionDurationSeconds = 8 * 60 * 60;

type TokenPayload = {
  sub: string;
  role?: 'SUPER_ADMIN' | 'AGENT';
  iat: number;
  exp: number;
};

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function createAuthToken(
  subject: string,
  secret: string,
  now = Date.now(),
  role: 'SUPER_ADMIN' | 'AGENT' = 'SUPER_ADMIN',
): string {
  const issuedAt = Math.floor(now / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: subject, role, iat: issuedAt, exp: issuedAt + sessionDurationSeconds });
  const unsignedToken = `${header}.${payload}`;

  return `${unsignedToken}.${sign(unsignedToken, secret)}`;
}

export function verifyAuthToken(token: string, secret: string, now = Date.now()): TokenPayload | null {
  const [header, payload, signature, extra] = token.split('.');
  if (!header || !payload || !signature || extra !== undefined) return null;

  const unsignedToken = `${header}.${payload}`;
  const expectedSignature = Buffer.from(sign(unsignedToken, secret));
  const actualSignature = Buffer.from(signature);
  if (expectedSignature.length !== actualSignature.length) return null;
  if (!timingSafeEqual(expectedSignature, actualSignature)) return null;

  try {
    const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString()) as { alg?: string; typ?: string };
    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Partial<TokenPayload>;
    const nowSeconds = Math.floor(now / 1000);

    if (
      decodedHeader.alg !== 'HS256' ||
      decodedHeader.typ !== 'JWT' ||
      typeof decodedPayload.sub !== 'string' ||
      (decodedPayload.role !== undefined && decodedPayload.role !== 'SUPER_ADMIN' && decodedPayload.role !== 'AGENT') ||
      typeof decodedPayload.iat !== 'number' ||
      typeof decodedPayload.exp !== 'number' ||
      decodedPayload.exp <= nowSeconds
    ) {
      return null;
    }

    return decodedPayload as TokenPayload;
  } catch {
    return null;
  }
}

export const authCookieName = 'lucky_draw_session';
export const sessionDurationMilliseconds = sessionDurationSeconds * 1000;