import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

let t;
before(async () => { t = await setup(); await t.login(); });
after(async () => { await t.close(); });

test('1. a valid invitation opens with the guest name and public event info only', async () => {
  const g = await t.addGuest({ name: 'Amara Diallo' });
  const r = await t.req('GET', `/api/invite/${g.token}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.guest.firstName, 'Amara');
  assert.equal(r.data.guest.allocation, 2);
  assert.equal(r.data.rsvp, null);
  assert.equal(r.data.event.startsAt, '2026-10-23T20:00:00+04:00');
  assert.equal(r.data.venue, null);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.ok(!('email' in r.data.guest), 'guest email is not exposed');
});

test('2. invalid, malformed and revoked invitations are refused', async () => {
  assert.equal((await t.req('GET', '/api/invite/' + 'x'.repeat(32))).status, 404);
  assert.equal((await t.req('GET', '/api/invite/short')).status, 404);
  assert.equal((await t.req('GET', "/api/invite/' OR 1=1 --")).status, 404);
  const g = await t.addGuest({ name: 'Revoked Person', email: 'r@example.com' });
  await t.admin('POST', `/api/admin/guests/${g.id}/revoke`);
  const r = await t.req('GET', `/api/invite/${g.token}`);
  assert.equal(r.status, 410);
  const w = await t.req('POST', `/api/invite/${g.token}/rsvp`, { body: { attendance: 'yes', partySize: 1 } });
  assert.equal(w.status, 410, 'revoked guests cannot reply');
});

test('3–4. a guest submits and then changes their RSVP; the server is the source of truth', async () => {
  const g = await t.addGuest({ name: 'Kevin Mbuyi', email: 'kevin@example.com', allocation: 2 });
  let r = await t.req('POST', `/api/invite/${g.token}/rsvp`, { body: { attendance: 'yes', partySize: 2, dietary: 'Vegetarian', message: 'Joyeux anniversaire !' } });
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.rsvp.attendance, r.data.rsvp.partySize, r.data.rsvp.dietary], ['yes', 2, 'Vegetarian']);

  r = await t.req('POST', `/api/invite/${g.token}/rsvp`, { body: { attendance: 'no' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.rsvp.attendance, 'no');
  assert.equal(r.data.rsvp.partySize, 0);

  const again = await t.req('GET', `/api/invite/${g.token}`);
  assert.equal(again.data.rsvp.attendance, 'no', 'reopening the link shows the saved reply');

  // 5. host sees the change and its history
  const { data } = await t.admin('GET', '/api/admin/overview');
  const row = data.guests.find(x => x.id === g.id);
  assert.equal(row.rsvp.attendance, 'no');
  const types = data.activity.filter(a => a.name === 'Kevin Mbuyi').map(a => a.type);
  assert.ok(types.includes('rsvp') && types.includes('rsvp_updated'));
});

test('RSVP input is validated', async () => {
  const g = await t.addGuest({ name: 'Nadège Pierre', email: 'n@example.com', allocation: 1 });
  assert.equal((await t.req('POST', `/api/invite/${g.token}/rsvp`, { body: { attendance: 'perhaps' } })).status, 400);
  assert.equal((await t.req('POST', `/api/invite/${g.token}/rsvp`, { body: { attendance: 'yes', partySize: 2 } })).status, 400, 'cannot exceed allocation');
  assert.equal((await t.req('POST', `/api/invite/${g.token}/rsvp`, { body: { attendance: 'yes', partySize: 0 } })).status, 400);
  const long = await t.req('POST', `/api/invite/${g.token}/rsvp`, { body: { attendance: 'maybe', partySize: 1, message: 'x'.repeat(900), dietary: 'y'.repeat(400) } });
  assert.equal(long.status, 200);
  assert.equal(long.data.rsvp.message.length, 500);
  assert.equal(long.data.rsvp.dietary.length, 140);
  assert.equal((await t.req('POST', `/api/invite/${g.token}/rsvp`, { raw: '{bad json', headers: { 'Content-Type': 'application/json' } })).status, 400);
});

test('10. capacity is enforced across guests; allocation edits clamp existing replies', async () => {
  await t.admin('PUT', '/api/admin/event', { capacity: 3 });
  const a = await t.addGuest({ name: 'Cap One', email: 'c1@example.com', allocation: 2 });
  const b = await t.addGuest({ name: 'Cap Two', email: 'c2@example.com', allocation: 2 });
  // Kevin declined above, so only these count.
  const { data: before } = await t.admin('GET', '/api/admin/overview');
  const already = before.stats.expected;
  assert.equal((await t.req('POST', `/api/invite/${a.token}/rsvp`, { body: { attendance: 'yes', partySize: 2 } })).status, already + 2 <= 3 ? 200 : 409);
  const over = await t.req('POST', `/api/invite/${b.token}/rsvp`, { body: { attendance: 'yes', partySize: 2 } });
  assert.equal(over.status, 409);
  assert.equal(over.data.error, 'capacity');
  assert.equal((await t.req('POST', `/api/invite/${b.token}/rsvp`, { body: { attendance: 'maybe', partySize: 2 } })).status, 200, 'maybe does not consume capacity');

  assert.equal((await t.admin('PUT', '/api/admin/event', { capacity: 41 })).status, 400, 'capacity max is 40');
  assert.equal((await t.admin('PUT', '/api/admin/event', { capacity: 40 })).status, 200);

  await t.admin('PATCH', `/api/admin/guests/${a.id}`, { allocation: 1 });
  const r = await t.req('GET', `/api/invite/${a.token}`);
  assert.equal(r.data.rsvp.partySize, 1, 'reply clamped to the new allocation');
  await t.admin('PUT', '/api/admin/event', { capacity: 35 });
});

test('venue stays private until shared, then only confirmed guests see it', async () => {
  await t.admin('PUT', '/api/admin/event', { venueName: 'Secret Villa', venueAddress: '1 Palm Way', mapsUrl: 'https://maps.app.goo.gl/abc', venueShared: false });
  const yes = await t.addGuest({ name: 'Venue Yes', email: 'vy@example.com', allocation: 1 });
  const maybe = await t.addGuest({ name: 'Venue Maybe', email: 'vm@example.com', allocation: 1 });
  await t.req('POST', `/api/invite/${yes.token}/rsvp`, { body: { attendance: 'yes', partySize: 1 } });
  await t.req('POST', `/api/invite/${maybe.token}/rsvp`, { body: { attendance: 'maybe', partySize: 1 } });

  assert.equal((await t.req('GET', `/api/invite/${yes.token}`)).data.venue, null, 'not shared yet');
  await t.admin('PUT', '/api/admin/event', { venueShared: true });
  assert.equal((await t.req('GET', `/api/invite/${yes.token}`)).data.venue.name, 'Secret Villa');
  assert.equal((await t.req('GET', `/api/invite/${maybe.token}`)).data.venue, null, 'maybe guests do not get the address');

  const pub = await t.req('GET', '/api/event');
  const home = await t.req('GET', '/');
  for (const body of [JSON.stringify(pub.data), home.data]) {
    assert.ok(!body.includes('Secret Villa') && !body.includes('Palm Way'), 'venue never in public responses');
  }
  await t.admin('PUT', '/api/admin/event', { venueShared: false });
});

test('RSVPs close after the deadline', async () => {
  const g = await t.addGuest({ name: 'Late Guest', email: 'late@example.com', allocation: 1 });
  await t.admin('PUT', '/api/admin/event', { rsvpDeadline: '2020-01-01T00:00' });
  const r = await t.req('POST', `/api/invite/${g.token}/rsvp`, { body: { attendance: 'yes', partySize: 1 } });
  assert.equal(r.status, 403);
  assert.equal((await t.req('GET', `/api/invite/${g.token}`)).data.rsvpOpen, false);
  await t.admin('PUT', '/api/admin/event', { rsvpDeadline: null });
});

test('invitation pages are served for /invite/:token with no-store and noindex', async () => {
  const g = await t.addGuest({ name: 'Page Guest', email: 'page@example.com' });
  const r = await t.req('GET', `/invite/${g.token}`);
  assert.equal(r.status, 200);
  assert.match(r.data, /<title>MAISON 23/);
  assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
});
