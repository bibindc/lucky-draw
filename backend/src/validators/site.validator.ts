import { z } from 'zod';

// Empty strings clear a field, so the form can send every field on save.
const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToNull, schema.nullable().optional());

const phone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\+?\d{7,15}$/, 'Enter 7 to 15 digits, optionally starting with +.'));

/** 07-public-website.md §4: everything a super admin can set for the public site (AC-PUB-1). */
export const siteSettingsSchema = z
  .object({
    featuredCampaignId: z.preprocess(blankToNull, z.uuid('Choose a campaign.').nullable()),
    organizerName: optional(z.string().trim().max(120, 'Use at most 120 characters.')),
    contactPhone: optional(phone),
    whatsappNumber: optional(phone),
    contactEmail: optional(z.string().trim().max(160, 'Use at most 160 characters.').pipe(z.email('Enter a valid email address.'))),
    joinNote: optional(z.string().trim().max(600, 'Use at most 600 characters.')),
  })
  .strict();

export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;
