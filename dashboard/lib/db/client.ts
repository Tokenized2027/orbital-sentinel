import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!_db) {
    const pool = new Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });
    _db = drizzle(pool, { schema });
  }
  return _db;
}

export type Database = NonNullable<ReturnType<typeof createDb>>;
