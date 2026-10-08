import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { setup } from './helpers.js';
import { parseCsv, csvCell, newToken, validateGuest } from '../server/util.js';
import { toDubaiIso, validateEventPatch, EVENT_DEFAULTS } from '../server/event.js';
import { invitationEmail } from '../server/templates.js';

// Load the browser countdown module exactly as the page does.
const src = await readFile(new URL('../public/countdown.js', import.meta.url), 'utf8');
const ctx = { window: {} };
vm.runInNewContext(src, ctx);
const compute = (...a) => JSON.parse(JSON.stringify(ctx.window.M23Countdown.compute(...a)));
const TARGET = '2026-10-23T20:00:00+04:00';

test('12. countdown targets 8 PM Dubai (16:00 UTC) whatever the device timezone', () => {
  assert.equal(Date.parse(TARGET), Date.parse('2026-10-23T16:00:00Z'));
  // One second before doors open.
  assert.deepEqual(compute(TARGET, Date.parse('2026-10-23T15:59:59Z')), { started: false, d: '00', h: '00', m: '00', s: '01' });
  // Exactly at the start, and after it.
  assert.equal(compute(TARGET, Date.parse('2026-10-23T16:00:00Z')).started, true);
  assert.equal(compute(TARGET, Date.parse('2026-10-24T01:00:00Z')).started, true);
  // Midnight in Dubai on the day (= 20:00 UTC the day before): exactly 20 hours left.
  assert.deepEqual(compute(TARGET, Date.parse('2026-10-22T20:00:00Z')), { started: false, d: '00', h: '20', m: '00', s: '00' });
  // Across Europe's DST change (25 Oct) and a far-off date — no drift.
  assert.equal(compute(TARGET, Date.parse('2026-10-08T16:00:00Z')).d, '15');
  // Sub-second remainder rounds up so 00:00:00 never shows before the start.
  assert.equal(compute(TARGET, Date.parse('2026-10-23T15:59:59.500Z')).s, '01');
  // Bad target falls back to the default.
  assert.equal(compute('nonsense', Date.parse('2026-10-23T15:59:59Z')).s, '01');
});

test('countdown is identical under different process timezones', async () => {
  const { execFileSync } = await import('node:child_process');
  const script = `const vm=require('vm'),fs=require('fs');const c={window:{}};vm.runInNewContext(fs.readFileSync('public/countdown.js','utf8'),c);
    console.log(JSON.stringify(c.window.M23Countdown.compute('${TARGET}', Date.parse('2026-10-20T08:30:15Z'))))`;
  const outs = ['UTC', 'America/Port-au-Prince', 'Europe/Paris', 'Africa/Kinshasa', 'Asia/Dubai', 'Pacific/Kiritimati'].map(tz =>
    execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: tz }, cwd: fileURLToPath(new URL('..', import.meta.url)) }).toString().trim());
  assert.equal(new Set(outs).size, 1);
  assert.deepEqual(JSON.parse(outs[0]), { started: false, d: '03', h: '07', m: '29', s: '45' });
});

test('Dubai wall-clock input converts to +04:00', () => {
  assert.equal(toDubaiIso('2026-10-23T20:00'), '2026-10-23T20:00:00+04:00');
  assert.equal(toDubaiIso('2026-10-23T16:00:00Z'), '2026-10-23T20:00:00+04:00');
  assert.equal(toDubaiIso('2026-10-23T23:30'), '2026-10-23T23:30:00+04:00');
  assert.equal(toDubaiIso('tomorrow'), null);
  assert.equal(validateEventPatch(EVENT_DEFAULTS, { capacity: 0 }).error !== undefined, true);
});

test('tokens are 192-bit random and url-safe', () => {
  const set = new Set(Array.from({ length: 5000 }, newToken));
  assert.equal(set.size, 5000);
  for (const t of set) assert.match(t, /^[A-Za-z0-9_-]{32}$/);
});

test('CSV parsing and cell escaping', () => {
  assert.deepEqual(parseCsv('﻿name,email\r\n"A, B","x""y"\n\n'), [['name', 'email'], ['A, B', 'x"y']]);
  assert.equal(csvCell('=1+1'), `"'=1+1"`);
  assert.equal(csvCell('-2'), `"'-2"`);
  assert.equal(csvCell('@SUM'), `"'@SUM"`);
  assert.equal(csvCell('Amara'), '"Amara"');
});

test('guest validation normalises phone and email', () => {
  assert.deepEqual(validateGuest({ name: '  Awa   Diallo ', email: ' AWA@Example.com ', phone: '+971 (50) 123-4567', allocation: '2' }).value,
    { name: 'Awa Diallo', email: 'awa@example.com', phone: '+971501234567', allocation: 2 });
  assert.ok(validateGuest({ name: 'X', phone: '12' }).error);
});

test('invitation email: subject, copy, plain-text alternative, escaping', () => {
  const m = invitationEmail({ firstName: '<b>Amara</b>', url: 'https://maison23.club/invite/abc' });
  assert.equal(m.subject, 'You’re Invited — MAISON 23 | Dubai · 23 October');
  assert.ok(m.text.startsWith('Hey <b>Amara</b>,\nI’m doing something a little different'));
  assert.ok(m.text.includes('Paris. Kinshasa. Port-au-Prince. Dubai.'));
  assert.ok(m.html.includes('Hey &lt;b&gt;Amara&lt;/b&gt;,'), 'names are HTML-escaped');
  assert.ok(m.html.includes('#64283D') || m.html.includes('#BE9A68'));
  assert.ok(m.html.includes('href="https://maison23.club/invite/abc"'));
});

test('14b. without a database the site still serves and the API fails clearly (never a fake success)', async () => {
  const s = await setup({ pool: null });
  assert.equal((await s.req('GET', '/')).status, 200);
  const r = await s.req('POST', '/api/invite/' + 'a'.repeat(32) + '/rsvp', { body: { attendance: 'yes', partySize: 1 } });
  assert.equal(r.status, 503);
  assert.equal(r.data.error, 'database_unavailable');
  assert.equal((await s.req('GET', '/api/health')).status, 503);
  await s.close();
});

test('14c. a database failure mid-request returns an error, not a confirmation', async () => {
  const { createPool } = await import('../server/db.js');
  const broken = createPool('postgres://localhost:1/nowhere');
  const s = await setup({ pool: broken });
  const r = await s.req('POST', '/api/invite/' + 'a'.repeat(32) + '/rsvp', { body: { attendance: 'yes', partySize: 1 } });
  assert.equal(r.status, 500);
  assert.equal(r.data.error, 'server_error');
  await s.close();
  await broken.end();
});

test('rate limiting kicks in on invitation lookups', async () => {
  const s = await setup({ pool: null });
  let last;
  for (let i = 0; i < 62; i++) last = await s.req('GET', '/api/invite/' + 'b'.repeat(32));
  assert.equal(last.status, 429);
  await s.close();
});
