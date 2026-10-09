#!/usr/bin/env python3
"""Build the MAISON 23 photography from assets/photos.json.

    python3 tools/build-images.py            # build everything
    python3 tools/build-images.py gate-hero  # rebuild selected slots only

assets/photos.json is the single source of truth: one entry per image slot, with the
source page, creator, license, alt text and focal point. For each entry this script

  1. downloads a high-quality master once into assets/originals/ (gitignored),
  2. writes graded, responsive WebP files to public/images/<slot>-<width>.webp,
  3. regenerates public/images/manifest.json (read by image-slot.js at runtime)
     and public/credits.html (the attribution page linked from the footer).

Requires Python 3.9+ and Pillow built with WebP support. Nothing here runs in production.
"""
import html, io, json, os, sys, time, urllib.error, urllib.parse, urllib.request
from PIL import Image, ImageEnhance, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'photos.json')
ORIGINALS = os.path.join(ROOT, 'assets', 'originals')
OUT = os.path.join(ROOT, 'public', 'images')
UA = 'Maison23ImageBuild/1.0 (private event site)'
MASTER_MAX = 3200

# Output widths per role. The largest width is capped at the master's own width.
WIDTHS = {
    'hero': [640, 960, 1440, 1920, 2560],
    'section': [480, 800, 1200, 1600],
    'card': [360, 640, 960],
    'thumb': [240, 480],
}
QUALITY = {'hero': 74, 'section': 76, 'card': 78, 'thumb': 80}

# Order and labels for the credits page.
SECTIONS = [
    ('entrance', 'Entrée'), ('cover', 'Couverture'), ('story', '01 — L’histoire'),
    ('cities', '02 — Les villes'), ('son', '03 — Le son'), ('sape', '04 — La sape'),
    ('nuit', '05 — La nuit'), ('rsvp', '06 — L’invitation'), ('lieu', '07 — Le lieu'),
]


def fetch(url, tries=6):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or i == tries - 1:
                raise
            wait = int(e.headers.get('Retry-After') or 0) or 15 * (i + 1)
            print(f'  rate-limited, retrying in {wait}s')
            time.sleep(wait)


