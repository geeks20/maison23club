(() => {
  'use strict';

  // ---------- Helpers ----------
  const $ = id => document.getElementById(id);
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach(c => n.append(c == null ? '' : c));
    return n;
  };
  const dubai = (iso, opts = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) =>
    iso ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', ...opts }).format(new Date(iso)) : '';
  const toLocalInput = iso => (iso ? iso.slice(0, 16) : ''); // stored as …+04:00, i.e. already Dubai wall time

  async function api(path, opts = {}) {
    let res;
    try {
      res = await fetch(path, {
        method: opts.method || 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'X-M23': '1', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    } catch (e) {
      return { ok: false, status: 0, data: { message: 'Network error — check your connection.' } };
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.endsWith('/session') && !path.endsWith('/login')) showLock();
    return { ok: res.ok, status: res.status, data };
  }

  const RSVP = { yes: 'CONFIRMÉ', maybe: 'PEUT-ÊTRE', no: 'DÉCLINÉ', pending: 'EN ATTENTE', revoked: 'RÉVOQUÉ' };
  const DELIVERY = {
    not_sent: 'NON ENVOYÉE', sent: 'ENVOYÉE', delivered: 'DÉLIVRÉE', delivery_delayed: 'RETARDÉE',
    marked_sent: 'ENVOYÉE (MANUEL)', failed: 'ÉCHEC', bounced: 'REJETÉE', complained: 'SIGNALÉE'
  };
  const CHANNEL = { email: 'email', whatsapp: 'WhatsApp' };
  const FILTERS = [['all', 'TOUS'], ['yes', 'CONFIRMÉS'], ['pending', 'EN ATTENTE'], ['maybe', 'PEUT-ÊTRE'], ['no', 'DÉCLINÉS'], ['not_sent', 'NON ENVOYÉES'], ['revoked', 'RÉVOQUÉS']];

  const state = { data: null, filter: 'all', q: '', openId: null };
  const rsvpOf = g => g.revoked ? 'revoked' : g.rsvp ? g.rsvp.attendance : 'pending';

  // ---------- Auth ----------
  function showLock(msg) {
    $('app').hidden = true;
    $('lock').hidden = false;
    if ($('guest-dialog').open) $('guest-dialog').close();
    if (msg) { $('pw-error').textContent = msg; $('pw-error').hidden = false; }
    $('pw').focus();
  }

  async function boot() {
    const r = await api('/api/admin/session');
    if (!r.ok) return showLock(r.data.message || 'The server is unavailable right now.');
    if (!r.data.configured) { showLock('Host access is not configured on the server yet (ADMIN_PASSWORD).'); $('pw-submit').disabled = true; return; }
    if (!r.data.authed) return showLock();
    $('lock').hidden = true;
    $('app').hidden = false;
    await refresh();
  }

  $('unlock-form').addEventListener('submit', async e => {
    e.preventDefault();
    $('pw-submit').disabled = true;
    const r = await api('/api/admin/login', { method: 'POST', body: { password: $('pw').value } });
    $('pw-submit').disabled = false;
    if (!r.ok) { $('pw-error').textContent = r.data.message || 'Incorrect password.'; $('pw-error').hidden = false; return; }
    $('pw').value = '';
    $('pw-error').hidden = true;
    boot();
  });
  $('pw').addEventListener('input', () => { $('pw-error').hidden = true; });
  $('logout').addEventListener('click', async () => { await api('/api/admin/logout', { method: 'POST' }); showLock(); });

  // ---------- Data ----------
  async function refresh() {
    const r = await api('/api/admin/overview');
    if (!r.ok) return;
    state.data = r.data;
    render();
    if (state.openId && $('guest-dialog').open) openGuest(state.openId, { keepMsg: true });
  }

  // ---------- Render ----------
  function render() {
    const { stats, event: ev, email, guests } = state.data;

    // Email status
    const b = $('email-banner');
    b.className = 'banner' + (email.mode === 'test' ? ' test' : '');
    b.hidden = false;
    b.replaceChildren(...(email.mode === 'off'
      ? [el('strong', {}, 'EMAIL — OFF. '), 'Nothing will be emailed. Set EMAIL_MODE=test (sends only to your test address) or EMAIL_MODE=live on the server.' + (email.missing.length ? ` Missing: ${email.missing.join(', ')}.` : '')]
      : email.mode === 'test'
        ? [el('strong', {}, 'EMAIL — TEST MODE. '), `Every email goes to ${email.testRecipient || '(EMAIL_TEST_RECIPIENT not set)'}, never to guests. Test sends don't count as invitations sent.` + (email.missing.length ? ` Missing: ${email.missing.join(', ')}.` : '')]
        : [el('strong', {}, 'EMAIL — LIVE. '), 'Emails go to guests.' + (email.missing.length ? ` Awaiting configuration: ${email.missing.join(', ')}.` : '') + (email.webhook ? ' Delivery tracking on.' : ' Delivery tracking off (RESEND_WEBHOOK_SECRET not set) — “sent” means accepted by Resend.')]));

    // Stats
    $('stats').replaceChildren(...[
      ['INVITÉ·ES', stats.invited, `${stats.notSent} not sent yet`],
      ['CONFIRMÉS', stats.confirmed, 'invitations'],
      ['PEUT-ÊTRE', stats.maybe, stats.maybeHeads ? `${stats.maybeHeads} people` : 'invitations'],
      ['DÉCLINÉS', stats.declined, 'invitations'],
      ['EN ATTENTE', stats.awaiting, 'no reply yet'],
      ['ATTENDUS', stats.expected, 'confirmed people', true],
      ['PLACES RESTANTES', stats.remaining, `of ${stats.capacity}`, stats.remaining < 0]
    ].map(([label, value, sub, hl]) => el('div', { class: 'stat' },
      el('span', { class: 'stat-label' }, label),
      el('span', { class: 'stat-value', style: hl ? 'color:var(--gold)' : null }, String(value)),
      el('span', { class: 'stat-sub' }, sub))));

    $('alloc-count').textContent = `${stats.expected} / ${stats.capacity}`;
    $('alloc-bar').style.width = Math.min(100, (stats.expected / stats.capacity) * 100) + '%';
    $('alloc-bar').classList.toggle('over', stats.expected > stats.capacity);
    $('alloc-note').textContent = `${stats.allocated} places allocated across active invitations` +
      (stats.allocated > stats.capacity ? ` — more than capacity, which is fine if some will decline. Confirmations stop at ${stats.capacity}.` : '.');

    // Filters
    const counts = { all: guests.length };
    for (const g of guests) {
      const k = rsvpOf(g); counts[k] = (counts[k] || 0) + 1;
      if (!g.revoked && (g.invitation.state === 'not_sent' || g.invitation.state === 'failed')) counts.not_sent = (counts.not_sent || 0) + 1;
    }
    $('filters').replaceChildren(...FILTERS.map(([k, label]) =>
      el('button', {
        type: 'button', role: 'tab', class: 'filter', 'aria-selected': String(state.filter === k),
        onclick: () => { state.filter = k; render(); }
      }, `${label} ${counts[k] || 0}`)));

    renderRows();
    renderEventForm();
    renderWords();
    renderActivity();
  }

  function visibleGuests() {
    const q = state.q.trim().toLowerCase();
    return state.data.guests.filter(g => {
      const k = rsvpOf(g);
      const f = state.filter;
      const pass = f === 'all' ? true
        : f === 'not_sent' ? !g.revoked && (g.invitation.state === 'not_sent' || g.invitation.state === 'failed')
        : f === 'revoked' ? g.revoked
        : !g.revoked && k === f;
      return pass && (!q || [g.name, g.email, g.phone].some(v => v && v.toLowerCase().includes(q)));
    });
  }

  function renderRows() {
    const rows = visibleGuests();
    $('rows').replaceChildren(...rows.map(g => {
      const k = rsvpOf(g), inv = g.invitation;
      const bump = d => async e => {
        e.stopPropagation();
        const r = await api(`/api/admin/guests/${g.id}`, { method: 'PATCH', body: { allocation: g.allocation + d } });
        if (!r.ok) flash(r.data.message || 'Could not update places.', false);
        refresh();
      };
      const notes = g.rsvp ? [g.rsvp.dietary && `Diet: ${g.rsvp.dietary}`, g.rsvp.message && '✉ message'].filter(Boolean).join(' · ') : '';
      return el('tr', { class: g.revoked ? 'revoked' : null, tabindex: '0', onclick: () => openGuest(g.id), onkeydown: e => { if (e.key === 'Enter') openGuest(g.id); } },
        el('td', { class: 'cell-name' }, g.name, el('span', { class: 'cell-contact' }, [g.email, g.phone].filter(Boolean).join(' · ') || 'no email or phone')),
        el('td', {}, el('div', { class: 'mini-stepper' },
          el('button', { type: 'button', 'aria-label': `Moins de places pour ${g.name}`, disabled: g.allocation <= 1, onclick: bump(-1) }, '−'),
          el('span', {}, String(g.allocation)),
          el('button', { type: 'button', 'aria-label': `Plus de places pour ${g.name}`, disabled: g.allocation >= 10, onclick: bump(1) }, '+'))),
        el('td', {}, el('span', { class: `badge ${k}` }, RSVP[k]),
          g.rsvp && g.rsvp.attendance !== 'no' ? el('span', { class: 'cell-sub' }, `${g.rsvp.partySize} / ${g.allocation} · ${dubai(g.rsvp.updatedAt)}`) : g.rsvp ? el('span', { class: 'cell-sub' }, dubai(g.rsvp.updatedAt)) : ''),
        el('td', { class: 'cell-notes' }, notes || '—'),
        el('td', {}, el('span', { class: `badge ${inv.state}` }, DELIVERY[inv.state] || inv.state),
          inv.at ? el('span', { class: 'cell-sub' }, `${CHANNEL[inv.channel] || ''} · ${dubai(inv.at)}`) : ''),
        el('td', {}, el('div', { class: 'row-actions' },
          g.revoked ? '' : el('button', { type: 'button', class: 'act-copy', onclick: e => { e.stopPropagation(); copyText(g.link, e.currentTarget, 'LIEN'); } }, 'LIEN'),
          el('button', { type: 'button', class: 'act-toggle', onclick: e => { e.stopPropagation(); openGuest(g.id); } }, 'OUVRIR →'))));
    }));
    $('empty').hidden = rows.length > 0;
    $('empty').textContent = state.data.guests.length ? 'Aucun résultat.' : 'Personne ici pour l’instant — add your first guest above.';
  }

  // ---------- Guest panel ----------
  async function openGuest(id, { keepMsg = false } = {}) {
    const g = state.data.guests.find(x => x.id === id);
    if (!g) return;
    state.openId = id;
    const dlg = $('guest-dialog');
    const prevMsg = keepMsg ? $('gd-msg') && { text: $('gd-msg').textContent, cls: $('gd-msg').className } : null;
    const k = rsvpOf(g);
    const email = state.data.email;

    const msg = el('p', { id: 'gd-msg', class: 'gd-msg', role: 'status' });
    if (prevMsg) { msg.textContent = prevMsg.text; msg.className = prevMsg.cls; }
    const say = (text, ok = true) => { msg.textContent = text; msg.className = 'gd-msg ' + (ok ? 'ok' : 'bad'); };

    const act = (label, fn, cls = 'btn-outline', disabled = false) => el('button', {
      type: 'button', class: cls, disabled,
      onclick: async e => {
        const btn = e.currentTarget; btn.disabled = true;
        try { await fn(btn); } finally { btn.disabled = false; }
      }
    }, label);

    const sendEmail = kind => async () => {
      let r = await api(`/api/admin/guests/${g.id}/email`, { method: 'POST', body: { kind } });
      if (r.status === 409 && r.data.error === 'already_sent') {
        if (!confirm(`${r.data.message}\n\nSend it again?`)) return say('Not sent.', false);
        r = await api(`/api/admin/guests/${g.id}/email`, { method: 'POST', body: { kind, force: true } });
      }
      say(r.ok ? r.data.message : (r.data.message || 'Send failed.'), r.ok);
      refresh();
    };

    // Edit form
    const f = {
      name: el('input', { class: 'input-line', value: g.name, maxlength: '120', required: true }),
      email: el('input', { class: 'input-line', type: 'email', value: g.email || '', maxlength: '254' }),
      phone: el('input', { class: 'input-line', type: 'tel', value: g.phone || '', maxlength: '40', placeholder: '+971…' }),
      allocation: el('input', { class: 'input-line', type: 'number', min: '1', max: '10', value: String(g.allocation) })
    };
    const editForm = el('form', { class: 'gd-edit', onsubmit: async e => {
      e.preventDefault();
      const r = await api(`/api/admin/guests/${g.id}`, { method: 'PATCH', body: { name: f.name.value, email: f.email.value, phone: f.phone.value, allocation: Number(f.allocation.value) } });
      say(r.ok ? 'Saved.' : (r.data.message || 'Could not save.'), r.ok);
      if (r.ok) refresh();
    } },
      el('div', { class: 'grid-2' },
        el('label', { class: 'field' }, el('span', { class: 'label' }, 'NOM'), f.name),
        el('label', { class: 'field' }, el('span', { class: 'label' }, 'PLACES'), f.allocation),
        el('label', { class: 'field' }, el('span', { class: 'label' }, 'EMAIL'), f.email),
        el('label', { class: 'field' }, el('span', { class: 'label' }, 'WHATSAPP'), f.phone)),
      el('div', { class: 'gd-row' }, el('button', { type: 'submit', class: 'btn-ivory btn-sm' }, 'ENREGISTRER')));

    // WhatsApp message (generated server-side with the guest's link)
    const wa = el('textarea', { class: 'input-area gd-wa', readonly: true, 'aria-label': 'Message WhatsApp' }, '…');
    const waOpen = el('a', { class: 'btn-outline', target: '_blank', rel: 'noopener noreferrer', href: '#' }, 'OUVRIR WHATSAPP');
    if (!g.revoked) api(`/api/admin/guests/${g.id}/whatsapp`).then(r => {
      if (!r.ok) return;
      wa.value = r.data.text;
      waOpen.href = r.data.waUrl;
      if (!r.data.hasPhone) waOpen.title = 'No phone number — WhatsApp will ask you to pick a contact.';
    });

    const rsvpBlock = g.rsvp ? el('dl', { class: 'kv' },
      el('dt', {}, 'RÉPONSE'), el('dd', {}, `${RSVP[g.rsvp.attendance]}${g.rsvp.attendance !== 'no' ? ` — ${g.rsvp.partySize} / ${g.allocation}` : ''}`),
      el('dt', {}, 'LE'), el('dd', {}, dubai(g.rsvp.updatedAt, { dateStyle: 'medium', timeStyle: 'short' }) + ' (Dubai)'),
      el('dt', {}, 'RÉGIME'), el('dd', {}, g.rsvp.dietary || '—'),
      el('dt', {}, 'MESSAGE'), el('dd', {}, g.rsvp.message || '—'))
      : el('p', { class: 'hint' }, 'No reply yet.');

    const history = g.history.length
      ? el('ol', { class: 'gd-history' }, g.history.map(h => el('li', {},
        `${dubai(h.created_at)} — ${CHANNEL[h.channel]} ${h.kind} · ${DELIVERY[h.status] || h.status.toUpperCase()}${h.is_test ? ' · TEST → ' + h.recipient : ''}${h.error ? ' · ' + h.error : ''}`)))
      : el('p', { class: 'hint' }, 'Nothing sent yet.');

    const emailReady = email.ready && !g.revoked && g.email;
    const emailHint = g.revoked ? 'Restore the invitation to send.' : !g.email ? 'Add an email address to send by email.'
      : !email.ready ? `Email is ${email.mode === 'off' ? 'off' : 'awaiting configuration'} — see the banner at the top.`
      : email.mode === 'test' ? `Test mode: goes to ${email.testRecipient}, not to ${g.firstName}.` : `Goes to ${g.email}.`;

    $('gd-body').replaceChildren(el('div', { class: 'gd' },
      el('div', { class: 'gd-head' },
        el('div', { class: 'kicker' }, `INVITATION — ${RSVP[k]}`),
        el('h2', { id: 'gd-name', class: 'gd-title' }, g.name)),
      msg,
      el('div', { class: 'gd-section' },
        el('span', { class: 'label' }, 'LIEN PERSONNEL'),
        g.revoked
          ? el('p', { class: 'hint' }, 'This invitation is revoked — its link no longer works.')
          : el('div', { class: 'gd-row' }, el('span', { class: 'gd-link' }, g.link),
            act('COPIER', btn => copyText(g.link, btn, 'COPIER')))),
      el('div', { class: 'gd-section' },
        el('span', { class: 'label' }, 'RSVP'), rsvpBlock),
      el('div', { class: 'gd-section' },
        el('span', { class: 'label' }, 'EMAIL'),
        el('p', { class: 'hint' }, emailHint),
        el('div', { class: 'gd-row' },
          act('ENVOYER L’INVITATION', sendEmail('invitation'), 'btn-ivory btn-sm', !emailReady),
          act('RELANCER', sendEmail('reminder'), 'btn-outline', !emailReady || Boolean(g.rsvp)))),
      g.revoked ? '' : el('div', { class: 'gd-section' },
        el('span', { class: 'label' }, 'WHATSAPP — ENVOI MANUEL'),
        el('p', { class: 'hint' }, '1. Copy or open in WhatsApp  2. Send it yourself  3. Mark it as sent. MAISON 23 can’t see WhatsApp delivery.'),
        wa,
        el('div', { class: 'gd-row' },
          act('COPIER LE MESSAGE', btn => copyText(wa.value, btn, 'COPIER LE MESSAGE')),
          waOpen,
          act('MARQUER COMME ENVOYÉ', async () => {
            const r = await api(`/api/admin/guests/${g.id}/whatsapp-sent`, { method: 'POST', body: { kind: g.invitation.state === 'not_sent' ? 'invitation' : 'reminder' } });
            say(r.ok ? 'Marked as sent via WhatsApp (by you).' : (r.data.message || 'Could not record.'), r.ok);
            refresh();
          }))),
      el('div', { class: 'gd-section' }, el('span', { class: 'label' }, 'MODIFIER'), editForm),
      el('div', { class: 'gd-section' },
        el('span', { class: 'label' }, 'HISTORIQUE DES ENVOIS'), history),
      el('div', { class: 'gd-section' },
        el('span', { class: 'label' }, 'ACCÈS'),
        el('p', { class: 'hint' }, 'A new link replaces the old one immediately — use it if a link was shared or leaked. The reply is kept.'),
        el('div', { class: 'gd-row' },
          g.revoked
            ? act('RÉACTIVER', async () => { const r = await api(`/api/admin/guests/${g.id}/restore`, { method: 'POST' }); say(r.ok ? 'Invitation restored — the same link works again.' : r.data.message, r.ok); refresh(); })
            : act('RÉVOQUER', async () => {
              if (!confirm(`Revoke ${g.name}'s invitation? Their link stops working immediately.`)) return;
              const r = await api(`/api/admin/guests/${g.id}/revoke`, { method: 'POST' }); say(r.ok ? 'Invitation revoked.' : r.data.message, r.ok); refresh();
            }, 'btn-danger'),
          act('NOUVEAU LIEN', async () => {
            if (!confirm(`Generate a new link for ${g.name}? The current link stops working.`)) return;
            const r = await api(`/api/admin/guests/${g.id}/regenerate`, { method: 'POST' }); say(r.ok ? 'New link generated. Send it to the guest — the old one no longer works.' : r.data.message, r.ok); refresh();
          })))));
    if (!dlg.open) dlg.showModal();
  }
  $('guest-dialog').addEventListener('close', () => { state.openId = null; });

  // ---------- Create / import ----------
  function flash(text, ok = true) {
    const m = $('create-msg');
    m.textContent = text; m.classList.toggle('bad', !ok); m.hidden = !text;
  }

  $('create-form').addEventListener('submit', async e => {
    e.preventDefault();
    const r = await api('/api/admin/guests', { method: 'POST', body: {
      name: $('new-name').value, email: $('new-email').value, phone: $('new-phone').value, allocation: Number($('new-alloc').value)
    } });
    if (!r.ok) return flash(r.data.message || 'Could not add the guest.', false);
    flash(`${$('new-name').value.trim()} added. Their invitation hasn’t been sent — open them to share the link.`);
    $('create-form').reset();
    $('new-alloc').value = '1';
    $('new-name').focus();
    refresh();
  });

  $('csv-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 250e3) return flash('That file is too large (max 250 KB).', false);
    const csv = await file.text();
    const dry = await api('/api/admin/guests/import', { method: 'POST', body: { csv, dryRun: true } });
    if (!dry.ok) return flash(dry.data.message || 'Could not read the file.', false);
    if (dry.data.errors.length) {
      return flash(`Nothing imported. Fix these rows and upload again: ${dry.data.errors.slice(0, 6).map(x => `row ${x.row}: ${x.message}`).join(' · ')}${dry.data.errors.length > 6 ? ' …' : ''}`, false);
    }
    if (!confirm(`Import ${dry.data.wouldCreate} guest(s) from ${file.name}? No invitations will be sent.`)) return;
    const r = await api('/api/admin/guests/import', { method: 'POST', body: { csv } });
    if (!r.ok) return flash(r.data.message || 'Import failed.', false);
    flash(`Imported ${r.data.created} guest(s).${r.data.skipped.length ? ` Skipped ${r.data.skipped.length} already on the list (same email).` : ''}`);
    refresh();
  });

  $('search').addEventListener('input', e => { state.q = e.target.value; renderRows(); });

  // ---------- Bulk sends ----------
  async function prepareBulk(kind, box, extra) {
    const r = await api(`/api/admin/bulk/preview?kind=${kind}`);
    box.hidden = false;
    if (!r.ok) return box.replaceChildren(el('p', { class: 'error' }, r.data.message || 'Could not prepare.'));
    const { count, names, email } = r.data;
    if (!count) return box.replaceChildren(el('p', { class: 'hint' }, kind === 'reminder' ? 'Nobody to remind right now.' : 'No confirmed guests with an email address yet.'));
    const where = email.mode === 'test' ? ` — TEST MODE: all ${count} go to ${email.testRecipient}` : email.mode === 'off' ? ' — email is OFF, nothing can be sent' : '';
    box.replaceChildren(
      el('p', {}, `${count} recipient(s)${where}:`),
      el('p', { class: 'names' }, names.join(', ')),
      el('div', { class: 'confirm-actions' },
        el('button', { type: 'button', class: 'btn-ivory btn-sm', disabled: !email.ready, onclick: async e => {
          e.currentTarget.disabled = true;
          e.currentTarget.textContent = 'ENVOI EN COURS…';
          const s = await api('/api/admin/bulk/send', { method: 'POST', body: { kind, confirm: true, ...extra() } });
          box.replaceChildren(el('p', { class: s.ok ? 'saved' : 'error' }, s.ok
            ? `${s.data.test ? 'TEST — ' : ''}Sent ${s.data.sent}, skipped ${s.data.skipped} (already sent), failed ${s.data.failed}.${s.data.errors.length ? ' ' + s.data.errors.map(x => `${x.name}: ${x.message}`).join(' · ') : ''}`
            : (s.data.message || 'Send failed.')));
          refresh();
        } }, `CONFIRMER — ENVOYER À ${count}`),
        el('button', { type: 'button', class: 'btn-text', onclick: () => { box.hidden = true; } }, 'ANNULER')));
  }
  $('reminder-preview').addEventListener('click', () => prepareBulk('reminder', $('reminder-confirm'), () => ({})));
  $('update-form').addEventListener('submit', e => {
    e.preventDefault();
    if (!$('update-subject').value.trim() || !$('update-body').value.trim()) {
      $('update-confirm').hidden = false;
      return $('update-confirm').replaceChildren(el('p', { class: 'error' }, 'Add a subject and a message.'));
    }
    prepareBulk('update', $('update-confirm'), () => ({ subject: $('update-subject').value, body: $('update-body').value }));
  });

  // ---------- Event settings ----------
  const EV_FIELDS = ['dressCode', 'venueName', 'venueAddress', 'mapsUrl', 'spotifyUrl', 'appleMusicUrl'];
  let formDirty = false;
  $('settings-form').addEventListener('input', () => { formDirty = true; $('saved-msg').textContent = ''; });

  function renderEventForm() {
    if (formDirty) return; // don't overwrite unsaved edits on refresh
    const ev = state.data.event;
    for (const k of EV_FIELDS) $(k).value = ev[k] || '';
    $('startsAt').value = toLocalInput(ev.startsAt);
    $('endsAt').value = toLocalInput(ev.endsAt);
    $('rsvpDeadline').value = toLocalInput(ev.rsvpDeadline);
    $('capacity').value = ev.capacity;
    $('capacity').max = state.data.maxCapacity;
    $('max-cap').textContent = state.data.maxCapacity;
    $('venueShared').checked = ev.venueShared;
  }

  $('settings-form').addEventListener('submit', async e => {
    e.preventDefault();
    const body = Object.fromEntries(EV_FIELDS.map(k => [k, $(k).value]));
    Object.assign(body, {
      startsAt: $('startsAt').value, endsAt: $('endsAt').value, rsvpDeadline: $('rsvpDeadline').value || null,
      capacity: Number($('capacity').value), venueShared: $('venueShared').checked
    });
    if (body.venueShared && !body.venueName.trim()) { $('saved-msg').textContent = 'Add the venue name before sharing it.'; return; }
    const r = await api('/api/admin/event', { method: 'PUT', body });
    $('saved-msg').textContent = r.ok ? 'Enregistré.' : (r.data.message || 'Could not save.');
    if (r.ok) { formDirty = false; refresh(); }
  });

  // ---------- Words & activity ----------
  function renderWords() {
    const msgs = state.data.guests.filter(g => g.rsvp && g.rsvp.message);
    $('messages').replaceChildren(...(msgs.length
      ? msgs.map(g => el('blockquote', { class: 'quote' },
          el('span', { class: 'quote-text' }, `“${g.rsvp.message}”`),
          el('span', { class: 'quote-name' }, `— ${g.name}`)))
      : [el('p', { class: 'no-messages' }, 'No messages yet.')]));
  }

  const ACT = {
    rsvp: d => `replied ${RSVP[d.attendance]}${d.attendance !== 'no' ? ` (${d.partySize})` : ''}`,
    rsvp_updated: d => `changed reply: ${RSVP[d.previous] || d.previous} → ${RSVP[d.attendance]}${d.attendance !== 'no' ? ` (${d.partySize})` : ''}`,
    guest_created: d => `added${d.via === 'csv' ? ' via CSV' : ''} — ${d.allocation} place(s)`,
    guest_updated: d => `details updated${'allocation' in d ? ` — ${d.allocation} place(s)` : ''}`,
    invitation_revoked: () => 'invitation revoked',
    invitation_restored: () => 'invitation restored',
    link_regenerated: () => 'new link generated',
    email_sent: d => `${d.test ? 'TEST ' : ''}${d.kind} email accepted by Resend`,
    email_failed: d => `${d.kind} email failed — ${d.error || ''}`,
    email_delivered: d => `${d.kind} email delivered`,
    email_bounced: d => `${d.kind} email bounced`,
    email_complained: d => `${d.kind} email marked as spam`,
    email_failed_webhook: d => `${d.kind} email failed`,
    whatsapp_marked_sent: d => `WhatsApp ${d.kind} marked as sent`,
    bulk_reminder: d => `reminders: ${d.sent} sent, ${d.skipped} skipped, ${d.failed} failed${d.test ? ' (test)' : ''}`,
    bulk_update: d => `update: ${d.sent} sent, ${d.skipped} skipped, ${d.failed} failed${d.test ? ' (test)' : ''}`,
    event_updated: d => `event details updated (${(d.fields || []).join(', ')})`,
    guest_list_exported: d => `guest list exported (${d.rows})`,
    host_login: () => 'host signed in'
  };
  function renderActivity() {
    const items = state.data.activity;
    $('activity').replaceChildren(...(items.length ? items.map(a => el('li', {},
      el('time', { datetime: a.at }, dubai(a.at)),
      el('span', {}, a.name ? el('span', { class: 'who' }, a.name + ' ') : '', (ACT[a.type] || (() => a.type.replace(/_/g, ' ')))(a.detail || {}))))
      : [el('li', {}, el('span', {}), el('span', { class: 'hint' }, 'Nothing yet.'))]));
  }

  // ---------- Utils ----------
  function copyText(text, btn, label) {
    const ok = () => { btn.textContent = 'COPIÉ'; setTimeout(() => { btn.textContent = label; }, 1800); };
    const fallback = () => {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); ok(); } catch (e) {}
      t.remove();
    };
    navigator.clipboard ? navigator.clipboard.writeText(text).then(ok, fallback) : fallback();
  }

  // Refresh when coming back to the tab so new RSVPs appear.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('app').hidden) refresh(); });
  boot();
})();
