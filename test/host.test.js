import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { setup } from './helpers.js';

let t;
before(async () => { t = await setup(); });
after(async () => { await t.close(); });

test('13. the dashboard API refuses unauthenticated and cross-site requests', async () => {
  for (const [m, p] of [['GET', '/api/admin/overview'], ['GET', '/api/admin/export.csv'], ['POST', '/api/admin/guests'], ['PUT', '/api/admin/event']]) {
    const r = await t.req(m, p, { body: m === 'GET' ? undefined : {}, headers: { 'X-M23': '1' } });
    assert.equal(r.status, 401, `${m} ${p}`);
  }
  assert.equal((await t.req('POST', '/api/admin/login', { body: { password: 'wrong-password!!' }, headers: { 'X-M23': '1' } })).status, 401);
  assert.equal((await t.req('POST', '/api/admin/login', { body: { password: 'test-password-123' } })).status, 403, 'login without CSRF header is refused');
  assert.equal((await t.req('POST', '/api/admin/login', { body: { password: 'test-password-123' }, headers: { 'X-M23': '1', Origin: 'https://evil.example' } })).status, 403);

  const ok = await t.login();
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);

  // Authenticated but missing the CSRF header → refused for writes.
  const sid = cookie.split(';')[0];
  const csrf = await t.req('POST', '/api/admin/guests', { body: { name: 'X' }, headers: { Cookie: sid } });
  assert.equal(csrf.status, 403);
});

