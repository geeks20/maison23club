# MAISON 23

Static invitation site for a private evening — Dubai, 23 October 2026.

No build step. Serve the folder and open it:

```sh
python3 -m http.server 3009
```

- `index.html`, `styles.css`, `app.js` — the guest site
- `host.html`, `host.css`, `host.js` — host dashboard (guest list, invitations, venue & playlist settings, CSV export)
- `image-slot.js` — photo placeholders; add `images/<slot-id>.jpg` to fill a slot (e.g. `images/cover-portrait.jpg`)

RSVPs are stored in the visitor's browser only (prototype). A server and database are needed before sending real invitations.
