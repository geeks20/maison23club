import { createPool, migrate } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createMailer } from '../server/email.js';

export const TEST_DB = process.env.TEST_DATABASE_URL || 'postgres://localhost/maison23_test';
export const ADMIN_PASSWORD = 'test-password-123';

/** Fake Resend API: records calls; behaviour can be switched per test. */
export function fakeResend() {
  const calls = [];
  const ctl = { mode: 'ok', calls };
  ctl.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, headers: opts.headers, body });
    if (ctl.mode === 'error') return new Response(JSON.stringify({ name: 'application_error', message: 'Internal error' }), { status: 500 });
    if (ctl.mode === 'network') throw new Error('ECONNRESET');
    return new Response(JSON.stringify({ id: `re_${calls.length}_${Math.random().toString(36).slice(2, 8)}` }), { status: 200 });
  };
  return ctl;
}

export async function setup({ env = {}, pool: poolOverride } = {}) {
  // Each setup gets its own schema so tests never see (or wipe) each other's data.
  const schema = `t_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  let pool = poolOverride;
  if (poolOverride === undefined) {
    const admin = createPool(TEST_DB);
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    pool = createPool(`${TEST_DB}${TEST_DB.includes('?') ? '&' : '?'}options=${encodeURIComponent(`-c search_path=${schema}`)}`);
    await migrate(pool);
  }
  const resend = fakeResend();
  const fullEnv = {
    ADMIN_PASSWORD, EMAIL_MODE: 'live', RESEND_API_KEY: 're_test', EMAIL_FROM: 'MAISON 23 <test@maison23.club>',
    RESEND_WEBHOOK_SECRET: 'whsec_' + Buffer.from('test-webhook-secret-0123456789').toString('base64'),
    PUBLIC_BASE_URL: 'https://maison23.club', RATE_LIMIT_RSVP_PER_MIN: '1000', ...env
  };
  const mailer = createMailer(fullEnv, resend.fetch);
  const app = createApp({ pool, env: fullEnv, mailer });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  let cookie = '';
  async function req(method, path, { body, admin = false, headers = {}, raw } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(admin ? { 'X-M23': '1', Cookie: cookie } : {}),
        ...headers
      },
      body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual'
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  }
  async function login() {
    const r = await req('POST', '/api/admin/login', { body: { password: ADMIN_PASSWORD }, headers: { 'X-M23': '1' } });
    cookie = (r.headers.get('set-cookie') || '').split(';')[0];
    return r;
  }
  const admin = (method, path, body) => req(method, path, { body, admin: true });

  async function addGuest(fields) {
    const r = await admin('POST', '/api/admin/guests', { name: 'Amara Diallo', email: 'amara@example.com', allocation: 2, ...fields });
    if (r.status !== 201) throw new Error('addGuest failed: ' + JSON.stringify(r.data));
    const { data } = await admin('GET', '/api/admin/overview');
    const g = data.guests.find(x => x.id === r.data.id);
    return { ...g, token: g.link.split('/invite/')[1] };
  }

  async function close() {
    await new Promise(r => server.close(r));
    if (poolOverride === undefined) {
      await pool.query(`DROP SCHEMA ${schema} CASCADE`);
      await pool.end();
    }
  }
  return { pool, req, admin, login, addGuest, resend, close, env: fullEnv };
}
