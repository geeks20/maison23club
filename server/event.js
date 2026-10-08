// Event settings: what the host can change from the dashboard without touching code.

export const EVENT_TZ = 'Asia/Dubai';
export const MAX_CAPACITY = 40;

export const EVENT_DEFAULTS = Object.freeze({
  startsAt: '2026-10-23T20:00:00+04:00',
  endsAt: '2026-10-24T02:00:00+04:00',
  capacity: 35,
  rsvpDeadline: null,
  dressCode: 'Black, burgundy, chocolate, ivory — gold for the details.',
  venueName: '',
  venueAddress: '',
  mapsUrl: '',
  venueShared: false,
  spotifyUrl: '',
  appleMusicUrl: ''
});

const URL_FIELDS = { mapsUrl: 500, spotifyUrl: 500, appleMusicUrl: 500 };
const TEXT_FIELDS = { dressCode: 200, venueName: 120, venueAddress: 300 };

export async function getEvent(q) {
  const { rows } = await q.query("SELECT value FROM settings WHERE key = 'event'");
  return { ...EVENT_DEFAULTS, ...(rows[0] ? rows[0].value : {}) };
}

/** Validates a partial update. Returns { value } or { error }. */
export function validateEventPatch(current, patch) {
  if (!patch || typeof patch !== 'object') return { error: 'Invalid settings.' };
  const next = { ...current };

  for (const [k, max] of Object.entries(TEXT_FIELDS)) {
    if (k in patch) {
      const v = String(patch[k] ?? '').trim();
      if (v.length > max) return { error: `${k} is too long (max ${max}).` };
      next[k] = v;
    }
  }
  for (const [k, max] of Object.entries(URL_FIELDS)) {
    if (k in patch) {
      const v = String(patch[k] ?? '').trim();
      if (v && (!/^https:\/\/[^\s<>"']+$/i.test(v) || v.length > max)) return { error: `${k} must be an https:// link.` };
      next[k] = v;
    }
  }
  if ('venueShared' in patch) next.venueShared = patch.venueShared === true;
  if ('capacity' in patch) {
    const c = Number(patch.capacity);
    if (!Number.isInteger(c) || c < 1 || c > MAX_CAPACITY) return { error: `Capacity must be between 1 and ${MAX_CAPACITY}.` };
    next.capacity = c;
  }
  for (const k of ['startsAt', 'endsAt', 'rsvpDeadline']) {
    if (k in patch) {
      const v = patch[k];
      if ((v === null || v === '') && k === 'rsvpDeadline') { next[k] = null; continue; }
      const iso = toDubaiIso(v);
      if (!iso) return { error: `${k} must be a valid date and time.` };
      next[k] = iso;
    }
  }
  if (Date.parse(next.endsAt) <= Date.parse(next.startsAt)) return { error: 'The end time must be after the start time.' };
  return { value: next };
}

/**
 * Accepts an ISO string with offset, or a "YYYY-MM-DDTHH:mm" wall-clock time which is
 * interpreted in Dubai time (UTC+4, no daylight saving). Returns ISO with +04:00.
 */
export function toDubaiIso(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let ms;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) ms = Date.parse(s + (s.length === 16 ? ':00' : '') + '+04:00');
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(s)) ms = Date.parse(s);
  else return null;
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms + 4 * 3600e3);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00+04:00`;
}

/** Fields any visitor may see. Never includes venue details. */
export function publicEvent(ev) {
  return {
    startsAt: ev.startsAt,
    endsAt: ev.endsAt,
    timezone: EVENT_TZ,
    rsvpDeadline: ev.rsvpDeadline,
    dressCode: ev.dressCode,
    spotifyUrl: ev.spotifyUrl,
    appleMusicUrl: ev.appleMusicUrl
  };
}

export function rsvpOpen(ev, now = Date.now()) {
  return !ev.rsvpDeadline || now <= Date.parse(ev.rsvpDeadline);
}

export function formatDubai(iso, opts) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: EVENT_TZ, ...opts }).format(new Date(iso));
}