test('6. host creates an invitation with a secure, unique, non-sequential token', async () => {
  const a = await t.addGuest({ name: 'Sofia Benali', email: 'sofia@example.com', allocation: 1 });
  const b = await t.addGuest({ name: 'Sofia Benali', email: 'sofia2@example.com', allocation: 1 });
  assert.match(a.token, /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(a.token, b.token);
  assert.equal(a.link, `https://maison23.club/invite/${a.token}`);
  assert.equal(a.invitation.state, 'not_sent', 'creating a link is not sending it');

  assert.equal((await t.admin('POST', '/api/admin/guests', { name: '' })).status, 400);
  assert.equal((await t.admin('POST', '/api/admin/guests', { name: 'Bad', email: 'not-an-email' })).status, 400);
  assert.equal((await t.admin('POST', '/api/admin/guests', { name: 'Bad', allocation: 11 })).status, 400);
});

test('7. revoking stops the link; regenerating issues a new one and kills the old', async () => {
  const g = await t.addGuest({ name: 'Old Link', email: 'old@example.com' });
  assert.equal((await t.admin('POST', `/api/admin/guests/${g.id}/revoke`)).status, 200);
  assert.equal((await t.req('GET', `/api/invite/${g.token}`)).status, 410);
  assert.equal((await t.admin('POST', `/api/admin/guests/${g.id}/restore`)).status, 200);
  assert.equal((await t.req('GET', `/api/invite/${g.token}`)).status, 200);

  await t.admin('POST', `/api/admin/guests/${g.id}/regenerate`);
  assert.equal((await t.req('GET', `/api/invite/${g.token}`)).status, 404, 'old token is dead');
  const { data } = await t.admin('GET', '/api/admin/overview');
  const fresh = data.guests.find(x => x.id === g.id).link.split('/invite/')[1];
  assert.notEqual(fresh, g.token);
  assert.equal((await t.req('GET', `/api/invite/${fresh}`)).status, 200);
});

test('8. email send, duplicate protection, explicit resend, and provider idempotency', async () => {
  const g = await t.addGuest({ name: 'Mail Guest', email: 'mail@example.com' });
  const n0 = t.resend.calls.length;
  const r1 = await t.admin('POST', `/api/admin/guests/${g.id}/email`, { kind: 'invitation' });
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  const call = t.resend.calls.at(-1);
  assert.equal(call.body.to[0], 'mail@example.com');
  assert.equal(call.body.subject, 'You’re Invited — MAISON 23 | Dubai · 23 October');
  assert.ok(call.body.html.includes(g.link) && call.body.text.includes(g.link), 'HTML and plain-text both carry the personal link');
  assert.ok(call.body.text.includes('Hey Mail,'));
  assert.match(call.headers['Idempotency-Key'], /^m23-msg-\d+$/);

  const dup = await t.admin('POST', `/api/admin/guests/${g.id}/email`, { kind: 'invitation' });
  assert.equal(dup.status, 409, 'second send is blocked without confirmation');
  assert.equal(t.resend.calls.length, n0 + 1);

  const forced = await t.admin('POST', `/api/admin/guests/${g.id}/email`, { kind: 'invitation', force: true });
  assert.equal(forced.status, 200, 'explicit resend works');

  const { data } = await t.admin('GET', '/api/admin/overview');
  const row = data.guests.find(x => x.id === g.id);
  assert.equal(row.invitation.state, 'sent', 'accepted by provider, not yet "delivered"');
  assert.equal(row.history.length, 2);
});

test('14a. failed sends are recorded as failed — never as sent', async () => {
  const g = await t.addGuest({ name: 'Fail Guest', email: 'fail@example.com' });
  t.resend.mode = 'error';
  const r = await t.admin('POST', `/api/admin/guests/${g.id}/email`, { kind: 'invitation' });
  assert.equal(r.status, 502);
  t.resend.mode = 'network';
  const r2 = await t.admin('POST', `/api/admin/guests/${g.id}/email`, { kind: 'invitation' });
  assert.equal(r2.status, 502);
  t.resend.mode = 'ok';
  const { data } = await t.admin('GET', '/api/admin/overview');
  const row = data.guests.find(x => x.id === g.id);
  assert.equal(row.invitation.state, 'failed');
  assert.ok(row.history.every(h => h.status === 'failed'));
  // A failed attempt doesn't block a retry.
  assert.equal((await t.admin('POST', `/api/admin/guests/${g.id}/email`, { kind: 'invitation' })).status, 200);
});

test('webhooks: only signed events update delivery; delivered beats sent, never the reverse', async () => {
  const g = await t.addGuest({ name: 'Hook Guest', email: 'hook@example.com' });
  await t.admin('POST', `/api/admin/guests/${g.id}/email`, { kind: 'invitation' });
  const { rows: [m] } = await t.pool.query('SELECT provider_id FROM messages WHERE guest_id = $1', [g.id]);

  const sign = (body, ts = Math.floor(Date.now() / 1000)) => {
    const key = Buffer.from(t.env.RESEND_WEBHOOK_SECRET.replace('whsec_', ''), 'base64');
    const sig = createHmac('sha256', key).update(`msg_1.${ts}.${body}`).digest('base64');
    return { 'svix-id': 'msg_1', 'svix-timestamp': String(ts), 'svix-signature': `v1,${sig}`, 'Content-Type': 'application/json' };
  };
  const delivered = JSON.stringify({ type: 'email.delivered', data: { email_id: m.provider_id } });
  assert.equal((await t.req('POST', '/api/webhooks/resend', { raw: delivered, headers: { 'Content-Type': 'application/json', 'svix-id': 'x', 'svix-timestamp': '1', 'svix-signature': 'v1,bad' } })).status, 401);
  assert.equal((await t.req('POST', '/api/webhooks/resend', { raw: delivered, headers: sign(delivered, 1000) })).status, 401, 'stale timestamp rejected');
  assert.equal((await t.req('POST', '/api/webhooks/resend', { raw: delivered, headers: sign(delivered) })).status, 200);
  const late = JSON.stringify({ type: 'email.sent', data: { email_id: m.provider_id } });
  await t.req('POST', '/api/webhooks/resend', { raw: late, headers: sign(late) });

  const { data } = await t.admin('GET', '/api/admin/overview');
  assert.equal(data.guests.find(x => x.id === g.id).invitation.state, 'delivered');
});

test('test mode redirects every email to the test address and never counts as sent', async () => {
  const tm = await setup({ env: { EMAIL_MODE: 'test', EMAIL_TEST_RECIPIENT: 'host@example.com' } });
  await tm.login();
  const g = await tm.addGuest({ name: 'Real Guest', email: 'real.guest@example.com' });
  const r = await tm.admin('POST', `/api/admin/guests/${g.id}/email`, { kind: 'invitation' });
  assert.equal(r.status, 200);
  const call = tm.resend.calls.at(-1);
  assert.deepEqual(call.body.to, ['host@example.com']);
  assert.match(call.body.subject, /^\[TEST → real\.guest@example\.com\]/);
  const { data } = await tm.admin('GET', '/api/admin/overview');
  assert.equal(data.guests[0].invitation.state, 'not_sent');
  await tm.close();
});

test('email off: nothing reaches the provider and the attempt is recorded as failed', async () => {
  const off = await setup({ env: { EMAIL_MODE: 'off' } });
  await off.login();
  const g = await off.addGuest({ name: 'Off Guest', email: 'off@example.com' });
  const r = await off.admin('POST', `/api/admin/guests/${g.id}/email`, { kind: 'invitation' });
  assert.equal(r.status, 502);
  assert.equal(off.resend.calls.length, 0);
  const bulk = await off.admin('POST', '/api/admin/bulk/send', { kind: 'reminder', confirm: true });
  assert.equal(bulk.status, 503);
  await off.close();
});

test('bulk reminders need confirmation, target only invited non-responders, and never double-send', async () => {
  const b = await setup();
  await b.login();
  const pending = await b.addGuest({ name: 'Pending Invited', email: 'p1@example.com' });
  const replied = await b.addGuest({ name: 'Replied', email: 'p2@example.com' });
  await b.addGuest({ name: 'Never Invited', email: 'p3@example.com' });
  await b.admin('POST', `/api/admin/guests/${pending.id}/email`, { kind: 'invitation' });
  await b.admin('POST', `/api/admin/guests/${replied.id}/email`, { kind: 'invitation' });
  await b.req('POST', `/api/invite/${replied.token}/rsvp`, { body: { attendance: 'no' } });

  assert.equal((await b.admin('POST', '/api/admin/bulk/send', { kind: 'reminder' })).status, 400, 'confirm required');
  const prev = await b.admin('GET', '/api/admin/bulk/preview?kind=reminder');
  assert.deepEqual(prev.data.names, ['Pending Invited']);
  const s1 = await b.admin('POST', '/api/admin/bulk/send', { kind: 'reminder', confirm: true });
  assert.equal(s1.data.sent, 1);
  assert.equal((await b.admin('GET', '/api/admin/bulk/preview?kind=reminder')).data.count, 0, 'not reminded twice within 24h');

  // Event update to confirmed guests is deduplicated per content.
  await b.req('POST', `/api/invite/${pending.token}/rsvp`, { body: { attendance: 'yes', partySize: 1 } });
  const u = { kind: 'update', confirm: true, subject: 'The address is in', body: 'See you Friday.' };
  assert.equal((await b.admin('POST', '/api/admin/bulk/send', u)).data.sent, 1);
  const again = await b.admin('POST', '/api/admin/bulk/send', u);
  assert.equal(again.data.sent, 0);
  assert.equal(again.data.skipped, 1);
  await b.close();
});

test('9. WhatsApp message is personalised and marking it sent is recorded as manual', async () => {
  const g = await t.addGuest({ name: 'Wa Guest', email: null, phone: '+971 50 123 4567' });
  const r = await t.admin('GET', `/api/admin/guests/${g.id}/whatsapp`);
  assert.equal(r.status, 200);
  assert.ok(r.data.text.startsWith('Hey Wa! 😂'));
  assert.ok(r.data.text.includes(g.link));
  assert.ok(r.data.text.endsWith('La nuit est à nous. 🥀'));
  assert.ok(r.data.waUrl.startsWith('https://wa.me/971501234567?text='));
  await t.admin('POST', `/api/admin/guests/${g.id}/whatsapp-sent`, { kind: 'invitation' });
  const { data } = await t.admin('GET', '/api/admin/overview');
  const row = data.guests.find(x => x.id === g.id);
  assert.equal(row.invitation.state, 'marked_sent');
  assert.equal(row.invitation.channel, 'whatsapp');
});

test('CSV import validates all rows first; export neutralises formulas', async () => {
  const bad = await t.admin('POST', '/api/admin/guests/import', { csv: 'name,email\nGood,good@example.com\nBad,not-email' });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.errors[0].row, 3);

  const csv = 'Name;Email;Phone;Places\n"Diallo, Awa";awa@example.com;+33 6 12 34 56 78;2\n=HYPERLINK("http://x");formula@example.com;;1\nAwa Dup;AWA@example.com;;1\n';
  const ok = await t.admin('POST', '/api/admin/guests/import', { csv });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.created, 2);
  assert.deepEqual(ok.data.skipped, ['awa@example.com']);

  const exp = await t.admin('GET', '/api/admin/export.csv');
  assert.equal(exp.status, 200);
  assert.match(exp.headers.get('content-type'), /text\/csv/);
  assert.ok(exp.data.includes(`"'=HYPERLINK(""http://x"")"`), 'formula is prefixed with a quote');
  assert.ok(exp.data.includes('"Diallo, Awa"'));
});

