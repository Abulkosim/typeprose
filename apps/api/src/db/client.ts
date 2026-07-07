import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

/**
 * Create a postgres.js connection + Drizzle instance.
 * Kept as a factory (not a module-level singleton) so tests and the
 * server can control connection lifecycle.
 */
export function createDbClient(databaseUrl: string) {
  const sql = postgres(databaseUrl);
  const db = drizzle(sql, { schema });
  return { sql, db };
}

export type DbClient = ReturnType<typeof createDbClient>;
export type Db = DbClient['db'];
