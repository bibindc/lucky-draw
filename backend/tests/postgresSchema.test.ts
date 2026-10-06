import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error - plain JavaScript build script without type declarations
import { expectedPostgresSchema, toPostgresSchema } from '../scripts/postgres-schema.mjs';

describe('production PostgreSQL schema (02-design.md §Deployment)', () => {
  it('is regenerated after every change to schema.prisma', () => {
    const committed = readFileSync(join(__dirname, '..', 'prisma', 'postgres', 'schema.prisma'), 'utf8');
    // When this fails, run: npm run postgres:migration --workspace backend -- <name>
    expect(committed).toBe(expectedPostgresSchema());
  });

  it('changes only the datasource', () => {
    const source = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8').replace(/\r\n/g, '\n');
    const generated = toPostgresSchema(source) as string;
    expect(generated).toContain('provider  = "postgresql"');
    expect(generated).toContain('directUrl = env("DIRECT_URL")');
    expect(generated).not.toContain('"sqlite"');
    const models = (text: string) => text.slice(text.indexOf('model '));
    expect(models(generated)).toBe(models(source));
  });
});

describe('text search', () => {
  it('adds case-insensitive mode only on PostgreSQL', async () => {
    const { containsText } = await import('../src/lib/textSearch');
    const original = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = 'file:./dev.db';
      expect(containsText('asha')).toEqual({ contains: 'asha' });
      process.env.DATABASE_URL = 'postgresql://user:pass@host/db';
      expect(containsText('asha')).toEqual({ contains: 'asha', mode: 'insensitive' });
    } finally {
      process.env.DATABASE_URL = original;
    }
  });
});
