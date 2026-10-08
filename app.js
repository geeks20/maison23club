(() => {
  'use strict';

  // ---------- Data ----------
  const K = { inv: 'maison23.v1.invites', rsvp: 'maison23.v1.rsvps', set: 'maison23.v1.settings', entered: 'maison23.entered' };
  const SEED = [
    { code: 'M23-AMARA', name: 'Amara Diallo', allocation: 2, revoked: false },
    { code: 'M23-KEVIN', name: 'Kevin Mbuyi', allocation: 1, revoked: false },
    { code: 'M23-NADEGE', name: 'Nadège Pierre', allocation: 2, revoked: false },
    { code: 'M23-SOFIA', name: 'Sofia Benali', allocation: 1, revoked: false },
    { code: 'M23-OLD', name: 'Ancien lien', allocation: 1, revoked: true }
  ];
  const TARGET = Date.parse('2026-10-23T20:00:00+04:00');

  const PALETTE = [
    { name: 'BLACK', hex: '#171016', fg: '#F2E8D8', title: 'Noir', note: 'The foundation. Sharp, after-dark, always right.' },
    { name: 'BURGUNDY', hex: '#64283D', fg: '#F2E8D8', title: 'Bordeaux', note: 'The colour of the night. Satin, velvet, a lip.' },
    { name: 'CHOCOLATE', hex: '#352522', fg: '#F2E8D8', title: 'Chocolat', note: 'Warm and rich. Suede, silk, deep tailoring.' },
    { name: 'IVORY', hex: '#F2E8D8', fg: '#171016', title: 'Ivoire', note: 'The surprise. A suit, a dress, a shirt that glows in flash.' },
    { name: 'GOLD', hex: '#BE9A68', fg: '#171016', title: 'Or', note: 'The detail, not the outfit. Jewellery, buttons, a heel.' }
  ];
  const LOOKS = {
    elle: [
      ['The satin dress', 'Bias-cut, close to the body, catching every light.', 'Satin slip dress, flash-lit'],
      ['Fitted & elegant', 'Black, sharp, one strong detail.', 'Fitted evening look, full length'],
      ['Tailoring, softened', 'An ivory suit with nothing underneath but gold.', 'Women’s tailored suit, wide trouser'],
      ['Statement accessories', 'Sculptural gold, one bold earring, a cuff.', 'Gold jewellery close-up'],
      ['Eveningwear, forward', 'A cape, a slit, an exposed shoulder.', 'Fashion-forward eveningwear'],
      ['The finishing touch', 'A silk scarf in the hair, a long glove.', 'Detail — scarf, glove, brooch']
    ],
    lui: [
      ['Relaxed tailoring', 'Unstructured blazer, chocolate or black.', 'Relaxed men’s tailoring'],
      ['Wide-leg trousers', 'Pleated, high-waisted, breaking on the loafer.', 'Wide-leg pleated trousers'],
      ['The shirt', 'Silk, open collar, a print with intent.', 'Silk shirt, open collar'],
      ['Loafers', 'Polished, horsebit, no socks if you dare.', 'Loafers, low angle'],
      ['Gold accessories', 'A chain, a signet, a watch that catches light.', 'Gold chain and signet ring'],
      ['The statement jacket', 'Burgundy velvet, or leather after midnight.', 'Velvet statement jacket']
    ]
  };
  const ARTISTS = [
    ['Aya Nakamura', 'PARIS', 'AFRO-POP'], ['Tayc', 'PARIS', 'R&B · AFRO-LOVE'], ['Dadju', 'PARIS', 'R&B'],
    ['Tiakola', 'PARIS', 'RAP · AFRO'], ['Franglish', 'PARIS', 'AFRO R&B'], ['Gims', 'PARIS', 'POP · RAP'],
    ['Joé Dwèt Filé', 'PORT-AU-PRINCE', 'KOMPA · AFRO-LOVE'], ['Fally Ipupa', 'KINSHASA', 'RUMBA · NDOMBOLO']
  ];
  const TIMELINE = [
    ['20:00', 'BIENVENUE', 'Arrivals, drinks, French R&B'],
    ['21:00', 'LE DÎNER', 'Food, conversations, good music'],
    ['22:00', 'PARIS', 'French Afro and R&B'],
    ['23:00', 'KINSHASA', 'Rumba, soukous, ndombolo'],
    ['23:45', 'THE BIRTHDAY MOMENT', 'Cake, celebration, photos', true],
    ['00:15', 'PORT-AU-PRINCE', 'Kompa and Caribbean sounds'],
    ['01:00', 'MAISON 23', 'Everything comes together']
  ];
  const ATT = { yes: ['Oui', 'YES'], maybe: ['Peut-être', 'MAYBE'], no: ['Non', 'NO'] };

  // ---------- Helpers ----------
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const first = n => (n || '').trim().split(/\s+/)[0] || '';
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
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

  // ---------- State ----------
  const state = {
    sound: false, sw: 1, gender: 'elle',
    code: '', invite: null, step: 'code', hasPrevious: false,
    attendance: 'yes', count: 1, saving: false, done: null,
    settings: {}
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
    if (ssGet(K.entered) === '1') return open();

    const enter = withSound => {
      ssSet(K.entered, '1');
      if (withSound && !state.sound) toggleSound();
      if (reduced) return open();
      gate.classList.add('leaving');
      setTimeout(open, 1150);
    };
    gate.querySelector('[data-enter]').addEventListener('click', () => enter(false));
    gate.querySelector('[data-enter-sound]').addEventListener('click', () => enter(true));
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

  // ---------- Countdown ----------
  function tick() {
    const diff = Math.max(0, TARGET - Date.now());
    $('cd-d').textContent = pad(Math.floor(diff / 864e5));
    $('cd-h').textContent = pad(Math.floor(diff / 36e5) % 24);
    $('cd-m').textContent = pad(Math.floor(diff / 6e4) % 60);
    $('cd-s').textContent = pad(Math.floor(diff / 1e3) % 60);
    $('countdown-label').textContent = diff > 0 ? 'AVANT L’OUVERTURE DES PORTES — 20:00 GST' : 'LA MAISON EST OUVERTE';
  }

  // ---------- Le son ----------
  function renderPlaylists() {
    const st = state.settings;
    $('playlists').replaceChildren(...[['SPOTIFY', st.spotify], ['APPLE MUSIC', st.apple]].map(([name, url]) =>
      el('a', {
        class: 'playlist', href: url || null, target: '_blank', rel: 'noopener',
        'aria-disabled': url ? 'false' : 'true',
        onclick: url ? null : e => e.preventDefault()
      },
      el('span', { class: 'playlist-name' }, name),
      el('span', { class: 'playlist-status' }, url ? 'Écouter →' : 'Link coming soon'))
    ));
  }

  function renderArtists() {
    $('artists').replaceChildren(...ARTISTS.map((a, i) =>
      el('li', { class: 'artist', 'data-reveal': '0' },
        el('span', { class: 'artist-n' }, pad(i + 1)),
        el('span', { class: 'artist-name' }, a[0]),
        el('span', { class: 'artist-meta' }, el('span', {}, a[1]), el('span', {}, a[2])))
    ));
  }

  // ---------- Dress code ----------
  function renderPalette() {
    $('palette').replaceChildren(...PALETTE.map((p, i) => {
      const on = i === state.sw;
      return el('button', {
        type: 'button', role: 'radio', class: 'swatch', 'aria-checked': String(on),
        style: { background: p.hex, color: p.fg },
        onclick: () => { state.sw = i; renderPalette(); renderLooks(); }
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
    const existing = container.children;
    const items = LOOKS[state.gender];
    // Rebuild only when the gender changes so swatch changes animate the colour bar.
    if (container.dataset.gender !== state.gender) {
      container.dataset.gender = state.gender;
      container.replaceChildren(...items.map((l, i) =>
        el('figure', { class: 'look' },
          el('div', { class: 'look-photo' }, el('image-slot', { id: `look-${state.gender}-${i}`, placeholder: l[2] })),
          el('div', { class: 'look-bar' }),
          el('figcaption', {},
            el('span', { class: 'look-meta' }, el('span', {}, pad(i + 1)), el('span', { class: 'look-sw' })),
            el('span', { class: 'look-title' }, l[0]),
            el('span', { class: 'look-note' }, l[1])))
      ));
    }
    for (const fig of existing) {
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
        el('span', { class: 'tl-desc' }, t[2]))
    ));
  }

  // ---------- RSVP ----------
  function setError(id, msg) { const n = $(id); n.textContent = msg || ''; n.hidden = !msg; }

  function openCode(raw, silent) {
    const code = String(raw || '').trim().toUpperCase();
    state.code = code;
    $('code-input').value = code;
    if (!code) return codeError('Enter the code from your invitation.');
    const inv = load(K.inv, []).find(i => i.code === code);
    if (!inv) return codeError(silent ? '' : 'We couldn’t find that invitation. Check the code and try again.');
    if (inv.revoked) return codeError('This invitation is no longer active. Please contact the host.');
    const prev = load(K.rsvp, {})[code];
    codeError('');
    Object.assign(state, {
      invite: inv, hasPrevious: !!prev, step: prev ? 'done' : 'form', done: prev || null,
      attendance: prev ? prev.attendance : 'yes',
      count: prev ? Math.max(1, Math.min(prev.count || 1, inv.allocation)) : Math.min(1, inv.allocation)
    });
    $('name-input').value = prev ? prev.name : inv.name;
    $('dietary-input').value = prev ? prev.dietary : '';
    $('message-input').value = prev ? prev.message : '';
    setError('form-error', '');
    renderRsvp();
  }

  function codeError(msg) {
    setError('code-error', msg);
    $('code-input').setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function submitRsvp() {
    const inv = load(K.inv, []).find(i => i.code === state.code);
    if (!inv || inv.revoked) return setError('form-error', 'This invitation is no longer active. Please contact the host.');
    const name = $('name-input').value.trim().slice(0, 80);
    if (!name) return setError('form-error', 'Please add your name.');
    const count = state.attendance === 'no' ? 0 : Math.max(1, Math.min(inv.allocation, state.count | 0));
    const rec = {
      name, attendance: state.attendance, count,
      dietary: $('dietary-input').value.trim().slice(0, 140),
      message: $('message-input').value.trim().slice(0, 500),
      at: new Date().toISOString()
    };
    state.saving = true; renderRsvp();
    setTimeout(() => {
      try {
        const all = load(K.rsvp, {}); all[state.code] = rec; save(K.rsvp, all);
        Object.assign(state, { saving: false, step: 'done', done: rec, hasPrevious: true, invite: inv });
      } catch (e) {
        state.saving = false;
        setError('form-error', 'Your reply couldn’t be saved. Please try again.');
      }
      renderRsvp();
    }, 450);
  }

  function renderRsvp() {
    const s = state, inv = s.invite, alloc = inv ? inv.allocation : 1, done = s.done;
    $('step-code').hidden = s.step !== 'code';
    $('step-form').hidden = s.step !== 'form';
    $('step-done').hidden = s.step !== 'done';

    if (s.step === 'form') {
      $('invite-first').textContent = inv ? first(inv.name) : '';
      $('alloc-text').textContent = alloc > 1
        ? `This invitation is for up to ${alloc} people, approved by the host.`
        : 'This invitation is for you alone — one place, held in your name.';
      $('has-previous').hidden = !s.hasPrevious;
      $('att-options').replaceChildren(...['yes', 'maybe', 'no'].map(k =>
        el('button', {
          type: 'button', class: 'att', 'aria-pressed': String(s.attendance === k),
          onclick: () => { state.attendance = k; setError('form-error', ''); renderRsvp(); }
        }, el('span', { class: 'att-fr' }, ATT[k][0]), el('span', { class: 'att-en' }, ATT[k][1]))
      ));
      $('count-row').hidden = !(s.attendance !== 'no' && alloc > 1);
      $('count-hint').textContent = `Up to ${alloc} on this invitation`;
      $('count').textContent = s.count;
      $('dec').disabled = s.count <= 1;
      $('inc').disabled = s.count >= alloc;
      $('submit-rsvp').disabled = s.saving;
      $('submit-rsvp').textContent = s.saving ? 'ENVOI…' : 'ENVOYER MA RÉPONSE';
    }

    if (s.step === 'done' && done) {
      $('done-first').textContent = first(done.name) + '.';
      $('done-line').textContent = done.attendance === 'yes'
        ? 'See you on the 23rd. The address will reach you privately.'
        : done.attendance === 'maybe'
          ? 'Noted as a maybe. Come back and confirm whenever you know.'
          : 'We’ll miss you. Thank you for letting us know.';
      $('done-att').textContent = `RÉPONSE — ${ATT[done.attendance][1]}`;
      $('done-count').textContent = done.attendance !== 'no' ? `${done.count} ${done.count > 1 ? 'PERSONNES' : 'PERSONNE'}` : '';
      $('add-cal').hidden = done.attendance === 'no';
    }
    renderVenue();
  }

  function initRsvp() {
    $('code-input').addEventListener('input', e => {
      const pos = e.target.selectionStart;
      e.target.value = e.target.value.toUpperCase();
      e.target.setSelectionRange(pos, pos);
      state.code = e.target.value;
      codeError('');
    });
    $('step-code').addEventListener('submit', e => { e.preventDefault(); openCode($('code-input').value); });
    $('step-form').addEventListener('submit', e => { e.preventDefault(); submitRsvp(); });
    $('name-input').addEventListener('input', () => setError('form-error', ''));
    $('dec').addEventListener('click', () => { state.count = Math.max(1, state.count - 1); renderRsvp(); });
    $('inc').addEventListener('click', () => { state.count = Math.min(state.invite ? state.invite.allocation : 1, state.count + 1); renderRsvp(); });
    $('reset-code').addEventListener('click', () => {
      Object.assign(state, { step: 'code', invite: null, code: '', done: null, hasPrevious: false });
      $('code-input').value = '';
      renderRsvp();
    });
    $('edit-rsvp').addEventListener('click', () => { state.step = 'form'; renderRsvp(); });
    $('add-cal').addEventListener('click', addCal);
    $('copy-invite').addEventListener('click', e =>
      copy(`${baseUrl()}?invite=${encodeURIComponent(state.code)}`, e.currentTarget, 'COPIER MON LIEN'));
    $('copy-site').addEventListener('click', e => copy(baseUrl(), e.currentTarget, 'COPIER LE LIEN'));
  }

  // ---------- Venue ----------
  function renderVenue() {
    const st = state.settings, done = state.done, inv = state.invite;
    const visible = !!(done && done.attendance === 'yes' && inv && !inv.revoked && st.venueName);
    $('venue-visible').hidden = !visible;
    $('venue-hidden').hidden = visible;
    $('venue-name').textContent = st.venueName || '';
    $('venue-address').textContent = st.venueAddress || '';
    $('venue-notes').textContent = st.venueNotes || '';
  }

  // ---------- Utilities ----------
  const baseUrl = () => location.origin + location.pathname;

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
    const st = state.settings;
    const loc = state.done && state.done.attendance === 'yes' && st.venueName ? `${st.venueName}, ${st.venueAddress || 'Dubai'}` : 'Dubai, UAE';
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MAISON 23//FR', 'BEGIN:VEVENT', 'UID:maison23-20261023@maison23',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z',
      'DTSTART:20261023T160000Z', 'DTEND:20261023T220000Z', 'SUMMARY:MAISON 23 — La nuit est à nous.',
      'LOCATION:' + loc.replace(/,/g, '\\,').replace(/\n/g, ' '),
      'DESCRIPTION:Une soirée privée. Address shared privately with confirmed guests.', 'END:VEVENT', 'END:VCALENDAR'
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
    });
    document.addEventListener('mouseleave', () => { c.style.opacity = '0'; });
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
  try { if (!localStorage.getItem(K.inv)) save(K.inv, SEED); } catch (e) {}
  state.settings = load(K.set, {});

  initGate();
  $('sound-toggle').addEventListener('click', toggleSound);
  tick(); setInterval(tick, 1000);
  renderPlaylists();
  renderArtists();
  renderPalette();
  renderGenders();
  renderLooks();
  renderTimeline();
  initRsvp();
  renderRsvp();

  const param = new URLSearchParams(location.search).get('invite');
  if (param) openCode(param, true);

  addEventListener('storage', e => {
    if (e.key === K.set) { state.settings = load(K.set, {}); renderPlaylists(); renderVenue(); }
  });

  setupCursor();
  setTimeout(setupReveal, 300);
})();