def master_url(p):
    if p['source'] == 'unsplash':
        try:
            raw = json.loads(fetch(f"https://unsplash.com/napi/photos/{p['id']}", tries=2))['urls']['raw']
        except urllib.error.HTTPError:
            # Rate-limited: the public download link redirects to the same image CDN URL.
            req = urllib.request.Request(f"https://unsplash.com/photos/{p['id']}/download", headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.url.split('&force')[0]
        return raw + ('&' if '?' in raw else '?') + f'w={MASTER_MAX}&q=92&fm=jpg'
    if p['source'] == 'commons':
        q = ('https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size'
             f'&iiurlwidth={MASTER_MAX}&titles=' + urllib.parse.quote(p['id']))
        # The original file, downscaled locally: odd-sized Commons thumbnails are rate-limited.
        return list(json.loads(fetch(q))['query']['pages'].values())[0]['imageinfo'][0]['url']
    raise ValueError(f"unknown source for {p['slot']}: {p['source']}")


def load_master(p):
    os.makedirs(ORIGINALS, exist_ok=True)
    path = os.path.join(ORIGINALS, p['slot'] + '.jpg')
    if not os.path.exists(path):
        print(f"  downloading {p['slot']} ← {p['page']}")
        im = Image.open(io.BytesIO(fetch(master_url(p))))
        im = ImageOps.exif_transpose(im).convert('RGB')
        im.thumbnail((MASTER_MAX, MASTER_MAX), Image.LANCZOS)
        im.save(path, quality=95)
    return Image.open(path).convert('RGB')


def crop(im, box):
    """Optional editorial crop, as fractions [left, top, right, bottom] of the master."""
    if not box:
        return im
    w, h = im.size
    return im.crop((round(box[0] * w), round(box[1] * h), round(box[2] * w), round(box[3] * h)))


def grade(im, mode):
    """A restrained, consistent house grade: slightly warmer, softer colour, deeper shadows."""
    if mode == 'none':
        return im
    strength = {'warm': 1.0, 'soft': 0.5}.get(mode, 1.0)
    im = ImageEnhance.Color(im).enhance(1 - 0.10 * strength)
    im = ImageEnhance.Contrast(im).enhance(1 + 0.06 * strength)
    r, g, b = im.split()
    r = r.point(lambda v: min(255, v * (1 + 0.035 * strength)))
    b = b.point(lambda v: v * (1 - 0.05 * strength))
    return Image.merge('RGB', (r, g, b))


def tone(im):
    """Average colour, darkened: the panel colour shown while the photo loads."""
    c = im.resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    return '#%02x%02x%02x' % tuple(int(v * 0.7) for v in c)


def build(p):
    im = grade(crop(load_master(p), p.get('crop')), p.get('grade', 'warm'))
    widths = [w for w in WIDTHS[p['role']] if w < im.width] + [min(im.width, WIDTHS[p['role']][-1])]
    widths = sorted(set(widths))
    for w in widths:
        h = round(im.height * w / im.width)
        im.resize((w, h), Image.LANCZOS).save(
            os.path.join(OUT, f"{p['slot']}-{w}.webp"), 'WEBP', quality=QUALITY[p['role']], method=6)
    return {'w': im.width, 'h': im.height, 'widths': widths, 'tone': tone(im)}


def credit_line(p):
    by = p['creator'] or 'Unknown author'
    return f"{by} — {p['license']}"


def write_credits(photos):
    rows = []
    for key, label in SECTIONS:
        items = [p for p in photos if p['section'] == key]
        if not items:
            continue
        rows.append(f'<h2>{html.escape(label)}</h2><ul>')
        for p in items:
            lic = html.escape(p['license'])
            if p.get('license_url'):
                lic = f'<a href="{html.escape(p["license_url"])}" rel="license noopener noreferrer" target="_blank">{lic}</a>'
            who = html.escape(p['creator'] or 'Unknown author')
            if p.get('creator_url'):
                who = f'<a href="{html.escape(p["creator_url"])}" rel="noopener noreferrer" target="_blank">{who}</a>'
            changes = 'Cropped, resized and colour-graded for this site.' if p['license'].startswith('CC') else ''
            rows.append(
                f'<li><img src="/images/{p["slot"]}-{p["widths"][0]}.webp" alt="" width="{p["widths"][0]}" '
                f'height="{round(p["h"] * p["widths"][0] / p["w"])}" loading="lazy">'
                f'<div><p class="c-alt">{html.escape(p["alt"])}</p>'
                f'<p>{who} · {lic} · <a href="{html.escape(p["page"])}" rel="noopener noreferrer" target="_blank">source</a></p>'
                + (f'<p class="c-note">{html.escape(p["caption"])}</p>' if p.get('caption') else '')
                + (f'<p class="c-note">{changes}</p>' if changes else '')
                + '</div></li>')
        rows.append('</ul>')
    page = TEMPLATE.replace('{{ROWS}}', '\n'.join(rows))
    open(os.path.join(ROOT, 'public', 'credits.html'), 'w').write(page)


TEMPLATE = '''<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Crédits photo — MAISON 23</title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="#171016">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&amp;family=Instrument+Sans:wght@400..700&amp;display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body class="credits">
<!-- Generated by tools/build-images.py from assets/photos.json — edit those, not this file. -->
<main class="credits-main">
  <a href="/" class="nav-logo">MAISON <em>23</em></a>
  <h1 class="h2-lg">Crédits <em>photo</em></h1>
  <p class="credits-lede">MAISON 23 is a private birthday celebration. The photographs on this site are used under the licenses below and set the mood only: they do not show our guests, our venue or the artists performing at this event. The artists named are musical inspirations, not performers on the night.</p>
{{ROWS}}
  <p class="credits-foot"><a href="/">← Retour à la maison</a></p>
</main>
</body>
</html>
'''


def main():
    photos = json.load(open(SRC))
    only = set(sys.argv[1:])
    os.makedirs(OUT, exist_ok=True)
    old = {}
    try:
        old = json.load(open(os.path.join(OUT, 'manifest.json')))
    except FileNotFoundError:
        pass
    manifest = {}
    for p in photos:
        slot = p['slot']
        if only and slot not in only and slot in old:
            info = {k: old[slot][k] for k in ('w', 'h', 'widths', 'tone')}
        else:
            print(f'· {slot}')
            for f in os.listdir(OUT):
                if f.startswith(slot + '-') and f.endswith('.webp') and f[len(slot) + 1:-5].isdigit():
                    os.remove(os.path.join(OUT, f))
            info = build(p)
        p.update(info)
        manifest[slot] = {
            **info, 'alt': p['alt'], 'focus': p.get('focus', '50% 50%'),
            **({'focusMobile': p['focusMobile']} if p.get('focusMobile') else {}),
            **({'credit': credit_line(p)} if p.get('attribution_required') else {}),
        }
    # Remove files of slots that no longer exist.
    for f in os.listdir(OUT):
        if f.endswith('.webp') and f.rsplit('-', 1)[0] not in manifest:
            os.remove(os.path.join(OUT, f))
    with open(os.path.join(OUT, 'manifest.json'), 'w') as fh:
        json.dump(manifest, fh, ensure_ascii=False, separators=(',', ':'))
    write_credits(photos)
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.endswith('.webp'))
    print(f'{len(manifest)} slots, {total / 1e6:.1f} MB of WebP in public/images')


if __name__ == '__main__':
    main()
