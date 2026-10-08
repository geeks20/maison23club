(() => {
  'use strict';

  // ---------- Content ----------
  const PALETTE = [
    { name: 'BLACK', hex: '#171016', fg: '#F2E8D8', title: 'Noir', note: 'The foundation. Sharp, after-dark, always right.' },
    { name: 'BURGUNDY', hex: '#64283D', fg: '#F2E8D8', title: 'Bordeaux', note: 'The colour of the night. Satin, velvet, a lip.' },
    { name: 'CHOCOLATE', hex: '#352522', fg: '#F2E8D8', title: 'Chocolat', note: 'Warm and rich. Suede, silk, deep tailoring.' },
    { name: 'IVORY', hex: '#F2E8D8', fg: '#171016', title: 'Ivoire', note: 'The surprise. A suit, a dress, a shirt that glows in flash.' },
    { name: 'GOLD', hex: '#BE9A68', fg: '#171016', title: 'Or', note: 'The detail, not the outfit. Jewellery, buttons, a heel.' }
  ];
  const LOOKS = {
    elle: [
      ['The satin dress', 'Bias-cut, close to the body, catching every light.', 'Satin slip dress, flash-lit', 'tall'],
      ['Fitted & elegant', 'Black, sharp, one strong detail.', 'Fitted evening look, full length', 'portrait'],
      ['Tailoring, softened', 'An ivory suit with nothing underneath but gold.', 'Women’s tailored suit, wide trouser', 'portrait'],
      ['Statement accessories', 'Sculptural gold, one bold earring, a cuff.', 'Gold jewellery close-up', 'square'],
      ['Eveningwear, forward', 'A cape, a slit, an exposed shoulder.', 'Fashion-forward eveningwear', 'portrait'],
      ['The finishing touch', 'A silk scarf in the hair, a long glove.', 'Detail — scarf, glove, brooch', 'square']
    ],
    lui: [
      ['Relaxed tailoring', 'Unstructured blazer, chocolate or black.', 'Relaxed men’s tailoring', 'tall'],
      ['Wide-leg trousers', 'Pleated, high-waisted, breaking on the loafer.', 'Wide-leg pleated trousers', 'portrait'],
      ['The shirt', 'Silk, open collar, a print with intent.', 'Silk shirt, open collar', 'portrait'],
      ['Loafers', 'Polished, horsebit, no socks if you dare.', 'Loafers, low angle', 'square'],
      ['Gold accessories', 'A chain, a signet, a watch that catches light.', 'Gold chain and signet ring', 'square'],
      ['The statement jacket', 'Burgundy velvet, or leather after midnight.', 'Velvet statement jacket', 'portrait']
    ]
  };
  // [name, city, genre, photo slot]
  const ARTISTS = [
    ['Aya Nakamura', 'PARIS', 'AFRO-POP', 'aya-nakamura'], ['Tayc', 'PARIS', 'R&B · AFRO-LOVE', 'tayc'], ['Dadju', 'PARIS', 'R&B', 'dadju'],
    ['Tiakola', 'PARIS', 'RAP · AFRO', 'tiakola'], ['Franglish', 'PARIS', 'AFRO R&B', 'franglish'], ['Gims', 'PARIS', 'POP · RAP', 'gims'],
    ['Joé Dwèt Filé', 'PORT-AU-PRINCE', 'KOMPA · AFRO-LOVE', 'joe-dwet-file'], ['Fally Ipupa', 'KINSHASA', 'RUMBA · NDOMBOLO', 'fally-ipupa']
  ];
  // [time, title, description, highlight, photo slot]
  const TIMELINE = [
    ['20:00', 'BIENVENUE', 'Arrivals, drinks, French R&B', false, 'tl-welcome'],
    ['21:00', 'LE DÎNER', 'Food, conversations, good music', false, 'tl-dinner'],
    ['22:00', 'PARIS', 'French Afro and R&B', false, 'tl-paris'],
    ['23:00', 'KINSHASA', 'Rumba, soukous, ndombolo', false, 'tl-kinshasa'],
    ['23:45', 'THE BIRTHDAY MOMENT', 'Cake, celebration, photos', true, 'tl-birthday'],
    ['00:15', 'PORT-AU-PRINCE', 'Kompa and Caribbean sounds', false, 'tl-pap'],
    ['01:00', 'MAISON 23', 'Everything comes together', false, 'tl-late']
  ];
  const ATT = {
    yes: ['I’ll be there', 'OUI', 'I’LL BE THERE'],
    maybe: ['Maybe', 'PEUT-ÊTRE', 'MAYBE'],
    no: ['Can’t make it', 'NON', 'CAN’T MAKE IT']
  };
  const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

  // ---------- Helpers ----------
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const ssGet = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} };
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === 'class') n.className = v;
      else if (k === 'style') Object.assign(n.style, v);
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    kids.flat().forEach(c => n.append(c));
    return n;
  };
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wideMQ = matchMedia('(min-width: 860px)');
  const dubai = (iso, opts) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', ...opts }).format(new Date(iso));

  async function api(path, opts = {}) {
    let res;
    try {
      res = await fetch(path, {
        ...opts,
        headers: { Accept: 'application/json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
        credentials: 'same-origin',
        cache: 'no-store'
      });
    } catch (e) {
      return { ok: false, status: 0, data: { message: 'We couldn’t reach MAISON 23 — please check your connection and try again.' } };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  // ---------- State ----------
  const pathMatch = location.pathname.match(/^\/invite\/([^/?#]+)\/?$/);
  const state = {
    sound: false, sw: 1, gender: 'elle',
    token: pathMatch && TOKEN_RE.test(pathMatch[1]) ? pathMatch[1] : null,
    invite: null,          // server payload: { guest, rsvp, rsvpOpen, event, venue }
    event: null,           // public event info
    step: 'link',
    attendance: null, count: 1, saving: false
  };

  // ---------- Gate ----------
  function initGate() {
    const gate = $('gate');
    const title = $('gate-title');
    'MAISON 23'.split('').forEach((c, i) => {
      title.append(el('span', {
        'aria-hidden': 'true',
        class: i > 6 ? 'num' : null,
        style: reduced ? { animation: 'none' } : { animationDelay: `${0.3 + i * 0.075}s` }
      }, c));
    });

    const open = () => { gate.remove(); document.body.classList.remove('gated'); };
    // A personal link always opens on the gate; the plain site remembers it for the session.
    if (!state.token && ssGet('maison23.entered') === '1') return open();

    const enter = (withSound, then) => {
      ssSet('maison23.entered', '1');
      if (withSound && !state.sound) toggleSound();
      const done = () => { open(); if (then) then(); };
      if (reduced) return done();
      gate.classList.add('leaving');
      setTimeout(done, 1150);
    };
    gate.querySelector('[data-enter]').addEventListener('click', () => enter(false));
    gate.querySelector('[data-enter-sound]').addEventListener('click', () => enter(true));
    gate.querySelector('[data-enter-rsvp]').addEventListener('click', () => enter(false, () => {
      $('rsvp').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    }));
    gate.querySelector('[data-enter]').focus({ preventScroll: true });
  }

  function personaliseGate() {
    const gate = $('gate');
    if (!gate || !state.invite) return;
    $('gate-kicker').textContent = 'YOU’RE INVITED TO MAISON 23';
    $('gate-guest').textContent = state.invite.guest.name;
    $('gate-guest').hidden = false;
    $('gate-date').textContent = 'FRIDAY, OCTOBER 23, 2026 · DUBAI, UAE';
    $('gate-rsvp').hidden = false;
    if (state.invite.rsvp) $('gate-rsvp').textContent = 'VOIR MA RÉPONSE';
  }

  // ---------- Mobile menu ----------
  function initMenu() {
    const btn = $('menu-toggle'), menu = $('menu');
    const set = open => {
      btn.setAttribute('aria-expanded', String(open));
      menu.hidden = !open;
      document.body.classList.toggle('menu-open', open);
    };
    btn.addEventListener('click', () => set(menu.hidden));
    menu.addEventListener('click', e => { if (e.target.closest('a')) set(false); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { set(false); btn.focus(); } });
    wideMQ.addEventListener('change', () => set(false));
  }

  // ---------- Ambient sound (synthesised pad, no hosted audio) ----------
  let actx, master;
  function toggleSound() {
    try {
      if (!actx) {
        const C = window.AudioContext || window.webkitAudioContext;
        actx = new C();
        master = actx.createGain(); master.gain.value = 0;
        const filt = actx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 760; filt.Q.value = 0.6;
        filt.connect(master); master.connect(actx.destination);
        [98, 146.83, 196, 233.08, 293.66, 349.23].forEach((f, i) => {
          const o = actx.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = (i - 2.5) * 5;
          const g = actx.createGain(); g.gain.value = 0.05;
          const lfo = actx.createOscillator(); lfo.frequency.value = 0.04 + i * 0.027;
          const lg = actx.createGain(); lg.gain.value = 0.045; lfo.connect(lg); lg.connect(g.gain);
          o.connect(g); g.connect(filt); o.start(); lfo.start();
        });
      }
      const on = !state.sound, t = actx.currentTime;
      actx.resume();
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(on ? 0.42 : 0, t, on ? 1.2 : 0.4);
      state.sound = on;
      $('sound-toggle').setAttribute('aria-pressed', String(on));
      $('sound-label').textContent = on ? 'SON ON' : 'SON OFF';
    } catch (e) { console.warn('Audio unavailable', e); }
  }

  // ---------- Countdown (Asia/Dubai, 20:00 on 23 October 2026) ----------
  let countdownTimer = null;
  function startCountdown(targetIso) {
    if (countdownTimer) clearInterval(countdownTimer);
    if (targetIso) $('countdown-label').textContent = `AVANT L’OUVERTURE DES PORTES — ${dubai(targetIso, { hour: '2-digit', minute: '2-digit', hour12: false })} DUBAI`;
    const box = $('countdown');
    const tick = () => {
      const c = window.M23Countdown.compute(targetIso, Date.now());
      box.classList.remove('is-loading');
      box.setAttribute('aria-busy', 'false');
      if (c.started) {
        $('countdown-label').hidden = true;
        $('countdown-grid').hidden = true;
        $('countdown-open').hidden = false;
        clearInterval(countdownTimer);
        return;
      }
      $('cd-d').textContent = c.d; $('cd-h').textContent = c.h; $('cd-m').textContent = c.m; $('cd-s').textContent = c.s;
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  // ---------- Le son ----------
  function renderPlaylists() {
    const ev = state.event || {};
    $('playlists').replaceChildren(...[['SPOTIFY', ev.spotifyUrl], ['APPLE MUSIC', ev.appleMusicUrl]].map(([name, url]) =>
      el('a', {
        class: 'playlist', href: url || null, target: url ? '_blank' : null, rel: 'noopener noreferrer',
        'aria-disabled': url ? 'false' : 'true',
        onclick: url ? null : e => e.preventDefault()
      },
      el('span', { class: 'playlist-name' }, name),
      el('span', { class: 'playlist-status' }, url ? 'Écouter →' : 'Link coming soon'))
    ));
  }

  function renderArtists() {
    // Licensed portraits where they exist; otherwise the initials keep the card typographic.
    const initials = name => name.split(/\s+/).map(w => w[0]).join('').slice(0, 2);
    $('artists').replaceChildren(...ARTISTS.map((a, i) =>
      el('li', { class: 'artist', 'data-reveal': '0' },
        el('span', { class: 'artist-n' }, pad(i + 1)),
        el('span', { class: 'artist-photo', 'data-initials': initials(a[0]) },
          el('image-slot', { id: `artist-${a[3]}`, sizes: '(hover: hover) 240px, 64px', 'no-credit': '' })),
        el('span', { class: 'artist-name' }, a[0]),
        el('span', { class: 'artist-meta' }, el('span', {}, a[1]), el('span', {}, a[2])))
    ));
  }

  // ---------- Dress code ----------
  function renderPalette() {
    $('palette').replaceChildren(...PALETTE.map((p, i) => {
      const on = i === state.sw;
      return el('button', {
        type: 'button', role: 'radio', class: 'swatch', 'aria-checked': String(on), 'aria-label': `${p.title} — ${p.name}`,
        style: { background: p.hex, color: p.fg },
        onclick: () => { state.sw = i; renderPalette(); renderLooks(); $('palette').children[i].focus(); }
      },
      el('span', { class: 'swatch-name' }, p.name),
      on ? el('span', { class: 'swatch-body' },
        el('span', { class: 'swatch-title' }, p.title),
        el('span', { class: 'swatch-note' }, p.note),
        el('span', { class: 'swatch-hex' }, p.hex)) : '');
    }));
  }

  function renderGenders() {
    $('genders').replaceChildren(...[['elle', 'ELLE'], ['lui', 'LUI']].map(([k, label]) =>
      el('button', {
        type: 'button', role: 'tab', class: 'tab', 'aria-selected': String(state.gender === k),
        onclick: () => { state.gender = k; renderGenders(); renderLooks(); }
      }, label)
    ));
  }

  function renderLooks() {
    const sw = PALETTE[state.sw];
    const container = $('looks');
    const items = LOOKS[state.gender];
    // Rebuild only when the gender changes so swatch changes animate the colour bar.
    if (container.dataset.gender !== state.gender) {
      container.dataset.gender = state.gender;
      container.replaceChildren(...items.map((l, i) =>
        el('figure', { class: 'look', 'data-shape': l[3] },
          el('div', { class: 'look-photo', 'data-n': pad(i + 1) },
            el('image-slot', { id: `look-${state.gender}-${i}`, placeholder: l[2], sizes: '(min-width: 1100px) 30vw, (min-width: 640px) 45vw, 92vw' })),
          el('div', { class: 'look-bar' }),
          el('figcaption', {},
            el('span', { class: 'look-meta' }, el('span', {}, pad(i + 1)), el('span', { class: 'look-sw' })),
            el('span', { class: 'look-title' }, l[0]),
            el('span', { class: 'look-note' }, l[1])))
      ));
    }
    container.style.setProperty('--look-tone', sw.hex);
    container.style.setProperty('--look-fg', sw.fg);
    for (const fig of container.children) {
      fig.querySelector('.look-bar').style.background = sw.hex;
      fig.querySelector('.look-sw').textContent = `IN ${sw.name}`;
    }
  }

  // ---------- Night ----------
  function renderTimeline() {
    const ol = $('timeline');
    ol.querySelectorAll('.tl-item').forEach(n => n.remove());
    TIMELINE.forEach((t, i) => ol.append(
      el('li', { class: 'tl-item' + (t[3] ? ' highlight' : ''), 'data-reveal': String(wideMQ.matches ? i * 120 : 0) },
        el('span', { class: 'tl-dot' }),
        el('span', { class: 'tl-time' }, t[0]),
        el('span', { class: 'tl-title' }, t[1]),
        el('span', { class: 'tl-desc' }, t[2]),
        el('span', { class: 'tl-photo' }, el('image-slot', { id: t[4], sizes: '(min-width: 860px) 160px, 80px', 'no-credit': '' })))
    ));
  }

  // ---------- RSVP ----------
  function setError(id, msg) { const n = $(id); n.textContent = msg || ''; n.hidden = !msg; }

  function showStep(step, focus) {
    state.step = step;
    for (const s of ['link', 'loading', 'form', 'done', 'closed']) $(`step-${s}`).hidden = s !== step;
    renderRsvp();
    if (focus) {
      const target = step === 'done' ? $('step-done') : step === 'form' ? $('att-options').querySelector('button') : null;
      if (target) target.focus({ preventScroll: true });
    }
  }

  async function loadInvite() {
    showStep('loading');
    const r = await api(`/api/invite/${state.token}`);
    if (!r.ok) {
      $('link-intro').textContent = r.status === 404 || r.status === 410
        ? 'Your invitation could not be opened.'
        : 'MAISON 23 is invitation-only. Open the personal link from your invitation — or paste it here.';
      setError('link-error', r.data.message || 'We couldn’t open your invitation. Please refresh in a moment.');
      return showStep('link');
    }
    applyInvite(r.data);
    personaliseGate();
    if (r.data.rsvp) showStep('done');
    else showStep(r.data.rsvpOpen ? 'form' : 'closed');
  }

  function applyInvite(data) {
    state.invite = data;
    state.event = data.event;
    const rsvp = data.rsvp;
    state.attendance = rsvp ? rsvp.attendance : null;
    state.count = rsvp && rsvp.partySize > 0 ? Math.min(rsvp.partySize, data.guest.allocation) : 1;
    $('dietary-input').value = rsvp ? rsvp.dietary : '';
    $('message-input').value = rsvp ? rsvp.message : '';
    renderPlaylists();
    renderVenue();
  }

  async function submitRsvp() {
    if (state.saving) return;
    if (!state.attendance) return setError('form-error', 'Please choose whether you can come.');
    state.saving = true; setError('form-error', ''); renderRsvp();
    const r = await api(`/api/invite/${state.token}/rsvp`, {
      method: 'POST',
      body: JSON.stringify({
        attendance: state.attendance,
        partySize: state.attendance === 'no' ? 0 : state.count,
        dietary: $('dietary-input').value,
        message: $('message-input').value
      })
    });
    state.saving = false;
    if (!r.ok || !r.data.rsvp) {
      // Nothing is confirmed unless the server says it saved the reply.
      setError('form-error', (r.data && r.data.message) || 'Your reply couldn’t be saved. Please try again.');
      return renderRsvp();
    }
    applyInvite(r.data);
    showStep('done', true);
  }

  function renderRsvp() {
    const inv = state.invite;
    if (!inv) return;
    const alloc = inv.guest.allocation, rsvp = inv.rsvp, ev = inv.event;

    if (state.step === 'form') {
      $('invite-first').textContent = inv.guest.firstName;
      $('alloc-text').textContent = alloc > 1
        ? `This invitation is for up to ${alloc} people, approved by the host.`
        : 'This invitation is for you alone — one place, held in your name.';
      $('deadline-text').hidden = !ev.rsvpDeadline;
      if (ev.rsvpDeadline) $('deadline-text').textContent = `Kindly reply by ${dubai(ev.rsvpDeadline, { weekday: 'long', day: 'numeric', month: 'long' })}.`;
      $('has-previous').hidden = !rsvp;
      $('cancel-edit').hidden = !rsvp;
      $('att-options').replaceChildren(...['yes', 'maybe', 'no'].map(k =>
        el('button', {
          type: 'button', class: 'att', 'aria-pressed': String(state.attendance === k),
          onclick: () => { state.attendance = k; setError('form-error', ''); renderRsvp(); }
        }, el('span', { class: 'att-fr' }, ATT[k][0]), el('span', { class: 'att-en' }, ATT[k][1]))
      ));
      $('count-row').hidden = !(state.attendance !== 'no' && alloc > 1);
      $('count-hint').textContent = `Up to ${alloc} on this invitation`;
      $('count').textContent = state.count;
      $('dec').disabled = state.count <= 1;
      $('inc').disabled = state.count >= alloc;
      $('submit-rsvp').disabled = state.saving;
      $('submit-rsvp').textContent = state.saving ? 'ENVOI…' : rsvp ? 'METTRE À JOUR' : 'ENVOYER MA RÉPONSE';
    }

    if (state.step === 'done' && rsvp) {
      $('done-first').textContent = inv.guest.firstName + '.';
      $('done-line').textContent = rsvp.attendance === 'yes'
        ? 'See you on the 23rd. The address will reach you privately.'
        : rsvp.attendance === 'maybe'
          ? 'Noted as a maybe. Come back and confirm whenever you know.'
          : 'We’ll miss you. Thank you for letting us know.';
      if (rsvp.attendance === 'yes' && inv.venue) $('done-line').textContent = 'See you on the 23rd.';
      $('done-att').textContent = `RÉPONSE — ${ATT[rsvp.attendance][2]}`;
      $('done-count').textContent = rsvp.attendance !== 'no' ? `${rsvp.partySize} ${rsvp.partySize > 1 ? 'PERSONNES' : 'PERSONNE'}` : '';
      $('done-dress').hidden = rsvp.attendance === 'no' || !ev.dressCode;
      $('done-dress').textContent = `Dress code — ${ev.dressCode}`;
      const v = inv.venue;
      $('done-venue').hidden = !v;
      if (v) {
        $('done-venue').replaceChildren(
          el('strong', {}, v.name),
          el('span', { style: { whiteSpace: 'pre-line' } }, v.address),
          v.mapsUrl ? el('a', { href: v.mapsUrl, target: '_blank', rel: 'noopener noreferrer' }, 'OUVRIR DANS GOOGLE MAPS →') : '');
      }
      $('add-cal').hidden = rsvp.attendance === 'no';
      $('edit-rsvp').hidden = !inv.rsvpOpen;
    }
  }

  function initRsvp() {
    $('step-link').addEventListener('submit', e => {
      e.preventDefault();
      const raw = $('link-input').value.trim();
      const m = raw.match(/([A-Za-z0-9_-]{32})\/?$/);
      if (!m) return setError('link-error', 'That doesn’t look like a MAISON 23 invitation link. Copy the full link from your invitation.');
      location.assign(`/invite/${m[1]}#rsvp`);
    });
    $('link-input').addEventListener('input', () => setError('link-error', ''));
    $('step-form').addEventListener('submit', e => { e.preventDefault(); submitRsvp(); });
    $('dec').addEventListener('click', () => { state.count = Math.max(1, state.count - 1); renderRsvp(); });
    $('inc').addEventListener('click', () => { state.count = Math.min(state.invite.guest.allocation, state.count + 1); renderRsvp(); });
    $('edit-rsvp').addEventListener('click', () => showStep('form', true));
    $('cancel-edit').addEventListener('click', () => { applyInvite(state.invite); showStep('done', true); });
    $('add-cal').addEventListener('click', addCal);
    $('copy-invite').addEventListener('click', e => copy(location.origin + location.pathname, e.currentTarget, 'COPIER MON LIEN'));
    // Share the public site, never the personal invitation link.
    $('copy-site').addEventListener('click', e => copy(location.origin + '/', e.currentTarget, 'COPIER LE LIEN'));
  }

  // ---------- Venue ----------
  function renderVenue() {
    const inv = state.invite;
    const v = inv && inv.venue;
    const confirmed = inv && inv.rsvp && inv.rsvp.attendance === 'yes';
    $('venue-visible').hidden = !v;
    $('venue-hidden').hidden = Boolean(v);
    if (v) {
      $('venue-name').textContent = v.name;
      $('venue-address').textContent = v.address;
      $('venue-map').hidden = !v.mapsUrl;
      if (v.mapsUrl) $('venue-map').href = v.mapsUrl;
    } else if (confirmed) {
      $('venue-pending-text').textContent = 'Your place is confirmed. The address will appear here, on your personal invitation, as soon as the host shares it.';
    }
  }

  // ---------- Utilities ----------
  function copy(text, btn, label) {
    const ok = () => { btn.textContent = 'LIEN COPIÉ'; setTimeout(() => { btn.textContent = label; }, 2200); };
    const fallback = () => {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); ok(); } catch (e) {}
      t.remove();
    };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
  }

  function addCal() {
    const ev = (state.invite && state.invite.event) || state.event || {};
    const v = state.invite && state.invite.venue;
    const utc = iso => new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const icsText = s => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
    const loc = v ? `${v.name}, ${v.address}` : 'Dubai, UAE';
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MAISON 23//FR', 'BEGIN:VEVENT', 'UID:maison23-20261023@maison23.club',
      'DTSTAMP:' + utc(new Date().toISOString()),
      'DTSTART:' + utc(ev.startsAt || '2026-10-23T20:00:00+04:00'),
      'DTEND:' + utc(ev.endsAt || '2026-10-24T02:00:00+04:00'),
      'SUMMARY:' + icsText('MAISON 23 — La nuit est à nous.'),
      'LOCATION:' + icsText(loc),
      'DESCRIPTION:' + icsText(`Une soirée privée.${ev.dressCode ? ' Dress code: ' + ev.dressCode : ''}${v ? '' : ' The address is shared privately with confirmed guests.'}`),
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'maison23.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function setupCursor() {
    if (!matchMedia('(pointer: fine)').matches || reduced) return;
    const c = el('div', { class: 'cursor', 'aria-hidden': 'true' });
    document.body.appendChild(c);
    addEventListener('mousemove', e => {
      c.style.opacity = '1';
      c.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      const hot = e.target.closest && e.target.closest('a,button,[role=radio],input,textarea');
      c.classList.toggle('hot', !!hot);
    }, { passive: true });
    document.addEventListener('mouseleave', () => { c.style.opacity = '0'; });
  }

  // Gentle parallax on large editorial photos: the frame stays put, the photo drifts a little.
  function setupParallax() {
    if (reduced || !matchMedia('(pointer: fine)').matches) return;
    const frames = [...document.querySelectorAll('[data-parallax]')];
    if (!frames.length) return;
    document.documentElement.classList.add('px-on');
    let queued = false;
    const update = () => {
      queued = false;
      const vh = innerHeight;
      for (const f of frames) {
        const r = f.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) continue;
        const p = (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2); // -1 … 1 across the viewport
        f.style.setProperty('--px', `${(p * -4).toFixed(2)}%`);
      }
    };
    addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  let io;
  function setupReveal() {
    if (reduced || !window.IntersectionObserver) return;
    io = io || new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.style.opacity = '1'; e.target.style.transform = 'none'; io.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll('[data-reveal]:not([data-rv])').forEach(n => {
      n.setAttribute('data-rv', '1');
      if (n.getBoundingClientRect().top < innerHeight * 0.9) return;
      const d = parseInt(n.getAttribute('data-reveal') || '0', 10) || 0;
      n.style.opacity = '0';
      n.style.transform = 'translateY(32px)';
      n.style.transition = `opacity 1.2s cubic-bezier(.2,.7,.1,1) ${d}ms, transform 1.2s cubic-bezier(.2,.7,.1,1) ${d}ms`;
      io.observe(n);
    });
  }

  // ---------- Boot ----------
  initGate();
  initMenu();
  $('sound-toggle').addEventListener('click', toggleSound);
  renderPlaylists();
  renderArtists();
  renderPalette();
  renderGenders();
  renderLooks();
  renderTimeline();
  initRsvp();

  // Countdown: show a quiet loading state until the event time is known (fallback after 2.5s).
  let countdownStarted = false;
  const startOnce = iso => { if (!countdownStarted || iso) { countdownStarted = true; startCountdown(iso); } };
  const fallback = setTimeout(() => startOnce(null), 2500);
  api('/api/event').then(r => {
    if (r.ok) { state.event = r.data; renderPlaylists(); }
    clearTimeout(fallback);
    startOnce(r.ok ? r.data.startsAt : null);
  });

  if (state.token) loadInvite();
  else {
    if (pathMatch) setError('link-error', 'That invitation link isn’t complete. Copy the full link from your invitation.');
    showStep('link');
  }

  setupCursor();
  setupParallax();
  setTimeout(setupReveal, 300);
})();
