import express from 'express';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tx, logActivity } from './db.js';
import { getEvent, publicEvent, rsvpOpen } from './event.js';
import { TOKEN_RE, cleanText, firstName, rateLimiter } from './util.js';
import { createAuth, cookies } from './auth.js';
import { adminRouter } from './admin.js';
import { verifyResendWebhook, WEBHOOK_STATUS, shouldUpgrade } from './email.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const IMAGE_RE = /^[a-z0-9-]+\.(jpe?g|png|webp|avif)$/i;

export function createApp({ pool, env = process.env, mailer }) {
  const app = express();
  const production = env.NODE_ENV === 'production' || Boolean(env.RAILWAY_ENVIRONMENT);
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // ---------- Security headers ----------
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "media-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; '),
      'X-Content-Type-Options': 'nosniff',
      // Invitation tokens live in URLs: never leak them to third parties via Referer.
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
      ...(production ? { 'Strict-Transport-Security': 'max-age=31536000' } : {})
    });
    next();
  });
  app.use(cookies);

  const needDb = (_req, res, next) => pool ? next() : res.status(503).json({ error: 'database_unavailable', message: 'The guest list is temporarily unavailable. Please try again shortly.' });
  const baseUrl = req => (env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

  // ---------- Health ----------
  app.get('/api/health', async (_req, res) => {
    let db = false;
    if (pool) { try { await pool.query('SELECT 1'); db = true; } catch { /* reported below */ } }
    res.status(db ? 200 : 503).json({ ok: db, db, email: mailer.status().mode });
  });

  // ---------- Resend webhook (raw body for signature verification) ----------
  app.post('/api/webhooks/resend', express.raw({ type: '*/*', limit: '256kb' }), needDb, async (req, res, next) => {
    try {
      const rawBody = req.body.toString('utf8');
      if (!verifyResendWebhook({ secret: env.RESEND_WEBHOOK_SECRET, headers: req.headers, rawBody })) {
        return res.status(401).json({ error: 'invalid_signature' });
      }
      const evt = JSON.parse(rawBody);
      const status = WEBHOOK_STATUS[evt.type];
      const providerId = evt.data && evt.data.email_id;
      if (status && providerId) {
        const { rows } = await pool.query('SELECT id, guest_id, status, kind, is_test FROM messages WHERE provider_id = $1', [providerId]);
        const m = rows[0];
        if (m && shouldUpgrade(m.status, status)) {
          await pool.query('UPDATE messages SET status = $1, updated_at = now(), error = $2 WHERE id = $3',
            [status, status === 'bounced' || status === 'failed' ? cleanText(evt.data.bounce?.message || evt.type, 300) : null, m.id]);
          if (['delivered', 'bounced', 'complained', 'failed'].includes(status)) {
            await logActivity(pool, { actor: 'system', guestId: m.guest_id, type: `email_${status}`, detail: { kind: m.kind, test: m.is_test } });
          }
        }
      }
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.use(express.json({ limit: '300kb' }));

  // ---------- Public API ----------
  // Per-IP limits. Generous enough for a household on one connection, tight enough to stop token guessing.
  const lookupLimit = rateLimiter({ windowMs: 60e3, max: Number(env.RATE_LIMIT_INVITE_PER_MIN) || 60, name: 'invite' });
  const rsvpLimit = rateLimiter({ windowMs: 60e3, max: Number(env.RATE_LIMIT_RSVP_PER_MIN) || 12, name: 'rsvp' });

  app.get('/api/event', needDb, async (_req, res, next) => {
    try { res.set('Cache-Control', 'no-cache').json(publicEvent(await getEvent(pool))); } catch (e) { next(e); }
  });

  async function loadInvite(token) {
    if (!TOKEN_RE.test(token)) return null;
    const { rows } = await pool.query(
      `SELECT g.id, g.name, g.allocation, g.revoked_at, r.attendance, r.party_size, r.dietary, r.message, r.updated_at
         FROM guests g LEFT JOIN rsvps r ON r.guest_id = g.id WHERE g.token = $1`, [token]);
    return rows[0] || null;
  }

  function invitePayload(g, ev) {
    const rsvp = g.attendance ? {
      attendance: g.attendance, partySize: g.party_size, dietary: g.dietary, message: g.message, updatedAt: g.updated_at
    } : null;
    const confirmed = rsvp && rsvp.attendance === 'yes';
    return {
      guest: { name: g.name, firstName: firstName(g.name), allocation: g.allocation },
      rsvp,
      rsvpOpen: rsvpOpen(ev),
      event: publicEvent(ev),
      // Venue details only for confirmed guests, and only once the host chooses to share them.
      venue: confirmed && ev.venueShared && ev.venueName
        ? { name: ev.venueName, address: ev.venueAddress, mapsUrl: ev.mapsUrl } : null
    };
  }

  const noStore = res => res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });

  app.get('/api/invite/:token', lookupLimit, needDb, async (req, res, next) => {
    try {
      noStore(res);
      const g = await loadInvite(req.params.token);
      if (!g) return res.status(404).json({ error: 'not_found', message: 'We couldn’t find this invitation. Please check the link you received.' });
      if (g.revoked_at) return res.status(410).json({ error: 'revoked', message: 'This invitation is no longer active. Please contact the host.' });
      res.json(invitePayload(g, await getEvent(pool)));
    } catch (e) { next(e); }
  });

  app.post('/api/invite/:token/rsvp', rsvpLimit, needDb, async (req, res, next) => {
    try {
      noStore(res);
      const b = req.body || {};
      const attendance = b.attendance;
      if (!['yes', 'maybe', 'no'].includes(attendance)) return res.status(400).json({ error: 'invalid', message: 'Please choose whether you can come.' });
      const dietary = cleanText(b.dietary, 140);
      const message = cleanText(b.message, 500);

      const result = await tx(pool, async c => {
        if (!TOKEN_RE.test(req.params.token)) return { status: 404, body: { error: 'not_found', message: 'We couldn’t find this invitation.' } };
        // Serialise RSVP writes so the capacity check cannot race.
        await c.query('SELECT pg_advisory_xact_lock(23)');
        const { rows } = await c.query(
          `SELECT g.id, g.name, g.allocation, g.revoked_at, r.attendance AS prev, r.party_size AS prev_size
             FROM guests g LEFT JOIN rsvps r ON r.guest_id = g.id WHERE g.token = $1 FOR UPDATE OF g`, [req.params.token]);
        const g = rows[0];
        if (!g) return { status: 404, body: { error: 'not_found', message: 'We couldn’t find this invitation.' } };
        if (g.revoked_at) return { status: 410, body: { error: 'revoked', message: 'This invitation is no longer active. Please contact the host.' } };
        const ev = await getEvent(c);
        if (!rsvpOpen(ev)) return { status: 403, body: { error: 'closed', message: 'RSVPs are now closed. Please contact the host directly.' } };

        let partySize = 0;
        if (attendance !== 'no') {
          partySize = Number(b.partySize ?? 1);
          if (!Number.isInteger(partySize) || partySize < 1 || partySize > g.allocation) {
            return { status: 400, body: { error: 'invalid', message: `This invitation is for up to ${g.allocation} ${g.allocation > 1 ? 'people' : 'person'}.` } };
          }
        }
        if (attendance === 'yes') {
          const { rows: [{ heads }] } = await c.query(
            `SELECT COALESCE(SUM(r.party_size), 0)::int AS heads FROM rsvps r JOIN guests g ON g.id = r.guest_id
              WHERE r.attendance = 'yes' AND g.revoked_at IS NULL AND g.id <> $1`, [g.id]);
          if (heads + partySize > ev.capacity) {
            return { status: 409, body: { error: 'capacity', message: 'We’ve reached capacity for the night. Please contact the host — they’ll do their best.' } };
          }
        }
        await c.query(
          `INSERT INTO rsvps (guest_id, attendance, party_size, dietary, message) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (guest_id) DO UPDATE SET attendance = EXCLUDED.attendance, party_size = EXCLUDED.party_size,
             dietary = EXCLUDED.dietary, message = EXCLUDED.message, updated_at = now()`,
          [g.id, attendance, partySize, dietary, message]);
        await logActivity(c, {
          actor: 'guest', guestId: g.id, type: g.prev ? 'rsvp_updated' : 'rsvp',
          detail: { attendance, partySize, ...(g.prev ? { previous: g.prev, previousSize: g.prev_size } : {}) }
        });
        return { status: 200 };
      });

      if (result.status !== 200) return res.status(result.status).json(result.body);
      // Respond with what is now stored — the client only shows success after this.
      const g = await loadInvite(req.params.token);
      res.json(invitePayload(g, await getEvent(pool)));
    } catch (e) { next(e); }
  });

  // Only images that exist are listed, so pages never request missing files.
  app.get('/images/manifest.json', async (_req, res) => {
    let files = [];
    try { files = (await readdir(PUBLIC_DIR + 'images')).filter(f => IMAGE_RE.test(f)); } catch { /* none */ }
    res.set('Cache-Control', 'public, max-age=300').json(files);
  });

  // ---------- Host ----------
  const auth = createAuth({ pool, adminPassword: env.ADMIN_PASSWORD, secureCookies: production });
  app.use('/api/admin', needDb, adminRouter({ pool, auth, mailer, baseUrl, env }));

  // ---------- Pages ----------
  const page = name => (req, res) => {
    noStore(res);
    res.sendFile(name, { root: PUBLIC_DIR });
  };
  app.get('/invite/:token', page('index.html'));
  app.get(['/host', '/host/'], page('host.html'));
  app.get('/host.html', (_req, res) => res.redirect(301, '/host'));
  app.use(express.static(PUBLIC_DIR, { index: 'index.html', extensions: ['html'], maxAge: production ? '1h' : 0 }));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
  app.use((_req, res) => res.status(404).sendFile('index.html', { root: PUBLIC_DIR }));

  // Never log request URLs here: invitation paths carry tokens.
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: 'That upload is too large.' });
    console.error('[error]', err.code || '', err.message);
    res.status(500).json({ error: 'server_error', message: 'Something went wrong on our side and nothing was saved. Please try again.' });
  });

  return app;
}
