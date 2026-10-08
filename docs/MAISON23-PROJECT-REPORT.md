# MAISON 23 — Project Report

*Everything built, deployed, configured, and verified so far.*
**Date:** 8 October 2026 · **Event:** Friday 23 October 2026, 20:00, Dubai · *La nuit est à nous.*

---

## Contents

1. [At a glance](#1-at-a-glance)
2. [Timeline — everything we did](#2-timeline--everything-we-did)
3. [Where things live](#3-where-things-live)
4. [V2 — A. Audit summary](#4-v2--a-audit-summary)
5. [V2 — B. Changes implemented](#5-v2--b-changes-implemented)
6. [V2 — C. Test results](#6-v2--c-test-results)
7. [V2 — D. Setup instructions](#7-v2--d-setup-instructions)
8. [V2 — E. Launch checklist](#8-v2--e-launch-checklist)
9. [Explained simply](#9-explained-simply)
10. [Glossary](#10-glossary)

---

## 1. At a glance

| | Status |
|---|---|
| **Live site (today)** | **Version 1**: the original static site. Online at `maison23.club` and `maison23-production.up.railway.app`. |
| **Version 2** | **Built and tested, not deployed.** On the GitHub branch `v2`. Needs a database on Railway, plus your approval to go live. |
| **RSVPs on the live site** | ⚠️ **Not collected.** V1 saves replies only in each guest's own browser. **Don't send invitations until V2 is live.** |
| **Automated tests (V2)** | **31 / 31 passing.** Every invitation, RSVP, host, email and security check runs against a real Postgres database. |
| **Browser checks (V2)** | **33 / 33 passing** in real Chrome: the phone RSVP flow and the desktop host dashboard. |
| **Email** | Built for Resend. **Waiting for your Resend account.** Off by default. |
| **Logo** | ⚠️ **Approved M23 monogram and wordmark files aren't in the project.** Please send them. Nothing has been invented in their place. |

---

## 2. Timeline — everything we did

### Phase 1 — From design to website
1. **Imported the design** from Claude Design (`Maison 23.dc.html`, plus the `image-slot.js` and `support.js` it relies on).
2. **Built the guest site** as plain HTML/CSS/JavaScript, faithful to the design:
   - entry gate with the letter-by-letter "MAISON 23" reveal
   - cover with countdown
   - the story ("Not just another birthday.")
   - four sticky city chapters: Paris → Kinshasa → Port-au-Prince → Dubai
   - the sound (artists and playlists)
   - the dress code (colour palette and elle/lui moodboard)
   - the night timeline, RSVP, the venue, and the closing screen
   - ambient synthesised sound, custom cursor, fade-in on scroll
3. **Checked it** with screenshots at desktop and phone sizes.
4. **Ran it locally** on port 3009.
5. **Built the first host page** (from `Maison 23 Host.dc.html`): password gate, guest list, stats, venue and playlist settings, CSV export. Like the design, it was a prototype that kept data in the browser.

### Phase 2 — Code, hosting, domain
6. **Pushed the code to GitHub:** <https://github.com/geeks20/maison23club>, branch `main`.
7. **Deployed to Railway** with the CLI (logged in via browserless pairing):
   - project `maison23club`, service `maison23`
   - public address <https://maison23-production.up.railway.app>
8. **Connected the domain** `maison23.club`:
   - added `maison23.club` and `www.maison23.club` as custom domains on Railway
   - you created a Cloudflare API token limited to "Edit zone DNS" on maison23.club. The first token had a start date set for midnight, so it didn't work yet. You replaced it.
   - I created two CNAME records in Cloudflare:
     - `maison23.club` → `6tsvrhcd.up.railway.app`
     - `www` → `xwcbyenj.up.railway.app`
   - after that, someone made two changes in the Cloudflare dashboard:
     - the root record was switched to **proxied** (orange cloud)
     - a `_railway-verify` TXT record was added
   - **Today:** `https://maison23.club` loads (HTTP 200). **`www.maison23.club` has no DNS record any more**, so it doesn't load. See the [launch checklist](#8-v2--e-launch-checklist).
9. **Kept the token safe:**
   - the token is in `env.local`, and that file is listed in `.gitignore`, so it can't reach GitHub or the live site
   - committed `.gitignore` rules for `.env*` and `env.local`
10. **Linked Railway to GitHub** (through Railway's API). **Every push to `main` now deploys to production automatically.**

### Phase 3 — Version 2 (audit, fixes, guest management)
11. Audited the whole site (section 4).
12. Built a real server and database, personal invitation links, a server-side RSVP and a full host dashboard (section 5).
13. Wrote 31 automated tests and ran the guest and host flows in real Chrome (section 6).
14. **Did all V2 work on a separate branch, `v2`**, pushed to GitHub. Railway deploys only `main`, so production hasn't changed.

---

## 3. Where things live

| What | Where |
|---|---|
| Code | <https://github.com/geeks20/maison23club>: `main` (live V1), `v2` (new version) |
| Hosting | Railway project **maison23club**, service **maison23**, auto-deploys from `main` |
| Railway URL | <https://maison23-production.up.railway.app> |
| Domain DNS | Cloudflare, zone **maison23.club** |
| Local project | `~/Documents/softwares/Maison 23` |
| Local secrets (never committed) | `env.local` (Cloudflare token), `.env` (local dev settings) |
| Design source (not committed) | `design-source/` |
| Guest site (V2) | `/` and `/invite/<personal-token>` |
| Host dashboard (V2) | `/host` |

**V2 project layout**

```
server/
  index.js       startup: database, email and host checks
  app.js         security headers, public API, webhook, pages
  admin.js       host API: guests, invitations, sending, CSV, settings
  auth.js        host login sessions, CSRF protection
  db.js          Postgres pool, transactions, activity log
  schema.sql     tables (additive only, safe to re-run)
  event.js       event settings, Dubai time handling, venue privacy
  email.js       Resend sender (off/test/live), webhook verification
  templates.js   branded invitation, reminder and update emails; WhatsApp text
  util.js        secure tokens, validation, rate limiting, CSV
public/
  index.html  styles.css  app.js        guest site
  host.html   host.css    host.js       host dashboard
  countdown.js  image-slot.js  images/
test/            31 automated tests
railway.json     start command and health check
.env.example     every environment variable, documented
```

---

## 4. V2 — A. Audit summary

I checked the live V1 code and its behaviour directly, without assuming anything.

### ✅ What was working
- **The design is faithful to Claude Design:** typography (Bodoni Moda + Instrument Sans), brand colours, gate animation, sticky city chapters, palette and moodboard interactions, timeline, ambient sound, reveals.
- **Nothing scrolls sideways on phones** (checked at 375px).
- **The countdown was correct across timezones.** It already targeted `2026-10-23T20:00:00+04:00`, an absolute moment, so it's the same on every device.
- **Railway hosting, the GitHub connection and HTTPS on `maison23.club`** all work.

### ❌ What was broken
| Problem | Impact on guests |
|---|---|
| **RSVPs were saved only in the guest's own browser** (`localStorage`). | The host never saw any reply. That defeats the purpose. |
| **Invitation codes were guessable** (`M23-AMARA`), and the demo codes were printed on the page. | Anyone could open someone else's invitation. |
| **The host password (`maison23`) sat in the browser code**, in a public repo, and was printed on the login screen. | The guest list and settings weren't protected. |
| **The venue address was stored in the browser**, and only the host's own browser had it. | Guests would never actually receive it. |
| **Every empty image slot requested a file that doesn't exist** (17+ 404 errors per page). | Slower loading and noisy logs. |
| **Placeholder boxes showed art-direction notes** ("Cover — warm flash portrait…"). | The site looked unfinished, like a wireframe, especially on phones. |
| **There was no chapter navigation on phones.** The links were hidden, with no menu. | Guests couldn't jump between sections. |

### 🟡 What was incomplete
- No email invitations, WhatsApp workflow, CSV import, delivery tracking, reminders or event updates.
- No capacity limit, RSVP deadline, activity history or invitation history.
- **The countdown wasn't polished:**
  - it showed "00" before it started
  - it showed "00:00:00" during the last second
  - it had no "LA NUIT EST À NOUS." state once the event begins
- The final brand line ("PRIVATE SOCIETY", @lamaison.society) wasn't applied.

### 🔍 What needs verification
- **Logo files:** the approved M23 monogram and wordmark **aren't in the project**. I need them.
- **The `www` domain:** its DNS record was removed after setup.
- **The share image** `og-maison23.jpg` doesn't exist yet.

---

## 5. V2 — B. Changes implemented

### Real backend
- **Node.js + Express server, with Postgres as the single source of truth.**
- **The database schema only adds tables and columns; it never removes or changes data.** Its six tables:
  - `guests`
  - `rsvps`
  - `messages` (every send attempt)
  - `activity` (history)
  - `settings` (event details)
  - `admin_sessions`
- **If the database is unavailable,** the public site still loads and RSVP shows a clear "temporarily unavailable" message. It never shows a fake success.

### Invitations and RSVP (guest side)
- **Every guest gets a unique link:** `maison23.club/invite/<token>`. Tokens are 192-bit random, so they can't be guessed and aren't in sequence.
- **Opening the link personalises the entry screen.** It shows "YOU'RE INVITED TO MAISON 23", the guest's name and "FRIDAY, OCTOBER 23, 2026 · DUBAI, UAE", plus a **RÉPONDRE À L'INVITATION** button.
- **The RSVP card offers:**
  - choices: **I'll be there / Maybe / Can't make it** (with OUI / PEUT-ÊTRE / NON)
  - a party size up to the guest's allocation
  - optional dietary requirements and a message for the host
- **The confirmation appears only after the database has saved the reply.** If saving fails, the guest sees a clear error and nothing is confirmed.
- **Guests can come back to their link any time** to see or change their reply (**MODIFIER**).
- **The server enforces:**
  - the allocation per invitation
  - total capacity (only "yes" replies count)
  - the RSVP deadline
  - revoked links
- **Invalid or revoked links** show a graceful message, plus a box to paste the right link.
- **Add to calendar** produces a correct `.ics` file in Dubai time, including the venue once it's shared.
- **The "Copy link" on the final screen shares the public site**, never the guest's personal link.

### Host dashboard (`/host`)
- **Login is checked on the server.** The password lives only on the server, sessions are stored hashed, and the cookie is HttpOnly and SameSite=Strict, with CSRF protection.
- **Stats:**
  - invited, confirmed, maybe, declined and awaiting reply
  - **expected attendees** (counted by allocation)
  - **remaining capacity** (default 35, configurable up to 40)
  - allocated places compared with capacity
- **Filters:** All · Confirmed · Pending · Maybe · Declined · **Invitation not sent** · Revoked, plus **search**.
- **Guests:**
  - add one at a time, or upload a **CSV**. Every row is validated before anything is imported, and duplicates are skipped by email.
  - edit names, email, WhatsApp number and places
  - **export a CSV**, with protection against spreadsheet formula injection
- **The guest panel shows:**
  - their personal link, with copy
  - RSVP details: dietary requirements and message
  - email sending
  - the WhatsApp workflow
  - edit fields
  - send history
  - **revoke / restore** and **generate a new link** (the old link stops working instantly)
- **Invitation status is tracked separately from RSVP status:**
  - not sent
  - sent (accepted by the provider)
  - delivered (confirmed by webhook)
  - bounced or failed
  - sent manually via WhatsApp
- **Activity feed:** every reply, change, send, revocation and settings edit.
- **Les mots:** the messages guests left for you.

### Email (Resend)
- **Server-side only.** Keys come from environment variables and never reach the browser.
- **Three modes:**
  - **off** (the default): nothing is ever sent
  - **test**: every email goes *only* to your own address and never counts as sent to the guest
  - **live**: emails go to guests
- **The branded invitation email:**
  - is in MAISON 23 colours and typography
  - uses your exact subject, **"You're Invited — MAISON 23 | Dubai · 23 October"**, and your exact text
  - has an RSVP button with the guest's personal link
  - includes a **plain-text version**
- **There are also reminder and event-update templates.**
- **Duplicates are prevented:**
  - a lock per guest plus an "in flight" record stops double clicks
  - resending something already sent needs explicit confirmation
  - the same update is never sent twice to the same person
  - each send carries a Resend idempotency key
- **Delivery status comes from signed Resend webhooks.** Signatures are verified and stale ones rejected.
- **Bulk sends stay within Resend's limits:**
  - nothing goes out until you've seen the recipient list and confirmed
  - sends are spaced to Resend's rate limit
  - a send Resend rate-limits is retried once
  - nothing is ever sent automatically

### WhatsApp (manual, by design)
- **Your exact message is generated per guest, with their link.**
- **The panel has three buttons:**
  - **Copy message**
  - **Open WhatsApp**, prefilled and addressed to their number
  - **Mark as sent**, recorded as *"sent (manual)"* and never as "delivered"
- **No automated WhatsApp messages.** That would need an approved provider.

### Event information (editable without code)
- **What you can edit:** start and end time (Dubai), RSVP deadline, capacity (up to 40), dress code, venue name, address, Google Maps link and playlist links.
- **The venue stays private:**
  - it's never in the public HTML, metadata, API or scripts
  - it reaches **only guests who replied "I'll be there"**, and **only after you switch on sharing**

### Countdown
- **It targets 8:00 PM Asia/Dubai** (16:00 UTC), the same on every device.
- **Before the event time loads,** it shows a quiet "··" instead of zeros.
- **It never shows 00:00:00 before the start.**
- **At the start,** it switches to **"LA NUIT EST À NOUS."**
- **The label follows the start time you set.**

### Guest experience
- **New chapter menu on phones** (01 L'histoire → 07 Le lieu).
- **Empty photo frames collapse gracefully:**
  - the cover re-centres
  - the story text sits as an editorial offset
  - moodboard cards become tonal panels in the selected palette colour
  - `?slots=1` shows the art-direction notes for whoever sources photos
- **Images load only if they exist** (no more 404s), with lazy loading.
- The **"Can't make it"** button no longer wraps awkwardly on small phones.
- **Accessibility:**
  - focus moves to the entry button and to the confirmation
  - visible focus outlines
  - `aria` states on the choice buttons, menu, tabs and status messages
  - reduced-motion support kept
- **Brand:** "PRIVATE SOCIETY" on the entry screen, emails and footer; **@lamaison.society** and **maison23.club** in the footer. The host link was removed from the public footer; hosts go to `/host`.

### Security and privacy
- **Secure random tokens, validated on the server, with revocation and regeneration.**
- **Per-IP rate limits:**
  - invitation lookups: 60/min
  - RSVPs: 12/min
  - login: 8 per 15 minutes
- **Input validation and length limits everywhere.** Names and messages are escaped in emails.
- **Strict Content-Security-Policy.** `Referrer-Policy: no-referrer` stops personal links leaking to other sites. Plus `X-Frame-Options`, HSTS and `nosniff`.
- **Invitation pages and APIs are `no-store` and `noindex`.**
- **Request URLs (which contain tokens) are never logged.** The site has no analytics.
- **Minimal personal data:** name, optional email and phone, the reply, and optional dietary requirements and message.
- **No secrets in client code or commits.** Local secret files are git-ignored.

### Files changed in V2

| Files | Change |
|---|---|
| `server/*` (10 files) | **New**: the whole backend |
| `public/app.js` | Rewritten around the API; everything that worked before is kept |
| `public/host.html`, `public/host.js` | Rebuilt dashboard |
| `public/index.html`, `public/styles.css`, `public/host.css` | Personalised gate, mobile menu, RSVP states, countdown states, brand footer, empty-photo layouts |
| `public/countdown.js` | **New**: the countdown logic on its own, so it can be tested |
| `public/image-slot.js` | Photo list from the server, no 404s, hidden captions |
| `test/*` | **New**: 31 tests |
| `package.json`, `railway.json`, `.env.example`, `README.md`, `.gitignore` | Build, deploy and setup documentation |

**Bugs fixed while testing:**
- **CSV parsing:** a quote in the middle of a field broke it.
- **Image placeholder:** its caption ignored the `hidden` flag.

---

## 6. V2 — C. Test results

### ✅ Passed: automated (31 tests, real Postgres, fake email provider)

| # | Scenario | Result |
|---|---|---|
| 1 | Guest opens a valid invitation (name and public info only, no email exposed, `no-store`) | ✅ |
| 2 | Invalid, malformed, SQL-injection-style and revoked links are refused; revoked guests can't reply | ✅ |
| 3 | Guest submits an RSVP | ✅ |
| 4 | Guest changes their RSVP; reopening the link shows the saved reply | ✅ |
| 5 | Host sees the updated reply and its history in the activity feed | ✅ |
| 6 | Host creates invitations: 32-character random tokens, unique, link not marked "sent" | ✅ |
| 7 | Revoke → link stops; restore → it works again; regenerate → old link dead, new link works | ✅ |
| 8 | Email: correct subject, HTML and plain text both carry the link, duplicate blocked, explicit resend allowed, idempotency key set | ✅ |
| 9 | WhatsApp text is personalised and has the link; `wa.me` uses the phone number; "mark as sent" is recorded as manual | ✅ |
| 10 | Allocation enforced, capacity enforced across guests, "maybe" doesn't use capacity, capacity limited to 40, lowering an allocation adjusts the existing reply | ✅ |
| 12 | Countdown: exact Dubai 20:00, last-second rounding, start state, **identical in 6 device timezones** | ✅ |
| 13 | Dashboard API refuses no session (401), missing CSRF header (403), foreign Origin (403); cookie is HttpOnly + SameSite=Strict; logout ends the session | ✅ |
| 14 | Without a database: site loads, RSVP returns 503. Database failure mid-request returns an error, never a confirmation. Failed sends (provider error or network) are recorded as **failed**, and a retry works | ✅ |
| — | Venue: hidden until shared; then confirmed guests only; never in public responses | ✅ |
| — | RSVP deadline closes replies | ✅ |
| — | Resend webhooks: bad or stale signatures rejected; "delivered" is never downgraded | ✅ |
| — | Test mode: email goes only to the test address and doesn't count as sent | ✅ |
| — | Email off: nothing reaches the provider | ✅ |
| — | Bulk reminders: confirmation required, only invited non-responders, no repeats within 24h; updates never duplicated | ✅ |
| — | CSV import validates every row first; export neutralises formulas | ✅ |
| — | Rate limiting works; tokens are unique across 5,000 samples | ✅ |

### ✅ Passed: real browser (headless Chrome, phone 390×844 and desktop 1440)
- **11. Phone RSVP flow (15 checks):**
  - the gate shows the guest's name
  - you must choose before submitting
  - the confirmation appears only after saving
  - the reply survives a reload
  - changing the reply works
  - the phone menu opens and closes
  - the countdown runs
  - no broken images
  - nothing scrolls sideways
  - an invalid link shows its message
- **Host dashboard (18 checks):**
  - signs in, and a wrong password is refused
  - live replies appear
  - stats are correct (expected 1, remaining 34)
  - filters and search work
  - the WhatsApp panel works
  - venue sharing works end-to-end and stays out of the public API
  - logout works
- **No Content-Security-Policy violations or script errors** in either flow.

### ⏳ Not tested yet (needs real services or your approval)
- **15. Production deploy of V2:** needs Railway Postgres and the merge to `main`. Checked locally only: build, start-up and health check.
- **A real email send through Resend, and real webhooks:** waiting for your Resend account and domain verification.
- **Real phones** (iOS Safari, Android Chrome), a screen reader, and load testing.
- **Photos:** none supplied yet, so the photo layouts were checked only with empty frames.

---

## 7. V2 — D. Setup instructions

### Database (Railway Postgres)
1. In the project folder, run `railway add --database postgres`, or in the Railway dashboard choose **New → Database → PostgreSQL**. *This adds a paid resource to your Railway project.*
2. On the **maison23** service, open **Variables** and add `DATABASE_URL = ${{Postgres.DATABASE_URL}}`.
3. Nothing else is needed. The tables are created automatically on first start.
4. **Backups:** turn on Railway's Postgres backups before inviting guests.

### Host login
- Set `ADMIN_PASSWORD` on Railway to a long random passphrase (at least 12 characters).
- Sign in at `https://maison23.club/host`.

### Links
- Set `PUBLIC_BASE_URL = https://maison23.club` so every invitation uses your domain.

### Email provider (Resend)
1. **Create an account** at resend.com and **add the domain `maison23.club`**.
2. **Add the DNS records Resend gives you** in Cloudflare (SPF, DKIM, and optionally DMARC). They must be **DNS only** (grey cloud).
3. **Create an API key.**
4. **On Railway, set:**
   - `RESEND_API_KEY`
   - `EMAIL_FROM` (for example `MAISON 23 <invitations@maison23.club>`)
   - `EMAIL_REPLY_TO` (your own email)
   - `EMAIL_TEST_RECIPIENT` (your own email)
   - `EMAIL_MODE=test`
5. **Send yourself a test** from the dashboard and check how it looks.
6. **Turn on delivery tracking:** in Resend, add a webhook to `https://maison23.club/api/webhooks/resend` for the events sent, delivered, delivery_delayed, bounced, complained and failed. Copy its signing secret into `RESEND_WEBHOOK_SECRET`.
7. **Only once you've approved it,** set `EMAIL_MODE=live`.

### All Railway variables

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `ADMIN_PASSWORD` | your passphrase |
| `PUBLIC_BASE_URL` | `https://maison23.club` |
| `EMAIL_MODE` | `off` → `test` → `live` |
| `RESEND_API_KEY` | from Resend |
| `EMAIL_FROM` | `MAISON 23 <invitations@maison23.club>` |
| `EMAIL_REPLY_TO` | your email |
| `EMAIL_TEST_RECIPIENT` | your email |
| `RESEND_WEBHOOK_SECRET` | `whsec_…` from Resend |

### Going live with V2
Merge the `v2` branch into `main`. Railway then deploys automatically. The health check at `/api/health` passes only once the database is connected, so a broken deploy won't replace the working site.

### Local development
```sh
cp .env.example .env     # set ADMIN_PASSWORD
npm install
npm run dev              # http://localhost:3009  ·  host: /host
npm test
```

---

## 8. V2 — E. Launch checklist

### ✅ Ready
- [x] Guest site, personal invitations and RSVP (V2, tested)
- [x] Host dashboard: guests, CSV, links, revoke and regenerate, stats, filters, activity
- [x] Email system, branded templates and duplicate protection (waiting for keys)
- [x] WhatsApp manual workflow
- [x] Event settings and private venue sharing
- [x] Countdown fixed to Dubai time
- [x] Security headers, rate limits, server-side authentication, CSRF protection
- [x] Documentation (`README.md`, `.env.example`, this report)

### ⚙️ Still needs configuration
- [ ] **Railway Postgres + `DATABASE_URL`**
- [ ] **`ADMIN_PASSWORD`** and **`PUBLIC_BASE_URL`** on Railway
- [ ] **Resend:** account, domain verification (DNS in Cloudflare), API key, webhook
- [ ] **`www.maison23.club`:** the record is gone. Re-add `CNAME www → xwcbyenj.up.railway.app` (DNS only), or redirect `www` to the root domain in Cloudflare.
- [ ] **Photos** in `public/images/` (named by slot, see README), the **share image** `og-maison23.jpg`, and the **approved logo files** (monogram and wordmark)
- [ ] **Event details in the dashboard:** venue, Maps link, RSVP deadline, playlists, capacity (35 by default)
- [ ] **Delete the Cloudflare API token** in Cloudflare once you no longer need it. The current one **never expires**. Then remove `env.local`.

### 🔐 Needs your approval
- [ ] **Add the Railway Postgres database** (a paid resource)
- [ ] **Merge `v2` → `main`**, which deploys V2 to production
- [ ] **Turn on `EMAIL_MODE=test`**, then **`live`**
- [ ] **Send the first real invitations.** I recommend 1–2 trusted guests first.
- [ ] **Share the venue** (the toggle in the dashboard)

> **Important:** until V2 is live, don't send anyone the current site for RSVPs. V1 can't collect replies.

---

## 9. Explained simply

**Before (V1)** the site was a beautiful printed invitation. When a guest ticked "Oui", the answer stayed on *their* phone. You'd never have seen it.

**Now (V2)** the site has a **guest book in the back office**: a database. When a guest replies, the answer is written into it, and only then does the site say "Merci". You open your **host dashboard** and see every reply live.

- **Personal links:** every guest gets a unique link, like a key cut just for them. It's long and random, so nobody can guess someone else's. If a key gets lost, you cut a new one and the old one stops working.
- **Email:** the site asks a mail company (Resend) to deliver your invitation. "Sent" means Resend accepted it; "Delivered" only appears when Resend confirms it arrived. There's a **test mode** that sends everything only to you.
- **WhatsApp:** the dashboard writes the message for you; you send it yourself and tick "sent".
- **The venue** stays secret until you flip a switch. Even then, only guests who said "I'll be there" can see it.
- **Railway** runs the website. **GitHub** keeps every version of the code. **Cloudflare** is the address book that points `maison23.club` to Railway.
- **Tests** are a robot guest and a robot host clicking through everything to make sure nothing breaks. 31 automated checks and 33 browser checks all pass.

---

## 10. Glossary

| Term | Meaning |
|---|---|
| **Branch** | A parallel copy of the code. `main` = live; `v2` = the new version waiting for approval. |
| **Database (Postgres)** | Where guests, replies and history are stored safely on the server. |
| **Token** | The random part of a personal invitation link. |
| **CNAME record** | A DNS entry that says "this name points to that server". |
| **Proxied (orange cloud)** | Cloudflare sits in front of the site. DNS only (grey) points straight to Railway. |
| **API key / token** | A password for a program, kept in environment variables and never in the code. |
| **Environment variable** | A setting given to the server at start-up (password, keys, mode). |
| **Webhook** | A message Resend sends back to the site, e.g. "this email was delivered". |
| **Idempotency key** | A tag that tells Resend "if you see this again, don't send twice". |
| **CSRF / CSP** | Browser protections against other websites acting on your behalf or injecting scripts. |
| **Rate limit** | A cap on how many requests one visitor can make per minute. |

---

*MAISON 23 — PRIVATE SOCIETY · maison23.club · @lamaison.society — La nuit est à nous.*
