-- MAISON 23 schema. Additive only: every statement is safe to re-run on start.

CREATE TABLE IF NOT EXISTS guests (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  email            TEXT CHECK (email IS NULL OR length(email) <= 254),
  phone            TEXT CHECK (phone IS NULL OR length(phone) <= 32),
  allocation       INT  NOT NULL DEFAULT 1 CHECK (allocation BETWEEN 1 AND 10),
  token            TEXT NOT NULL UNIQUE,
  token_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rsvps (
  guest_id    BIGINT PRIMARY KEY REFERENCES guests(id) ON DELETE CASCADE,
  attendance  TEXT NOT NULL CHECK (attendance IN ('yes', 'maybe', 'no')),
  party_size  INT  NOT NULL CHECK (party_size BETWEEN 0 AND 10),
  dietary     TEXT NOT NULL DEFAULT '' CHECK (length(dietary) <= 140),
  message     TEXT NOT NULL DEFAULT '' CHECK (length(message) <= 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every send attempt (email) or manual send record (WhatsApp).
-- status: sending | sent (accepted by provider) | delivered | delivery_delayed
--         | bounced | complained | failed | marked_sent (host-confirmed manual send)
CREATE TABLE IF NOT EXISTS messages (
  id           BIGSERIAL PRIMARY KEY,
  guest_id     BIGINT REFERENCES guests(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  kind         TEXT NOT NULL CHECK (kind IN ('invitation', 'reminder', 'update')),
  is_test      BOOLEAN NOT NULL DEFAULT false,
  recipient    TEXT,
  subject      TEXT,
  dedupe_key   TEXT,
  status       TEXT NOT NULL,
  provider_id  TEXT,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_guest_idx ON messages (guest_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_provider_idx ON messages (provider_id);
-- A given update/reminder key can only be live once; failed attempts may be retried.
CREATE UNIQUE INDEX IF NOT EXISTS messages_dedupe_idx ON messages (dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status <> 'failed';

CREATE TABLE IF NOT EXISTS activity (
  id        BIGSERIAL PRIMARY KEY,
  at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor     TEXT NOT NULL CHECK (actor IN ('host', 'guest', 'system')),
  guest_id  BIGINT REFERENCES guests(id) ON DELETE SET NULL,
  type      TEXT NOT NULL,
  detail    JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS activity_at_idx ON activity (at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash  TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
