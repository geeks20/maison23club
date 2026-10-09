#!/usr/bin/env python3
"""Build the MAISON 23 site icons: an italic Bodoni Moda "23" in gold on ink.

Outputs (in public/):
  favicon.svg            tab icon for modern browsers (outlined glyphs, no webfont)
  favicon.ico            16/32/48 fallback, also answers the browser's automatic /favicon.ico request
  apple-touch-icon.png   180, iOS home screen (iOS rounds the corners itself)
  icon-192.png, icon-512.png and site.webmanifest   Android / installable

Bodoni Moda (SIL OFL) is downloaded once into assets/originals/ (git-ignored).
Usage: python3 tools/build-icons.py
"""
import json
import os
import urllib.request

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, 'public')
FONT_DIR = os.path.join(ROOT, 'assets', 'originals', 'fonts')
FONT_URL = 'https://github.com/google/fonts/raw/main/ofl/bodonimoda/BodoniModa-Italic%5Bopsz%2Cwght%5D.ttf'

# Brand tokens (public/styles.css)
INK = '#171016'
GLOW = '#2c1620'       # a breath of --burgundy behind the numerals
GOLD_HI = '#DDC293'
GOLD_LO = '#A9834F'    # --gold #BE9A68 sits between the two

TEXT = '23'
AXES = {'wght': 600, 'opsz': 28}  # sturdy hairlines so it survives 16px
GLYPH_HEIGHT = 0.56               # ink height as a share of the icon...
TAB_WIDTH = 0.80                  # ...capped at this width in browser tabs
APP_WIDTH = 0.62                  # and inside Android's maskable safe circle on home screens
TRACKING = -0.02                  # em, the numerals sit close like the nav logo


def font_path():
    os.makedirs(FONT_DIR, exist_ok=True)
    var = os.path.join(FONT_DIR, 'BodoniModa-Italic-VF.ttf')
    if not os.path.exists(var):
        urllib.request.urlretrieve(FONT_URL, var)
    static = os.path.join(FONT_DIR, 'BodoniModa-Italic-icon.ttf')
    if not os.path.exists(static) or os.path.getmtime(static) < os.path.getmtime(__file__):
        instantiateVariableFont(TTFont(var), AXES).save(static)
    return static


def glyph_layout(font):
    """Glyph names with x offsets in font units, plus the ink bounds of the run."""
    cmap, hmtx, gs = font.getBestCmap(), font['hmtx'], font.getGlyphSet()
    upm = font['head'].unitsPerEm
    x, run = 0, []
    for ch in TEXT:
        name = cmap[ord(ch)]
        run.append((name, x))
        x += hmtx[name][0] + TRACKING * upm
    bp = BoundsPen(gs)
    for name, dx in run:
        gs[name].draw(TransformPen(bp, (1, 0, 0, 1, dx, 0)))
    return run, bp.bounds


def build_svg(font, size=512):
    run, (x0, y0, x1, y1) = glyph_layout(font)
    gs = font.getGlyphSet()
    scale = size * min(GLYPH_HEIGHT / (y1 - y0), TAB_WIDTH / (x1 - x0))
    # Centre the ink, flipping font y-up into SVG y-down.
    tx = size / 2 - (x0 + x1) / 2 * scale
    ty = size / 2 + (y0 + y1) / 2 * scale
    pen = SVGPathPen(gs, ntos=lambda v: f'{v:.1f}'.rstrip('0').rstrip('.'))
    for name, dx in run:
        gs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, tx + dx * scale, ty)))
    r = round(size * 0.22)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">
<defs>
<radialGradient id="bg" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="{GLOW}"/><stop offset="1" stop-color="{INK}"/></radialGradient>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{GOLD_HI}"/><stop offset="1" stop-color="{GOLD_LO}"/></linearGradient>
</defs>
<rect width="{size}" height="{size}" rx="{r}" fill="url(#bg)"/>
<path fill="url(#gold)" d="{pen.getCommands()}"/>
</svg>
'''


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def render_png(ttf, size, max_width, radius=0.0):
    """Raster version drawn from the same font instance, supersampled 4x."""
    S = size * 4
    glow, ink = hex_rgb(GLOW), hex_rgb(INK)
    bg = Image.new('RGB', (S, S))
    px = bg.load()
    cx, cy, rr = S * 0.5, S * 0.38, S * 0.70
    for y in range(S):
        for x in range(S):
            d = min(1.0, ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / rr)
            px[x, y] = lerp(glow, ink, d)

    # Size the type the same way as the SVG: by ink height, capped by width.
    probe = ImageFont.truetype(ttf, 1000)
    l, t, r_, b = probe.getbbox(TEXT)
    font = ImageFont.truetype(ttf, round(1000 * S * min(GLYPH_HEIGHT / (b - t), max_width / (r_ - l))))
    mask = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(mask)
    upm_px = font.size
    x, chars = 0, []
    for ch in TEXT:
        chars.append((ch, x))
        x += font.getlength(ch) + TRACKING * upm_px
    boxes = [font.getbbox(ch) for ch, _ in chars]
    ink_l = min(bx[0] + ox for bx, (_, ox) in zip(boxes, chars))
    ink_r = max(bx[2] + ox for bx, (_, ox) in zip(boxes, chars))
    ink_t = min(bx[1] for bx in boxes)
    ink_b = max(bx[3] for bx in boxes)
    ox0 = S / 2 - (ink_l + ink_r) / 2
    oy0 = S / 2 - (ink_t + ink_b) / 2
    for ch, ox in chars:
        d.text((ox0 + ox, oy0), ch, font=font, fill=255)

    hi, lo = hex_rgb(GOLD_HI), hex_rgb(GOLD_LO)
    gold = Image.new('RGB', (S, S))
    gd = ImageDraw.Draw(gold)
    top, bottom = oy0 + ink_t, oy0 + ink_b
    for y in range(S):
        gd.line([(0, y), (S, y)], fill=lerp(hi, lo, min(1, max(0, (y - top) / (bottom - top)))))
    img = Image.composite(gold, bg, mask)

    if radius:
        shape = Image.new('L', (S, S), 0)
        ImageDraw.Draw(shape).rounded_rectangle([0, 0, S - 1, S - 1], round(S * radius), fill=255)
        img = img.convert('RGBA')
        img.putalpha(shape)
    return img.resize((size, size), Image.LANCZOS)


def main():
    ttf = font_path()
    font = TTFont(ttf)
    open(os.path.join(PUBLIC, 'favicon.svg'), 'w').write(build_svg(font))

    render_png(ttf, 180, APP_WIDTH).save(os.path.join(PUBLIC, 'apple-touch-icon.png'), optimize=True)
    for s in (192, 512):
        render_png(ttf, s, APP_WIDTH).save(os.path.join(PUBLIC, f'icon-{s}.png'), optimize=True)
    ico = render_png(ttf, 256, TAB_WIDTH, radius=0.22)
    ico.save(os.path.join(PUBLIC, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])

    manifest = {
        'name': 'MAISON 23',
        'short_name': 'MAISON 23',
        'start_url': '/',
        'display': 'standalone',
        'background_color': INK,
        'theme_color': INK,
        'icons': [
            {'src': '/icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any maskable'},
            {'src': '/icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any maskable'},
        ],
    }
    with open(os.path.join(PUBLIC, 'site.webmanifest'), 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    print('icons written to public/')


if __name__ == '__main__':
    main()
