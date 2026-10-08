(() => {
  'use strict';

  // Same storage keys and seed as the guest site (app.js) so both pages share data.
  const K = { inv: 'maison23.v1.invites', rsvp: 'maison23.v1.rsvps', set: 'maison23.v1.settings', host: 'maison23.host' };
  const SEED = [
    { code: 'M23-AMARA', name: 'Amara Diallo', allocation: 2, revoked: false },
    { code: 'M23-KEVIN', name: 'Kevin Mbuyi', allocation: 1, revoked: false },
    { code: 'M23-NADEGE', name: 'Nadège Pierre', allocation: 2, revoked: false },
    { code: 'M23-SOFIA', name: 'Sofia Benali', allocation: 1, revoked: false },
    { code: 'M23-OLD', name: 'Ancien lien', allocation: 1, revoked: true }
  ];
  const CAP = 40;
  const MAX_ALLOC = 4;
  const SETTINGS_FIELDS = ['venueName', 'venueAddress', 'venueNotes', 'spotify', 'apple'];
  const STATUS = {
    yes: 'CONFIRMÉ', no: 'DÉCLINÉ', maybe: 'PEUT-ÊTRE', pending: 'EN ATTENTE', revoked: 'RÉVOQUÉ'
  };
  const FILTERS = [['all', 'TOUS'], ['yes', 'CONFIRMÉS'], ['maybe', 'PEUT-ÊTRE'], ['pending', 'EN ATTENTE'], ['no', 'DÉCLINÉS'], ['revoked', 'RÉVOQUÉS']];

  // ---------- Helpers ----------
  const $ = id => document.getElementById(id);
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const ssGet = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const ssSet = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} };
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    kids.flat().forEach(c => n.append(c));
    return n;
  };

  // ---------- State ----------
  const state = { invites: [], rsvps: {}, filter: 'all', copied: '' };

  function refresh() {
    state.invites = load(K.inv, []);
    state.rsvps = load(K.rsvp, {});
  }
  function setInvites(fn) {
    const next = fn(load(K.inv, []));
    save(K.inv, next);
    state.invites = next;
    render();
  }
  const statusOf = i => i.revoked ? 'revoked' : (state.rsvps[i.code] ? state.rsvps[i.code].attendance : 'pending');
  const inviteLink = code => new URL('index.html?invite=' + encodeURIComponent(code), location.href).href;

  // ---------- Lock ----------
  function showApp(unlocked) {
    $('lock').hidden = unlocked;
    $('app').hidden = !unlocked;
    if (unlocked) { refresh(); fillSettings(); render(); }
  }

  $('unlock-form').addEventListener('submit', e => {
    e.preventDefault();
    if ($('pw').value === 'maison23') {
      ssSet(K.host, '1');
      $('pw').value = '';
      showApp(true);
    } else {
      $('pw-error').textContent = 'Incorrect password.';
      $('pw-error').hidden = false;
    }
  });
  $('pw').addEventListener('input', () => { $('pw-error').hidden = true; });
  $('logout').addEventListener('click', () => { ssSet(K.host, null); showApp(false); });

  // ---------- Render ----------
  function render() {
    const { invites, rsvps } = state;
    const active = invites.filter(i => !i.revoked);
    const n = k => active.filter(i => statusOf(i) === k).length;
    const heads = k => active.reduce((t, i) => t + (statusOf(i) === k ? rsvps[i.code].count : 0), 0);
    const expected = heads('yes'), maybeHeads = heads('maybe');
    const allocSum = active.reduce((t, i) => t + i.allocation, 0);

    // Stats
    $('stats').replaceChildren(...[
      ['ATTENDUS', expected, maybeHeads ? `+${maybeHeads} maybe` : 'confirmed heads', true],
      ['CONFIRMÉS', n('yes'), 'invitations'],
      ['PEUT-ÊTRE', n('maybe'), 'invitations'],
      ['EN ATTENTE', n('pending'), 'no reply yet'],
      ['DÉCLINÉS', n('no'), 'invitations']
    ].map(([label, value, sub, gold]) => el('div', { class: 'stat' },
      el('span', { class: 'stat-label' }, label),
      el('span', { class: 'stat-value', style: gold ? 'color:var(--gold)' : null }, String(value)),
      el('span', { class: 'stat-sub' }, sub))));

    // Allocation bar
    const over = allocSum > CAP;
    $('alloc-count').textContent = `${allocSum} / ${CAP}`;
    $('alloc-bar').style.width = Math.min(100, allocSum / CAP * 100) + '%';
    $('alloc-bar').classList.toggle('over', over);
    $('alloc-over').hidden = !over;
    $('alloc-over').textContent = `Allocated places exceed the ${CAP}-guest maximum.`;

    // Filters
    $('filters').replaceChildren(...FILTERS.map(([k, label]) =>
      el('button', {
        type: 'button', role: 'tab', class: 'filter', 'aria-selected': String(state.filter === k),
        onclick: () => { state.filter = k; render(); }
      }, label)));

    // Rows
    const rows = state.filter === 'all' ? invites : invites.filter(i => statusOf(i) === state.filter);
    $('rows').replaceChildren(...rows.map(i => {
      const r = rsvps[i.code], k = statusOf(i);
      const bump = d => () => setInvites(list => list.map(x => x.code === i.code
        ? { ...x, allocation: Math.max(1, Math.min(MAX_ALLOC, x.allocation + d)) } : x));
      return el('tr', { class: i.revoked ? 'revoked' : null },
        el('td', { class: 'cell-name' }, i.name),
        el('td', { class: 'cell-code' }, i.code),
        el('td', {}, el('div', { class: 'mini-stepper' },
          el('button', { type: 'button', 'aria-label': 'Moins', onclick: bump(-1) }, '−'),
          el('span', {}, String(i.allocation)),
          el('button', { type: 'button', 'aria-label': 'Plus', onclick: bump(1) }, '+'))),
        el('td', {}, el('span', { class: `badge ${k}` }, STATUS[k])),
        el('td', {}, r && r.attendance !== 'no' ? `${r.count} / ${i.allocation}` : '—'),
        el('td', { class: 'cell-notes' }, r && r.dietary ? `Diet: ${r.dietary}` : '—'),
        el('td', {}, el('div', { class: 'row-actions' },
          el('button', { type: 'button', class: 'act-copy', onclick: () => copyLink(i.code) }, state.copied === i.code ? 'COPIÉ' : 'COPIER LE LIEN'),
          el('button', {
            type: 'button', class: 'act-toggle',
            onclick: () => setInvites(list => list.map(x => x.code === i.code ? { ...x, revoked: !x.revoked } : x))
          }, i.revoked ? 'RÉACTIVER' : 'RÉVOQUER'))));
    }));
    $('empty').hidden = rows.length > 0;

    // Messages
    const msgs = invites.map(i => rsvps[i.code]).filter(r => r && r.message);
    $('messages').replaceChildren(...(msgs.length
      ? msgs.map(r => el('blockquote', { class: 'quote' },
          el('span', { class: 'quote-text' }, `“${r.message}”`),
          el('span', { class: 'quote-name' }, `— ${r.name}`)))
      : [el('p', { class: 'no-messages' }, 'No messages yet.')]));
  }

  // ---------- Create invitation ----------
  function genCode(name) {
    const base = (name.normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/)[0] || '')
      .toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) || 'GUEST';
    const taken = new Set(state.invites.map(i => i.code));
    let code = 'M23-' + base;
    while (taken.has(code)) code = 'M23-' + base + Math.floor(10 + Math.random() * 90);
    return code;
  }

  function createMsg(text, ok) {
    const m = $('create-msg');
    m.textContent = text;
    m.classList.toggle('bad', !ok);
    m.hidden = !text;
  }

  $('new-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });
  $('new-name').addEventListener('input', () => createMsg('', true));
  $('create-form').addEventListener('submit', e => {
    e.preventDefault();
    refresh();
    const name = $('new-name').value.trim();
    const alloc = Math.max(1, Math.min(MAX_ALLOC, parseInt($('new-alloc').value, 10) || 1));
    if (!name) return createMsg('Add a guest name.', false);
    const code = $('new-code').value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || genCode(name);
    if (state.invites.some(i => i.code === code)) return createMsg(`Code ${code} already exists.`, false);
    setInvites(list => [...list, { code, name, allocation: alloc, revoked: false, createdAt: new Date().toISOString() }]);
    $('new-name').value = ''; $('new-alloc').value = '1'; $('new-code').value = '';
    createMsg(`Invitation created — ${code}.`, true);
  });

  // ---------- Links & export ----------
  function copyLink(code) {
    const text = inviteLink(code);
    const ok = () => {
      state.copied = code; render();
      setTimeout(() => { if (state.copied === code) { state.copied = ''; render(); } }, 2000);
    };
    const fallback = () => {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); ok(); } catch (e) {}
      t.remove();
    };
    navigator.clipboard ? navigator.clipboard.writeText(text).then(ok, fallback) : fallback();
  }

  $('export').addEventListener('click', () => {
    const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const rows = [['Name', 'Code', 'Allocation', 'Status', 'Attending', 'Dietary', 'Message', 'Replied at', 'Revoked', 'Link']];
    state.invites.forEach(i => {
      const r = state.rsvps[i.code];
      rows.push([i.name, i.code, i.allocation, r ? r.attendance : 'pending', r ? r.count : '', r ? r.dietary : '', r ? r.message : '', r ? r.at : '', i.revoked ? 'yes' : 'no', inviteLink(i.code)]);
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'maison23-guests.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // ---------- Settings ----------
  function fillSettings() {
    const st = load(K.set, {});
    SETTINGS_FIELDS.forEach(k => { $(k).value = st[k] || ''; });
  }
  SETTINGS_FIELDS.forEach(k => $(k).addEventListener('input', () => { $('saved-msg').textContent = ''; }));
  $('settings-form').addEventListener('submit', e => {
    e.preventDefault();
    const clean = { ...load(K.set, {}) };
    SETTINGS_FIELDS.forEach(k => { clean[k] = $(k).value.trim(); });
    ['spotify', 'apple'].forEach(k => { if (clean[k] && !/^https:\/\//.test(clean[k])) clean[k] = ''; });
    save(K.set, clean);
    fillSettings();
    $('saved-msg').textContent = 'Enregistré.';
  });

  // ---------- Boot ----------
  try { if (!localStorage.getItem(K.inv)) save(K.inv, SEED); } catch (e) {}
  addEventListener('storage', () => { if (!$('app').hidden) { refresh(); render(); } });
  showApp(ssGet(K.host) === '1');
})();
