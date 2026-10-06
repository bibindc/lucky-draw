import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/utils/password';

describe('password hashing', () => {
  it('verifies the password without storing it in plain text', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).not.toContain('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('incorrect password', hash)).toBe(false);
  });

  it('rejects malformed hashes', async () => {
    expect(await verifyPassword('password', 'not-a-password-hash')).toBe(false);
  });
});