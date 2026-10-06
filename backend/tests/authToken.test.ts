import { describe, expect, it } from 'vitest';
import { createAuthToken, verifyAuthToken } from '../src/utils/authToken';

const secret = 'a-test-secret-with-more-than-32-characters';

describe('admin session token', () => {
  it('verifies a signed, unexpired token', () => {
    const now = Date.UTC(2026, 9, 5);
    const token = createAuthToken('admin-id', secret, now);

    expect(verifyAuthToken(token, secret, now)?.sub).toBe('admin-id');
  });

  it('rejects expired tokens, tampering, and a different secret', () => {
    const now = Date.UTC(2026, 9, 5);
    const token = createAuthToken('admin-id', secret, now);

    expect(verifyAuthToken(token, secret, now + 8 * 60 * 60 * 1000)).toBeNull();
    expect(verifyAuthToken(`${token.slice(0, -1)}x`, secret, now)).toBeNull();
    expect(verifyAuthToken(token, `${secret}-wrong`, now)).toBeNull();
  });
});