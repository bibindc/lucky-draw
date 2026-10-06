const onPostgres = () => (process.env.DATABASE_URL ?? '').startsWith('postgres');

/**
 * A case-insensitive "contains" filter on both databases (02-design.md §Deployment).
 * SQLite's LIKE ignores case already and rejects `mode`; PostgreSQL needs `mode: 'insensitive'`.
 */
export function containsText(search: string) {
  return (onPostgres() ? { contains: search, mode: 'insensitive' } : { contains: search }) as { contains: string };
}
