import { randomBytes, scryptSync } from 'node:crypto';
import { sha256, safeEqual } from './util.js';

export const SESSION_COOKIE = 'm23_admin';
const SESSION_DAYS = 7;
const SALT = randomBytes(16);

/**
 * Host authentication. The password lives only in the ADMIN_PASSWORD environment
 * variable; sessions are random tokens stored hashed in the database and sent as an
 * HttpOnly, SameSite=Strict cookie.
 */
export function createAuth({ pool, adminPassword, secureCookies }) {
  const configured = typeof adminPassword === 'string' && adminPassword.length >= 12;
  const expected = configured ? scryptSync(adminPassword, SALT, 32) : null;

  const checkPassword = pw =>
    configured && typeof pw === 'string' && pw.length <= 200 &&
    safeEqual(scryptSync(pw, SALT, 32).toString('hex'), expected.toString('hex'));

  async function createSession(res) {
    const token = randomBytes(32).toString('base64url');
    await pool.query(
      `INSERT INTO admin_sessions (token_hash, expires_at) VALUES ($1, now() + interval '${SESSION_DAYS} days')`,
      [sha256(token)]
    );
    await pool.query('DELETE FROM admin_sessions WHERE expires_at < now()');
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: 'strict', secure: secureCookies, path: '/', maxAge: SESSION_DAYS * 864e5
    });
  }

  async function destroySession(req, res) {
    const t = req.cookies[SESSION_COOKIE];
    if (t) await pool.query('DELETE FROM admin_sessions WHERE token_hash = $1', [sha256(t)]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  async function isAuthed(req) {
    const t = req.cookies[SESSION_COOKIE];
    if (!t || t.length > 100) return false;
    const { rowCount } = await pool.query(
      'SELECT 1 FROM admin_sessions WHERE token_hash = $1 AND expires_at > now()', [sha256(t)]
    );
    return rowCount === 1;
  }

  /** Requires a valid session. Mutating requests must also carry the CSRF header and a same-origin Origin. */
  function requireAdmin(req, res, next) {
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (mutating && !sameOrigin(req)) return res.status(403).json({ error: 'forbidden' });
    isAuthed(req).then(ok => ok ? next() : res.status(401).json({ error: 'unauthorized' }), next);
  }

  return { configured, checkPassword, createSession, destroySession, isAuthed, requireAdmin };
}

/**
 * CSRF defence for cookie-authenticated requests: a custom header (which cross-site
 * forms cannot send without a CORS preflight we never grant) plus an Origin check.
 */
export function sameOrigin(req) {
  if (req.get('x-m23') !== '1') return false;
  const origin = req.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === req.get('host'); } catch { return false; }
}

/** Minimal cookie parser (avoids a dependency). */
export function cookies(req, _res, next) {
  req.cookies = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      const k = part.slice(0, i).trim();
      try { req.cookies[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore malformed */ }
    }
  }
  next();
}
