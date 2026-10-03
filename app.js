/* Health Bot — workout tracker. Vanilla JS, localStorage persistence. */
(() => {
  'use strict';
  const SEED = window.HB_SEED;
  const KEY = 'healthbot.v1';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const CAT_LABEL = { warmup: 'Warm-up', core: 'Core', prehab: 'Prehab', plyo: 'Power / Plyo', strength: 'Strength', iso: 'Isometric', accessory: 'Accessory' };
  const FLAG_LABEL = { back: 'back', shoulder: 'R shoulder' };

  // ---------------------------------------------------------------- state
  let S = load();
  function freshState() {
    const templates = SEED.templates.map((t) => ({ ...clone(t), items: t.items.map((it) => ({ uid: uid(), ...clone(it) })) }));
    const history = SEED.history.map((h) => {
      const tpl = templates.find((t) => t.id === h.tpl);
      const start = new Date(h.date + 'T07:00:00').getTime();
      return {
        id: uid(), tplId: h.tpl, name: tpl ? tpl.name : h.tpl, started: start, finished: start, imported: true, note: h.note || '',
        flags: { back: false, shoulder: false },
        items: h.items.map(([ex, sets]) => ({ uid: uid(), ex, sets: sets.map((s) => ({ ...s, done: true })) })),
      };
    });
    return { v: 1, schema: 7, templates, customLib: {}, renames: {}, aliases: {}, history, session: null, settings: { restOn: true, rest: 90, restAlert: true, wStep: 5, tStep: 5 } };
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) { migrate(s); return s; } } catch (e) {}
    return freshState();
  }
  function defaultSteps(ex = 'warmup') { return clone(SEED.BLOCKS[ex]?.steps || []).map((st) => ({ ...st, key: st.id, id: st.id + '_' + uid().slice(0, 4) })); }
  // session copy of block steps: drop the other day-type's finisher, add live fields
  // A/B steps alternate: pick the option NOT used last time this step was logged
  function alternate(steps) {
    for (const st of steps) {
      if (!st.choices) continue;
      const key = st.key || String(st.id).replace(/_[a-z0-9]{4}$/, '');
      let lastChoice = null;
      outer: for (let i = S.history.length - 1; i >= 0; i--) for (const it of S.history[i].items) for (const x of it.steps || []) if ((x.key || '') === key && x.choice && x.done) { lastChoice = x.choice; break outer; }
      if (lastChoice) { const idx = st.choices.findIndex((c) => c.id === lastChoice); st.choice = st.choices[(idx + 1) % st.choices.length].id; }
      const ch = st.choices.find((c) => c.id === st.choice);
      if (ch?.weight && (st.w === '' || st.w == null)) { // prefill DB weight from last time it was logged
        outer2: for (let i = S.history.length - 1; i >= 0; i--) for (const it of S.history[i].items) for (const x of it.steps || []) if (x.key === key && x.choice === ch.id && x.w !== '' && x.w != null) { st.w = x.w; break outer2; }
      }
    }
    return steps;
  }
  function sessSteps(steps, focus) { return clone(steps).filter((st) => !st.days || !focus || st.days === focus).map((st) => ({ ...st, done: false, skipped: false, val: '' })); }
  // upgrade saved data in place — history is never touched except to add fields
  function migrate(st) {
    if ((st.schema || 1) < 2) {
      const fixItem = (it, sess) => {
        if (it.ex === 'warmup' && !it.steps) it.steps = defaultSteps().map((x) => (sess ? { ...x, done: !!it.sets?.[0]?.done, val: '' } : x));
        if (it.note) it.note = it.note.replace(/@ ?90 ?lb/i, 'with +90 lb belt');
      };
      (st.templates || []).forEach((t) => t.items.forEach((it) => fixItem(it, false)));
      if (st.session) st.session.items.forEach((it) => fixItem(it, true));
      st.schema = 2;
    }
    if (st.schema < 3) { // Core block
      const focusOf = (id) => (st.templates || []).find((t) => t.id === id)?.focus;
      (st.templates || []).forEach((t) => t.items.forEach((it) => { if (it.ex === 'core' && !it.steps) it.steps = defaultSteps('core'); }));
      if (st.session) st.session.items.forEach((it) => {
        if (it.ex === 'core' && !it.steps) { const d = !!it.sets?.[0]?.done; it.steps = sessSteps(defaultSteps('core'), focusOf(st.session.tplId)).map((x) => ({ ...x, done: d })); }
      });
      st.schema = 3;
    }
    if (st.schema < 4) { // Shoulder prehab block
      (st.templates || []).forEach((t) => t.items.forEach((it) => { if (it.ex === 'shoulder_prehab' && !it.steps) it.steps = defaultSteps('shoulder_prehab'); }));
      if (st.session) st.session.items.forEach((it) => {
        if (it.ex === 'shoulder_prehab' && !it.steps) { const d = !!it.sets?.[0]?.done; it.steps = sessSteps(defaultSteps('shoulder_prehab')).map((x) => ({ ...x, done: d })); }
      });
      st.schema = 4;
    }
    if (st.schema < 5) { // Lower A supersets B (depth drops + snatch-grip DL) and C (physio curls + stir the pot)
      const G = { depth_drop_jump: 'B', sgdl_band: 'B', physio_curl: 'C', stir_pot: 'C' };
      const fix = (items) => items.forEach((it) => { const g = G[it.orig?.ex || it.swap?.from || it.ex]; if (g && !it.group) it.group = g; });
      (st.templates || []).filter((t) => t.id === 'lowerA').forEach((t) => fix(t.items));
      if (st.session?.tplId === 'lowerA') fix(st.session.items);
      st.schema = 5;
    }
    if (st.schema < 6) { // rest stopwatch
      st.settings = st.settings || {}; if (st.settings.restAlert === undefined) st.settings.restAlert = true; if (st.settings.rest == null) st.settings.rest = 90;
      st.schema = 6;
    }
    if (st.schema < 7) { st.renames = st.renames || {}; st.aliases = st.aliases || {}; st.schema = 7; } // exercise renames (name overlay on stable ids)
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
    return st;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Storage full — export a backup'); } }
  // exercise ids are stable; renames are a name overlay, so history/last/best stay linked by id
  const lib = () => {
    const base = Object.assign({}, SEED.library, S.customLib);
    for (const [id, nm] of Object.entries(S.renames || {})) if (base[id]) base[id] = { ...base[id], name: nm, origName: (SEED.library[id] || S.customLib[id] || {}).name };
    return base;
  };
  const nameOf = (it) => it.name || exDef(it.ex).name; // per-session / per-template override, else global name
  const exDef = (id) => lib()[id] || { id, name: id, fields: 'rw', cat: 'strength', swaps: {} };

  // ---------------------------------------------------------------- helpers
  const fmtT = (t) => { if (t === '' || t == null) return ''; t = +t; const m = Math.floor(t / 60), s = t % 60; return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`; };
  const fmtClock = (t) => { t = Math.max(0, Math.round(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const parseT = (v) => { v = String(v).trim().replace(/[s"]/g, ''); if (!v) return ''; if (v.includes(':') || v.includes("'")) { const [m, s] = v.split(/[:']/); return (+m || 0) * 60 + (+s || 0); } return Math.max(0, Math.round(+v || 0)); };
  const has = (fields, f) => fields.includes(f);
  function fmtSet(s, fields, belt) {
    if (has(fields, 't')) {
      let b = s.t !== '' ? fmtT(s.t) : '';
      if (has(fields, 'r') && s.r !== '') b += (b ? ' + ' : '') + s.r;
      if (has(fields, 'w') && s.w !== '' && +s.w > 0) b = (belt ? `+${s.w} lb belt · ` : `${s.w}lb `) + b;
      return b;
    }
    if (s.w !== '' && s.r !== '' && has(fields, 'w')) return belt ? (+s.w > 0 ? `+${s.w}×${s.r}` : `BW×${s.r}`) : `${s.w}×${s.r}`;
    if (s.r !== '') return `×${s.r}`;
    if (s.w !== '') return belt ? `+${s.w} lb belt` : `${s.w}lb`;
    return '';
  }
  function fmtSets(sets, fields, belt) {
    if (fields === 'c') return '✓';
    const parts = sets.map((s) => fmtSet(s, fields, belt)).filter(Boolean);
    if (!parts.length) return sets.length ? `${sets.length} set${sets.length > 1 ? 's' : ''}` : '';
    const allSame = parts.length === sets.length && parts.every((p) => p === parts[0]);
    if (allSame && sets.length > 1) {
      const s = sets[0];
      if (!has(fields, 't') && s.w !== '' && s.r !== '') return `${sets.length}×${s.r} @ ${belt ? `+${s.w} lb belt` : s.w}`;
      if (!has(fields, 't') && s.r !== '') return `${sets.length}×${s.r}`;
      return `${sets.length} × ${parts[0]}`;
    }
    return parts.join(' · ');
  }
  const dateLbl = (ts, o = { month: 'numeric', day: 'numeric' }) => new Date(ts).toLocaleDateString(undefined, o);
  function lastFor(ex) {
    for (let i = S.history.length - 1; i >= 0; i--) {
      const h = S.history[i];
      const it = h.items.find((x) => x.ex === ex && x.sets.some((s) => s.done));
      if (it) return { date: h.started, sets: it.sets.filter((s) => s.done) };
    }
    return null;
  }
  function rotation() { return S.templates.filter((t) => t.rotation > 0).sort((a, b) => a.rotation - b.rotation); }
  function suggestedTpl() {
    const rot = rotation();
    if (!rot.length) return S.templates[0];
    for (let i = S.history.length - 1; i >= 0; i--) {
      const idx = rot.findIndex((t) => t.id === S.history[i].tplId);
      if (idx >= 0) return rot[(idx + 1) % rot.length];
    }
    return rot[0];
  }
  const tplById = (id) => S.templates.find((t) => t.id === id);

  // ---------------------------------------------------------------- sessions
  function newSession(tplId) {
    const t = tplById(tplId) || suggestedTpl();
    const sess = {
      id: uid(), tplId: t.id, name: t.name, subtitle: t.subtitle || '', created: Date.now(), started: null, finished: null,
      flags: { back: false, shoulder: false },
      items: t.items.map((it) => ({ uid: uid(), ex: it.ex, ...(it.name ? { name: it.name } : {}), group: it.group || '', note: it.note || '', target: it.target || 0, ...(it.rest !== undefined ? { rest: it.rest } : {}), sets: it.sets.map((s) => ({ r: s.r ?? '', w: s.w ?? '', t: s.t ?? '', done: false })), ...(it.steps ? { steps: alternate(sessSteps(it.steps, t.focus)) } : {}) })),
    };
    return sess;
  }
  function session() {
    if (!S.session) { S.session = newSession(suggestedTpl().id); save(); }
    return S.session;
  }
  const anyDone = (it) => it.sets.some((s) => s.done) || !!it.steps?.some((s) => s.done);

  // flare engine -------------------------------------------------
  function resolveSwap(exId, flag, presentIds) {
    const rule = exDef(exId).swaps?.[flag];
    if (!rule) return null;
    const cands = Array.isArray(rule) ? rule : [rule];
    for (const c of cands) { if (c === 'remove' || !presentIds.has(c)) return c; }
    return 'remove';
  }
  function applyFlags(sess) {
    const flags = ['back', 'shoulder'].filter((f) => sess.flags[f]);
    // 1) swaps / removals on original items
    const present = () => new Set(sess.items.filter((i) => !i.removedBy).map((i) => i.ex));
    for (const it of sess.items) {
      if (it.addedBy) continue;
      if (anyDone(it)) continue; // never touch work already logged
      const base = it.orig || { ex: it.ex, note: it.note, sets: clone(it.sets) };
      let target = base.ex, reason = null, removed = null;
      const pres = present(); pres.delete(it.ex);
      for (const f of flags) {
        const r = resolveSwap(target, f, pres);
        if (!r) continue;
        if (r === 'remove') { removed = f; break; }
        target = r; reason = reason || f;
      }
      if (removed) {
        if (!it.orig) it.orig = base;
        it.removedBy = removed;
        continue;
      }
      it.removedBy = null;
      if (target === base.ex) {
        if (it.orig) { it.ex = base.ex; it.note = base.note; it.sets = clone(base.sets); it.orig = null; it.swap = null; }
        continue;
      }
      if (it.ex === target && it.swap) continue;
      it.orig = base;
      const alt = exDef(target);
      it.ex = target;
      it.swap = { from: base.ex, reason };
      it.note = '';
      it.sets = base.sets.map((s) => ({ r: has(alt.fields, 'r') ? s.r : '', w: '', t: has(alt.fields, 't') ? s.t : '', done: false }));
    }
    // 2) added prehab
    for (const f of ['back', 'shoulder']) {
      if (sess.flags[f]) {
        if (sess.items.some((i) => i.addedBy === f)) continue;
        const pres = present();
        const hasBlock = f === 'shoulder' && sess.items.some((i) => i.ex === 'shoulder_prehab' && i.steps?.length);
        const adds = SEED.FLARE_PREHAB[f].filter((a) => !pres.has(a.ex) && !hasBlock).map((a) => ({
          uid: uid(), ex: a.ex, group: '', note: a.note, target: 0, addedBy: f,
          sets: Array.from({ length: a.sets }, () => ({ r: a.r ?? '', w: '', t: a.t ?? '', done: false })),
        }));
        let idx = 0;
        sess.items.forEach((i, k) => { if (['warmup', 'core', 'prehab'].includes(exDef(i.ex).cat) && k === idx) idx = k + 1; });
        sess.items.splice(idx, 0, ...adds);
      } else {
        sess.items = sess.items.filter((i) => i.addedBy !== f || anyDone(i));
      }
    }
  }

  // ---------------------------------------------------------------- icons
  const IC = {
    today: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg>',
    history: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    plans: '<svg viewBox="0 0 24 24"><rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M8 8.5h8M8 12h8M8 15.5h5"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    dots: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    crest: '<svg viewBox="0 0 64 64"><path d="M32 4 8 12v18c0 15 10 25 24 30 14-5 24-15 24-30V12L32 4z" fill="#A51C30" stroke="#C9A227" stroke-width="3"/><path d="M19 26v12M45 26v12M15 29v6M49 29v6M19 32h26" stroke="#C9A227" stroke-width="4" stroke-linecap="round" fill="none"/></svg>',
  };

  // ---------------------------------------------------------------- routing
  let tab = 'today', sub = null; // sub: {type:'tpl', id} for plans editor
  let plansSeg = 'templates';
  const views = { today: renderToday, history: renderHistory, plans: renderPlans, settings: renderSettings };
  function go(t) { tab = t; sub = null; render(true); window.scrollTo({ top: 0 }); }
  function render(animate) {
    const v = $('#view');
    v.innerHTML = views[tab]();
    if (animate) { v.style.animation = 'none'; void v.offsetWidth; v.style.animation = ''; }
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  }
  function keepScroll(fn) { const y = window.scrollY; fn(); window.scrollTo(0, y); }

  // ---------------------------------------------------------------- TODAY
  function progress(sess) {
    let total = 0, done = 0;
    sess.items.filter((i) => !i.removedBy).forEach((i) => { total += i.sets.length; done += i.sets.filter((s) => s.done).length; });
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }
  function heroHTML(sess) {
    const p = progress(sess);
    const sug = suggestedTpl();
    const now = new Date();
    const el = sess.started ? fmtClock((Date.now() - sess.started) / 1000) : null;
    return `<div class="hero" id="hero">
      <div class="crest">${IC.crest}</div>
      <div class="eyebrow">${esc(now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }))}</div>
      <div class="title-row"><h1>${esc(sess.name)}</h1></div>
      <div class="sub">${esc(sess.subtitle)}${sess.tplId === sug.id ? ' · <span style="color:var(--gold)">Next in rotation</span>' : ''}</div>
      <div class="row" style="margin-top:14px;flex:none">
        <button class="chip" data-a="pick" style="flex:none">⇆ Change workout</button>
        <button class="chip ${S.settings.restOn ? 'gold' : ''}" data-a="toggle-rest" style="flex:none">⏱ Rest ${S.settings.restOn ? 'on' : 'off'}</button>
      </div>
      <div class="prog"><div class="bar"><i style="width:${p.pct}%"></i></div><span id="prog-txt">${p.done}/${p.total} sets${el ? ` · <span id="elapsed">${el}</span>` : ''}</span></div>
    </div>`;
  }
  function flareHTML(sess) {
    const on = sess.flags.back || sess.flags.shoulder;
    const swaps = sess.items.filter((i) => i.swap && !i.removedBy);
    const removed = sess.items.filter((i) => i.removedBy);
    const added = sess.items.filter((i) => i.addedBy);
    let list = '';
    if (on) {
      list = '<ul class="swaplist">' +
        swaps.map((i) => `<li><i>⇄</i><span>${esc(exDef(i.swap.from).name)} → <b>${esc(exDef(i.ex).name)}</b></span></li>`).join('') +
        removed.map((i) => `<li><i class="x">✕</i><span>Dropped ${esc(exDef((i.orig || i).ex).name)} <span style="color:var(--muted)">(${FLAG_LABEL[i.removedBy]})</span></span></li>`).join('') +
        added.map((i) => `<li><i style="color:var(--green)">+</i><span>Added ${esc(exDef(i.ex).name)}</span></li>`).join('') +
        sess.items.filter((i) => i.steps && !i.removedBy).flatMap((i) => i.steps.map((st) => [blockOf(i).title, st])).filter(([, st]) => ['shoulder', 'back'].some((f) => sess.flags[f] && st.flare?.[f])).map(([bt, st]) => { const v = stepView(st, sess.flags); return `<li><i style="color:var(--gold)">~</i><span>${esc(bt)}: ${v.title !== st.title ? `${esc(st.title)} → <b>${esc(v.title)}</b>` : `${esc(st.title)} <span style="color:var(--muted)">(${v.optional ? 'optional, gentler' : 'gentler'})</span>`}</span></li>`; }).join('') +
        (!swaps.length && !removed.length && !added.length ? '<li><i>✓</i><span>Nothing in today\'s plan needs swapping.</span></li>' : '') +
        '</ul>';
    }
    return `<section class="flare ${on ? 'active' : ''}">
      <div class="flare-h"><b>Back or shoulder flaring up?</b><small>${on ? `${swaps.length} swapped · ${removed.length} dropped` : 'Tap to adapt'}</small></div>
      <div class="toggles">
        <button class="tog ${sess.flags.back ? 'on' : ''}" data-a="flag" data-flag="back"><span class="dot"></span>Back</button>
        <button class="tog ${sess.flags.shoulder ? 'on' : ''}" data-a="flag" data-flag="shoulder"><span class="dot"></span>R Shoulder</button>
      </div>${list}
    </section>`;
  }
  function stepperHTML(f, val, ph, belt) {
    const label = { r: 'reps', w: belt ? '+lb belt' : 'lb', t: 'time' }[f];
    const shown = f === 't' ? (val === '' ? '' : fmtClock(val)) : val;
    return `<div class="stp" data-f="${f}"><button data-a="dec" aria-label="minus ${label}">−</button><label><input data-a="inp" value="${esc(shown)}" placeholder="${ph ?? '–'}" inputmode="${f === 't' ? 'text' : f === 'w' ? 'decimal' : 'numeric'}" enterkeyhint="done"><span>${label}</span></label><button data-a="inc" aria-label="plus ${label}">+</button></div>`;
  }
  function setRowsHTML(it, ctx) {
    const d = exDef(it.ex);
    const fl = d.fields.split('').filter((f) => 'rwt'.includes(f)).sort((a, b) => 'trw'.indexOf(a) - 'trw'.indexOf(b));
    return it.sets.map((s, i) => `<div class="set ${s.done ? 'done' : ''}" data-i="${i}">
      ${ctx === 'tpl' ? `<div class="chk" style="cursor:default">${i + 1}</div>` : `<button class="chk" data-a="done" aria-label="Set ${i + 1} done">${s.done ? IC.check : i + 1}</button>`}
      <div class="fields f${fl.length}">${fl.map((f) => stepperHTML(f, s[f], undefined, d.belt)).join('')}</div>
    </div>`).join('');
  }
  function cardHTML(it, ctx = 'sess') {
    const d = exDef(it.ex);
    const complete = ctx === 'sess' && it.sets.length && it.sets.every((s) => s.done);
    const last = ctx === 'sess' ? lastFor(it.ex) : null;
    const menu = `<button class="icon-btn" data-a="menu" aria-label="Options">${IC.dots}</button>`;
    if (it.steps) return warmupHTML(it, ctx, menu);
    if (d.fields === 'c') {
      return `<article class="card mini ${complete ? 'complete' : ''}" data-uid="${it.uid}" data-ctx="${ctx}">
        ${ctx === 'sess' ? `<button class="chk ${complete ? 'on' : ''}" data-a="check">${complete ? IC.check : ''}</button>` : ''}
        <div class="grow"><div class="tag ${d.cat}">${CAT_LABEL[d.cat] || d.cat}</div><h3>${esc(nameOf(it))}</h3>${it.note ? `<div class="meta"><div class="note">${esc(it.note)}</div></div>` : ''}</div>${menu}
      </article>`;
    }
    let total = '';
    if (it.target && has(d.fields, 't')) {
      const sum = it.sets.reduce((a, s) => a + (+s.t || 0), 0);
      total = `<div class="total"><div class="bar"><i style="width:${Math.min(100, (sum / it.target) * 100)}%"></i></div><span>${fmtClock(sum)} / ${fmtClock(it.target)} total</span></div>`;
    }
    const meta = [
      it.swap ? `<span class="badge">⇄ Swapped from ${esc(exDef(it.swap.from).name)} · ${FLAG_LABEL[it.swap.reason]}</span>` : '',
      it.addedBy ? `<span class="badge gold">+ Prehab for ${FLAG_LABEL[it.addedBy]}</span>` : '',
      it.group && ctx === 'tpl' ? `<span class="badge gray">Group: ${esc(it.group)}</span>` : '',
      it.note ? `<div class="note">${esc(it.note)}</div>` : '',
      ctx === 'sess' && !has(d.fields, 'c') ? `<button class="rest-meta" data-a="rest-target-item">⏱ Rest ${targetFor(it) ? fmtClock(targetFor(it)) : '—'}${it.sets.some((s) => s.rest != null) ? ` · actual ${it.sets.filter((s) => s.rest != null).map((s) => fmtClock(s.rest)).join(', ')}` : ''}</button>` : '',
      last ? `<div class="last">Last <b>${dateLbl(last.date)}</b> · ${esc(fmtSets(last.sets, d.fields, d.belt))}</div>` : (ctx === 'sess' ? '<div class="last">No history yet</div>' : ''),
    ].filter(Boolean).join('');
    return `<article class="card ${complete ? 'complete' : ''}" data-uid="${it.uid}" data-ctx="${ctx}">
      <div class="card-h"><div style="flex:1;min-width:0"><div class="tag ${d.cat}">${CAT_LABEL[d.cat] || d.cat}${complete ? ' · <span style="color:var(--gold)">Done</span>' : ''}</div>${ctx === 'tpl' ? `<input class="tname" data-a="tname" value="${esc(nameOf(it))}" aria-label="Exercise name" enterkeyhint="done">` : `<h3>${esc(nameOf(it))}</h3>`}</div>${menu}</div>
      ${meta ? `<div class="meta">${meta}</div>` : ''}${total}
      <div class="sets">${setRowsHTML(it, ctx)}</div>
      <div class="card-f"><div class="mini-stp"><button data-a="set-" aria-label="Remove set">−</button><b>${it.sets.length} set${it.sets.length === 1 ? '' : 's'}</b><button data-a="set+" aria-label="Add set">+</button></div>
      ${ctx === 'sess' ? `<button class="link" data-a="all-done">${complete ? 'Undo all' : 'All done ✓'}</button>` : ''}</div>
    </article>`;
  }
  // ---------------------------------------------------------------- STEP BLOCKS (warm-up, core)
  const wEdit = new Set(), wOpen = new Set();
  let wt = null; // running step timer {uid, sid, kind, start, end, buzz}
  const blockOf = (it) => { const B = SEED.BLOCKS[it.ex] || { title: exDef(it.ex).name, holdLabel: 'hold' }; const nm = it.name || S.renames?.[it.ex]; return nm ? { ...B, title: nm } : B; };
  const stepKey = (st) => st.key || String(st.id).replace(/_[a-z0-9]{4}$/, '');
  const settled = (st) => st.done || st.skipped;
  function stepHist(st) { // last + best logged value for a stopwatch step, from history
    const key = stepKey(st); let last = null, best = null;
    for (let i = S.history.length - 1; i >= 0; i--) {
      for (const it of S.history[i].items) for (const x of it.steps || []) {
        if (stepKey(x) !== key || !x.val) continue;
        if (last == null) last = { v: +x.val, d: S.history[i].started };
        if (best == null || +x.val > best) best = +x.val;
      }
    }
    return { last, best };
  }
  function stepView(st, flags) {
    let title = st.choices?.find((c) => c.id === st.choice)?.title || st.title, detail = st.detail || '', badge = '', optional = !!st.optional;
    const ds = [], bs = [];
    for (const f of ['shoulder', 'back']) {
      const o = flags?.[f] && st.flare?.[f];
      if (o) { if (o.title) title = o.title; if (o.detail) ds.push(o.detail); if (o.optional) optional = true; bs.push(f === 'back' ? 'Back-friendly' : 'Shoulder-friendly'); }
    }
    if (ds.length) detail = ds.join(' · ');
    const tags = [optional ? '<span class="badge gray">Optional</span>' : '', bs.length ? `<span class="badge">${bs.join(' · ')}</span>` : ''].filter(Boolean).join('');
    if (tags) badge = `<div class="wtags">${tags}</div>`;
    return { title, detail, badge, optional };
  }
  function stepCtl(it, st, ctx) {
    if (!st.kind || st.kind === 'check' || st.kind === 'sets') return '';
    if (ctx !== 'sess') return `<span class="wtime static">⏱ ${st.kind === 'timer' ? fmtClock(st.dur) : esc(st.target || 'log')}</span>`;
    const run = wt && wt.uid === it.uid && wt.sid === st.id;
    if (run) {
      const v = wt.kind === 'timer' ? (wt.end - Date.now()) / 1000 : (Date.now() - wt.start) / 1000;
      return `<button class="wtime run" data-a="wtimer"><span class="wt-live">${fmtClock(wt.kind === 'timer' ? Math.ceil(Math.max(0, v)) : v)}</span><i>■</i></button>`;
    }
    if (st.kind === 'stopwatch' && st.val !== '' && st.val != null) {
      return `<div class="wval"><button data-a="wv" data-d="-5">−</button><b>${st.val}s</b><button data-a="wv" data-d="5">+</button></div>`;
    }
    return `<button class="wtime" data-a="wtimer">▶ ${st.kind === 'timer' ? fmtClock(st.dur) : 'Start'}</button>`;
  }
  function stepExtras(st, ctx) { // sets×reps steppers, stopwatch last/best, day tag, skip
    let x = '';
    if (st.choices) {
      x += `<div class="abseg">${st.choices.map((c) => `<button class="${st.choice === c.id ? 'on' : ''}" data-a="wchoice" data-c="${c.id}">${esc(c.label)}</button>`).join('')}</div>`;
    }
    const chW = st.choices?.find((c) => c.id === st.choice)?.weight;
    if (st.kind === 'sets') {
      x += `<div class="wsets">${chW ? `<div class="mini-stp"><button data-a="wsr" data-k="w" data-d="-1" aria-label="less weight">−</button><b>${st.w === '' || st.w == null ? '– lb' : st.w + ' lb'}</b><button data-a="wsr" data-k="w" data-d="1" aria-label="more weight">+</button></div>` : ''}<div class="mini-stp"><button data-a="wsr" data-k="sets" data-d="-1" aria-label="fewer sets">−</button><b>${st.sets || 0} sets</b><button data-a="wsr" data-k="sets" data-d="1" aria-label="more sets">+</button></div>
        <div class="mini-stp"><button data-a="wsr" data-k="reps" data-d="-1" aria-label="fewer reps">−</button><b>${st.reps || 0} reps</b><button data-a="wsr" data-k="reps" data-d="1" aria-label="more reps">+</button></div></div>`;
    }
    if (st.kind === 'stopwatch') {
      const h = stepHist(st);
      if (h.last) x += `<div class="wlast">Last <b>${h.last.v}s</b> (${dateLbl(h.last.d)}) · Best <b>${h.best}s</b></div>`;
      else if (ctx === 'sess' && !st.val) x += `<div class="wlast">No time logged yet</div>`;
    }
    const tags = [];
    if (st.days && ctx === 'tpl') tags.push(`<span class="badge gold">${st.days === 'lower' ? 'Lower days' : 'Upper days'}</span>`);
    if (tags.length) x += `<div class="wtags">${tags.join('')}</div>`;
    if (ctx === 'sess' && !st.done) x += `<button class="wskip" data-a="wskip">${st.skipped ? 'Skipped · undo' : 'Skip'}</button>`;
    return x;
  }
  function blockHTML(it, ctx, menu) {
    const B = blockOf(it);
    const steps = it.steps;
    const nDone = steps.filter((x) => x.done).length, nSkip = steps.filter((x) => x.skipped && !x.done).length, n = nDone + nSkip;
    const all = ctx === 'sess' && steps.length > 0 && n === steps.length;
    const editing = wEdit.has(it.uid);
    const open = !all || wOpen.has(it.uid) || editing;
    const flags = ctx === 'sess' ? session().flags : null;
    const hold = steps.find((x) => x.kind === 'stopwatch' && x.val);
    let body = '';
    if (!open) {
      body = `<button class="wsum" data-a="wexpand"><span>✓ ${nDone} done${nSkip ? ` · ${nSkip} skipped` : ''}${hold ? ` · ${B.holdLabel} ${hold.val}s` : ''}</span><b>Show</b></button>`;
    } else {
      body = `<div class="wsteps">${steps.map((st, i) => {
        if (editing) {
          return `<div class="wstep edit" data-sid="${st.id}"><div class="wchk sm">${i + 1}</div>
            <input class="wtitle" data-a="wtitle" value="${esc(st.title)}" aria-label="Step ${i + 1}">
            <div class="wedit-btns"><button data-a="wmv" data-d="-1" aria-label="Move up">↑</button><button data-a="wmv" data-d="1" aria-label="Move down">↓</button><button data-a="wdel" class="del" aria-label="Remove">✕</button></div></div>`;
        }
        const v = stepView(st, flags);
        const chk = st.done ? IC.check : st.skipped ? '–' : i + 1;
        return `<div class="wstep ${st.done ? 'done' : ''} ${st.skipped && !st.done ? 'skipped' : ''} ${v.optional ? 'opt' : ''}" data-sid="${st.id}">
          ${ctx === 'sess' ? `<button class="wchk" data-a="wstep" aria-label="Step ${i + 1}">${chk}</button>` : `<div class="wchk">${i + 1}</div>`}
          <div class="wtxt" ${ctx === 'sess' ? 'data-a="wstep"' : ''}><b>${esc(v.title)}</b>${v.detail ? `<small>${esc(v.detail)}</small>` : ''}${v.badge}${stepExtras(st, ctx)}</div>
          ${stepCtl(it, st, ctx)}</div>`;
      }).join('')}</div>`;
      if (editing) {
        body += `<div class="wadd"><input id="wadd-t" placeholder="New step…" enterkeyhint="done"><input id="wadd-s" placeholder="sec" inputmode="numeric" aria-label="Timer seconds (optional)"><button data-a="wadd">Add</button></div>
          <div class="row" style="margin-top:10px"><button class="btn sm dark" data-a="wreset">Reset to default steps</button><button class="btn sm gold" data-a="wedit">Done editing</button></div>`;
      } else if (all) body += `<button class="link" data-a="wexpand" style="margin-top:4px">Collapse</button>`;
    }
    const cat = exDef(it.ex).cat;
    return `<article class="card warm ${all ? 'complete' : ''}" data-uid="${it.uid}" data-ctx="${ctx}">
      <div class="card-h"><div><div class="tag ${cat}">${esc(B.title)} · ${n}/${steps.length}${nSkip ? ` <span style="color:var(--muted)">(${nSkip} skipped)</span>` : ''}${all ? ' · <span style="color:var(--gold)">Done</span>' : ''}</div><h3>${esc(B.title)}</h3></div>
      <div style="display:flex;gap:2px"><button class="icon-btn" data-a="wedit" aria-label="Edit steps" style="font-size:17px">${editing ? '✓' : '✎'}</button>${menu}</div></div>
      ${ctx === 'sess' ? `<div class="bar" style="margin-top:10px"><i style="width:${steps.length ? (n / steps.length) * 100 : 0}%"></i></div>` : ''}
      ${body}</article>`;
  }
  const warmupHTML = blockHTML;
  function wSync(it, ctx, justCompleted) {
    if (ctx !== 'sess') return;
    const all = it.steps.length > 0 && it.steps.every(settled);
    it.sets[0].done = all;
    if (it.steps.some((x) => x.done) && !session().started) session().started = Date.now();
    if (all && justCompleted) { wOpen.delete(it.uid); if (navigator.vibrate) navigator.vibrate([20, 60, 20]); toast(`${blockOf(it).title} done 🔥`); advance(it.uid); }
  }
  const allSettled = (it) => it.steps.length > 0 && it.steps.every(settled);
  function wTick() {
    if (!wt) return;
    const el = document.querySelector(`[data-uid="${wt.uid}"] [data-sid="${wt.sid}"] .wt-live`);
    if (wt.kind === 'timer') {
      const left = (wt.end - Date.now()) / 1000;
      if (el) el.textContent = fmtClock(Math.ceil(Math.max(0, left)));
      if (left <= 0) {
        const it = findItem(wt.uid, 'sess'); const st = it?.steps.find((x) => x.id === wt.sid);
        wt = null; if (navigator.vibrate) navigator.vibrate([250, 120, 250]); beep();
        if (st) { const was = allSettled(it); st.done = true; st.skipped = false; wSync(it, 'sess', !was && allSettled(it)); save(); refreshCard(it.uid, 'sess'); refreshHero(); }
      }
    } else {
      const sec = (Date.now() - wt.start) / 1000;
      if (el) el.textContent = fmtClock(sec);
      for (const m of [30, 60]) if (sec >= m && !wt.buzz[m]) { wt.buzz[m] = 1; if (navigator.vibrate) navigator.vibrate(150); beep(); }
    }
  }
  setInterval(wTick, 250);
  function groupLabel(g) { return /finisher/i.test(g) ? `Finisher <small>circuit — move through, minimal rest</small>` : /^[A-Z]$/.test(g) ? `Superset ${esc(g)} <small>alternate sets</small>` : `${esc(g)} <small>paired</small>`; }
  function itemsHTML(items, ctx) {
    let out = '', i = 0;
    while (i < items.length) {
      const it = items[i];
      if (it.group) {
        let j = i; const grp = [];
        while (j < items.length && items[j].group === it.group) grp.push(items[j++]);
        out += `<div class="group"><div class="group-h">${groupLabel(it.group)}</div>${grp.map((g) => cardHTML(g, ctx)).join('')}</div>`;
        i = j;
      } else { out += cardHTML(it, ctx); i++; }
    }
    return out;
  }
  function renderToday() {
    const sess = session();
    const vis = sess.items.filter((i) => !i.removedBy);
    return heroHTML(sess) + flareHTML(sess) + itemsHTML(vis, 'sess') +
      `<div class="stack"><button class="btn ghost" data-a="add-ex">+ Add exercise</button>
       <button class="btn primary" data-a="finish">Finish &amp; save workout</button>
       <button class="btn sm dark" data-a="reset-session" style="height:44px">Reset today's session</button></div>`;
  }
  function refreshHero() { const sess = S.session; if (!sess || tab !== 'today') return; const h = $('#hero'); if (h) h.outerHTML = heroHTML(sess); }
  function refreshCard(uidv, ctx) {
    const el = document.querySelector(`[data-uid="${uidv}"]`);
    const it = findItem(uidv, ctx);
    if (el && it) el.outerHTML = cardHTML(it, ctx);
  }

  // ---------------------------------------------------------------- item lookup (session or template editor)
  function itemsFor(ctx) { return ctx === 'tpl' ? tplById(sub.id).items : session().items; }
  function findItem(u, ctx) { return itemsFor(ctx).find((i) => i.uid === u); }

  function stepVal(it, i, f, dir) {
    const s = it.sets[i];
    const step = f === 'w' ? S.settings.wStep : f === 't' ? S.settings.tStep : 1;
    let cur = s[f];
    if (cur === '' || cur == null) {
      const prev = it.sets.slice(0, i).reverse().find((x) => x[f] !== '' && x[f] != null);
      if (prev) { s[f] = prev[f]; return; }
      if (f === 'w') { const l = lastFor(it.ex); const lw = l && l.sets.find((x) => x.w !== ''); if (lw) { s[f] = lw.w; return; } }
      cur = 0;
    }
    let v = +cur + dir * step;
    if (f === 'w') v = Math.round(v * 10) / 10;
    s[f] = Math.max(0, v);
  }

  // ---------------------------------------------------------------- rest stopwatch (counts UP; timestamp-based, persisted in session)
  let restIv = null, audioCtx = null;
  const R = () => S.session?.rest || null;
  const restElapsed = (r) => (r ? Math.max(0, ((r.pausedAt || Date.now()) - r.start - (r.pausedTotal || 0)) / 1000) : 0);
  const targetFor = (it) => (it && it.rest !== undefined && it.rest !== null && it.rest !== '' ? +it.rest : +S.settings.rest || 0);
  function logRest() { // write actual rest onto the set it followed
    const r = R(); if (!r) return;
    const s = S.session.items.find((i) => i.uid === r.uid)?.sets[r.si];
    const e = Math.round(restElapsed(r));
    if (s && s.done && e >= 3) s.rest = e; // ignore accidental instant dismissals
  }
  function startRest(it, si) {
    if (!S.session) return;
    logRest();
    S.session.rest = { start: Date.now(), pausedAt: null, pausedTotal: 0, uid: it.uid, si, target: targetFor(it), near: false, hit: false };
    save(); showRest();
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  function stopRest(log = true) { if (log) logRest(); if (S.session && S.session.rest) { S.session.rest = null; save(); } hideRest(); }
  function cancelRestFor(u, si) { const r = R(); if (r && r.uid === u && r.si === si) { S.session.rest = null; save(); hideRest(); } }
  function showRest() { $('#rest').classList.add('show'); document.body.classList.add('resting'); clearInterval(restIv); restIv = setInterval(tickRest, 250); tickRest(); }
  function hideRest() { clearInterval(restIv); restIv = null; $('#rest').classList.remove('show', 'near', 'hit', 'paused'); document.body.classList.remove('resting'); }
  function tickRest() {
    const r = R(); if (!r) { hideRest(); return; }
    const e = restElapsed(r), T = +r.target || 0;
    const it = S.session.items.find((i) => i.uid === r.uid);
    $('#rest .t').textContent = fmtClock(e);
    $('#rest .tg').textContent = T ? `/ ${fmtClock(T)}` : '';
    $('#rest .ex').textContent = it ? `${nameOf(it)} · set ${r.si + 1}` : 'Rest';
    $('#rest .rfill').style.width = T ? `${Math.min(100, (e / T) * 100)}%` : '0%';
    const hit = T > 0 && e >= T, near = T > 0 && !hit && e >= T - Math.min(15, T * 0.25);
    const el = $('#rest'); el.classList.toggle('near', near); el.classList.toggle('hit', hit); el.classList.toggle('paused', !!r.pausedAt);
    $('#rest .pp').innerHTML = r.pausedAt ? '▶' : '❚❚';
    if (near && !r.near) { r.near = true; save(); if (S.settings.restAlert !== false && !document.hidden && navigator.vibrate) navigator.vibrate(60); }
    if (hit && !r.hit) { r.hit = true; save(); if (S.settings.restAlert !== false && !r.pausedAt) { if (navigator.vibrate) navigator.vibrate([300, 120, 300]); beep(); } }
  }
  function restTargetSheet(u) {
    const it = S.session?.items.find((i) => i.uid === u); if (!it) return;
    sheetCtx = { type: 'rtarget', u, val: targetFor(it) };
    const v = sheetCtx.val;
    openSheet(`<div class="sheet-h"><h3>Target rest</h3><p>${esc(exDef(it.ex).name)}</p></div><div class="sheet-b">
      <div class="setting"><div class="grow"><b id="rt-val">${v ? fmtClock(v) : 'No target'}</b><small>Bar turns gold near it, crimson + buzz at it</small></div>
      <div class="mini-stp"><button data-a="rt-step" data-d="-15">−</button><b>15s</b><button data-a="rt-step" data-d="15">+</button></div></div>
      <div class="cats" style="margin-top:6px">${[0, 60, 90, 120, 150, 180, 240].map((x) => `<button data-a="rt-set" data-v="${x}">${x ? fmtClock(x) : 'None'}</button>`).join('')}</div>
      <div class="stack"><button class="btn primary" data-a="rt-save">Save for this exercise</button><button class="btn dark" data-a="rt-default">Make default for all (${fmtClock(S.settings.rest || 0)} now)</button></div></div>`, sheetCtx);
  }
  function beep() {
    try { const ctx = audioCtx; if (!ctx) return; [0, 0.25].forEach((d) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.0001, ctx.currentTime + d); g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d + 0.2); o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.22); }); } catch (e) {}
  }
  // elapsed clock tick even without rest timer
  setInterval(() => { const el = $('#elapsed'); if (el && S.session?.started) el.textContent = fmtClock((Date.now() - S.session.started) / 1000); }, 1000);

  // ---------------------------------------------------------------- sheets / toast / confirm
  let sheetCtx = null;
  function openSheet(html, ctx) { sheetCtx = ctx || null; $('#sheet').innerHTML = `<div class="grab"></div>${html}`; $('#sheet-wrap').classList.add('open'); }
  function closeSheet() { $('#sheet-wrap').classList.remove('open'); sheetCtx = null; }
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }
  function ask(title, msg, ok = 'Confirm', danger = true) {
    return new Promise((res) => {
      openSheet(`<div class="sheet-h"><h3>${esc(title)}</h3><p>${esc(msg)}</p></div><div class="sheet-b"><div class="stack" style="margin-top:4px">
        <button class="btn ${danger ? 'primary' : 'gold'}" data-a="ask-ok">${esc(ok)}</button><button class="btn dark" data-a="ask-no">Cancel</button></div></div>`, { type: 'ask', res });
    });
  }

  function pickerSheet() {
    const sug = suggestedTpl(); const cur = session();
    const rot = rotation(); const others = S.templates.filter((t) => !(t.rotation > 0));
    const opt = (t) => `<button class="opt ${cur.tplId === t.id ? 'sel' : ''}" data-a="pick-tpl" data-id="${t.id}">
      <span class="num">${t.rotation > 0 ? t.rotation : '•'}</span><span class="grow"><b>${esc(t.name)}${t.id === sug.id ? ' <span class="badge gold" style="margin-left:6px;font-size:10px;padding:2px 7px">NEXT</span>' : ''}</b><small>${esc(t.subtitle || '')} · ${t.items.length} items</small></span></button>`;
    openSheet(`<div class="sheet-h"><h3>Choose workout</h3><p>Rotation: ${rot.map((t) => esc(t.name)).join(' → ')}</p></div>
      <div class="sheet-b">${rot.map(opt).join('')}${others.length ? `<div class="month">Other templates</div>${others.map(opt).join('')}` : ''}</div>`);
  }

  let libQuery = '', libCat = 'all';
  function libSheet(mode, target) {
    // mode: 'add' (session), 'replace' (session item), 'tpl-add', 'tpl-replace'
    sheetCtx = { type: 'lib', mode, target };
    openSheet(`<div class="sheet-h"><h3>${mode.includes('replace') ? 'Swap exercise' : 'Add exercise'}</h3><p>Search the library or create your own.</p></div>
      <div class="sheet-b"><div class="search"><input id="lib-q" placeholder="Search exercises…" value="${esc(libQuery)}" autocomplete="off">
      <div class="cats">${['all', 'prehab', 'core', 'plyo', 'strength', 'iso', 'accessory', 'warmup'].map((c) => `<button data-a="lib-cat" data-cat="${c}" class="${libCat === c ? 'on' : ''}">${c === 'all' ? 'All' : CAT_LABEL[c]}</button>`).join('')}</div></div>
      <div id="lib-list">${libListHTML()}</div></div>`, sheetCtx);
  }
  function libListHTML() {
    const q = libQuery.trim().toLowerCase();
    const items = Object.values(lib()).filter((e) => (libCat === 'all' || e.cat === libCat) && (!q || [e.name, ...(S.aliases?.[e.id] || []), e.origName || ''].join(' ').toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
    const swapInfo = (e) => { const s = []; if (e.swaps?.back) s.push(`back → <em>${e.swaps.back === 'remove' ? 'drop' : esc(exDef([].concat(e.swaps.back)[0]).name)}</em>`); if (e.swaps?.shoulder) s.push(`shoulder → <em>${e.swaps.shoulder === 'remove' ? 'drop' : esc(exDef([].concat(e.swaps.shoulder)[0]).name)}</em>`); return s.length ? `<div class="lib-swap">${s.join(' · ')}</div>` : ''; };
    let html = items.map((e) => `<button class="opt" data-a="lib-pick" data-id="${e.id}"><span class="grow"><div class="tag ${e.cat}">${CAT_LABEL[e.cat]}</div><b style="font-size:15px">${esc(e.name)}</b>${swapInfo(e)}</span><span class="chev">+</span></button>`).join('');
    if (q && !items.some((e) => e.name.toLowerCase() === q)) html = `<button class="opt" data-a="lib-new" style="border-style:dashed"><span class="grow"><b style="font-size:15px;color:var(--gold)">+ Create “${esc(libQuery.trim())}”</b><small>New custom exercise</small></span></button>` + html;
    return html || '<div class="empty">No matches</div>';
  }
  function newExSheet(name) {
    sheetCtx = { ...sheetCtx, type: 'newex' };
    openSheet(`<div class="sheet-h"><h3>New exercise</h3></div><div class="sheet-b">
      <label class="field"><span>Name</span><input id="nx-name" value="${esc(name)}"></label>
      <label class="field"><span>Tracks</span><select id="nx-fields"><option value="rw">Reps + weight</option><option value="r">Reps only</option><option value="t">Time (hold)</option><option value="tw">Time + weight</option><option value="tr">Time + reps</option><option value="c">Just a checkbox</option></select></label>
      <label class="field"><span>Category</span><select id="nx-cat">${Object.entries(CAT_LABEL).map(([k, v]) => `<option value="${k}" ${k === 'strength' ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div class="stack"><button class="btn primary" data-a="nx-save">Create &amp; add</button></div></div>`, sheetCtx);
  }
  function addItemFromLib(exId, mode, target) {
    const d = exDef(exId);
    const sets = d.fields === 'c' ? 1 : 3;
    const item = { uid: uid(), ex: exId, group: '', note: '', target: 0, sets: Array.from({ length: sets }, () => ({ r: '', w: '', t: '', done: false })) };
    if (SEED.BLOCKS[exId]) item.steps = mode.startsWith('tpl') ? defaultSteps(exId) : sessSteps(defaultSteps(exId), tplById(session().tplId)?.focus);
    const last = lastFor(exId);
    if (last && d.fields !== 'c') item.sets = last.sets.map((s) => ({ r: s.r, w: s.w, t: s.t, done: false }));
    if (mode === 'add' || mode === 'tpl-add') {
      if (mode === 'tpl-add') item.sets.forEach((s) => delete s.done);
      itemsFor(mode === 'tpl-add' ? 'tpl' : 'sess').push(item);
    } else {
      const items = itemsFor(mode === 'tpl-replace' ? 'tpl' : 'sess');
      const idx = items.findIndex((i) => i.uid === target);
      if (idx >= 0) { const old = items[idx]; item.group = old.group; item.sets = old.sets.map((s) => ({ r: has(d.fields, 'r') ? s.r : '', w: '', t: has(d.fields, 't') ? s.t : '', ...(mode === 'tpl-replace' ? {} : { done: false }) })); items[idx] = item; }
    }
    save(); closeSheet(); render(); toast(`${mode.includes('replace') ? 'Swapped in' : 'Added'} ${d.name}`);
    if (mode === 'add' || mode === 'tpl-add') setTimeout(() => document.querySelector(`[data-uid="${item.uid}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  function renameSheet(scope, ex, u, proposed) {
    // scope: 'sess' | 'tpl' | 'lib'
    const d = exDef(ex); const it = u ? findItem(u, scope) : null;
    const cur = it ? nameOf(it) : d.name;
    sheetCtx = { type: 'rename', scope, ex, u };
    openSheet(`<div class="sheet-h"><h3>Rename exercise</h3><p>${esc(cur)}${d.origName ? ` · originally “${esc(d.origName)}”` : ''}</p></div><div class="sheet-b">
      <label class="field"><span>New name</span><input id="rn-name" value="${esc(proposed ?? cur)}" autocomplete="off" enterkeyhint="done"></label>
      <p class="sub" style="margin-top:10px">History stays linked — past sessions, Last and Best follow this exercise and show the new name.</p>
      <div class="stack">${scope === 'lib' ? '' : `<button class="btn dark" data-a="rn-local">Just ${scope === 'tpl' ? 'this template' : 'today'}</button>`}
      <button class="btn primary" data-a="rn-global">${scope === 'lib' ? 'Save' : 'Everywhere'}</button>
      ${scope === 'lib' ? '' : `<small class="sub" style="text-align:center">Everywhere = all templates, the exercise library, flare swaps and history</small>`}
      ${d.origName ? `<button class="btn sm danger" data-a="rn-reset">Reset to “${esc(d.origName)}”</button>` : ''}</div></div>`, sheetCtx);
    setTimeout(() => { const i = $('#rn-name'); if (i) { i.focus(); i.select(); } }, 350);
  }
  function renameGlobal(ex, name) {
    S.renames = S.renames || {}; S.aliases = S.aliases || {};
    const orig = (SEED.library[ex] || S.customLib[ex] || {}).name;
    const old = exDef(ex).name;
    if (!name || name === orig) delete S.renames[ex]; else S.renames[ex] = name;
    if (old && old !== name) { const al = (S.aliases[ex] = S.aliases[ex] || []); if (!al.includes(old)) al.push(old); }
    // clear local overrides so it really is everywhere (templates + today's session); history keeps its id link
    S.templates.forEach((t) => t.items.forEach((i) => { if (i.ex === ex) delete i.name; }));
    S.session?.items.forEach((i) => { if (i.ex === ex) delete i.name; });
  }
  function itemMenu(u, ctx) {
    const items = itemsFor(ctx); const it = items.find((i) => i.uid === u); const d = exDef(it.ex);
    sheetCtx = { type: 'menu', u, ctx };
    openSheet(`<div class="sheet-h"><h3>${esc(nameOf(it))}</h3><p>${CAT_LABEL[d.cat]}${it.group ? ` · Group ${esc(it.group)}` : ''}</p></div><div class="sheet-b">
      <div class="row"><button class="opt" data-a="mv" data-d="-1" style="justify-content:center"><b>↑ Move up</b></button><button class="opt" data-a="mv" data-d="1" style="justify-content:center"><b>↓ Move down</b></button></div>
      <button class="opt" data-a="m-rename"><span class="grow"><b>✎ Rename</b><small>Just ${ctx === 'tpl' ? 'this template' : 'today'} or everywhere — history stays linked</small></span></button>
      <button class="opt" data-a="m-swap"><span class="grow"><b>⇄ Swap for another exercise</b><small>Pick from the library</small></span></button>
      ${it.orig ? `<button class="opt" data-a="m-restore"><span class="grow"><b>↺ Restore ${esc(exDef(it.orig.ex).name)}</b><small>Undo the flare-up swap for this one</small></span></button>` : ''}
      <label class="field"><span>Superset / group label</span><input id="m-group" value="${esc(it.group)}" placeholder="e.g. A, B, Finisher (blank = none)"></label>
      ${ctx === 'sess' && d.fields !== 'c' ? `<label class="field"><span>Target rest (m:ss, blank = default ${fmtClock(S.settings.rest || 0)})</span><input id="m-rest" inputmode="numeric" value="${it.rest != null && it.rest !== '' ? fmtClock(it.rest) : ''}"></label>` : ''}
      <label class="field"><span>Note</span><textarea id="m-note" placeholder="Cues, tempo, how it felt…">${esc(it.note)}</textarea></label>
      ${d.fields.includes('t') ? `<label class="field"><span>Accumulate target (total seconds, 0 = none)</span><input id="m-target" inputmode="numeric" value="${it.target || 0}"></label>` : ''}
      <div class="stack"><button class="btn gold" data-a="m-save">Save</button><button class="btn danger" data-a="m-remove">Remove from ${ctx === 'tpl' ? 'template' : "today's session"}</button></div></div>`, sheetCtx);
  }

  async function finishFlow() {
    const sess = session(); const p = progress(sess);
    if (!sess.items.some((i) => !i.removedBy && anyDone(i))) { toast('Mark at least one set done first'); return; }
    sheetCtx = { type: 'finish' };
    const t = tplById(sess.tplId);
    openSheet(`<div class="sheet-h"><h3>Finish workout</h3><p>${p.done} of ${p.total} sets done${sess.started ? ` · ${fmtClock((Date.now() - sess.started) / 1000)}` : ''}</p></div><div class="sheet-b">
      <label class="field"><span>Session note (optional)</span><textarea id="fin-note" placeholder="Energy, back/shoulder status, PRs…"></textarea></label>
      ${t ? `<div class="setting"><div class="grow"><b>Update ${esc(t.name)} defaults</b><small>Prefill next time with today's numbers (skips swapped moves)</small></div><button class="switch" id="fin-upd" data-a="sw"></button></div>` : ''}
      <div class="stack"><button class="btn primary" data-a="fin-ok">Save to history</button><button class="btn dark" data-a="close">Keep training</button></div></div>`, sheetCtx);
  }
  function commitFinish(note, updateTpl) {
    const sess = session();
    const rec = {
      id: sess.id, tplId: sess.tplId, name: sess.name, started: sess.started || Date.now(), finished: Date.now(), flags: { ...sess.flags }, note,
      items: sess.items.filter((i) => !i.removedBy && anyDone(i)).map((i) => ({ uid: i.uid, ex: i.ex, swapFrom: i.swap?.from || null, ...(i.name ? { name: i.name } : {}), sets: i.sets.map((s) => ({ ...s })), ...(i.steps ? { wsum: { done: i.steps.filter((x) => x.done).length, skipped: i.steps.filter((x) => x.skipped && !x.done).length, total: i.steps.length, hang: i.steps.find((x) => x.kind === 'stopwatch' && x.val)?.val || '', label: blockOf(i).holdLabel }, steps: i.steps.map((x) => ({ key: stepKey(x), title: x.title, done: !!x.done, skipped: !!x.skipped, val: x.val || '', ...(x.kind === 'sets' ? { sets: x.sets, reps: x.reps } : {}), ...(x.choices ? { choice: x.choice, w: x.w ?? '' } : {}) })) } : {}) })),
    };
    S.history.push(rec);
    const t = tplById(sess.tplId);
    if (updateTpl && t) {
      for (const it of sess.items) {
        if (it.swap || it.addedBy || it.removedBy || !anyDone(it)) continue;
        const ti = t.items.find((x) => x.ex === it.ex);
        if (ti && exDef(it.ex).fields !== 'c') ti.sets = it.sets.filter((s) => s.done).map((s) => ({ r: s.r, w: s.w, t: s.t }));
      }
    }
    stopRest(false); S.session = null; save(); closeSheet();
    go('history'); toast('Workout saved 💪');
  }

  // ---------------------------------------------------------------- HISTORY
  let openHist = null;
  function renderHistory() {
    const H = [...S.history].sort((a, b) => b.started - a.started);
    const now = new Date();
    const monthCount = H.filter((h) => { const d = new Date(h.started); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
    const wk = Date.now() - 7 * 864e5;
    const weekCount = H.filter((h) => h.started >= wk).length;
    const sets = H.reduce((a, h) => a + h.items.reduce((b, i) => b + i.sets.filter((s) => s.done).length, 0), 0);
    let out = `<div class="eyebrow">Training log</div><h1>History</h1>
      <div class="stats"><div class="stat"><b>${weekCount}</b><span>Last 7 days</span></div><div class="stat"><b>${monthCount}</b><span>This month</span></div><div class="stat"><b>${sets}</b><span>Total sets</span></div></div>`;
    if (!H.length) return out + '<div class="empty">No sessions yet. Finish a workout and it lands here.</div>';
    let lastMonth = '';
    for (const h of H) {
      const m = dateLbl(h.started, { month: 'long', year: 'numeric' });
      if (m !== lastMonth) { out += `<div class="month">${m}</div>`; lastMonth = m; }
      const nSets = h.items.reduce((b, i) => b + i.sets.filter((s) => s.done).length, 0);
      const dur = !h.imported && h.finished && h.started ? `${Math.round((h.finished - h.started) / 60000)} min · ` : '';
      const open = openHist === h.id;
      out += `<div class="hcard"><button data-a="hist" data-id="${h.id}">
        <div class="hdate"><small>${dateLbl(h.started, { weekday: 'short' })}</small><b>${new Date(h.started).getDate()}</b></div>
        <div class="grow"><div class="t1">${esc(h.name)}</div><div class="t2">${dur}${nSets} set${nSets === 1 ? '' : 's'} · ${h.items.length} exercise${h.items.length === 1 ? '' : 's'}</div>
        <div class="badges">${h.flags?.back ? '<span class="badge">Back flare</span>' : ''}${h.flags?.shoulder ? '<span class="badge">Shoulder flare</span>' : ''}${h.imported ? '<span class="badge gray">From your log</span>' : ''}</div></div>
        <span class="chev">${open ? '⌃' : '⌄'}</span></button>
        ${open ? `<div class="hbody">${h.items.map((i) => { const d = exDef(i.ex); return `<div class="hrow"><span>${esc(nameOf(i))}${i.swapFrom ? ' ⇄' : ''}</span><span>${esc(i.wsum ? `${i.wsum.done}/${i.wsum.total} steps${i.wsum.skipped ? ` (${i.wsum.skipped} skipped)` : ''}${i.wsum.hang ? ` · ${i.wsum.label || 'hang'} ${i.wsum.hang}s` : ''}` : fmtSets(i.sets.filter((s) => s.done), d.fields, d.belt))}</span></div>${i.sets.some((x) => x.rest != null) ? `<div class="hrest">rest ${i.sets.filter((x) => x.rest != null).map((x) => fmtClock(x.rest)).join(' · ')}</div>` : ''}`; }).join('')}
          ${h.note ? `<div class="hrow" style="margin-top:6px"><span style="color:var(--muted)">📝 ${esc(h.note)}</span></div>` : ''}
          <div class="row" style="margin-top:10px"><button class="btn sm dark" data-a="hist-repeat" data-id="${h.id}">Repeat this</button><button class="btn sm danger" data-a="hist-del" data-id="${h.id}">Delete</button></div></div>` : ''}
      </div>`;
    }
    return out;
  }

  // ---------------------------------------------------------------- PLANS
  function renderPlans() {
    if (sub?.type === 'tpl') return renderTplEditor();
    let out = `<div class="eyebrow">Programming</div><h1>Plans</h1>
      <div class="seg"><button class="${plansSeg === 'templates' ? 'on' : ''}" data-a="seg" data-seg="templates">Workouts</button><button class="${plansSeg === 'library' ? 'on' : ''}" data-a="seg" data-seg="library">Exercises</button><button class="${plansSeg === 'swaps' ? 'on' : ''}" data-a="seg" data-seg="swaps">Swaps</button></div>`;
    if (plansSeg === 'templates') {
      const rot = rotation(); const others = S.templates.filter((t) => !(t.rotation > 0));
      const card = (t) => `<button class="tcard" data-a="tpl-open" data-id="${t.id}"><span class="num ${t.rotation > 0 ? '' : 'off'}">${t.rotation > 0 ? t.rotation : '–'}</span><span class="grow"><b>${esc(t.name)}</b><small>${esc(t.subtitle || '')} · ${t.items.length} items</small></span><span class="chev">›</span></button>`;
      out += `<h2>Rotation</h2>${rot.map(card).join('')}<h2>Other templates</h2>${others.map(card).join('')}
        <div class="stack"><button class="btn ghost" data-a="tpl-new">+ New template</button></div>`;
    } else if (plansSeg === 'library') {
      out += `<div class="stack"><button class="btn ghost" data-a="lib-browse">Search / add custom exercise</button></div><p class="sub" style="margin-top:12px">Tap an exercise to rename it everywhere. History stays linked.</p>` +
        Object.entries(CAT_LABEL).map(([c, lbl]) => { const xs = Object.values(lib()).filter((e) => e.cat === c); return xs.length ? `<h2>${lbl}</h2>` + xs.map((e) => `<button class="setting" style="width:100%;text-align:left" data-a="lib-rename" data-id="${e.id}"><div class="grow"><b style="font-size:15px">${esc(e.name)}</b><small>${e.origName ? `was “${esc(e.origName)}” · ` : ''}${{ c: 'Checkbox', r: 'Reps', rw: 'Reps + weight', t: 'Time', tw: 'Time + weight', tr: 'Time + reps', trw: 'Time + reps + weight' }[e.fields] || e.fields}${S.customLib[e.id] ? ' · custom' : ''}</small></div><span class="chev">✎</span></button>`).join('') : ''; }).join('');
    } else {
      const rows = Object.values(lib()).filter((e) => e.swaps?.back || e.swaps?.shoulder);
      const nm = (r) => r === 'remove' ? '<span style="color:#ff7d8f">drop</span>' : [].concat(r).filter((x) => x !== 'remove').map((x) => esc(exDef(x).name)).join(' / ');
      out += `<p class="sub" style="margin-top:14px">What the flare-up toggles change. Added prehab — Back: McGill Big 3, cat-camel. R shoulder: band ER, pull-aparts, scap wall slides. Anything already logged in a session is never swapped.</p>` +
        rows.map((e) => `<div class="setting"><div class="grow"><b style="font-size:15px">${esc(e.name)}</b>
          ${e.swaps.back ? `<small style="display:block">Back → ${nm(e.swaps.back)}</small>` : ''}${e.swaps.shoulder ? `<small style="display:block">Shoulder → ${nm(e.swaps.shoulder)}</small>` : ''}</div></div>`).join('');
    }
    return out;
  }
  function renderTplEditor() {
    const t = tplById(sub.id);
    if (!t) { sub = null; return renderPlans(); }
    const maxRot = Math.max(4, ...S.templates.map((x) => x.rotation || 0)) + 1;
    return `<button class="back" data-a="tpl-back">‹ Plans</button>
      <div class="eyebrow" style="margin-top:6px">Edit template</div><h1>${esc(t.name)}</h1>
      <label class="field"><span>Name</span><input data-a="tpl-field" data-k="name" value="${esc(t.name)}"></label>
      <label class="field"><span>Subtitle</span><input data-a="tpl-field" data-k="subtitle" value="${esc(t.subtitle || '')}"></label>
      <label class="field"><span>Rotation slot</span><select data-a="tpl-field" data-k="rotation">${Array.from({ length: maxRot + 1 }, (_, i) => `<option value="${i}" ${(+t.rotation || 0) === i ? 'selected' : ''}>${i === 0 ? 'Not in rotation' : 'Slot ' + i}</option>`).join('')}</select></label>
      <h2>Exercises <small style="font-family:var(--sans);font-size:13px;color:var(--muted);font-weight:500">default sets · reps · weight</small></h2>
      ${itemsHTML(t.items, 'tpl')}
      <div class="stack"><button class="btn ghost" data-a="tpl-add">+ Add exercise</button>
      <button class="btn primary" data-a="tpl-start">Start this workout today</button>
      <div class="row"><button class="btn sm dark" data-a="tpl-dup">Duplicate</button><button class="btn sm danger" data-a="tpl-del">Delete</button></div></div>`;
  }

  // ---------------------------------------------------------------- SETTINGS
  function renderSettings() {
    const st = S.settings;
    return `<div class="eyebrow">Health Bot</div><h1>Settings</h1>
      <h2>Rest timer</h2>
      <div class="setting"><div class="grow"><b>Auto-start rest stopwatch</b><small>Counts up from each checked set; logs actual rest</small></div><button class="switch ${st.restOn ? 'on' : ''}" data-a="set-toggle" data-k="restOn"></button></div>
      <div class="setting"><div class="grow"><b>Default target rest</b><small>${st.rest ? fmtClock(st.rest) : 'No target'} · per-exercise targets override</small></div><div class="mini-stp"><button data-a="set-step" data-k="rest" data-d="-15">−</button><b>${st.rest ? fmtClock(st.rest) : 'off'}</b><button data-a="set-step" data-k="rest" data-d="15">+</button></div></div>
      <div class="setting"><div class="grow"><b>Buzz + beep at target</b><small>Gold near target, crimson when hit</small></div><button class="switch ${st.restAlert !== false ? 'on' : ''}" data-a="set-toggle" data-k="restAlert"></button></div>
      <h2>Steppers</h2>
      <div class="setting"><div class="grow"><b>Weight increment</b><small>lb per tap</small></div><div class="mini-stp"><button data-a="set-step" data-k="wStep" data-d="-2.5">−</button><b>${st.wStep} lb</b><button data-a="set-step" data-k="wStep" data-d="2.5">+</button></div></div>
      <div class="setting"><div class="grow"><b>Time increment</b><small>seconds per tap</small></div><div class="mini-stp"><button data-a="set-step" data-k="tStep" data-d="-1">−</button><b>${st.tStep}s</b><button data-a="set-step" data-k="tStep" data-d="1">+</button></div></div>
      <h2>Backup</h2>
      <p class="sub">Everything lives on this phone (localStorage). Export a backup now and then.</p>
      <div class="stack"><button class="btn gold" data-a="export">Export backup (.json)</button>
      <button class="btn dark" data-a="import">Import backup</button><input type="file" id="imp" accept="application/json,.json" class="hidden">
      <button class="btn danger" data-a="wipe">Reset app to original program</button></div>
      <div class="foot">Install: open in Safari → Share → <b>Add to Home Screen</b> (Android Chrome: ⋮ → Install app).<br>Works offline once installed.<br><span style="color:var(--gold)">Health Bot · v1.0</span></div>`;
  }
  function doExport() {
    const data = JSON.stringify({ app: 'healthbot', exported: new Date().toISOString(), state: S }, null, 1);
    const name = `healthbot-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([data], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'Health Bot backup' }).catch(() => {}); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    toast('Backup downloaded');
  }

  // ---------------------------------------------------------------- events
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    if (b.tagName === 'INPUT' || b.tagName === 'SELECT' || b.tagName === 'TEXTAREA') return;
    const a = b.dataset.a;
    const card = b.closest('[data-uid]'); const ctx = card?.dataset.ctx;
    const it = card ? findItem(card.dataset.uid, ctx) : null;
    const setEl = b.closest('[data-i]'); const si = setEl ? +setEl.dataset.i : -1;
    const f = b.closest('[data-f]')?.dataset.f;
    switch (a) {
      case 'tab': go(b.dataset.tab); break;
      case 'inc': case 'dec': stepVal(it, si, f, a === 'inc' ? 1 : -1); save(); refreshCard(it.uid, ctx); break;
      case 'done': {
        const s = it.sets[si]; s.done = !s.done; const sess = session();
        if (s.done && !sess.started) sess.started = Date.now();
        save(); refreshCard(it.uid, ctx); refreshHero();
        const row = document.querySelector(`[data-uid="${it.uid}"] [data-i="${si}"]`); if (row && s.done) row.classList.add('just');
        if (s.done) {
          if (navigator.vibrate) navigator.vibrate(12);
          if (S.settings.restOn) startRest(it, si);
          if (it.sets.every((x) => x.done)) advance(it.uid);
        } else cancelRestFor(it.uid, si);
        break;
      }
      case 'check': { const s = it.sets[0]; s.done = !s.done; if (s.done && !session().started) session().started = Date.now(); save(); refreshCard(it.uid, ctx); refreshHero(); const c = document.querySelector(`[data-uid="${it.uid}"] .chk`); if (s.done && c) { c.classList.add('just'); advance(it.uid); } break; }
      case 'all-done': { const all = it.sets.every((s) => s.done); it.sets.forEach((s) => (s.done = !all)); if (!all && !session().started) session().started = Date.now(); save(); refreshCard(it.uid, ctx); refreshHero(); if (!all) { if (S.settings.restOn) startRest(it, it.sets.length - 1); advance(it.uid); } break; }
      case 'set+': { const last = it.sets[it.sets.length - 1] || { r: '', w: '', t: '' }; const ns = { r: last.r, w: last.w, t: last.t }; if (ctx === 'sess') ns.done = false; it.sets.push(ns); save(); refreshCard(it.uid, ctx); refreshHero(); break; }
      case 'set-': if (it.sets.length > 1) { it.sets.pop(); save(); refreshCard(it.uid, ctx); refreshHero(); } break;
      case 'flag': {
        const sess = session(); const fl = b.dataset.flag; sess.flags[fl] = !sess.flags[fl]; applyFlags(sess); save();
        keepScroll(() => render());
        toast(sess.flags[fl] ? `Adapted for ${FLAG_LABEL[fl]} 🛡️` : `${FLAG_LABEL[fl][0].toUpperCase() + FLAG_LABEL[fl].slice(1)} back to normal plan`);
        break;
      }
      case 'pick': pickerSheet(); break;
      case 'pick-tpl': {
        const sess = session();
        if (sess.items.some(anyDone) && sess.tplId !== b.dataset.id) { if (!(await ask('Switch workout?', 'You have sets logged today. Switching discards them (finish & save first to keep them).', 'Switch & discard'))) return; }
        const flags = { ...sess.flags };
        S.session = newSession(b.dataset.id); S.session.flags = flags; applyFlags(S.session); save(); closeSheet(); go('today');
        break;
      }
      case 'toggle-rest': S.settings.restOn = !S.settings.restOn; save(); refreshHero(); if (!S.settings.restOn) stopRest(); toast(S.settings.restOn ? 'Rest stopwatch on' : 'Rest stopwatch off'); break;
      case 'rest-pp': { const r = R(); if (!r) break; if (r.pausedAt) { r.pausedTotal += Date.now() - r.pausedAt; r.pausedAt = null; } else r.pausedAt = Date.now(); save(); tickRest(); break; }
      case 'rest-reset': { const r = R(); if (!r) break; r.start = Date.now(); r.pausedTotal = 0; r.pausedAt = r.pausedAt ? Date.now() : null; r.near = false; r.hit = false; save(); tickRest(); break; }
      case 'rest-x': stopRest(); break;
      case 'rest-target': { const r = R(); if (r) restTargetSheet(r.uid); break; }
      case 'rest-target-item': restTargetSheet(it.uid); break;
      case 'rt-step': case 'rt-set': { sheetCtx.val = a === 'rt-set' ? +b.dataset.v : Math.max(0, Math.min(900, sheetCtx.val + +b.dataset.d)); $('#rt-val').textContent = sheetCtx.val ? fmtClock(sheetCtx.val) : 'No target'; break; }
      case 'rt-save': case 'rt-default': {
        const { u, val } = sheetCtx; const sess = session(); const x = sess.items.find((i) => i.uid === u);
        if (a === 'rt-default') { S.settings.rest = val; sess.items.forEach((i) => { if (i.rest === S.settings.rest) delete i.rest; }); }
        else if (x) { x.rest = val; const ti = tplById(sess.tplId)?.items.find((i) => i.ex === x.ex); if (ti) ti.rest = val; }
        const r = R(); if (r && (a === 'rt-default' ? !(x && x.rest !== undefined && r.uid === u) : r.uid === u)) { r.target = targetFor(sess.items.find((i) => i.uid === r.uid)); r.near = r.hit = restElapsed(r) >= r.target && r.target > 0; }
        save(); closeSheet(); keepScroll(() => render()); tickRest(); toast(a === 'rt-default' ? `Default rest ${val ? fmtClock(val) : 'off'}` : `Target rest ${val ? fmtClock(val) : 'off'}`); break;
      }
      case 'add-ex': libSheet('add'); break;
      case 'menu': itemMenu(it.uid, ctx); break;
      case 'finish': finishFlow(); break;
      case 'reset-session': if (await ask('Reset session?', "Clears today's checkmarks and edits and reloads the template.", 'Reset')) { stopRest(false); S.session = null; save(); render(); } break;
      // step blocks (warm-up, core)
      case 'wstep': {
        const st = it.steps.find((x) => x.id === b.closest('[data-sid]').dataset.sid); const was = allSettled(it);
        st.done = !st.done; st.skipped = false; if (wt && wt.sid === st.id) wt = null;
        wSync(it, ctx, !was && allSettled(it)); save(); refreshCard(it.uid, ctx); refreshHero();
        if (st.done) { const c = document.querySelector(`[data-uid="${it.uid}"] [data-sid="${st.id}"] .wchk`); c && c.classList.add('just'); if (navigator.vibrate) navigator.vibrate(10); }
        break;
      }
      case 'wskip': {
        const st = it.steps.find((x) => x.id === b.closest('[data-sid]').dataset.sid); const was = allSettled(it);
        st.skipped = !st.skipped; if (wt && wt.sid === st.id) wt = null;
        wSync(it, ctx, !was && allSettled(it)); save(); refreshCard(it.uid, ctx); refreshHero(); break;
      }
      case 'wchoice': { const st = it.steps.find((x) => x.id === b.closest('[data-sid]').dataset.sid); st.choice = b.dataset.c; save(); refreshCard(it.uid, ctx); break; }
      case 'wsr': { const st = it.steps.find((x) => x.id === b.closest('[data-sid]').dataset.sid); const k = b.dataset.k; if (k === 'w') { st.w = (st.w === '' || st.w == null) ? (+b.dataset.d > 0 ? S.settings.wStep : '') : Math.max(0, Math.round((+st.w + +b.dataset.d * S.settings.wStep) * 10) / 10); } else st[k] = Math.max(1, (+st[k] || 0) + +b.dataset.d); save(); refreshCard(it.uid, ctx); break; }
      case 'wtimer': {
        const sid = b.closest('[data-sid]').dataset.sid; const st = it.steps.find((x) => x.id === sid);
        try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (err) {}
        if (wt && wt.uid === it.uid && wt.sid === sid) { // stop
          if (wt.kind === 'stopwatch') { const was = allSettled(it); st.val = Math.round((Date.now() - wt.start) / 1000); st.done = true; st.skipped = false; wt = null; wSync(it, ctx, !was && allSettled(it)); }
          else wt = null;
        } else {
          wt = st.kind === 'timer' ? { uid: it.uid, sid, kind: 'timer', end: Date.now() + (st.dur || 60) * 1000 } : { uid: it.uid, sid, kind: 'stopwatch', start: Date.now(), buzz: {} };
          if (!session().started) session().started = Date.now();
        }
        save(); refreshCard(it.uid, ctx); refreshHero(); break;
      }
      case 'wv': { const st = it.steps.find((x) => x.id === b.closest('[data-sid]').dataset.sid); st.val = Math.max(0, (+st.val || 0) + +b.dataset.d); save(); refreshCard(it.uid, ctx); break; }
      case 'wexpand': wOpen.has(it.uid) ? wOpen.delete(it.uid) : wOpen.add(it.uid); refreshCard(it.uid, ctx); break;
      case 'wedit': wEdit.has(it.uid) ? wEdit.delete(it.uid) : wEdit.add(it.uid); refreshCard(it.uid, ctx); break;
      case 'wmv': { const i = it.steps.findIndex((x) => x.id === b.closest('[data-sid]').dataset.sid); const j = i + +b.dataset.d; if (j < 0 || j >= it.steps.length) return; const [m] = it.steps.splice(i, 1); it.steps.splice(j, 0, m); save(); refreshCard(it.uid, ctx); break; }
      case 'wdel': { it.steps = it.steps.filter((x) => x.id !== b.closest('[data-sid]').dataset.sid); wSync(it, ctx, false); save(); refreshCard(it.uid, ctx); refreshHero(); break; }
      case 'wadd': {
        const t = card.querySelector('#wadd-t').value.trim(); if (!t) { card.querySelector('#wadd-t').focus(); return; }
        const sec = parseT(card.querySelector('#wadd-s').value);
        const st = { id: 'u_' + uid(), title: t, detail: '', kind: sec ? 'timer' : 'check', ...(sec ? { dur: sec, detail: fmtClock(sec) } : {}) };
        if (ctx === 'sess') Object.assign(st, { done: false, val: '' });
        it.steps.push(st); wSync(it, ctx, false); save(); refreshCard(it.uid, ctx); refreshHero(); document.querySelector(`[data-uid="${it.uid}"] #wadd-t`)?.focus(); break;
      }
      case 'wreset': if (await ask(`Reset ${blockOf(it).title.toLowerCase()} steps?`, `Restores the default ${blockOf(it).title.toLowerCase()} steps for this ${ctx === 'tpl' ? 'template' : 'session'}.`, 'Reset', false)) {
        it.steps = ctx === 'sess' ? sessSteps(defaultSteps(it.ex), tplById(session().tplId)?.focus) : defaultSteps(it.ex); wSync(it, ctx, false); save(); refreshCard(it.uid, ctx); refreshHero(); } break;
      // sheet internals
      case 'close': closeSheet(); break;
      case 'ask-ok': case 'ask-no': { const r = sheetCtx?.res; closeSheet(); r && r(a === 'ask-ok'); break; }
      case 'lib-cat': libCat = b.dataset.cat; document.querySelectorAll('.cats button').forEach((x) => x.classList.toggle('on', x.dataset.cat === libCat)); $('#lib-list').innerHTML = libListHTML(); break;
      case 'lib-pick': if (sheetCtx?.mode) addItemFromLib(b.dataset.id, sheetCtx.mode, sheetCtx.target); else closeSheet(); break;
      case 'lib-new': newExSheet(libQuery.trim()); break;
      case 'nx-save': {
        const name = $('#nx-name').value.trim(); if (!name) return;
        const id = 'c_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30) + '_' + uid().slice(0, 4);
        S.customLib[id] = { id, name, fields: $('#nx-fields').value, cat: $('#nx-cat').value, swaps: {} }; save();
        if (sheetCtx?.mode) addItemFromLib(id, sheetCtx.mode, sheetCtx.target); else { closeSheet(); render(); toast('Exercise created'); }
        libQuery = ''; break;
      }
      case 'mv': {
        const { u, ctx: c } = sheetCtx; const items = itemsFor(c); const i = items.findIndex((x) => x.uid === u); const j = i + +b.dataset.d;
        if (c === 'sess') { // skip hidden (removed) items
          let k = j; while (k >= 0 && k < items.length && items[k].removedBy) k += +b.dataset.d; if (k < 0 || k >= items.length) return;
          const [m] = items.splice(i, 1); items.splice(k, 0, m);
        } else { if (j < 0 || j >= items.length) return; const [m] = items.splice(i, 1); items.splice(j, 0, m); }
        save(); keepScroll(() => render()); document.querySelector(`[data-uid="${u}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); break;
      }
      case 'm-rename': { const { u, ctx: c } = sheetCtx; renameSheet(c, findItem(u, c).ex, u); break; }
      case 'lib-rename': renameSheet('lib', b.dataset.id, null); break;
      case 'rn-local': case 'rn-global': case 'rn-reset': {
        const { scope, ex, u } = sheetCtx; const name = a === 'rn-reset' ? (SEED.library[ex] || S.customLib[ex] || {}).name : $('#rn-name').value.trim();
        if (!name) { $('#rn-name').focus(); return; }
        if (a === 'rn-local') { const x = findItem(u, scope); if (name === exDef(ex).name) delete x.name; else x.name = name; }
        else renameGlobal(ex, name);
        save(); closeSheet(); keepScroll(() => render()); toast(a === 'rn-local' ? `Renamed ${scope === 'tpl' ? 'in this template' : 'for today'}` : `Renamed everywhere → ${name}`); break;
      }
      case 'm-swap': { const { u, ctx: c } = sheetCtx; libSheet(c === 'tpl' ? 'tpl-replace' : 'replace', u); break; }
      case 'm-restore': { const { u, ctx: c } = sheetCtx; const x = findItem(u, c); if (x?.orig) { x.ex = x.orig.ex; x.note = x.orig.note; x.sets = clone(x.orig.sets).map((s) => ({ ...s, done: false })); x.orig = null; x.swap = null; x.removedBy = null; save(); closeSheet(); keepScroll(() => render()); } break; }
      case 'm-save': { const { u, ctx: c } = sheetCtx; const x = findItem(u, c); const mr = $('#m-rest'); if (mr) { if (mr.value.trim() === '') delete x.rest; else x.rest = parseT(mr.value); } x.group = $('#m-group').value.trim(); x.note = $('#m-note').value.trim(); const tg = $('#m-target'); if (tg) x.target = parseT(tg.value) || 0; save(); closeSheet(); keepScroll(() => render()); break; }
      case 'm-remove': { const { u, ctx: c } = sheetCtx; if (c === 'tpl') { const t = tplById(sub.id); t.items = t.items.filter((x) => x.uid !== u); } else { S.session.items = S.session.items.filter((x) => x.uid !== u); } save(); closeSheet(); keepScroll(() => render()); toast('Removed'); break; }
      case 'sw': b.classList.toggle('on'); break;
      case 'fin-ok': commitFinish($('#fin-note').value.trim(), $('#fin-upd')?.classList.contains('on')); break;
      // history
      case 'hist': openHist = openHist === b.dataset.id ? null : b.dataset.id; keepScroll(() => render()); break;
      case 'hist-del': if (await ask('Delete session?', 'This removes it from history permanently.', 'Delete')) { S.history = S.history.filter((h) => h.id !== b.dataset.id); save(); render(); } break;
      case 'hist-repeat': {
        const h = S.history.find((x) => x.id === b.dataset.id);
        if (S.session?.items.some(anyDone) && !(await ask('Replace today?', 'You have sets logged today; they will be discarded.', 'Replace'))) return;
        S.session = { id: uid(), tplId: h.tplId, name: h.name, subtitle: 'Repeat of ' + dateLbl(h.started), created: Date.now(), started: null, finished: null, flags: { back: false, shoulder: false },
          items: h.items.map((i) => ({ uid: uid(), ex: i.ex, group: '', note: '', target: 0, sets: i.sets.map((s) => ({ r: s.r, w: s.w, t: s.t, done: false })), ...(SEED.BLOCKS[i.ex] ? { steps: sessSteps(tplById(h.tplId)?.items.find((x) => x.ex === i.ex && x.steps)?.steps || defaultSteps(i.ex), tplById(h.tplId)?.focus) } : {}) })) };
        save(); go('today'); break;
      }
      // plans
      case 'seg': plansSeg = b.dataset.seg; render(); break;
      case 'lib-browse': libSheet('browse'); sheetCtx.mode = null; break;
      case 'tpl-open': sub = { type: 'tpl', id: b.dataset.id }; render(true); window.scrollTo(0, 0); break;
      case 'tpl-back': sub = null; render(true); break;
      case 'tpl-add': libSheet('tpl-add'); break;
      case 'tpl-new': { const t = { id: 't_' + uid(), name: 'New workout', subtitle: '', focus: '', rotation: 0, items: [{ uid: uid(), ex: 'warmup', sets: [{ r: '', w: '', t: '' }], steps: defaultSteps('warmup') }, { uid: uid(), ex: 'core', sets: [{ r: '', w: '', t: '' }], steps: defaultSteps('core') }] }; S.templates.push(t); save(); sub = { type: 'tpl', id: t.id }; render(true); break; }
      case 'tpl-dup': { const t = clone(tplById(sub.id)); t.id = 't_' + uid(); t.name += ' (copy)'; t.rotation = 0; t.items.forEach((i) => (i.uid = uid())); S.templates.push(t); save(); sub = { type: 'tpl', id: t.id }; render(true); toast('Duplicated'); break; }
      case 'tpl-del': if (await ask('Delete template?', 'History stays; the template is removed.', 'Delete')) { S.templates = S.templates.filter((t) => t.id !== sub.id); save(); sub = null; render(true); } break;
      case 'tpl-start': {
        if (S.session?.items.some(anyDone) && !(await ask('Replace today?', 'You have sets logged today; they will be discarded.', 'Replace'))) return;
        S.session = newSession(sub.id); save(); go('today'); break;
      }
      // settings
      case 'set-toggle': S.settings[b.dataset.k] = !S.settings[b.dataset.k]; save(); render(); break;
      case 'set-step': { const k = b.dataset.k, d = +b.dataset.d; const lim = { rest: [0, 900], wStep: [2.5, 25], tStep: [1, 30] }[k]; S.settings[k] = Math.min(lim[1], Math.max(lim[0], S.settings[k] + d)); save(); render(); break; }
      case 'export': doExport(); break;
      case 'import': $('#imp').click(); break;
      case 'wipe': if (await ask('Reset everything?', 'Restores the original templates and imported log. Your logged sessions are deleted — export first!', 'Reset app')) { hideRest(); S = freshState(); save(); go('today'); } break;
    }
  });
  function advance(u) {
    // when an exercise is complete, glide to the next unfinished card
    setTimeout(() => {
      const cards = [...document.querySelectorAll('#view [data-uid][data-ctx="sess"]')];
      const i = cards.findIndex((c) => c.dataset.uid === u);
      const next = cards.slice(i + 1).find((c) => !c.classList.contains('complete'));
      if (next) next.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 260);
  }
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.a === 'inp') {
      const card = el.closest('[data-uid]'); const ctx = card.dataset.ctx; const it = findItem(card.dataset.uid, ctx);
      const i = +el.closest('[data-i]').dataset.i; const f = el.closest('[data-f]').dataset.f;
      const v = el.value.trim();
      it.sets[i][f] = v === '' ? '' : f === 't' ? parseT(v) : Math.max(0, +v.replace(',', '.') || 0);
      save(); refreshCard(it.uid, ctx);
    } else if (el.dataset.a === 'tname') {
      const card = el.closest('[data-uid]'); const it = findItem(card.dataset.uid, 'tpl'); const v = el.value.trim();
      if (!v) { el.value = nameOf(it); return; }
      if (v !== nameOf(it)) renameSheet('tpl', it.ex, it.uid, v);
    } else if (el.dataset.a === 'wtitle') {
      const card = el.closest('[data-uid]'); const it = findItem(card.dataset.uid, card.dataset.ctx);
      const st = it.steps.find((x) => x.id === el.closest('[data-sid]').dataset.sid); const v = el.value.trim();
      if (v && v !== st.title) { st.title = v; st.flare = null; st.detail = st.kind === 'timer' ? fmtClock(st.dur) : st.kind === 'stopwatch' ? st.detail : ''; save(); }
    } else if (el.dataset.a === 'tpl-field') {
      const t = tplById(sub.id); const k = el.dataset.k; t[k] = k === 'rotation' ? +el.value : el.value; save();
      if (k !== 'subtitle') render();
      if (S.session && S.session.tplId === t.id && !S.session.items.some(anyDone)) { S.session.name = t.name; S.session.subtitle = t.subtitle; save(); }
    } else if (el.id === 'imp') {
      const file = el.files[0]; if (!file) return;
      file.text().then(async (txt) => {
        try {
          const d = JSON.parse(txt); const st = d.state || d;
          if (!st.templates || !st.history) throw new Error('bad');
          if (!(await ask('Import backup?', `Replaces everything on this phone with the backup (${st.history.length} sessions, ${st.templates.length} templates).`, 'Import'))) return;
          S = st; S.v = 1; save(); go('today'); toast('Backup restored');
        } catch (err) { toast('That file is not a Health Bot backup'); }
        el.value = '';
      });
    }
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'lib-q') { libQuery = e.target.value; $('#lib-list').innerHTML = libListHTML(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset?.a === 'inp') e.target.blur(); if (e.key === 'Enter' && e.target.id === 'wadd-t') e.target.closest('[data-uid]').querySelector('[data-a="wadd"]').click(); if (e.key === 'Enter' && e.target.dataset?.a === 'wtitle') e.target.blur(); if (e.key === 'Enter' && e.target.dataset?.a === 'tname') e.target.blur(); if (e.key === 'Enter' && e.target.id === 'rn-name') $('[data-a="rn-global"]')?.click(); });
  document.addEventListener('focusin', (e) => { if (e.target.dataset?.a === 'inp') setTimeout(() => e.target.select(), 0); });
  $('#backdrop').addEventListener('click', () => { const r = sheetCtx?.res; closeSheet(); r && r(false); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && R()) showRest(); });

  // ---------------------------------------------------------------- boot
  $('#tabs .inner').innerHTML = [['today', 'Today'], ['history', 'History'], ['plans', 'Plans'], ['settings', 'Settings']].map(([k, l]) => `<button data-a="tab" data-tab="${k}">${IC[k]}<span>${l}</span></button>`).join('');
  $('#rest').innerHTML = `<i class="rfill"></i><button class="rmain" data-a="rest-pp" aria-label="Pause or resume rest"><span class="pp">❚❚</span><span class="rtime"><b class="t">0:00</b><span class="tg"></span></span><span class="ex"></span></button>
    <button class="rbtn" data-a="rest-target" aria-label="Target rest">🎯</button><button class="rbtn" data-a="rest-reset" aria-label="Reset rest">↺</button><button class="rbtn x" data-a="rest-x" aria-label="Dismiss rest">✕</button>`;
  if (R()) showRest();
  const qp = new URLSearchParams(location.search).get('tab'); if (qp && views[qp]) tab = qp;
  render(true);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const hadCtl = !!navigator.serviceWorker.controller; let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadCtl && !reloaded) { reloaded = true; location.reload(); } }); // pick up new version right away
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.HB = { get state() { return S; }, applyFlags, render };
})();
