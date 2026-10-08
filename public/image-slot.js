/**
 * <image-slot> — fills its positioned parent with a photo.
 *
 * Photos live in /images, named after the slot id (e.g. images/cover-portrait.jpg).
 * The server lists the files that exist (/images/manifest.json), so the page never
 * requests a missing image. While a slot has no photo it gets the `empty` attribute:
 * guests see a quiet tonal panel (or the wrapper collapses, see styles.css), and
 * `?slots=1` shows the art-direction captions for whoever is sourcing photos.
 */
(() => {
  const showCaptions = new URLSearchParams(location.search).has('slots');
  const manifest = fetch('/images/manifest.json')
    .then(r => (r.ok ? r.json() : []))
    .then(list => new Map(list.map(f => [f.replace(/\.[a-z]+$/i, ''), f])))
    .catch(() => new Map());

  const css =
    ':host{position:absolute;inset:0;display:block;overflow:hidden;color:inherit}' +
    '.ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;' +
    '  text-align:center;background:rgba(127,127,127,.08);font:10px/1.6 "Instrument Sans",system-ui,sans-serif;' +
    '  letter-spacing:.2em;text-transform:uppercase;opacity:.75}' +
    '.ph[hidden]{display:none}' +
    '.ph::before{content:"";position:absolute;inset:0;border:1px dashed currentColor;opacity:.3}' +
    'img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .8s}' +
    'img.ok{opacity:1}';

  class ImageSlot extends HTMLElement {
    static get observedAttributes() { return ['src', 'id', 'placeholder']; }

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${css}</style><div class="ph" part="placeholder" hidden></div><img alt="" loading="lazy" decoding="async">`;
      this._ph = root.querySelector('.ph');
      this._img = root.querySelector('img');
      this._img.addEventListener('load', () => { this._img.classList.add('ok'); this.removeAttribute('empty'); });
      this._img.addEventListener('error', () => this._setEmpty());
    }

    connectedCallback() { this._render(); }
    attributeChangedCallback() { if (this.isConnected) this._render(); }

    _setEmpty() {
      this._img.classList.remove('ok');
      this._img.removeAttribute('src');
      // In ?slots=1 preview mode the frames stay visible with their captions.
      if (showCaptions) this._ph.hidden = false;
      else this.setAttribute('empty', '');
    }

    async _render() {
      this._ph.textContent = this.getAttribute('placeholder') || '';
      this._img.alt = this.getAttribute('alt') || '';
      if (this.id === 'cover-portrait') this._img.loading = 'eager';
      let src = this.getAttribute('src');
      if (!src && this.id) {
        const file = (await manifest).get(this.id);
        if (file) src = `/images/${file}`;
      }
      if (!src) return this._setEmpty();
      this._ph.hidden = true;
      this._img.src = src;
    }
  }

  if (!customElements.get('image-slot')) customElements.define('image-slot', ImageSlot);
})();
