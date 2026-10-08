import pg from 'pg';
import { readFile } from 'node:fs/promises';

const SCHEMA_URL = new URL('./schema.sql', import.meta.url);

/**
 * Postgres pool. In production this is Neon: use the pooled (-pooler) connection string
 * for the app. TLS comes from `sslmode=require` in Neon's URLs; local dev runs without it.
 * The app only uses transaction-scoped features (pg_advisory_xact_lock, no SET/LISTEN),
 * so it is safe behind Neon's PgBouncer transaction pooling.
 */
export function createPool(connectionString, { max = 10 } = {}) {
  if (!connectionString) return null;
  return new pg.Pool({
    // Neon issues sslmode=require; ask explicitly for full certificate verification (pg's
    // current behaviour, and what upcoming pg versions will need spelled out).
    connectionString: connectionString.replace(/([?&])sslmode=(require|prefer|verify-ca)\b/, '$1sslmode=verify-full'),
    max,
    // Neon scales to zero when idle; the first connection can take a moment to wake it.
    connectionTimeoutMillis: 15000,
    // Drop idle clients before the pooler/proxy does, so we never reuse a dead socket.
    idleTimeoutMillis: 30000,
    keepAlive: true
  });
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
