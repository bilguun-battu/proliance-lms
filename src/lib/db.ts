import { Pool, PoolClient } from 'pg';

const g = globalThis as unknown as { __pgPool?: Pool };
export const pool = g.__pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== 'production') g.__pgPool = pool;

type Q = Pick<Pool, 'query'> | PoolClient;

export async function all<T = any>(sql: string, params: unknown[] = [], c: Q = pool): Promise<T[]> {
  return (await c.query(sql, params as any[])).rows as T[];
}

export async function one<T = any>(sql: string, params: unknown[] = [], c: Q = pool): Promise<T | undefined> {
  return (await c.query(sql, params as any[])).rows[0] as T | undefined;
}

export async function run(sql: string, params: unknown[] = [], c: Q = pool) {
  return c.query(sql, params as any[]);
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
