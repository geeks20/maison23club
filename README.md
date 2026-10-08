# MAISON 23

Invitation-only birthday experience — Dubai, Friday 23 October 2026. *La nuit est à nous.*

- **Guest site** (`/`, `/invite/<token>`): the editorial site plus a personal invitation and RSVP.
- **Host dashboard** (`/host`): guests, invitations, email & WhatsApp sending, event settings, activity.

## Stack

Node 20+ · Express 5 · **Neon Postgres** (`pg`) · vanilla HTML/CSS/JS (no build step) · Resend for email · Railway hosting.

```
server/        API, auth, email, schema (additive migrations run on start)
public/        index.html, host.html, styles, scripts, images/
test/          node:test suite (runs against a real Postgres)
```

## Database — Neon

Neon project **maison23** (`snowy-art-54837808`), region **aws-ap-southeast-1 (Singapore)**, Postgres 17, database `maison23`.

| Branch | Use |
|---|---|
| `production` | the live site (set on Railway) |
| `dev` | local development and testing — an isolated copy, safe to reset |

- The app uses the **pooled** connection string (`-pooler` host) as `DATABASE_URL`.
- Schema setup runs at start-up over the **direct** string (`DATABASE_URL_UNPOOLED`) when provided. It is additive only.
- The app only uses transaction-scoped features (`pg_advisory_xact_lock`), so it is safe behind Neon's PgBouncer pooling.
- Neon scales to zero when idle; the first request after a quiet period takes a moment longer.
- Point-in-time restore covers the last 24 hours (project history retention). Create a branch before risky changes.

```sh
# connection strings (never commit them)
neon connection-string production --project-id snowy-art-54837808 --database-name maison23 --pooled
neon connection-string dev        --project-id snowy-art-54837808 --database-name maison23 --pooled
```

## Local development

```sh
cp .env.example .env     # set ADMIN_PASSWORD, and DATABASE_URL/DATABASE_URL_UNPOOLED from the Neon dev branch
npm install
npm run dev              # http://localhost:3009  (host: /host)
```

Tests run against any Postgres; each run uses its own temporary schema:

```sh
createdb maison23_test && npm test                      # local Postgres (fast)
TEST_DATABASE_URL="<neon dev DIRECT string>" npm test   # against Neon
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Neon **pooled** connection string |
| `DATABASE_URL_UNPOOLED` | recommended | Neon **direct** connection string, for schema setup |
| `ADMIN_PASSWORD` | yes | Host dashboard password (12+ chars) |
| `PUBLIC_BASE_URL` | recommended | Base for invitation links, e.g. `https://maison23.club` |
| `EMAIL_MODE` | no | `off` (default) · `test` (only to `EMAIL_TEST_RECIPIENT`) · `live` |
| `RESEND_API_KEY` | for email | Resend API key |
| `EMAIL_FROM` | for email | Sender on a Resend-verified domain |
| `EMAIL_REPLY_TO` | no | Where guest replies go |
| `EMAIL_TEST_RECIPIENT` | for `test` | Your own address |
| `RESEND_WEBHOOK_SECRET` | for delivery tracking | `whsec_…` from the Resend webhook |
| `RATE_LIMIT_INVITE_PER_MIN`, `RATE_LIMIT_RSVP_PER_MIN` | no | Per-IP limits (60 / 12) |

Without `DATABASE_URL` the public site still loads; RSVP and the dashboard report the database as unavailable.

## Photos

Put photos in `public/images/` named after the slot id — e.g. `cover-portrait.jpg`, `story-dinner.jpg`,
`city-paris.jpg`, `city-kinshasa.jpg`, `city-pap.jpg`, `look-elle-0.jpg` … `look-lui-5.jpg`.
Until a photo exists its frame collapses (or becomes a tonal panel on the moodboard).
Add `?slots=1` to any page URL to see every slot with its art-direction caption.

## Email

1. Create a Resend account, verify `maison23.club` (DNS records in Cloudflare), create an API key.
2. Set `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TEST_RECIPIENT`, and `EMAIL_MODE=test`. Send yourself an invitation from the dashboard.
3. Add a webhook in Resend → `https://maison23.club/api/webhooks/resend` (events: sent, delivered, delivery_delayed, bounced, complained, failed) and set `RESEND_WEBHOOK_SECRET`.
4. When happy, switch to `EMAIL_MODE=live`.

“Sent” in the dashboard means *accepted by Resend*; “Delivered” only appears when Resend’s webhook confirms it.
WhatsApp is a manual workflow: copy or open the prefilled message, send it yourself, then mark it as sent.

## Security notes

- Invitation tokens: 192-bit random, validated server-side; revoke or regenerate from the dashboard.
- The venue is never in public HTML or APIs; only confirmed guests receive it, and only after you enable sharing.
- Host sessions: random tokens stored hashed, HttpOnly + SameSite=Strict cookie, CSRF header + Origin check.
- Per-IP rate limits on invitation lookups, RSVPs and login. Strict CSP, `Referrer-Policy: no-referrer`.
- CSV import validates every row before writing; CSV export neutralises spreadsheet formulas.
