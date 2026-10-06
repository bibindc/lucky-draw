import { z } from 'zod';

const indianMobileSchema = z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number.');

export const createAgentSchema = z.object({
  name: z.string().trim().min(1),
  email: z.email().trim().toLowerCase(),
  mobile: indianMobileSchema,
  password: z.string().min(12, 'Password must be at least 12 characters.'),
});

export const updateAgentSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    email: z.email().trim().toLowerCase().optional(),
    mobile: indianMobileSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((agent) => Object.keys(agent).length > 0, 'Provide at least one agent field to update.');