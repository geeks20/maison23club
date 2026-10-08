import { createApp } from './app.js';
import { createPool, migrate } from './db.js';
import { createMailer } from './email.js';

const env = process.env;
const pool = createPool(env.DATABASE_URL);
const mailer = createMailer(env);

if (pool) {
  try {
    // Schema changes go over a direct (unpooled) connection when one is provided, as Neon recommends.
    const direct = env.DATABASE_URL_UNPOOLED ? createPool(env.DATABASE_URL_UNPOOLED, { max: 1 }) : null;
    try { await migrate(direct || pool); } finally { if (direct) await direct.end(); }
    console.log(`[db] schema ready${direct ? ' (direct connection)' : ''}`);
  } catch (e) {
    // Keep serving the public site; the API reports the database as unavailable.
    console.error('[db] migration failed:', e.message);
  }
  pool.on('error', e => console.error('[db] pool error:', e.message));
} else {
  console.warn('[db] DATABASE_URL is not set — RSVP and host features are unavailable.');
}

const email = mailer.status();
console.log(`[email] mode=${email.mode}${email.missing.length ? ` missing=${email.missing.join(',')}` : ''}`);
if (!env.ADMIN_PASSWORD) console.warn('[host] ADMIN_PASSWORD is not set — the host dashboard is locked.');

const port = Number(env.PORT) || 3009;
const server = createApp({ pool, env, mailer }).listen(port, () => console.log(`[http] MAISON 23 listening on :${port}`));

const shutdown = () => server.close(() => (pool ? pool.end() : Promise.resolve()).finally(() => process.exit(0)));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