test('event settings are validated and stored in Dubai time', async () => {
  const r = await t.admin('PUT', '/api/admin/event', { startsAt: '2026-10-23T21:00', endsAt: '2026-10-24T03:00' });
  assert.equal(r.status, 200);
  assert.equal(r.data.event.startsAt, '2026-10-23T21:00:00+04:00');
  assert.equal((await t.req('GET', '/api/event')).data.startsAt, '2026-10-23T21:00:00+04:00');
  assert.equal((await t.admin('PUT', '/api/admin/event', { endsAt: '2026-10-23T20:00' })).status, 400, 'end before start');
  assert.equal((await t.admin('PUT', '/api/admin/event', { spotifyUrl: 'javascript:alert(1)' })).status, 400);
  await t.admin('PUT', '/api/admin/event', { startsAt: '2026-10-23T20:00', endsAt: '2026-10-24T02:00' });
});

test('logout ends the session server-side', async () => {
  const s = await setup({ pool: t.pool });
  const login = await s.login();
  const cookie = login.headers.get('set-cookie').split(';')[0];
  await s.admin('POST', '/api/admin/logout');
  const r = await s.req('GET', '/api/admin/overview', { headers: { Cookie: cookie, 'X-M23': '1' } });
  assert.equal(r.status, 401);
  await s.close();
});
