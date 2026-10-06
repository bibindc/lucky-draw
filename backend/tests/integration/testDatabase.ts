import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Creates a throwaway SQLite database from the real migrations and points Prisma at it.
// Call before importing anything that loads `src/lib/prisma`.
export function createTestDatabase(name: string) {
  const directory = mkdtempSync(path.join(tmpdir(), `lucky-draw-${name}-`));
  const databaseUrl = `file:${path.join(directory, 'test.db').replaceAll('\\', '/')}`;
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
  process.env.DATABASE_URL = databaseUrl;

  return { cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}
