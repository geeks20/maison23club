import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

// ---------- Invitation tokens ----------
// 24 random bytes → 32 url-safe characters (192 bits). Not sequential, not guessable.
export const newToken = () => randomBytes(24).toString('base64url');
export const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
export const sha256 = s => createHash('sha256').update(s).digest('hex');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---------- Validation ----------
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

export function cleanText(v, max) {
  // Strip control characters (keep newlines for messages), collapse whitespace at the ends.
  return String(v ?? '').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim().slice(0, max);
}

/** Validates guest fields. `partial` allows omitting fields (for edits). */
export function validateGuest(input, { partial = false } = {}) {
  const out = {};
  if (!partial || 'name' in input) {
    const name = cleanText(input.name, 120).replace(/\s+/g, ' ');
    if (!name) return { error: 'A guest name is required.' };
    out.name = name;
  }
  if ('email' in input || !partial) {
    const email = cleanText(input.email, 254).toLowerCase();
    if (email && !EMAIL_RE.test(email)) return { error: `"${email}" is not a valid email address.` };
    out.email = email || null;
  }
  if ('phone' in input || !partial) {
    const raw = cleanText(input.phone, 40);
    const phone = raw.replace(/[^\d+]/g, '');
    if (phone && !/^\+?\d{7,15}$/.test(phone)) return { error: `"${raw}" is not a valid phone number. Use international format, e.g. +971501234567.` };
    out.phone = phone || null;
  }
  if ('allocation' in input || !partial) {
    const a = input.allocation === undefined || input.allocation === '' ? 1 : Number(input.allocation);
    if (!Number.isInteger(a) || a < 1 || a > 10) return { error: 'Places must be a whole number between 1 and 10.' };
    out.allocation = a;
  }
  return { value: out };
}

export const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';

// ---------- Rate limiting (in-memory, per process) ----------
export function rateLimiter({ windowMs, max, name }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset <= now) { h = { n: 0, reset: now + windowMs }; hits.set(key, h); }
    h.n++;
    if (h.n > max) {
      res.set('Retry-After', String(Math.ceil((h.reset - now) / 1000)));
      return res.status(429).json({ error: 'rate_limited', message: 'Too many requests. Please wait a moment and try again.', scope: name });
    }
    next();
  };
}

// ---------- CSV ----------
/** RFC 4180-ish parser: quoted fields, escaped quotes, CRLF/LF. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', i = 0, quoted = false;
  const s = String(text).replace(/^﻿/, '');
  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { quoted = false; i++; continue; }
      field += c; i++; continue;
    }
    // A quote only opens a quoted field at the start of the field (RFC 4180).
    if (c === '"' && field === '') { quoted = true; i++; continue; }
    if (c === ',' || c === ';' || c === '\t') { row.push(field); field = ''; i++; continue; }
    if (c === '\r' && s[i + 1] === '\n') i++;
    if (c === '\n' || c === '\r') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => f.trim() !== ''));
}

/** Escapes a CSV cell and neutralises spreadsheet formula injection. */
export function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}
