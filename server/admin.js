import express from 'express';
import { tx, logActivity } from './db.js';
import { getEvent, validateEventPatch, formatDubai, MAX_CAPACITY } from './event.js';
import { newToken, validateGuest, firstName, rateLimiter, parseCsv, csvCell, sha256, cleanText } from './util.js';
import { sameOrigin } from './auth.js';
import { invitationEmail, reminderEmail, updateEmail, whatsappMessage } from './templates.js';

const OK_STATUSES = ['sent', 'delivered', 'delivery_delayed', 'marked_sent'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function adminRouter({ pool, auth, mailer, baseUrl }) {
  const r = express.Router();
  const loginLimit = rateLimiter({ windowMs: 15 * 60e3, max: 8, name: 'login' });
  const sendGap = 600; // Resend's default limit is 2 requests/second.

  // ---------- Session ----------
  r.get('/session', async (req, res, next) => {
    try { res.json({ configured: auth.configured, authed: auth.configured && await auth.isAuthed(req) }); } catch (e) { next(e); }
  });

  r.post('/login', loginLimit, async (req, res, next) => {
    try {
      if (!sameOrigin(req)) return res.status(403).json({ error: 'forbidden' });
      if (!auth.configured) return res.status(503).json({ error: 'not_configured', message: 'Host access is not configured. Set ADMIN_PASSWORD (12+ characters) on the server.' });
      if (!auth.checkPassword(req.body && req.body.password)) return res.status(401).json({ error: 'invalid', message: 'Incorrect password.' });
      await auth.createSession(res);
      await logActivity(pool, { actor: 'host', type: 'host_login' });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.post('/logout', async (req, res, next) => {
    try {
      if (!sameOrigin(req)) return res.status(403).json({ error: 'forbidden' });
      await auth.destroySession(req, res);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // Everything below requires an authenticated host.
  r.use(auth.requireAdmin);
  r.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  const link = (req, token) => `${baseUrl(req)}/invite/${token}`;

  async function loadGuests(req) {
    const { rows } = await pool.query(`
      SELECT g.*, r.attendance, r.party_size, r.dietary, r.message, r.updated_at AS rsvp_at,
        (SELECT row_to_json(m) FROM (
           SELECT channel, kind, status, created_at, updated_at, error FROM messages
            WHERE guest_id = g.id AND NOT is_test ORDER BY created_at DESC LIMIT 1) m) AS last_message,
        (SELECT row_to_json(m) FROM (
           SELECT channel, kind, status, created_at, updated_at FROM messages
            WHERE guest_id = g.id AND NOT is_test AND status = ANY($1) ORDER BY created_at DESC LIMIT 1) m) AS last_ok,
        (SELECT COALESCE(json_agg(h ORDER BY h.created_at DESC), '[]') FROM (
           SELECT channel, kind, status, is_test, recipient, error, created_at, updated_at FROM messages
            WHERE guest_id = g.id ORDER BY created_at DESC LIMIT 10) h) AS history
      FROM guests g LEFT JOIN rsvps r ON r.guest_id = g.id
      ORDER BY g.created_at`, [OK_STATUSES]);
    return rows.map(g => ({
      id: Number(g.id), name: g.name, firstName: firstName(g.name), email: g.email, phone: g.phone,
      allocation: g.allocation, link: link(req, g.token), revoked: Boolean(g.revoked_at), revokedAt: g.revoked_at,
      createdAt: g.created_at, tokenCreatedAt: g.token_created_at,
      rsvp: g.attendance ? { attendance: g.attendance, partySize: g.party_size, dietary: g.dietary, message: g.message, updatedAt: g.rsvp_at } : null,
      // Delivery is tracked separately from RSVP. "sent" = accepted by provider or marked sent by the host.
      invitation: g.last_ok
        ? { state: g.last_ok.status, channel: g.last_ok.channel, kind: g.last_ok.kind, at: g.last_ok.updated_at }
        : g.last_message ? { state: 'failed', channel: g.last_message.channel, at: g.last_message.created_at, error: g.last_message.error }
        : { state: 'not_sent' },
      history: g.history
    }));
  }

  function stats(guests, ev) {
    const active = guests.filter(g => !g.revoked);
    const by = k => active.filter(g => (g.rsvp ? g.rsvp.attendance : 'pending') === k);
    const heads = list => list.reduce((t, g) => t + g.rsvp.partySize, 0);
    const expected = heads(by('yes'));
    return {
      invited: active.length,
      confirmed: by('yes').length,
      maybe: by('maybe').length,
      declined: by('no').length,
      awaiting: by('pending').length,
      expected,
      maybeHeads: heads(by('maybe')),
      capacity: ev.capacity,
      remaining: ev.capacity - expected,
      allocated: active.reduce((t, g) => t + g.allocation, 0),
      notSent: active.filter(g => g.invitation.state === 'not_sent' || g.invitation.state === 'failed').length,
      revoked: guests.length - active.length
    };
  }

  r.get('/overview', async (req, res, next) => {
    try {
      const [guests, ev, act] = await Promise.all([
        loadGuests(req), getEvent(pool),
        pool.query(`SELECT a.at, a.actor, a.type, a.detail, g.name FROM activity a LEFT JOIN guests g ON g.id = a.guest_id
                     ORDER BY a.at DESC LIMIT 60`)
      ]);
      res.json({
        guests, stats: stats(guests, ev), event: ev, maxCapacity: MAX_CAPACITY,
        email: mailer.status(), activity: act.rows
      });
    } catch (e) { next(e); }
  });

  // ---------- Guests ----------
  async function guestById(q, id) {
    const { rows } = await q.query('SELECT * FROM guests WHERE id = $1', [id]);
    return rows[0] || null;
  }
  const idParam = req => { const n = Number(req.params.id); return Number.isSafeInteger(n) && n > 0 ? n : 0; };

  r.post('/guests', async (req, res, next) => {
    try {
      const v = validateGuest(req.body || {});
      if (v.error) return res.status(400).json({ error: 'invalid', message: v.error });
      const g = await tx(pool, async c => {
        const { rows } = await c.query(
          'INSERT INTO guests (name, email, phone, allocation, token) VALUES ($1, $2, $3, $4, $5) RETURNING id, name',
          [v.value.name, v.value.email, v.value.phone, v.value.allocation, newToken()]);
        await logActivity(c, { actor: 'host', guestId: rows[0].id, type: 'guest_created', detail: { allocation: v.value.allocation } });
        return rows[0];
      });
      res.status(201).json({ ok: true, id: Number(g.id) });
    } catch (e) { next(e); }
  });

  r.patch('/guests/:id', async (req, res, next) => {
    try {
      const id = idParam(req);
      const v = validateGuest(req.body || {}, { partial: true });
      if (v.error) return res.status(400).json({ error: 'invalid', message: v.error });
      const fields = Object.keys(v.value);
      if (!fields.length) return res.status(400).json({ error: 'invalid', message: 'Nothing to update.' });
      const out = await tx(pool, async c => {
        const before = await guestById(c, id);
        if (!before) return null;
        const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
        await c.query(`UPDATE guests SET ${sets}, updated_at = now() WHERE id = $1`, [id, ...fields.map(f => v.value[f])]);
        // Keep an RSVP consistent with a reduced allocation.
        if ('allocation' in v.value) {
          await c.query('UPDATE rsvps SET party_size = LEAST(party_size, $2), updated_at = now() WHERE guest_id = $1 AND party_size > $2', [id, v.value.allocation]);
        }
        const changed = Object.fromEntries(fields.filter(f => before[f] !== v.value[f]).map(f => [f, f === 'allocation' ? v.value[f] : true]));
        await logActivity(c, { actor: 'host', guestId: id, type: 'guest_updated', detail: changed });
        return true;
      });
      if (!out) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  const invitationAction = (type, sql, params = id => [id]) => async (req, res, next) => {
    try {
      const id = idParam(req);
      const ok = await tx(pool, async c => {
        const { rowCount } = await c.query(sql, params(id));
        if (!rowCount) return false;
        await logActivity(c, { actor: 'host', guestId: id, type });
        return true;
      });
      ok ? res.json({ ok: true }) : res.status(409).json({ error: 'no_change', message: 'Nothing to change — refresh and try again.' });
    } catch (e) { next(e); }
  };
  r.post('/guests/:id/revoke', invitationAction('invitation_revoked',
    'UPDATE guests SET revoked_at = now(), updated_at = now() WHERE id = $1 AND revoked_at IS NULL'));
  r.post('/guests/:id/restore', invitationAction('invitation_restored',
    'UPDATE guests SET revoked_at = NULL, updated_at = now() WHERE id = $1 AND revoked_at IS NOT NULL'));
  // New link: the old one stops working immediately. Also re-activates a revoked invitation.
  r.post('/guests/:id/regenerate', invitationAction('link_regenerated',
    'UPDATE guests SET token = $2, token_created_at = now(), revoked_at = NULL, updated_at = now() WHERE id = $1',
    id => [id, newToken()]));

  // ---------- CSV import / export ----------
  r.post('/guests/import', async (req, res, next) => {
    try {
      const text = String((req.body && req.body.csv) || '');
      if (!text.trim()) return res.status(400).json({ error: 'invalid', message: 'The file is empty.' });
      const rows = parseCsv(text);
      if (rows.length > 501) return res.status(400).json({ error: 'invalid', message: 'Up to 500 guests per upload.' });
      const header = rows[0].map(h => h.trim().toLowerCase());
      const col = names => header.findIndex(h => names.includes(h));
      const idx = { name: col(['name', 'guest', 'nom', 'full name']), email: col(['email', 'e-mail']), phone: col(['phone', 'whatsapp', 'mobile', 'téléphone']), allocation: col(['places', 'allocation', 'seats', 'guests', 'party size']) };
      if (idx.name < 0) return res.status(400).json({ error: 'invalid', message: 'The first row must be a header with at least a "name" column (optional: email, phone, places).' });

      const valid = [], errors = [];
      rows.slice(1).forEach((row, i) => {
        const pick = k => idx[k] >= 0 ? row[idx[k]] : '';
        const v = validateGuest({ name: pick('name'), email: pick('email'), phone: pick('phone'), allocation: pick('allocation') || 1 });
        if (v.error) errors.push({ row: i + 2, message: v.error }); else valid.push(v.value);
      });
      if (req.body.dryRun) return res.json({ ok: true, wouldCreate: valid.length, errors });
      if (errors.length) return res.status(400).json({ error: 'invalid', message: `Fix ${errors.length} row(s) and upload again — nothing was imported.`, errors });

      // Skip rows that duplicate an existing guest's email.
      const created = await tx(pool, async c => {
        const { rows: existing } = await c.query('SELECT lower(email) AS e FROM guests WHERE email IS NOT NULL');
        const seen = new Set(existing.map(x => x.e));
        let n = 0; const skipped = [];
        for (const g of valid) {
          if (g.email && seen.has(g.email)) { skipped.push(g.email); continue; }
          if (g.email) seen.add(g.email);
          const { rows: [row] } = await c.query(
            'INSERT INTO guests (name, email, phone, allocation, token) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [g.name, g.email, g.phone, g.allocation, newToken()]);
          await logActivity(c, { actor: 'host', guestId: row.id, type: 'guest_created', detail: { allocation: g.allocation, via: 'csv' } });
          n++;
        }
        return { n, skipped };
      });
      res.json({ ok: true, created: created.n, skipped: created.skipped });
    } catch (e) { next(e); }
  });

  r.get('/export.csv', async (req, res, next) => {
    try {
      const guests = await loadGuests(req);
      const lines = [['Name', 'Email', 'Phone', 'Places', 'RSVP', 'Attending', 'Dietary', 'Message', 'Replied at', 'Invitation', 'Invitation channel', 'Revoked', 'Link']];
      for (const g of guests) {
        lines.push([g.name, g.email, g.phone, g.allocation, g.rsvp ? g.rsvp.attendance : 'pending', g.rsvp ? g.rsvp.partySize : '',
          g.rsvp ? g.rsvp.dietary : '', g.rsvp ? g.rsvp.message : '', g.rsvp ? new Date(g.rsvp.updatedAt).toISOString() : '',
          g.invitation.state, g.invitation.channel || '', g.revoked ? 'yes' : 'no', g.revoked ? '' : g.link]);
      }
      await logActivity(pool, { actor: 'host', type: 'guest_list_exported', detail: { rows: guests.length } });
      res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="maison23-guests.csv"' });
      res.send('﻿' + lines.map(l => l.map(csvCell).join(',')).join('\r\n'));
    } catch (e) { next(e); }
  });

  // ---------- Event settings ----------
  r.put('/event', async (req, res, next) => {
    try {
      const current = await getEvent(pool);
      const v = validateEventPatch(current, req.body);
      if (v.error) return res.status(400).json({ error: 'invalid', message: v.error });
      await tx(pool, async c => {
        await c.query(`INSERT INTO settings (key, value) VALUES ('event', $1)
                       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [v.value]);
        const changed = Object.keys(v.value).filter(k => JSON.stringify(v.value[k]) !== JSON.stringify(current[k]));
        if (changed.length) await logActivity(c, { actor: 'host', type: 'event_updated', detail: { fields: changed } });
      });
      res.json({ ok: true, event: v.value });
    } catch (e) { next(e); }
  });

  // ---------- Sending ----------
  /**
   * Records an attempt, sends it, records the result. A guest-level advisory lock and the
   * in-flight "sending" row stop double clicks and concurrent bulk runs from duplicating.
   */
  async function sendEmail(req, guestId, kind, { force = false, update = null } = {}) {
    const ev = await getEvent(pool);
    const pre = await tx(pool, async c => {
      await c.query('SELECT pg_advisory_xact_lock(230000 + $1::int)', [guestId]);
      const g = await guestById(c, guestId);
      if (!g) return { status: 404, body: { error: 'not_found' } };
      if (g.revoked_at) return { status: 409, body: { error: 'revoked', message: 'This invitation is revoked — restore it before sending.' } };
      if (!g.email) return { status: 400, body: { error: 'no_email', message: `${g.name} has no email address.` } };
      const isTest = mailer.mode === 'test';
      const dedupeKey = update ? `update:${update.hash}:${guestId}:${isTest ? 'test' : 'live'}` : null;
      const { rows: recent } = await c.query(
        `SELECT status, created_at FROM messages WHERE guest_id = $1 AND kind = $2 AND channel = 'email' AND is_test = $3
           AND (status = ANY($4) OR (status = 'sending' AND created_at > now() - interval '5 minutes'))
           ${update ? 'AND dedupe_key = $5' : ''} ORDER BY created_at DESC LIMIT 1`,
        update ? [guestId, kind, isTest, OK_STATUSES, dedupeKey] : [guestId, kind, isTest, OK_STATUSES]);
      if (recent[0] && (recent[0].status === 'sending' || update || !force)) {
        return { status: 409, body: { error: 'already_sent', message: `Already sent to ${g.name} (${formatDubai(recent[0].created_at, { dateStyle: 'medium', timeStyle: 'short' })} Dubai).`, at: recent[0].created_at } };
      }
      const url = link(req, g.token);
      const fn = firstName(g.name);
      const mail = kind === 'invitation' ? invitationEmail({ firstName: fn, url })
        : kind === 'reminder' ? reminderEmail({ firstName: fn, url, deadlineText: ev.rsvpDeadline ? formatDubai(ev.rsvpDeadline, { weekday: 'long', day: 'numeric', month: 'long' }) : '' })
        : updateEmail({ firstName: fn, url, subject: update.subject, body: update.body });
      const { rows: [m] } = await c.query(
        `INSERT INTO messages (guest_id, channel, kind, is_test, recipient, subject, dedupe_key, status)
         VALUES ($1, 'email', $2, $3, $4, $5, $6, 'sending') RETURNING id`,
        [guestId, kind, isTest, g.email, mail.subject, dedupeKey]);
      return { messageId: m.id, guest: g, mail };
    });
    if (pre.status) return pre;

    const result = await mailer.send({ to: pre.guest.email, ...pre.mail, idempotencyKey: `m23-msg-${pre.messageId}` });
    await pool.query(
      'UPDATE messages SET status = $1, provider_id = $2, error = $3, recipient = COALESCE($4, recipient), is_test = $5, updated_at = now() WHERE id = $6',
      [result.ok ? 'sent' : 'failed', result.providerId || null, result.error || null, result.recipient, result.isTest, pre.messageId]);
    await logActivity(pool, {
      actor: 'host', guestId, type: result.ok ? 'email_sent' : 'email_failed',
      detail: { kind, test: result.isTest, ...(result.ok ? {} : { error: result.error }) }
    });
    return result.ok
      ? { status: 200, body: { ok: true, test: result.isTest, recipient: result.recipient, message: result.isTest ? `Test email sent to ${result.recipient} (not to the guest).` : `Sent to ${result.recipient} — accepted by Resend. Delivery is confirmed separately.` } }
      : { status: 502, body: { error: 'send_failed', message: result.error }, retryAfter: result.retryAfter };
  }

  r.post('/guests/:id/email', async (req, res, next) => {
    try {
      const kind = req.body && req.body.kind;
      if (!['invitation', 'reminder'].includes(kind)) return res.status(400).json({ error: 'invalid' });
      const out = await sendEmail(req, idParam(req), kind, { force: req.body.force === true });
      res.status(out.status).json(out.body);
    } catch (e) { next(e); }
  });

  r.get('/guests/:id/whatsapp', async (req, res, next) => {
    try {
      const g = await guestById(pool, idParam(req));
      if (!g) return res.status(404).json({ error: 'not_found' });
      const text = whatsappMessage({ firstName: firstName(g.name), url: link(req, g.token) });
      const phone = (g.phone || '').replace(/\D/g, '');
      res.json({ text, waUrl: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`, hasPhone: Boolean(phone) });
    } catch (e) { next(e); }
  });

  // The host confirms they sent it themselves. Recorded as "marked sent", never as delivered.
  r.post('/guests/:id/whatsapp-sent', async (req, res, next) => {
    try {
      const id = idParam(req);
      const kind = ['invitation', 'reminder', 'update'].includes(req.body && req.body.kind) ? req.body.kind : 'invitation';
      const g = await guestById(pool, id);
      if (!g) return res.status(404).json({ error: 'not_found' });
      await pool.query(
        `INSERT INTO messages (guest_id, channel, kind, recipient, status) VALUES ($1, 'whatsapp', $2, $3, 'marked_sent')`,
        [id, kind, g.phone]);
      await logActivity(pool, { actor: 'host', guestId: id, type: 'whatsapp_marked_sent', detail: { kind } });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ---------- Bulk: reminders & event updates (explicit confirmation required) ----------
  async function audience(kind) {
    if (kind === 'reminder') {
      // Pending guests who were already invited, have email, and weren't reminded in the last 24h.
      const { rows } = await pool.query(`
        SELECT g.id, g.name FROM guests g
         WHERE g.revoked_at IS NULL AND g.email IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM rsvps r WHERE r.guest_id = g.id)
           AND EXISTS (SELECT 1 FROM messages m WHERE m.guest_id = g.id AND NOT m.is_test AND m.kind = 'invitation' AND m.status = ANY($1))
           AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.guest_id = g.id AND m.kind = 'reminder' AND m.channel = 'email'
                             AND m.status <> 'failed' AND m.created_at > now() - interval '24 hours')
         ORDER BY g.name`, [OK_STATUSES]);
      return rows;
    }
    const { rows } = await pool.query(`
      SELECT g.id, g.name FROM guests g JOIN rsvps r ON r.guest_id = g.id
       WHERE g.revoked_at IS NULL AND g.email IS NOT NULL AND r.attendance = 'yes' ORDER BY g.name`);
    return rows;
  }

  r.get('/bulk/preview', async (req, res, next) => {
    try {
      const kind = req.query.kind === 'update' ? 'update' : 'reminder';
      const list = await audience(kind);
      res.json({ kind, count: list.length, names: list.map(g => g.name), email: mailer.status() });
    } catch (e) { next(e); }
  });

  let bulkRunning = false;
  r.post('/bulk/send', async (req, res, next) => {
    if (bulkRunning) return res.status(409).json({ error: 'busy', message: 'A bulk send is already running.' });
    try {
      const b = req.body || {};
      const kind = b.kind === 'update' ? 'update' : b.kind === 'reminder' ? 'reminder' : null;
      if (!kind) return res.status(400).json({ error: 'invalid' });
      if (b.confirm !== true) return res.status(400).json({ error: 'confirm_required', message: 'Confirm the recipients before sending.' });
      let update = null;
      if (kind === 'update') {
        const subject = cleanText(b.subject, 120), body = cleanText(b.body, 4000);
        if (!subject || !body) return res.status(400).json({ error: 'invalid', message: 'An update needs a subject and a message.' });
        update = { subject, body, hash: sha256(subject + '\n' + body).slice(0, 16) };
      }
      if (!mailer.status().ready) return res.status(503).json({ error: 'email_not_ready', message: 'Email is not configured yet — nothing was sent.' });

      bulkRunning = true;
      const list = await audience(kind);
      const results = { sent: 0, skipped: 0, failed: 0, errors: [] };
      for (const g of list) {
        let out = await sendEmail(req, Number(g.id), kind, { update });
        // Rate-limited by the provider: wait as instructed and retry once (failed rows don't block a retry).
        if (out.status === 502 && out.retryAfter) { await sleep(Math.min(10, Number(out.retryAfter) || 1) * 1000); out = await sendEmail(req, Number(g.id), kind, { update }); }
        if (out.status === 200) results.sent++;
        else if (out.status === 409) results.skipped++;
        else { results.failed++; results.errors.push({ name: g.name, message: out.body.message }); }
        await sleep(sendGap);
      }
      await logActivity(pool, { actor: 'host', type: `bulk_${kind}`, detail: { sent: results.sent, skipped: results.skipped, failed: results.failed, test: mailer.mode === 'test' } });
      res.json({ ok: true, ...results, test: mailer.mode === 'test' });
    } catch (e) { next(e); } finally { bulkRunning = false; }
  });

  return r;
}
