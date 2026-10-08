/**
 * <image-slot> — fills its positioned parent with a photo.
 *
 * Photos are built by tools/build-images.py from assets/photos.json into
 * /images/<slot>-<width>.webp, and described in /images/manifest.json (sizes, alt text,
 * focal point, loading tone, credit). A slot looks itself up by id, so the page never
 * requests a missing image. While a slot has no photo it gets the `empty` attribute:
 * guests see a quiet tonal panel (or the wrapper collapses, see styles.css), and
 * `?slots=1` shows the art-direction captions for whoever is sourcing photos.
 *
 * Attributes: `sizes` (responsive sizes hint, default 100vw), `priority` (above the fold:
 * load eagerly with high fetch priority), `no-credit` (the credit is shown elsewhere).
 * If a photo fails to load, the slot gets `failed` and keeps its frame as a tonal panel.
 */
(() => {
  const showCaptions = new URLSearchParams(location.search).has('slots');
  const manifest = fetch('/images/manifest.json', { credentials: 'same-origin' })
    .then(r => (r.ok ? r.json() : {}))
    .catch(() => ({}));

  const css =
    ':host{position:absolute;inset:0;display:block;overflow:hidden;color:inherit;background:var(--slot-tone,transparent);transition:background .8s}' +
    '.ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;' +
    '  text-align:center;background:rgba(127,127,127,.08);font:10px/1.6 "Instrument Sans",system-ui,sans-serif;' +
    '  letter-spacing:.2em;text-transform:uppercase;opacity:.75}' +
    '.ph::before{content:"";position:absolute;inset:0;border:1px dashed currentColor;opacity:.3}' +
    '.ph[hidden],.credit[hidden]{display:none}' +
    'img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:var(--focus,50% 50%);' +
    '  opacity:0;transform:scale(1.04);transition:opacity 1.1s cubic-bezier(.2,.7,.1,1),transform 1.6s cubic-bezier(.2,.7,.1,1)}' +
    '@media (max-width:640px){img{object-position:var(--focus-m,var(--focus,50% 50%))}}' +
    'img.ok{opacity:1;transform:none}' +
    '@media (prefers-reduced-motion:reduce){img{transform:none;transition:opacity .3s}}' +
    '.credit{position:absolute;right:0;bottom:0;max-width:100%;padding:4px 8px;font:9px/1.4 "Instrument Sans",system-ui,sans-serif;' +
    '  letter-spacing:.08em;color:rgba(242,232,216,.82);background:rgba(15,10,14,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
    '  opacity:0;transition:opacity .6s .4s;pointer-events:none}' +
    'img.ok~.credit{opacity:1}' +
    ':host([no-credit]) .credit{display:none}';

  class ImageSlot extends HTMLElement {
    static get observedAttributes() { return ['id', 'placeholder']; }

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${css}</style><div class="ph" part="placeholder" hidden></div>` +
        '<img alt="" loading="lazy" decoding="async" part="img"><span class="credit" part="credit" hidden></span>';
      this._ph = root.querySelector('.ph');
      this._img = root.querySelector('img');
      this._credit = root.querySelector('.credit');
      this._img.addEventListener('load', () => {
        this._img.classList.add('ok');
        this.removeAttribute('empty');
        this.removeAttribute('failed');
        this.setAttribute('loaded', '');
      });
      this._img.addEventListener('error', () => {
        if (!this._img.getAttribute('src')) return;
        this._img.classList.remove('ok');
        this.setAttribute('failed', '');
      });
    }

    connectedCallback() { this._render(); }
    attributeChangedCallback() { if (this.isConnected) this._render(); }

    _setEmpty() {
      this._img.classList.remove('ok');
      this._img.removeAttribute('src');
      this._img.removeAttribute('srcset');
      this._credit.hidden = true;
      // In ?slots=1 preview mode the frames stay visible with their captions.
      if (showCaptions) this._ph.hidden = false;
      else this.setAttribute('empty', '');
    }

    async _render() {
      const id = this.id;
      this._ph.textContent = this.getAttribute('placeholder') || '';
      const entry = id ? (await manifest)[id] : null;
      if (id !== this.id) return; // re-rendered for another id meanwhile
      if (!entry) return this._setEmpty();

      const img = this._img;
      this._ph.hidden = true;
      this.style.setProperty('--slot-tone', entry.tone || 'transparent');
      img.style.setProperty('--focus', entry.focus || '50% 50%');
      if (entry.focusMobile) img.style.setProperty('--focus-m', entry.focusMobile);
      img.alt = this.hasAttribute('decorative') ? '' : entry.alt || '';
      img.width = entry.w;
      img.height = entry.h;
      if (this.hasAttribute('priority')) {
        img.loading = 'eager';
        img.fetchPriority = 'high';
      }
      img.sizes = this.getAttribute('sizes') || '100vw';
      img.srcset = entry.widths.map(w => `/images/${id}-${w}.webp ${w}w`).join(', ');
      img.src = `/images/${id}-${entry.widths[Math.min(1, entry.widths.length - 1)]}.webp`;
      this._credit.textContent = entry.credit ? `Photo — ${entry.credit}` : '';
      this._credit.hidden = !entry.credit;
    }
  }

  if (!customElements.get('image-slot')) customElements.define('image-slot', ImageSlot);
})();
