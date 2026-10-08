/**
 * <image-slot> — fills its positioned parent with a photo, or a captioned
 * placeholder until one exists.
 *
 * Image source, in order: the `src` attribute, then `images/<id>.jpg`.
 * Drop a file named after the slot id into /images to fill it.
 */
(() => {
  const css =
    ':host{position:absolute;inset:0;display:block;overflow:hidden;color:inherit}' +
    '.ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;' +
    '  text-align:center;background:rgba(127,127,127,.08);font:10px/1.6 "Instrument Sans",system-ui,sans-serif;' +
    '  letter-spacing:.2em;text-transform:uppercase;opacity:.75}' +
    '.ph::before{content:"";position:absolute;inset:0;border:1px dashed currentColor;opacity:.3}' +
    'img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .8s}' +
    'img.ok{opacity:1}';

  class ImageSlot extends HTMLElement {
    static get observedAttributes() { return ['src', 'id', 'placeholder']; }

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${css}</style><div class="ph" part="placeholder"></div><img alt="">`;
      this._ph = root.querySelector('.ph');
      this._img = root.querySelector('img');
      this._img.addEventListener('load', () => { this._img.classList.add('ok'); this._ph.hidden = true; });
      this._img.addEventListener('error', () => { this._img.classList.remove('ok'); this._ph.hidden = false; this._img.removeAttribute('src'); });
    }

    connectedCallback() { this._render(); }
    attributeChangedCallback() { if (this.isConnected) this._render(); }

    _render() {
      this._ph.textContent = this.getAttribute('placeholder') || '';
      this._img.alt = this.getAttribute('alt') || this.getAttribute('placeholder') || '';
      const src = this.getAttribute('src') || (this.id ? `images/${this.id}.jpg` : '');
      if (!src) return;
      this._img.classList.remove('ok');
      this._ph.hidden = false;
      this._img.src = src;
    }
  }

  if (!customElements.get('image-slot')) customElements.define('image-slot', ImageSlot);
})();
