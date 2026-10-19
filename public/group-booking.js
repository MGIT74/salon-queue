/* Reservation a plusieurs (un parent + ses enfants, des amis...) - module commun a rdv.html, compte.html et au mode salon.
 *
 * Parcours utilise par les pages : « Pour qui ? » (juste moi / plusieurs personnes) > « Qui vient ? », puis la page reprend la main
 * (cfg.onPeople) et refait la reservation normale pour chaque personne, avec un panier commun (cartHeld / cartPayload / cartRowsHtml).
 *
 * Ancien parcours guide (encore disponible sans onPeople) en 4 ecrans : « Pour qui ? » (juste moi / plusieurs personnes) > « Que fait chacun ? » (prestation, coiffeur,
 * supplements, personne par personne, avec « Meme chose que ... ») > « Quand venez-vous ? » (UNE date pour tout le groupe et des
 * horaires complets proposes : les uns apres les autres, ou en meme temps) > « On verifie ensemble ». L'heure de chacun peut
 * toujours etre choisie separement. Deux personnes ne se chevauchent jamais chez le meme coiffeur (parametre « held » cote serveur).
 *
 * Partie « logique » pure (testee sous Node) + partie interface (create). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GroupBooking = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var MAX_PEOPLE = 6;

  function toMin(t) { var p = String(t).split(':'); return Number(p[0]) * 60 + Number(p[1]); }
  function minToTime(m) { return (m < 600 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + (m % 60); }
  function pad(m) { var h = Math.floor(m / 60), mm = m % 60; return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm; }

  function byId(list, id) { for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i]; return null; }

  /** Duree (minutes) et prix (centimes) d'une personne : prestation + supplements choisis.
   *  services/extras : une liste, ou une fonction (personne -> liste) pour le tarif propre a SON coiffeur. */
  function personDuration(p, services, extras) {
    if (typeof services === 'function') { extras = extras(p); services = services(p); }
    var s = byId(services, p.serviceId), d = s ? Number(s.duration_min) || 0 : 0;
    (p.extraIds || []).forEach(function (id) { var e = byId(extras, id); if (e) d += Number(e.duration_min) || 0; });
    return d;
  }
  function personPrice(p, services, extras) {
    if (typeof services === 'function') { extras = extras(p); services = services(p); }
    var s = byId(services, p.serviceId), c = s ? Number(s.price_cents) || 0 : 0;
    (p.extraIds || []).forEach(function (id) { var e = byId(extras, id); if (e) c += Number(e.price_cents) || 0; });
    return c;
  }

  /** Creneaux deja retenus par les AUTRES personnes (meme jour que « date »), au format du parametre « held » du serveur. */
  function heldParam(people, index, date, services, extras) {
    var out = [];
    people.forEach(function (p, i) {
      if (i === index || !p.slot || p.date !== date) return;
      var d = personDuration(p, services, extras);
      if (d > 0) out.push(p.slot.barberId + '|' + p.date + '|' + p.slot.time + '|' + d);
    });
    return out.join(',');
  }

  /**
   * Raccourcis proposes pour une personne :
   *  - « after » : premier creneau libre chez le MEME coiffeur qu'une autre personne, juste apres elle ;
   *  - « same »  : en meme temps qu'elle, chez un AUTRE coiffeur.
   * slots : creneaux de cette personne [{time, barber_id}] (deja sans chevauchement) ; barberSlots : creneaux par coiffeur
   * (utile quand la personne a choisi « premier disponible », pour retrouver le coiffeur de l'autre) ; pref : coiffeur choisi ('' = au choix).
   */
  function computeSuggestions(o) {
    var out = [];
    (o.others || []).forEach(function (other) {
      if (!other.time || other.date !== o.date) return;
      var end = toMin(other.time) + other.duration;
      var pool = (o.pref && String(o.pref) !== String(other.barberId)) ? [] : ((o.barberSlots && o.barberSlots[other.barberId]) || (String(o.pref) === String(other.barberId) ? o.slots : []));
      var after = null;
      pool.forEach(function (s) { if (String(s.barber_id) === String(other.barberId) && toMin(s.time) >= end && (!after || toMin(s.time) < toMin(after.time))) after = s; });
      if (after) out.push({ kind: 'after', name: other.name, time: after.time, barberId: after.barber_id });
      var same = null;
      (o.slots || []).forEach(function (s) { if (s.time === other.time && String(s.barber_id) !== String(other.barberId) && !same) same = s; });
      if (same) out.push({ kind: 'same', name: other.name, time: same.time, barberId: same.barber_id });
    });
    return out;
  }

  /** Corps envoye a POST /api/appointments/group (sans les coordonnees du client, ajoutees par la page). */
  function buildPayload(people) {
    return people.map(function (p) {
      return { name: p.isSelf ? '' : String(p.name || '').trim(), service_id: p.serviceId, extras: (p.extraIds || []).slice(),
               barber_id: p.slot ? p.slot.barberId : null, date: p.date, time: p.slot ? p.slot.time : null };
    });
  }

  // Icones minimalistes (traits fins, couleur du texte) : jamais d'emoji.
  var IC = {
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    next: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    same: '<path d="M5 9h14M5 15h14"/>'
  };
  function ic(n) { return '<svg class="gb-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[n] + '</svg>'; }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  var STYLE = '' +
    '.gb-recap-person{margin-bottom:16px;opacity:.8}.gb-recap-person.on{opacity:1}' +
    '.gb-ic{width:14px;height:14px;flex:none}.gb-pill-x .gb-ic{width:12px;height:12px}.gb-who .gb-ic{width:13px;height:13px;margin-left:2px;opacity:.7}' +
    '.gb-chip.sugg{display:inline-flex;align-items:center;gap:7px}.gb-mini.x{display:inline-flex;align-items:center}.gb-pill-x{display:flex;align-items:center;justify-content:center}' +
    '.gb-pills{position:relative;padding-right:34px}' +
    '.gb-pill-x{position:absolute;right:0;top:0;border:none;background:var(--fill);color:var(--grey);width:26px;height:26px;border-radius:50%;font-size:12px;cursor:pointer;font-family:inherit;flex:none}.gb-pill-x:hover{color:#fff;background:var(--red)}' +
    'button.gb-pill{border:none;font-family:inherit;cursor:pointer}button.gb-pill:hover{filter:brightness(1.25)}' +
    '.gb-menu{flex-basis:100%;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--sep);border-radius:12px;padding:4px;margin-top:2px}' +
    '.gb-menu button{border:none;background:none;color:var(--ink);text-align:left;padding:9px 10px;border-radius:8px;font-family:inherit;font-size:14px;cursor:pointer}.gb-menu button:hover,.gb-menu button.on{background:var(--fill)}.gb-menu button.on{font-weight:600}' +
    '.gb-whos{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:22px}' +
    '.gb-who{display:inline-flex;align-items:center;gap:10px;border:2px solid var(--sep);background:var(--card);color:var(--ink);border-radius:16px;padding:12px 18px 12px 12px;font-family:inherit;font-size:16px;font-weight:600;cursor:pointer}' +
    '.gb-who i{font-style:normal;width:32px;height:32px;border-radius:50%;background:var(--blue-soft);color:var(--blue);display:flex;align-items:center;justify-content:center;font-size:14px}' +
    '.gb-who.on{border-color:var(--blue);background:var(--blue-soft)}.gb-who.on i{background:var(--blue);color:#fff}' +
    '.gb-addrow{display:flex;gap:8px}.gb-addrow input{flex:1;min-width:0}' +
    '.gb-pills{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}' +
    '.gb-pill{display:inline-flex;align-items:center;gap:6px;background:var(--fill);color:var(--ink);border-radius:999px;padding:5px 11px;font-size:13px;font-weight:500;line-height:1.3}' +
    '.gb-pill b{font-weight:700}' +
    '.gb-pill.who{background:var(--blue);color:#fff;font-weight:600;padding-left:5px}' +
    '.gb-pill.who i{font-style:normal;width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.25);display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}' +
    '.gb-rows{display:flex;flex-direction:column;gap:10px;margin-bottom:14px}' +
    '.gb-row{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--sep);border-radius:16px;padding:12px 14px}' +
    '.gb-av{width:38px;height:38px;border-radius:50%;background:var(--blue-soft);color:var(--blue);font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}' +
    '.gb-info{flex:1;min-width:0}.gb-info b{display:block;font-size:16px}.gb-info span{display:block;font-size:13.5px;color:var(--grey);margin-top:2px}' +
    '.gb-info span.todo{color:var(--orange)}' +
    '.gb-mini{border:1px solid var(--sep);background:var(--fill);color:var(--ink);border-radius:10px;padding:9px 13px;font-family:inherit;font-size:14px;cursor:pointer}' +
    '.gb-mini.x{color:var(--grey);padding:9px 11px}.gb-mini.x:hover{color:var(--red)}' +
    '.gb-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}' +
    '.gb-chip{border:1px solid var(--sep);background:var(--fill);color:var(--ink);border-radius:999px;padding:9px 14px;font-family:inherit;font-size:14px;cursor:pointer}' +
    '.gb-chip.sugg{border-color:var(--blue);color:var(--blue);background:var(--blue-soft)}' +
    '.gb-addbtn{border:1px dashed var(--blue);background:none;color:var(--blue);border-radius:14px;padding:13px;font-family:inherit;font-size:15px;font-weight:600;cursor:pointer;width:100%;margin-bottom:14px}' +
    '.gb-total{display:flex;justify-content:space-between;font-weight:600;font-size:15px;margin:6px 0 12px}' +
    '.gb-empty{color:var(--grey);font-size:13.5px;padding:6px 0;text-align:center}' +
    '.gb-ok{color:var(--blue);font-weight:600;font-size:14px;margin:10px 0 14px}' +
    '.gb-warn{color:var(--orange);font-size:13px;margin:6px 0}' +
    '.gb-save{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--grey);margin:4px 0 16px}' +
    '.gb-choices{display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:22px}@media(min-width:700px){.gb-choices{grid-template-columns:1fr 1fr}}' +
    '.gb-choice{display:flex;align-items:center;gap:14px;text-align:left;border:2px solid var(--sep);background:var(--card);color:var(--ink);border-radius:18px;padding:16px;font-family:inherit;cursor:pointer}' +
    '.gb-choice b{display:block;font-size:17px}.gb-choice em{display:block;font-style:normal;font-size:13.5px;color:var(--grey);margin-top:2px}' +
    '.gb-choice-ic{width:48px;height:48px;border-radius:50%;background:var(--fill);display:flex;align-items:center;justify-content:center;flex:none}' +
    '.gb-choice.on{border-color:var(--blue);background:var(--blue-soft)}.gb-choice.on .gb-choice-ic{background:var(--blue);color:#fff}' +
    '.gb-label{font-size:13px;font-weight:650;color:var(--grey);letter-spacing:.04em;text-transform:uppercase;margin:18px 0 10px}' +
    '.gb-pbar{display:flex;gap:8px;overflow-x:auto;margin:10px 0 14px;padding-bottom:2px}' +
    '.gb-pb{display:flex;align-items:center;gap:8px;border:none;background:var(--fill);color:var(--ink);border-radius:999px;padding:6px 14px 6px 6px;font-family:inherit;cursor:pointer;flex:none;text-align:left}' +
    '.gb-pb .gb-av{width:30px;height:30px;font-size:13px}.gb-pb-n{font-size:14px;font-weight:650}.gb-pb-s{font-size:12px;color:var(--grey)}' +
    '.gb-pb.cur{background:var(--blue-soft);box-shadow:inset 0 0 0 2px var(--blue)}.gb-pb .gb-av.on{background:var(--blue);color:#fff}' +
    '.gb-av.ok{background:var(--green,#2f9e60);color:#fff}' +
    '.gb-copy{display:inline-flex;align-items:center;border:1px dashed var(--grey);background:var(--fill);color:var(--ink);border-radius:999px;padding:9px 14px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:14px}' +
    '.gb-barbers{display:flex;flex-wrap:wrap;gap:8px}' +
    '.gb-bchip{border:none;background:var(--fill);color:var(--ink);border-radius:999px;padding:9px 15px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer}.gb-bchip.on{background:var(--blue);color:#fff}.gb-bchip:disabled{opacity:.35;cursor:default}' +
    '.gb-link{border:none;background:none;color:var(--blue);font-family:inherit;font-size:14.5px;font-weight:600;cursor:pointer;padding:12px 0;text-align:left}' +
    '.gb-days{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:12px}' +
    '.gb-day{flex:none;width:56px;border:none;background:var(--fill);color:var(--ink);border-radius:12px;padding:7px 0;font-family:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:1px}' +
    '.gb-day span{font-size:11px;color:var(--grey)}.gb-day b{font-size:17px}.gb-day.on{background:var(--blue);color:#fff}.gb-day.on span{color:rgba(255,255,255,.8)}' +
    '.gb-mode{margin-bottom:4px}' +
    '.gb-plan{display:flex;flex-direction:column;gap:5px;width:100%;text-align:left;border:none;background:var(--fill);color:var(--ink);border-radius:16px;padding:14px 16px;margin-bottom:10px;font-family:inherit;cursor:pointer}' +
    '.gb-plan.on{background:var(--blue-soft);box-shadow:inset 0 0 0 2px var(--blue)}.gb-plan-h{font-size:17px;font-weight:700}' +
    '.gb-plan-r{font-size:14px;color:var(--grey)}.gb-plan-r b{display:inline-block;min-width:52px;color:var(--ink)}' +
    '@media(min-width:1100px){.wrap.page-flow .gb-when{display:grid;grid-template-columns:minmax(280px,360px) minmax(0,1fr);gap:32px;align-items:start}.wrap.page-flow .gb-days{flex-wrap:wrap;overflow:visible}.wrap.page-flow .gb-when-plans .gb-mode{margin-top:0}}' +
    '.gb-sum-head{font-size:13px;font-weight:650;color:var(--grey);letter-spacing:.04em;text-transform:uppercase;margin-bottom:10px}' +
    '.gb-sum{display:grid;grid-template-columns:46px minmax(0,1fr) auto;gap:8px;align-items:baseline;padding:6px 0}.gb-sum.on{color:var(--blue)}' +
    '.gb-sum-t{font-weight:700;font-size:14px}.gb-sum-n b{display:block;font-size:14.5px}.gb-sum-n em{display:block;font-style:normal;font-size:12.5px;color:var(--grey)}.gb-sum-p{font-size:14px;font-weight:600}' +
    '@media(max-width:899px){.gb-sum,.gb-sum-head{display:none}}' +
    '.gb-row-t{font-weight:700;font-size:16px;min-width:50px}.gb-row-p{font-weight:600;font-size:14.5px;white-space:nowrap}' +
    '.gb-input{width:100%;box-sizing:border-box;border:1px solid var(--sep);background:var(--fill);color:var(--ink);border-radius:12px;padding:13px 14px;font-family:inherit;font-size:16px}';

  function injectStyle() {
    if (typeof document === 'undefined' || document.getElementById('gb-style')) return;
    var st = document.createElement('style'); st.id = 'gb-style'; st.textContent = STYLE; document.head.appendChild(st);
  }

  /* Cartes identiques a la reservation normale quand les aides de app.js sont presentes (vitrineCardHtml, barberTileHtml) ;
     version simple sinon (tests). */
  function itemCard(kind, it, sel) {
    if (typeof vitrineCardHtml === 'function') return vitrineCardHtml(kind, it, sel, '');
    return '<button type="button" class="item-card' + (sel ? ' sel' : '') + '" data-id="' + esc(it.id) + '"><span class="item-name">' + esc(it.name) + '</span></button>';
  }
  function barberCard(b, sel) {
    if (typeof barberTileHtml === 'function') return barberTileHtml(b, sel, '');
    return '<button type="button" class="svc-card barber-tile' + (sel ? ' sel' : '') + '" data-barber-id="' + esc(b.id) + '"><span class="name">' + esc(b.name) + '</span></button>';
  }

  /* ---------- Horaires proposes pour tout le groupe (logique pure, testee sous Node) ----------
   * opts[i] : creneaux possibles de la personne i, [{ time:'10:00', min:600, barberId:'b1', dur:30 }] (un par coiffeur possible).
   * mode 'seq' : les uns apres les autres (la suivante commence a la fin de la precedente, 45 min d'attente au plus) ;
   * mode 'same' : tout le monde a la meme heure, chacun chez un coiffeur different.
   * Jamais deux personnes qui se chevauchent chez le meme coiffeur (marge tampon comprise). Jusqu'a « max » horaires,
   * espaces dans la journee (90 min pour « a la suite », 60 min pour « en meme temps »). */
  function overlapsBusy(busy, b, s, e, buf) {
    return (busy[b] || []).some(function (r) { return s < r[1] + buf && e + buf > r[0]; });
  }
  function planSeq(opts, T, buf) {
    var busy = {}, res = [], tReq = T, prevB = null;
    for (var i = 0; i < opts.length; i++) {
      var cands = opts[i].filter(function (o) { return (i === 0 ? o.min === T : o.min >= tReq) && !overlapsBusy(busy, o.barberId, o.min, o.min + o.dur, buf); });
      if (!cands.length) return null;
      var best = cands[0];
      cands.forEach(function (c) { if (c.min < best.min || (c.min === best.min && c.barberId === prevB && best.barberId !== prevB)) best = c; });
      if (i > 0 && best.min - tReq > 45) return null;
      (busy[best.barberId] = busy[best.barberId] || []).push([best.min, best.min + best.dur]);
      res.push(best); tReq = best.min + best.dur; prevB = best.barberId;
    }
    return res;
  }
  function planSame(opts, T, buf) {
    var busy = {}, res = [];
    function rec(i) {
      if (i === opts.length) return true;
      var cands = opts[i].filter(function (o) { return o.min === T; });
      for (var k = 0; k < cands.length; k++) {
        var o = cands[k];
        if (overlapsBusy(busy, o.barberId, o.min, o.min + o.dur, buf)) continue;
        (busy[o.barberId] = busy[o.barberId] || []).push([o.min, o.min + o.dur]); res.push(o);
        if (rec(i + 1)) return true;
        res.pop(); busy[o.barberId].pop();
      }
      return false;
    }
    return rec(0) ? res : null;
  }
  function buildPlans(opts, mode, bufferMin, max) {
    max = max || 3; var buf = Number(bufferMin) || 0;
    if (!opts.length || opts.some(function (o) { return !o.length; })) return [];
    var starts = []; opts[0].forEach(function (o) { if (starts.indexOf(o.min) === -1) starts.push(o.min); }); starts.sort(function (a, b) { return a - b; });
    var out = [], last = -1e9, gap = mode === 'same' ? 60 : 90;
    for (var i = 0; i < starts.length && out.length < max; i++) {
      var T = starts[i]; if (out.length && T < last + gap) continue;
      var items = mode === 'same' ? planSame(opts, T, buf) : planSeq(opts, T, buf);
      if (!items) continue;
      var end = 0; items.forEach(function (it) { end = Math.max(end, it.min + it.dur); });
      out.push({ start: pad(T), end: pad(end), items: items.map(function (it) { return { time: it.time, barberId: it.barberId, dur: it.dur }; }) });
      last = T;
    }
    return out;
  }

  /**
   * cfg : { mount|zones, api(path), services, extras, barbers, relatives, createRelative(name), onContinue(people, payload), onExit(),
   *         onSolo() (premier ecran « Pour qui ? » : « Juste moi » repart sur la reservation normale), bufferMin,
   *         eur, toast, continueLabel, today(), selfChip, selfName, whoSub, saveLabel }
   *
   * Deroule (une etape par ecran) : Pour qui ? > Que fait chacun ? (prestation + coiffeur + supplements, personne par personne)
   * > Quand venez-vous ? (une date, des horaires complets proposes pour tout le groupe) > On verifie ensemble > coordonnees (page).
   */
  function create(cfg) {
    injectStyle();
    var people = [], uid = 0, view = 'who', cur = null, wsel = null, editing = false, sepMode = false;
    var plan = { date: null, mode: 'seq', loading: false, list: null, chosen: -1, req: 0 }, slotCache = {};
    var zones = cfg.zones;
    if (!zones) {
      cfg.mount.innerHTML = '<div class="gb"><div class="flow-top"></div><div class="flow-body"></div><div class="step-bar"></div></div>';
      zones = { top: cfg.mount.querySelector('.flow-top'), body: cfg.mount.querySelector('.flow-body'), bar: cfg.mount.querySelector('.step-bar') };
    }
    var el = { contains: function (n) { return zones.top.contains(n) || zones.body.contains(n) || zones.bar.contains(n); },
               addEventListener: function (t, f) { [zones.top, zones.body, zones.bar].forEach(function (z) { z.addEventListener(t, f); }); } };
    var eur = cfg.eur || function (c) { return (c / 100).toFixed(2) + ' €'; };
    var today = function () { return cfg.today ? cfg.today() : (typeof salonToday === 'function' ? salonToday() : new Date().toISOString().slice(0, 10)); };

    function newPerson(init) {
      var p = { uid: ++uid, isSelf: false, name: '', relativeId: null, saveRelative: false, serviceId: '', extraIds: [], pref: '', date: today(), slots: null, slot: null,
                loading: false, req: 0, half: 'morning', note: '', suggestions: [], barberSlots: {}, showExtras: false };
      for (var k in (init || {})) p[k] = init[k];
      return p;
    }
    function label(p) { return p.isSelf ? (cfg.selfName || 'Vous') : (String(p.name || '').trim() || 'Personne ' + (people.indexOf(p) + 1)); }
    function shortName(p) { return p.isSelf ? (cfg.selfName || 'vous') : label(p); }
    function barberName(id) { var b = byId(cfg.barbers, id); return b ? b.name : ''; }
    function offerBarber(p) { var bid = (p.slot && p.slot.barberId) || p.pref; return bid ? byId(cfg.barbers, bid) : null; }
    function itemsFor(b, kind) { var list = kind === 'services' ? cfg.services : cfg.extras; return typeof barberItems === 'function' ? barberItems(b, kind, list) : list; }
    function svcList(p) { return itemsFor(offerBarber(p), 'services'); }
    function extList(p) { return itemsFor(offerBarber(p), 'extras'); }
    function fmtDate(d) { try { return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { return d; } }
    function complete(p) { return !!(p.serviceId && p.slot && (p.isSelf || String(p.name || '').trim())); }
    function fmtMin(m) { return typeof formatMinutes === 'function' ? formatMinutes(m) : m + ' min'; }

    function newWho() { return { multi: !cfg.onSolo, self: true, rels: {}, extra: [], draft: '', draftSave: false }; }
    function reset() { slotCache = {}; people = []; cur = null; editing = false; sepMode = false; wsel = newWho(); plan = { date: null, mode: 'seq', loading: false, list: null, chosen: -1, req: 0 }; view = 'who'; paint(); }
    function whoCount() { return (wsel.self ? 1 : 0) + Object.keys(wsel.rels).filter(function (k) { return wsel.rels[k]; }).length + wsel.extra.length; }
    function addWhoName() {
      var n = String(wsel.draft || '').trim(); if (!n) return;
      var low = n.toLowerCase(), rel = (cfg.relatives || []).filter(function (r) { return String(r.name).toLowerCase() === low; })[0];
      if (rel) wsel.rels[rel.id] = true;
      else if (!wsel.extra.some(function (x) { return x.name.toLowerCase() === low; })) wsel.extra.push({ name: n, save: !!wsel.draftSave });
      wsel.draft = ''; paint();
    }
    function applyWho() {
      var next = [];
      function keep(match, init) { var f = people.filter(match)[0]; next.push(f || newPerson(init)); }
      if (wsel.self) keep(function (p) { return p.isSelf; }, { isSelf: true });
      (cfg.relatives || []).forEach(function (r) { if (wsel.rels[r.id]) keep(function (p) { return String(p.relativeId) === String(r.id); }, { name: r.name, relativeId: r.id }); });
      wsel.extra.forEach(function (x) { keep(function (p) { return !p.isSelf && !p.relativeId && p.name === x.name; }, { name: x.name, saveRelative: x.save }); });
      people = next.slice(0, MAX_PEOPLE);
    }
    function personByUid(u) { for (var i = 0; i < people.length; i++) if (String(people[i].uid) === String(u)) return people[i]; return null; }
    function firstWithout(pred) { for (var i = 0; i < people.length; i++) if (pred(people[i])) return people[i]; return null; }
    function invalidateTimes() { people.forEach(function (p) { p.slot = null; p.slots = null; }); plan.list = null; plan.chosen = -1; }

    /* ---------- Creneaux d'UNE personne (choix « separement », ou un creneau pris entre-temps) ---------- */
    function slotsUrl(p, barber, held) {
      return '/api/appointments/availability?date=' + p.date + '&service_id=' + p.serviceId + '&extras=' + p.extraIds.join(',') +
        (barber ? '&barber_id=' + barber : '') + (held ? '&held=' + encodeURIComponent(held) : '');
    }
    function loadSlots(p) {
      if (!p.serviceId || !p.date) { p.slots = null; p.suggestions = []; return; }
      var token = ++p.req; p.loading = true; p.slots = null; paint();
      var held = heldParam(people, people.indexOf(p), p.date, svcList, extList);
      cfg.api(slotsUrl(p, p.pref, held)).then(function (r) {
        if (token !== p.req) return;
        p.slots = r.slots || []; p.loading = false; p.note = '';
        if (p.slot && !p.slots.some(function (s) { return s.time === p.slot.time && String(s.barber_id) === String(p.slot.barberId); })) { p.slot = null; p.note = "Ce créneau n'est plus libre, choisissez-en un autre."; }
        p.half = p.slots.some(function (s) { return s.time < '12:00'; }) ? 'morning' : 'afternoon';
        return loadSuggestions(p, held, token);
      }).catch(function (e) { if (token !== p.req) return; p.loading = false; p.slots = []; paint(); if (cfg.toast) cfg.toast(e.message, true); });
    }
    function loadSuggestions(p, held, token) {
      var others = people.filter(function (o) { return o !== p && o.slot && o.date === p.date; }).map(function (o) {
        return { name: shortName(o), date: o.date, time: o.slot.time, barberId: o.slot.barberId, duration: personDuration(o, svcList, extList) };
      });
      var need = {}; if (!p.pref) others.forEach(function (o) { need[o.barberId] = true; });
      var jobs = Object.keys(need).map(function (bid) {
        return cfg.api(slotsUrl(p, bid, held)).then(function (r) { return [bid, r.slots || []]; }).catch(function () { return [bid, []]; });
      });
      return Promise.all(jobs).then(function (pairs) {
        if (token !== p.req) return;
        p.barberSlots = {}; pairs.forEach(function (x) { p.barberSlots[x[0]] = x[1]; });
        if (p.pref) others.forEach(function (o) { if (String(o.barberId) === String(p.pref)) p.barberSlots[o.barberId] = p.slots; });
        p.suggestions = computeSuggestions({ date: p.date, pref: p.pref, slots: p.slots, barberSlots: p.barberSlots, others: others });
        paint();
      });
    }

    /* ---------- Horaires du groupe ---------- */
    function candBarbers(p) {
      if (p.pref) { var b = byId(cfg.barbers, p.pref); return b ? [b] : []; }
      return cfg.barbers.filter(function (b) {
        if ((b.disabled_service_ids || []).indexOf(p.serviceId) !== -1) return false;
        return !(p.extraIds || []).some(function (x) { return (b.disabled_extra_ids || []).indexOf(x) !== -1; });
      });
    }
    function durFor(p, b) { return personDuration(p, itemsFor(b, 'services'), itemsFor(b, 'extras')); }
    function fetchTimes(p, b, date) {
      var key = [date, p.serviceId, p.extraIds.join(','), b.id].join('|');
      if (slotCache[key]) return Promise.resolve(slotCache[key]);
      return cfg.api('/api/appointments/availability?date=' + date + '&service_id=' + p.serviceId + '&extras=' + p.extraIds.join(',') + '&barber_id=' + b.id)
        .then(function (r) { slotCache[key] = (r.slots || []).map(function (s) { return s.time; }); return slotCache[key]; })
        .catch(function () { return []; });
    }
    function loadPlans() {
      var token = ++plan.req, date = plan.date, opts = people.map(function () { return []; }), jobs = [];
      plan.loading = true; plan.list = null; plan.chosen = -1; paint();
      people.forEach(function (p, i) {
        candBarbers(p).forEach(function (b) {
          jobs.push(fetchTimes(p, b, date).then(function (times) {
            var d = durFor(p, b);
            times.forEach(function (t) { opts[i].push({ time: t, min: toMin(t), barberId: String(b.id), dur: d }); });
          }));
        });
      });
      Promise.all(jobs).then(function () {
        if (token !== plan.req) return;
        plan.list = buildPlans(opts, people.length > 1 ? plan.mode : 'seq', cfg.bufferMin, 3); plan.loading = false;
        // Les horaires deja choisis correspondent a une proposition : elle reste cochee.
        plan.list.forEach(function (pl, k) {
          if (pl.items.every(function (it, i) { var p = people[i]; return p.slot && p.date === date && p.slot.time === it.time && String(p.slot.barberId) === it.barberId; })) plan.chosen = k;
        });
        paint();
      });
    }
    function pickPlan(k) {
      var pl = plan.list && plan.list[k]; if (!pl) return;
      people.forEach(function (p, i) { p.date = plan.date; p.slot = { time: pl.items[i].time, barberId: pl.items[i].barberId }; p.slots = null; p.alert = ''; });
      plan.chosen = k; paint();
    }

    /* ---------- Rendu ---------- */
    function back() { return '<button type="button" class="back" data-act="back">‹ Retour</button>'; }
    function goBtn(text, disabled, act) { return '<button type="button" class="go" data-act="' + (act || 'next') + '"' + (disabled ? ' disabled' : '') + '>' + text + '</button>'; }
    function av(p, cls) { return '<span class="gb-av' + (cls ? ' ' + cls : '') + '">' + esc(label(p).charAt(0).toUpperCase()) + '</span>'; }
    var ICON_ONE = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/></svg>';
    var ICON_MANY = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17.5 14.2c2.3.3 3.5 2.2 3.5 5.8"/></svg>';
    var CHECK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>';

    // Colonne de droite (ordinateur) / bas d'ecran (telephone) : le groupe, prestation et heure de chacun, le total.
    function barHtml() {
      if (!people.length) return '';
      var cents = 0, rows = people.map(function (p) {
        var s = byId(svcList(p), p.serviceId), price = s ? personPrice(p, svcList, extList) : 0; cents += price;
        var b = p.slot ? barberName(p.slot.barberId) : (p.pref ? barberName(p.pref) : '');
        return '<div class="gb-sum' + (p === cur && (view === 'person' || view === 'datetime') ? ' on' : '') + '"><span class="gb-sum-t">' + (p.slot ? esc(p.slot.time) : '') + '</span>' +
          '<span class="gb-sum-n"><b>' + esc(label(p)) + '</b><em>' + (s ? esc(s.name) + (b ? ' · ' + esc(b) : '') : 'à choisir') + '</em></span>' +
          '<span class="gb-sum-p">' + (s ? eur(price) : '') + '</span></div>';
      }).join('');
      var day = people[0].slot ? fmtDate(people[0].date) : '';
      return '<div class="gb-sum-head">' + (day ? esc(day) : 'Votre groupe') + '</div>' + rows +
        '<div class="recap-total"><span>Total · ' + people.length + ' personne' + (people.length > 1 ? 's' : '') + '</span><span><strong>' + eur(cents) + '</strong></span></div>';
    }
    function peopleBar() {
      return '<div class="gb-pbar">' + people.map(function (p) {
        var st = p === cur ? 'cur' : (p.serviceId ? 'done' : 'todo');
        var s = byId(svcList(p), p.serviceId);
        return '<button type="button" class="gb-pb ' + st + '" data-act="goto" data-uid="' + p.uid + '">' +
          (st === 'done' ? '<span class="gb-av ok">' + CHECK + '</span>' : av(p, st === 'cur' ? 'on' : '')) +
          '<span class="gb-pb-n">' + esc(label(p)) + '</span><span class="gb-pb-s">' + (st === 'cur' ? 'en cours' : s ? esc(s.name) : 'à faire') + '</span></button>';
      }).join('') + '</div>';
    }
    function dayStrip() {
      var out = '', d0 = new Date(today() + 'T12:00:00');
      for (var i = 0; i < 14; i++) {
        var d = new Date(d0); d.setDate(d0.getDate() + i);
        var iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        out += '<button type="button" class="gb-day' + (iso === plan.date ? ' on' : '') + '" data-act="plan-day" data-date="' + iso + '"><span>' +
          esc(d.toLocaleDateString('fr-FR', { weekday: 'short' })) + '</span><b>' + d.getDate() + '</b><span>' + esc(d.toLocaleDateString('fr-FR', { month: 'short' })) + '</span></button>';
      }
      return '<div class="gb-days">' + out + '</div>';
    }

    function views() {
      if (view === 'who') {
        var cards = cfg.onSolo ? '<div class="gb-choices">' +
          '<button type="button" class="gb-choice" data-act="solo"><span class="gb-choice-ic">' + ICON_ONE + '</span><span><b>Juste moi</b><em>Un rendez-vous pour une personne</em></span></button>' +
          '<button type="button" class="gb-choice' + (wsel.multi ? ' on' : '') + '" data-act="multi"><span class="gb-choice-ic">' + ICON_MANY + '</span><span><b>Plusieurs personnes</b><em>Enfants, amis, famille — jusqu\'à ' + MAX_PEOPLE + '</em></span></button></div>' : '';
        var n = whoCount(), body = cards;
        if (wsel.multi) {
          var chips = '<button type="button" class="gb-who' + (wsel.self ? ' on' : '') + '" data-act="who-self"><i>' + esc((cfg.selfChip || 'Moi').charAt(0)) + '</i>' + esc(cfg.selfChip || 'Moi') + '</button>';
          (cfg.relatives || []).forEach(function (r) { chips += '<button type="button" class="gb-who' + (wsel.rels[r.id] ? ' on' : '') + '" data-act="who-rel" data-id="' + esc(r.id) + '"><i>' + esc(String(r.name).charAt(0).toUpperCase()) + '</i>' + esc(r.name) + '</button>'; });
          wsel.extra.forEach(function (x, i) { chips += '<button type="button" class="gb-who on" data-act="who-del" data-i="' + i + '" title="Retirer"><i>' + esc(x.name.charAt(0).toUpperCase()) + '</i>' + esc(x.name) + ic('x') + '</button>'; });
          body += '<div class="gb-label">Qui vient ?</div>' + (cfg.whoSub ? '<p class="step-sub">' + esc(cfg.whoSub) + '</p>' : '') + '<div class="gb-whos">' + chips + '</div>' +
            '<div class="fld"><label for="gb-who-name">Ajouter quelqu\'un d\'autre</label><div class="gb-addrow"><input id="gb-who-name" maxlength="60" autocomplete="off" placeholder="Prénom" value="' + esc(wsel.draft) + '"><button type="button" class="gb-mini" data-act="who-add">Ajouter</button></div></div>' +
            (cfg.createRelative ? '<label class="gb-save"><input type="checkbox" data-act="who-save"' + (wsel.draftSave ? ' checked' : '') + '> ' + esc(cfg.saveLabel || 'Enregistrer ce prénom dans « Mes proches »') + '</label>' : '');
        }
        return { top: (cfg.onExit ? back() : '') + '<div class="eyebrow">' + (cfg.onSolo ? 'Pour qui est le rendez-vous ?' : 'Qui vient au salon ?') + '</div>',
          body: body,
          go: wsel.multi ? goBtn(n > 1 ? 'Continuer avec ' + n + ' personnes' : 'Continuer', n < 1 || n > MAX_PEOPLE, 'who-next') : '',
          hint: !wsel.multi ? '' : n < 1 ? 'Choisissez au moins une personne.' : n > MAX_PEOPLE ? 'Maximum ' + MAX_PEOPLE + ' personnes.' : '' };
      }
      if (view === 'person') {
        var p = cur, prev = null;
        for (var j = people.indexOf(p) - 1; j >= 0 && !prev; j--) if (people[j].serviceId) prev = people[j];
        if (!prev) prev = firstWithout(function (o) { return o !== p && o.serviceId; });
        var bodyP = '';
        if (prev && (prev.serviceId !== p.serviceId || String(prev.pref) !== String(p.pref))) {
          var ps = byId(svcList(prev), prev.serviceId);
          bodyP += '<button type="button" class="gb-copy" data-act="copy" data-uid="' + prev.uid + '">Même chose que ' + esc(label(prev)) + (ps ? ' (' + esc(ps.name) + ')' : '') + '</button>';
        }
        bodyP += '<div class="item-grid">' + svcList(p).map(function (it) { return itemCard('services', it, String(p.serviceId) === String(it.id)).replace('<button', '<button data-pick="service"'); }).join('') + '</div>';
        bodyP += '<div class="gb-label">Coiffeur</div><div class="gb-barbers"><button type="button" class="gb-bchip' + (!p.pref ? ' on' : '') + '" data-act="pref" data-id="">Peu importe</button>' +
          cfg.barbers.map(function (b) {
            var off = p.serviceId && (b.disabled_service_ids || []).indexOf(p.serviceId) !== -1;
            return '<button type="button" class="gb-bchip' + (String(p.pref) === String(b.id) ? ' on' : '') + '" data-act="pref" data-id="' + esc(b.id) + '"' + (off ? ' disabled title="Ne fait pas cette prestation"' : '') + '>' + esc(b.name) + '</button>';
          }).join('') + '</div>';
        var exts = extList(p);
        if (exts.length) {
          if (p.showExtras || p.extraIds.length) bodyP += '<div class="gb-label">Suppléments (facultatif)</div><div class="item-grid">' + exts.map(function (it) { return itemCard('extras', it, p.extraIds.indexOf(String(it.id)) !== -1).replace('<button', '<button data-pick="extra"'); }).join('') + '</div>';
          else bodyP += '<button type="button" class="gb-link" data-act="show-extras">+ Ajouter un supplément (facultatif)</button>';
        }
        var nx = editing ? null : firstWithout(function (o) { return o !== p && !o.serviceId; });
        var who = p.isSelf ? (cfg.selfName ? 'Que fait ' + esc(cfg.selfName) + ' ?' : 'Que faites-vous ?') : 'Que fait ' + esc(label(p)) + ' ?';
        return { top: back() + (people.length > 1 ? peopleBar() : '') + '<div class="eyebrow">' + who + '</div>', body: bodyP,
          go: goBtn(nx ? 'Suivant : ' + esc(label(nx)) + ' ›' : (editing && p.slot ? 'Valider' : 'Choisir l\'horaire'), !p.serviceId, 'person-next') };
      }
      if (view === 'when') {
        var plans = '';
        if (plan.loading || !plan.list) plans = '<div class="empty">Recherche des horaires…</div>';
        else if (!plan.list.length) plans = '<div class="empty">Aucun horaire pour tout le groupe ce jour-là. Essayez une autre date' + (people.length > 1 ? ', l\'autre option ci-dessus,' : '') + ' ou choisissez l\'heure de chacun séparément.</div>';
        else plans = plan.list.map(function (pl, k) {
          return '<button type="button" class="gb-plan' + (plan.chosen === k ? ' on' : '') + '" data-act="plan-pick" data-i="' + k + '"><span class="gb-plan-h">' + esc(pl.start) + ' → ' + esc(pl.end) + '</span>' +
            pl.items.map(function (it, i) { var s = byId(itemsFor(byId(cfg.barbers, it.barberId), 'services'), people[i].serviceId);
              return '<span class="gb-plan-r"><b>' + esc(it.time) + '</b>' + esc(label(people[i])) + (s ? ' · ' + esc(s.name) : '') + ' · ' + esc(barberName(it.barberId)) + '</span>'; }).join('') + '</button>';
        }).join('');
        var mode = people.length > 1 ? '<div class="half-toggle gb-mode"><button type="button" class="' + (plan.mode === 'seq' ? 'sel' : '') + '" data-act="plan-mode" data-mode="seq">Les uns après les autres</button><button type="button" class="' + (plan.mode === 'same' ? 'sel' : '') + '" data-act="plan-mode" data-mode="same">En même temps</button></div>' : '';
        return { top: back() + '<div class="eyebrow">Quand venez-vous ?</div><p class="step-sub">Une seule date pour tout le groupe.</p>',
          body: '<div class="gb-when"><div class="gb-when-cal">' + dayStrip() +
            '<div class="fld"><label for="gb-plan-date">Autre date</label><input id="gb-plan-date" type="date" min="' + today() + '" value="' + esc(plan.date) + '"></div></div>' +
            '<div class="gb-when-plans">' + mode + '<div class="gb-label">Horaires proposés' + (people.length > 1 ? ' pour les ' + people.length : '') + '</div>' + plans +
            '<button type="button" class="gb-link" data-act="sep">' + (people.length > 1 ? 'Choisir l\'heure de chacun séparément' : 'Voir tous les créneaux') + '</button></div></div>',
          go: goBtn('Continuer', !people.every(complete), 'to-recap') };
      }
      if (view === 'recap') {
        var ready = people.length > 0 && people.every(complete);
        var used = {}; people.forEach(function (o) { if (o.relativeId) used[o.relativeId] = true; });
        var rels = (cfg.relatives || []).filter(function (r) { return !used[r.id]; });
        var dates = {}; people.forEach(function (o) { if (o.slot) dates[o.date] = true; });
        var bodyR = (Object.keys(dates).length === 1 ? '<div class="gb-label">' + esc(fmtDate(Object.keys(dates)[0])) + '</div>' : '') + '<div class="gb-rows">';
        people.slice().sort(function (a, b) { return ((a.date || '') + (a.slot ? a.slot.time : '99')).localeCompare((b.date || '') + (b.slot ? b.slot.time : '99')); }).forEach(function (o) {
          var s = byId(svcList(o), o.serviceId);
          var line = s ? esc(s.name) + (o.slot ? ' · ' + esc(barberName(o.slot.barberId)) : '') + (o.slot && Object.keys(dates).length > 1 ? ' · ' + esc(fmtDate(o.date)) : '') : '<span class="todo">À compléter</span>';
          bodyR += '<div class="gb-row"><span class="gb-row-t">' + (o.slot ? esc(o.slot.time) : '—') + '</span><div class="gb-info"><b>' + esc(label(o)) + '</b><span>' + line + '</span></div>' +
            '<span class="gb-row-p">' + (s ? eur(personPrice(o, svcList, extList)) : '') + '</span>' +
            '<button type="button" class="gb-mini" data-act="edit" data-uid="' + o.uid + '">Modifier</button>' +
            '<button type="button" class="gb-mini x" data-act="rm" data-uid="' + o.uid + '" aria-label="Retirer ' + esc(label(o)) + '">' + ic('x') + '</button></div>';
        });
        bodyR += '</div>';
        if (people.length < MAX_PEOPLE) {
          if (rels.length) bodyR += '<div class="gb-chips">' + rels.map(function (r) { return '<button type="button" class="gb-chip" data-act="add-rel" data-id="' + esc(r.id) + '">+ ' + esc(r.name) + '</button>'; }).join('') + '</div>';
          bodyR += '<button type="button" class="gb-addbtn" data-act="add">+ Ajouter une personne</button>';
        }
        return { top: back() + '<div class="eyebrow">On vérifie ensemble</div>', body: bodyR,
          go: goBtn(esc(cfg.continueLabel || 'Continuer'), !ready, 'continue'), hint: !ready ? 'Complétez chaque personne (prestation et horaire).' : '' };
      }
      if (view === 'name') return { top: back() + '<div class="eyebrow">Qui vient en plus ?</div>',
        body: '<div class="fld"><label for="gb-name">Prénom</label><input id="gb-name" maxlength="60" autocomplete="off" value="' + esc(cur.name) + '"></div>' +
          (cfg.createRelative ? '<label class="gb-save"><input type="checkbox" data-act="save"' + (cur.saveRelative ? ' checked' : '') + '> ' + esc(cfg.saveLabel || 'Ajouter ce prénom à « Mes proches »') + '</label>' : ''),
        go: goBtn('Suivant', !String(cur.name || '').trim(), 'name-next') };
      // datetime : l'heure d'UNE personne (choix « separement », ou creneau pris entre-temps)
      var q = cur, whoQ = q.isSelf ? '' : esc(label(q)) + ' — ';
      var morning = (q.slots || []).filter(function (s) { return s.time < '12:00'; }), aft = (q.slots || []).filter(function (s) { return s.time >= '12:00'; });
      var body2 = '<div class="fld"><label for="gb-date">Date</label><input id="gb-date" type="date" min="' + today() + '" value="' + esc(q.date) + '"></div>';
      if (q.suggestions && q.suggestions.length) body2 += '<div class="gb-chips">' + q.suggestions.map(function (sg) {
        return '<button type="button" class="gb-chip sugg" data-act="sugg" data-time="' + esc(sg.time) + '" data-barber="' + esc(sg.barberId) + '">' + (sg.kind === 'after' ? ic('next') + 'À la suite de ' : ic('same') + 'En même temps que ') + esc(sg.name) + ' · ' + esc(sg.time) + (barberName(sg.barberId) ? ' · ' + esc(barberName(sg.barberId)) : '') + '</button>'; }).join('') + '</div>';
      body2 += '<div class="gb-label">Créneaux disponibles</div>';
      if (morning.length && aft.length) body2 += '<div class="half-toggle" style="margin-bottom:14px"><button type="button" class="' + (q.half === 'morning' ? 'sel' : '') + '" data-act="half" data-half="morning">Matin</button><button type="button" class="' + (q.half === 'afternoon' ? 'sel' : '') + '" data-act="half" data-half="afternoon">Après-midi</button></div>';
      var list = (morning.length && aft.length) ? (q.half === 'morning' ? morning : aft) : (q.slots || []);
      body2 += '<div class="slots-grid">' + (q.loading || !q.slots ? '<div class="empty">Chargement…</div>' : !list.length ? '<div class="empty">Aucun créneau disponible ce jour-là</div>' :
        list.map(function (s) { var on = q.slot && q.slot.time === s.time && String(q.slot.barberId) === String(s.barber_id);
          return '<button type="button" class="slot-btn' + (on ? ' sel' : '') + '" data-act="slot" data-time="' + esc(s.time) + '" data-barber="' + esc(s.barber_id) + '">' + esc(s.time) + '</button>'; }).join('')) + '</div>';
      if (q.note || q.alert) body2 += '<div class="gb-warn">' + esc(q.alert || q.note) + '</div>';
      return { top: back() + (people.length > 1 ? peopleBar() : '') + '<div class="eyebrow">' + whoQ + 'Date et heure</div>', body: body2, go: goBtn('Valider', !q.slot, 'dt-next') };
    }

    function paint() {
      var v = views(), keep = zones.body.scrollTop;
      zones.top.innerHTML = v.top; zones.body.innerHTML = v.body;
      var sum = (view === 'who' && !people.length) ? '' : barHtml();
      zones.bar.innerHTML = (sum ? '<div class="flow-recap">' + sum + '</div>' : '') + (v.go || '') + (v.hint ? '<div class="gb-empty">' + v.hint + '</div>' : '');
      zones.body.scrollTop = keep;
    }

    /* ---------- Navigation ---------- */
    function go(v) {
      if (v === 'datetime' && cur && (!cur.date || cur.date < today())) { cur.date = today(); cur.slot = null; }
      if (v === 'when') { if (!plan.date || plan.date < today()) plan.date = (people[0] && people[0].slot && people[0].date >= today()) ? people[0].date : today(); }
      view = v; paint();
      if (v === 'datetime') loadSlots(cur);
      if (v === 'when') loadPlans();
    }
    function afterPerson() {
      if (editing) { editing = false; return people.every(complete) ? go('recap') : go('when'); }
      var nx = firstWithout(function (o) { return !o.serviceId; });
      if (nx) { cur = nx; return go('person'); }
      return go('when');
    }
    function backFrom() {
      if (view === 'who') return cfg.onExit && cfg.onExit();
      if (view === 'person') {
        if (editing) { editing = false; return go(people.every(complete) ? 'recap' : 'when'); }
        var k = people.indexOf(cur);
        if (k > 0) { cur = people[k - 1]; return go('person'); }
        return go('who');
      }
      if (view === 'when') { cur = people[people.length - 1]; return go('person'); }
      if (view === 'recap') return go('when');
      if (view === 'name') { if (!String(cur.name || '').trim()) people.splice(people.indexOf(cur), 1); return go(people.length ? 'recap' : 'who'); }
      if (view === 'datetime') {
        if (sepMode) { var i2 = people.indexOf(cur); if (i2 > 0) { cur = people[i2 - 1]; return go('datetime'); } sepMode = false; return go('when'); }
        return go('recap');
      }
    }
    function addPerson(init) {
      if (people.length >= MAX_PEOPLE) return;
      var np = newPerson(init || {}); if (people[0]) np.date = people[0].date;
      people.push(np); cur = np; editing = false;
      return go(np.name ? 'person' : 'name');
    }
    function markChanged(p) { p.slot = null; p.slots = null; plan.list = null; plan.chosen = -1; }

    el.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-act],[data-pick]') : null; if (!t || !el.contains(t) || t.disabled) return;
      var pick = t.getAttribute('data-pick'), act = t.getAttribute('data-act');
      if (pick) {
        var id = t.getAttribute('data-id') || '';
        if (pick === 'service') { if (String(cur.serviceId) !== String(id)) { cur.serviceId = id; markChanged(cur); } return paint(); }
        if (pick === 'extra') { var k = cur.extraIds.indexOf(String(id)); if (k === -1) cur.extraIds.push(String(id)); else cur.extraIds.splice(k, 1); markChanged(cur); return paint(); }
      }
      if (act === 'solo') return cfg.onSolo && cfg.onSolo();
      if (act === 'multi') { wsel.multi = true; return paint(); }
      if (act === 'who-self') { wsel.self = !wsel.self; return paint(); }
      if (act === 'who-rel') { var rid = t.getAttribute('data-id'); wsel.rels[rid] = !wsel.rels[rid]; return paint(); }
      if (act === 'who-del') { wsel.extra.splice(Number(t.getAttribute('data-i')), 1); return paint(); }
      if (act === 'who-add') return addWhoName();
      if (act === 'who-next') {
        if (whoCount() < 1) return;
        if (whoCount() > MAX_PEOPLE) { if (cfg.toast) cfg.toast('Maximum ' + MAX_PEOPLE + ' personnes.', true); return; }
        applyWho(); editing = false;
        // Parcours « une personne a la fois » : la page reprend la main avec la liste des personnes, et refait pour
        // chacune la reservation normale (coiffeur > prestation > supplements > produits > date) avant un panier commun.
        if (cfg.onPeople) return savePendingRelatives().then(function () {
          cfg.onPeople(people.map(function (q) { return { uid: q.uid, isSelf: q.isSelf, name: label(q), relativeId: q.relativeId || null }; }));
        });
        cur = firstWithout(function (o) { return !o.serviceId; }) || people[0]; return go('person');
      }
      if (act === 'goto') { var pg = personByUid(t.getAttribute('data-uid')); if (pg) { cur = pg; return go('person'); } return; }
      if (act === 'copy') { var src = personByUid(t.getAttribute('data-uid')); if (src) { cur.serviceId = src.serviceId; cur.extraIds = src.extraIds.slice(); cur.pref = src.pref; markChanged(cur); } return paint(); }
      if (act === 'pref') {
        var bid = t.getAttribute('data-id') || '';
        if (String(cur.pref) !== bid) {
          cur.pref = bid; markChanged(cur);
          if (cur.serviceId && !byId(svcList(cur), cur.serviceId)) cur.serviceId = '';
          cur.extraIds = cur.extraIds.filter(function (x) { return byId(extList(cur), x); });
        }
        return paint();
      }
      if (act === 'show-extras') { cur.showExtras = true; return paint(); }
      if (act === 'person-next') return afterPerson();
      if (act === 'name-next') return go('person');
      if (act === 'plan-day') { plan.date = t.getAttribute('data-date'); return loadPlans(); }
      if (act === 'plan-mode') { plan.mode = t.getAttribute('data-mode'); return loadPlans(); }
      if (act === 'plan-pick') return pickPlan(Number(t.getAttribute('data-i')));
      if (act === 'sep') { sepMode = true; people.forEach(function (o) { o.date = plan.date; }); cur = people[0]; return go('datetime'); }
      if (act === 'to-recap') return go('recap');
      if (act === 'dt-next') {
        if (sepMode) { var i3 = people.indexOf(cur); if (i3 < people.length - 1) { var nxt = people[i3 + 1]; nxt.date = cur.date; cur = nxt; return go('datetime'); } sepMode = false; }
        return go('recap');
      }
      if (act === 'edit') { var pe = personByUid(t.getAttribute('data-uid')); if (pe) { cur = pe; editing = true; return go('person'); } return; }
      if (act === 'rm') {
        var pr = personByUid(t.getAttribute('data-uid')); if (!pr) return;
        people.splice(people.indexOf(pr), 1);
        if (!people.length) { wsel = newWho(); wsel.multi = true; return go('who'); }
        return paint();
      }
      if (act === 'back') return backFrom();
      if (act === 'add') return addPerson();
      if (act === 'add-rel') { var r = byId(cfg.relatives || [], t.getAttribute('data-id')); if (r) addPerson({ name: r.name, relativeId: r.id }); return; }
      if (act === 'continue') return doContinue();
      if (act === 'half') { cur.half = t.getAttribute('data-half'); return paint(); }
      if (act === 'slot' || act === 'sugg') { cur.slot = { time: t.getAttribute('data-time'), barberId: t.getAttribute('data-barber') }; cur.note = ''; cur.alert = ''; plan.chosen = -1; return paint(); }
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'gb-who-name') { e.preventDefault(); addWhoName(); } });
    el.addEventListener('input', function (e) {
      if (e.target.id === 'gb-who-name') wsel.draft = e.target.value;
      if (e.target.id === 'gb-name') { cur.name = e.target.value; var b = zones.bar.querySelector('[data-act=name-next]'); if (b) b.disabled = !cur.name.trim(); }
    });
    el.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'gb-date') { cur.date = (t.value && t.value >= today()) ? t.value : today(); t.value = cur.date; cur.slot = null; loadSlots(cur); }
      if (t.id === 'gb-plan-date') { plan.date = (t.value && t.value >= today()) ? t.value : today(); loadPlans(); }
      if (t.getAttribute && t.getAttribute('data-act') === 'save') cur.saveRelative = t.checked;
      if (t.getAttribute && t.getAttribute('data-act') === 'who-save') wsel.draftSave = t.checked;
    });

    function savePendingRelatives() {
      var todo = people.filter(function (p) { return !p.isSelf && p.saveRelative && !p.relativeId && String(p.name || '').trim() && cfg.createRelative; });
      return Promise.all(todo.map(function (p) {
        return cfg.createRelative(String(p.name).trim()).then(function (item) { if (item) p.relativeId = item.id; }).catch(function () {});
      }));
    }
    function doContinue() {
      var todo = people.filter(function (p) { return !p.isSelf && p.saveRelative && !p.relativeId && String(p.name || '').trim() && cfg.createRelative; });
      Promise.all(todo.map(function (p) {
        return cfg.createRelative(String(p.name).trim()).then(function (item) { if (item) p.relativeId = item.id; }).catch(function () {});
      })).then(function () { cfg.onContinue(people, buildPayload(people)); });
    }

    reset();
    return {
      reset: reset,
      getPeople: function () { return people; },
      // Choix direct de « Plusieurs personnes » (ex. depuis une tuile) : l'ecran « Qui vient ? » s'ouvre deja deplie.
      openMulti: function () { reset(); wsel.multi = true; paint(); },
      focusPerson: function (i, msg) { var q = people[i]; if (!q) return; q.slot = null; q.alert = msg || ''; cur = q; sepMode = false; editing = false; go('datetime'); },
      setRelatives: function (list) { cfg.relatives = list || []; if (view === 'recap' || view === 'who') paint(); },
      setCatalog: function (c) { cfg.services = c.services || cfg.services; cfg.extras = c.extras || cfg.extras; cfg.barbers = c.barbers || cfg.barbers; slotCache = {}; }
    };
  }

  /* ---------- Panier « une personne a la fois » (rdv.html, compte.html) ----------
     Une ligne de panier : { name, isSelf, relativeId, barber_id, barber_name, service_id, service_name, extras[], extra_names[],
     products[], product_names[], date, time, dur, price_cents }. */
  // Creneaux deja retenus dans le panier ce jour-la (sauf la personne en cours) : la disponibilite ne les propose plus.
  function cartHeld(cart, date, exceptIndex) {
    return (cart || []).filter(function (e, i) { return i !== exceptIndex && e && e.date === date && e.barber_id && e.dur > 0; })
      .map(function (e) { return e.barber_id + '|' + e.date + '|' + e.time + '|' + e.dur; }).join(',');
  }
  // Envoi au serveur (/api/appointments/group ou /admin-group) : une personne par ligne, dans l'ordre du panier.
  function cartPayload(cart) {
    return (cart || []).map(function (e) {
      return { name: e.isSelf ? '' : e.name, service_id: e.service_id, extras: (e.extras || []).slice(),
               products: (e.products || []).map(function (id) { return { id: id, quantity: 1 }; }),
               barber_id: e.barber_id, date: e.date, time: e.time };
    });
  }
  function cartDate(d) { try { return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { return d; } }
  // Lignes du panier : qui, quand, quoi, avec qui, combien ; « Modifier » / retirer. eur : formateur de prix.
  function cartRowsHtml(cart, eur, fnPrefix) {
    return (cart || []).map(function (e, i) {
      var what = e.service_name + (e.extra_names && e.extra_names.length ? ' + ' + e.extra_names.join(', ') : '');
      var prod = e.product_names && e.product_names.length ? '<em>Produit' + (e.product_names.length > 1 ? 's' : '') + ' : ' + esc(e.product_names.join(', ')) + '</em>' : '';
      return '<div class="cart-row"><div class="cart-when"><b>' + esc(e.time) + '</b><span>' + esc(cartDate(e.date)) + '</span></div>' +
        '<div class="cart-what"><b>' + esc(e.name) + '</b><span>' + esc(what) + (e.barber_name ? ' · ' + esc(e.barber_name) : '') + '</span>' + prod + '</div>' +
        '<div class="cart-price">' + eur(e.price_cents || 0) + '</div>' +
        '<div class="cart-acts"><button type="button" class="cart-edit" onclick="' + fnPrefix + 'Edit(' + i + ')">Modifier</button>' +
        '<button type="button" class="cart-rm" aria-label="Retirer ' + esc(e.name) + '" onclick="' + fnPrefix + 'Remove(' + i + ')">' + ic('x') + '</button></div></div>';
    }).join('');
  }

  // Pastilles des personnes du groupe (bandeau et panier) : faite (coche), en cours, a faire ; chacune avec une croix pour
  // l'enlever tout de suite si elle ne vient plus. onlyTodo : seulement celles qui n'ont pas encore de rendez-vous.
  function peoplePillsHtml(people, cart, current, removeFn, onlyTodo) {
    return (people || []).map(function (p, i) {
      var done = (cart || []).some(function (e) { return e.person === i; });
      if (onlyTodo && done) return '';
      var st = done ? 'done' : (i === current ? 'cur' : 'todo');
      return '<span class="grp-pill ' + st + '">' + (done ? '<span class="grp-pill-ok">' + ic('same').replace('<path d="M5 9h14M5 15h14"/>', '<path d="M5 12.5l4.2 4.2L19 7"/>') + '</span>' : '') +
        '<span class="grp-pill-n">' + esc(p.name) + '</span>' +
        '<button type="button" class="grp-pill-x" aria-label="Retirer ' + esc(p.name) + '" title="Ne vient plus" onclick="' + removeFn + '(' + i + ')">' + ic('x') + '</button></span>';
    }).join('');
  }

  /** Tuile « plusieurs personnes » des grilles de coiffeurs (meme habillage que « Utiliser un cadeau »). */
  function tileHtml(onclick) {
    return '<button type="button" class="svc-card barber-tile group-tile" onclick="' + onclick + '">' +
      '<span class="icon"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17.5 14.2c2.3.3 3.5 2.2 3.5 5.8"/></svg></span>' +
      '<span class="name">Plusieurs personnes</span><span class="meta">Enfants, amis…</span></button>';
  }

  return { peoplePillsHtml: peoplePillsHtml, cartHeld: cartHeld, cartPayload: cartPayload, cartRowsHtml: cartRowsHtml, buildPlans: buildPlans, tileHtml: tileHtml, MAX_PEOPLE: MAX_PEOPLE, personDuration: personDuration, personPrice: personPrice, heldParam: heldParam, computeSuggestions: computeSuggestions, buildPayload: buildPayload, create: create };
});
