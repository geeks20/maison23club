import { createHmac } from 'node:crypto';
import { safeEqual } from './util.js';

/**
 * Transactional email via Resend (https://resend.com), called from the server only.
 *
 * EMAIL_MODE controls what happens on send:
 *   off  (default) — nothing is sent; attempts are recorded as failed "email disabled".
 *   test — every email is redirected to EMAIL_TEST_RECIPIENT, subject prefixed [TEST].
 *          Test sends never count as an invitation delivered to the guest.
 *   live — emails go to guests.
 */
export function createMailer(env, fetchImpl = fetch) {
  const mode = ['off', 'test', 'live'].includes(env.EMAIL_MODE) ? env.EMAIL_MODE : 'off';
  const apiKey = env.RESEND_API_KEY || '';
  const from = env.EMAIL_FROM || '';
  const replyTo = env.EMAIL_REPLY_TO || '';
  const testRecipient = env.EMAIL_TEST_RECIPIENT || '';

  const missing = [];
  if (!apiKey) missing.push('RESEND_API_KEY');
  if (!from) missing.push('EMAIL_FROM');
  if (mode === 'test' && !testRecipient) missing.push('EMAIL_TEST_RECIPIENT');

  const status = () => ({
    mode, provider: 'resend', ready: mode !== 'off' && missing.length === 0,
    missing, testRecipient: mode === 'test' ? testRecipient : null,
    webhook: Boolean(env.RESEND_WEBHOOK_SECRET)
  });

  /** Returns { ok, providerId, recipient, isTest } or { ok:false, error, recipient, isTest }. */
  async function send({ to, subject, html, text, idempotencyKey }) {
    const isTest = mode === 'test';
    const recipient = isTest ? testRecipient : to;
    if (mode === 'off') return { ok: false, error: 'Email sending is off (EMAIL_MODE=off).', recipient: to, isTest: false };
    if (missing.length) return { ok: false, error: `Email is awaiting configuration: ${missing.join(', ')}.`, recipient, isTest };
    if (!to) return { ok: false, error: 'Guest has no email address.', recipient: null, isTest };

    const body = {
      from, to: [recipient], subject: isTest ? `[TEST → ${to}] ${subject}` : subject, html, text,
      ...(replyTo ? { reply_to: replyTo } : {})
    };
    try {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) {
        return { ok: false, error: `Resend ${res.status}: ${data.message || data.name || 'request failed'}`.slice(0, 300), recipient, isTest, retryAfter: res.headers.get('retry-after') };
      }
      return { ok: true, providerId: data.id, recipient, isTest };
    } catch (e) {
      return { ok: false, error: `Network error: ${e.message}`.slice(0, 300), recipient, isTest };
    }
  }

  return { mode, status, send };
}

/**
 * Verifies a Resend webhook (Svix signature scheme).
 * Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`, HMAC-SHA256 with the
 * base64 secret after the "whsec_" prefix. Rejects timestamps older than 5 minutes.
 */
export function verifyResendWebhook({ secret, headers, rawBody, now = Date.now() }) {
  if (!secret) return false;
  const id = headers['svix-id'], ts = headers['svix-timestamp'], sigHeader = headers['svix-signature'];
  if (!id || !ts || !sigHeader) return false;
  if (Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${ts}.${rawBody}`).digest('base64');
  return sigHeader.split(' ').some(part => {
    const [ver, sig] = part.split(',');
    return ver === 'v1' && sig && safeEqual(sig, expected);
  });
}

// Resend event type → our message status. Order matters: never downgrade a final state.
export const WEBHOOK_STATUS = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed'
};
const RANK = { sending: 0, sent: 1, delivery_delayed: 2, delivered: 3, failed: 4, bounced: 4, complained: 5 };
export const shouldUpgrade = (from, to) => (RANK[to] ?? -1) > (RANK[from] ?? -1);
