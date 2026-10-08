import pg from 'pg';
import { readFile } from 'node:fs/promises';

const SCHEMA_URL = new URL('./schema.sql', import.meta.url);

export function createPool(connectionString) {
  if (!connectionString) return null;
  // Railway's private network (postgres.railway.internal) and local dev run without TLS.
  // Add ?sslmode=require to the URL to force it (e.g. when connecting over the public proxy).
  return new pg.Pool({ connectionString, max: 10 });
}

export async function migrate(pool) {
  const sql = await readFile(SCHEMA_URL, 'utf8');
  await pool.query(sql);
}

export async function tx(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export function logActivity(q, { actor, guestId = null, type, detail = {} }) {
  return q.query(
    'INSERT INTO activity (actor, guest_id, type, detail) VALUES ($1, $2, $3, $4)',
    [actor, guestId, type, detail]
  );
}
