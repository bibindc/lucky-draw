import { describe, expect, it } from 'vitest';
import { createParticipantSchema } from '../src/validators/participant.validator';

describe('participant validation', () => {
  it('requires a name and at least one contact method', () => {
    expect(createParticipantSchema.safeParse({ name: 'Riya' }).success).toBe(false);
    expect(createParticipantSchema.safeParse({ email: 'riya@example.com' }).success).toBe(false);
  });

  it('accepts valid email or Indian mobile and normalizes optional fields', () => {
    const byEmail = createParticipantSchema.safeParse({ name: ' Riya Sharma ', email: 'RIYA@EXAMPLE.COM' });
    const byMobile = createParticipantSchema.safeParse({ name: 'Kabir Nair', mobile: '9876543210', externalUserId: 'user-7' });

    expect(byEmail.success && byEmail.data.email).toBe('riya@example.com');
    expect(byMobile.success && byMobile.data.mobile).toBe('9876543210');
    expect(byMobile.success && byMobile.data.email).toBeNull();
  });

  it('rejects an invalid email and a non-Indian mobile number', () => {
    expect(createParticipantSchema.safeParse({ name: 'Riya', email: 'invalid' }).success).toBe(false);
    expect(createParticipantSchema.safeParse({ name: 'Riya', mobile: '1234567890' }).success).toBe(false);
  });
});