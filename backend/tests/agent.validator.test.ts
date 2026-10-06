import { describe, expect, it } from 'vitest';
import { createAgentSchema, updateAgentSchema } from '../src/validators/agent.validator';

describe('agent validation', () => {
  it('requires a name, valid email, Indian mobile, and long initial password', () => {
    expect(createAgentSchema.safeParse({
      name: 'Agent One', email: 'agent@example.com', mobile: '9876543210', password: 'long-enough-password',
    }).success).toBe(true);
    expect(createAgentSchema.safeParse({
      name: 'Agent One', email: 'agent@example.com', mobile: '1234567890', password: 'long-enough-password',
    }).success).toBe(false);
    expect(createAgentSchema.safeParse({
      name: 'Agent One', email: 'agent@example.com', mobile: '9876543210', password: 'short',
    }).success).toBe(false);
  });

  it('requires at least one update field and allows active-state changes', () => {
    expect(updateAgentSchema.safeParse({}).success).toBe(false);
    expect(updateAgentSchema.safeParse({ isActive: false }).success).toBe(true);
  });
});