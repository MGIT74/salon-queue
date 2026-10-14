/* Reservation a plusieurs (un parent + ses enfants, des amis...) - module commun a rdv.html et compte.html.
 *
 * Meme deroule que la reservation normale, une etape par ecran (coiffeur > prestation > supplements > date/heure), repete pour chaque personne.
 * Chaque personne a SA prestation, SON coiffeur (le meme que les autres ou un autre) et SON horaire. Des raccourcis
 * « A la suite de Lucas » / « En meme temps que Lucas » proposent le bon creneau en un clic. Les creneaux deja
 * retenus par les autres personnes sont envoyes au serveur (parametre « held ») : deux personnes ne peuvent pas se
 * chevaucher chez le meme coiffeur, meme avant que quoi que ce soit soit enregistre.
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

  /** Duree (minutes) et prix (centimes) d'une personne : prestation + supplements choisis. */
  function personDuration(p, services, extras) {
    var s = byId(services, p.serviceId), d = s ? Number(s.duration_min) || 0 : 0;
    (p.extraIds || []).forEach(function (id) { var e = byId(extras, id); if (e) d += Number(e.duration_min) || 0; });
    return d;
  }
  function personPrice(p, services, extras) {
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
    '.gb-pill-x{position:absolute;right:0;top:0;border:none;background:var(--fill);color:var(--grey);width:26px;height:26px;border-radius:50%;font-size:12px;cursor:pointer;font-family:inherit;flex:none}.gb-pill-x:hover{color:#fff;background:#ff3b30}' +
    'button.gb-pill{border:none;font-family:inherit;cursor:pointer}button.gb-pill:hover{filter:brightness(1.25)}' +
    '.gb-menu{flex-basis:100%;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--sep);border-radius:12px;padding:4px;margin-top:2px}' +
    '.gb-menu button{border:none;background:none;color:var(--ink);text-align:left;padding:9px 10px;border-radius:8px;font-family:inherit;font-size:14px;cursor:pointer}.gb-menu button:hover,.gb-menu button.on{background:var(--fill)}.gb-menu button.on{font-weight:600}' +
    '.gb-whos{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:22px}' +
    '.gb-who{display:inline-flex;align-items:center;gap:10px;border:2px solid transparent;background:var(--fill);color:var(--ink);border-radius:16px;padding:12px 18px 12px 12px;font-family:inherit;font-size:16px;font-weight:600;cursor:pointer}' +
    '.gb-who i{font-style:normal;width:32px;height:32px;border-radius:50%;background:var(--blue-soft);color:var(--blue);display:flex;align-items:center;justify-content:center;font-size:14px}' +
    '.gb-who.on{border-color:var(--blue);background:var(--blue-soft)}.gb-who.on i{background:var(--blue);color:#fff}' +
    '.gb-addrow{display:flex;gap:8px}.gb-addrow input{flex:1;min-width:0}' +
    '.gb-pills{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}' +
    '.gb-pill{display:inline-flex;align-items:center;gap:6px;background:var(--fill);color:var(--ink);border-radius:999px;padding:5px 11px;font-size:13px;font-weight:500;line-height:1.3}' +
    '.gb-pill b{font-weight:700}' +
    '.gb-pill.who{background:var(--blue);color:#fff;font-weight:600;padding-left:5px}' +
    '.gb-pill.who i{font-style:normal;width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.25);display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}' +
    '.gb-rows{display:flex;flex-direction:column;gap:10px;margin-bottom:14px}' +
    '.gb-row{display:flex;align-items:center;gap:12px;background:var(--fill);border-radius:16px;padding:12px 14px}' +
    '.gb-av{width:38px;height:38px;border-radius:50%;background:var(--blue-soft);color:var(--blue);font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}' +
    '.gb-info{flex:1;min-width:0}.gb-info b{display:block;font-size:16px}.gb-info span{display:block;font-size:13.5px;color:var(--grey);margin-top:2px}' +
    '.gb-info span.todo{color:#ff9500}' +
    '.gb-mini{border:none;background:var(--card);color:var(--ink);border-radius:10px;padding:9px 13px;font-family:inherit;font-size:14px;cursor:pointer}' +
    '.gb-mini.x{color:var(--grey);padding:9px 11px}.gb-mini.x:hover{color:#ff3b30}' +
    '.gb-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}' +
    '.gb-chip{border:1px solid var(--sep);background:var(--fill);color:var(--ink);border-radius:999px;padding:9px 14px;font-family:inherit;font-size:14px;cursor:pointer}' +
    '.gb-chip.sugg{border-color:var(--blue);color:var(--blue);background:var(--blue-soft)}' +
    '.gb-addbtn{border:1px dashed var(--blue);background:none;color:var(--blue);border-radius:14px;padding:13px;font-family:inherit;font-size:15px;font-weight:600;cursor:pointer;width:100%;margin-bottom:14px}' +
    '.gb-total{display:flex;justify-content:space-between;font-weight:600;font-size:15px;margin:6px 0 12px}' +
    '.gb-empty{color:var(--grey);font-size:13.5px;padding:6px 0;text-align:center}' +
    '.gb-ok{color:var(--blue);font-weight:600;font-size:14px;margin:10px 0 14px}' +
    '.gb-warn{color:#ff9500;font-size:13px;margin:6px 0}' +
    '.gb-save{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--grey);margin:4px 0 16px}' +
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

  /**
   * cfg : { mount, api(path), services, extras, barbers, relatives, createRelative(name), onContinue(people, payload), onExit(),
   *         eur, toast, continueLabel, today() }
   */
  function create(cfg) {
    injectStyle();
    var people = [], uid = 0, view = 'who', cur = null, fromWho = false, menuFor = null, wsel = null;
    // Trois zones (en-tete / liste / colonne de droite) : fournies par la page (cfg.zones, mises en page comme la reservation normale),
    // sinon creees dans cfg.mount.
    var zones = cfg.zones;
    if (!zones) {
      cfg.mount.innerHTML = '<div class="gb"><div class="flow-top"></div><div class="flow-body"></div><div class="step-bar"></div></div>';
      zones = { top: cfg.mount.querySelector('.flow-top'), body: cfg.mount.querySelector('.flow-body'), bar: cfg.mount.querySelector('.step-bar') };
    }
    var el = { contains: function (n) { return zones.top.contains(n) || zones.body.contains(n) || zones.bar.contains(n); },
               addEventListener: function (t, f) { [zones.top, zones.body, zones.bar].forEach(function (z) { z.addEventListener(t, f); }); },
               querySelector: function (q) { return zones.top.querySelector(q) || zones.body.querySelector(q) || zones.bar.querySelector(q); } };
    var eur = cfg.eur || function (c) { return (c / 100).toFixed(2) + ' €'; };
    var today = function () { return cfg.today ? cfg.today() : new Date().toISOString().slice(0, 10); };
    var STEPS = ['barber', 'service', 'extras', 'datetime'];

    function newPerson(init) {
      var p = { uid: ++uid, isSelf: false, name: '', relativeId: null, saveRelative: false, serviceId: '', extraIds: [], pref: '', date: today(), slots: null, slot: null,
                loading: false, req: 0, half: 'morning', note: '', suggestions: [], barberSlots: {} };
      for (var k in (init || {})) p[k] = init[k];
      return p;
    }
    function label(p) { return p.isSelf ? 'Vous' : (String(p.name || '').trim() || 'Personne ' + (people.indexOf(p) + 1)); }
    function shortName(p) { return p.isSelf ? 'vous' : label(p); }
    function barberName(id) { var b = byId(cfg.barbers, id); return b ? b.name : ''; }
    function fmtDate(d) { try { return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { return d; } }
    function complete(p) { return !!(p.serviceId && p.slot && (p.isSelf || String(p.name || '').trim())); }
    function stepsFor(p) { return STEPS.filter(function (s) { return s !== 'extras' || (cfg.extras && cfg.extras.length); }).concat(p.isSelf ? [] : []); }

    function newWho() { return { self: true, rels: {}, extra: [], draft: '', draftSave: false }; }
    function reset() { people = []; cur = null; fromWho = false; menuFor = null; wsel = newWho(); view = 'who'; paint(); }
    function whoCount() { return (wsel.self ? 1 : 0) + Object.keys(wsel.rels).filter(function (k) { return wsel.rels[k]; }).length + wsel.extra.length; }
    function addWhoName() {
      var n = String(wsel.draft || '').trim(); if (!n) return;
      var low = n.toLowerCase(), rel = (cfg.relatives || []).filter(function (r) { return String(r.name).toLowerCase() === low; })[0];
      if (rel) wsel.rels[rel.id] = true;
      else if (!wsel.extra.some(function (x) { return x.name.toLowerCase() === low; })) wsel.extra.push({ name: n, save: !!wsel.draftSave });
      wsel.draft = ''; paint();
    }
    // Construit (ou met a jour, sans perdre ce qui est deja choisi) la liste des personnes depuis l'ecran « Qui vient ? ».
    function applyWho() {
      var next = [];
      function keep(match, init) { var f = people.filter(match)[0]; next.push(f || newPerson(init)); }
      if (wsel.self) keep(function (p) { return p.isSelf; }, { isSelf: true });
      (cfg.relatives || []).forEach(function (r) { if (wsel.rels[r.id]) keep(function (p) { return String(p.relativeId) === String(r.id); }, { name: r.name, relativeId: r.id }); });
      wsel.extra.forEach(function (x) { keep(function (p) { return !p.isSelf && !p.relativeId && p.name === x.name; }, { name: x.name, saveRelative: x.save }); });
      people = next.slice(0, MAX_PEOPLE);
    }
    function personByUid(u) { for (var i = 0; i < people.length; i++) if (String(people[i].uid) === String(u)) return people[i]; return null; }
    function nextIncomplete(after) {
      for (var i = after + 1; i < people.length; i++) if (!complete(people[i])) return people[i];
      return null;
    }

    /* ---------- Creneaux ---------- */
    function slotsUrl(p, barber, held) {
      return '/api/appointments/availability?date=' + p.date + '&service_id=' + p.serviceId + '&extras=' + p.extraIds.join(',') +
        (barber ? '&barber_id=' + barber : '') + (held ? '&held=' + encodeURIComponent(held) : '');
    }
    function loadSlots(p) {
      if (!p.serviceId || !p.date) { p.slots = null; p.suggestions = []; return; }
      var token = ++p.req; p.loading = true; p.slots = null; paint();
      var held = heldParam(people, people.indexOf(p), p.date, cfg.services, cfg.extras);
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
        return { name: shortName(o), date: o.date, time: o.slot.time, barberId: o.slot.barberId, duration: personDuration(o, cfg.services, cfg.extras) };
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

    /* ---------- Rendu ---------- */
    // Trois zones comme la reservation normale : en-tete (retour + titre), liste qui defile, colonne de droite (recapitulatif + bouton).
    function back(label2) { return '<button type="button" class="back" data-act="back">‹ ' + (label2 || 'Retour') + '</button>'; }
    function goBtn(text, disabled, act) { return '<button type="button" class="go" data-act="' + (act || 'next') + '"' + (disabled ? ' disabled' : '') + '>' + text + '</button>'; }
    function fmtMin(m) { return typeof formatMinutes === 'function' ? formatMinutes(m) : m + ' min'; }

    // Recapitulatif detaille : un bloc par personne (meme habillage que celui de la reservation normale) + total.
    function recapHtml() {
      var html = '', cents = 0;
      people.forEach(function (p) {
        var s = byId(cfg.services, p.serviceId), who = label(p) + (p.isSelf ? '' : '');
        var b = p.slot ? barberName(p.slot.barberId) : (p.pref ? barberName(p.pref) : '');
        var menu = '';
        if (menuFor === p.uid) menu = '<div class="gb-menu">' + cfg.barbers.map(function (bb) {
          return '<button type="button" data-act="set-barber" data-uid="' + p.uid + '" data-id="' + esc(bb.id) + '"' + (String(bb.id) === String(p.slot ? p.slot.barberId : p.pref) ? ' class="on"' : '') + '>' + esc(bb.name) + '</button>'; }).join('') + '</div>';
        var pills = '<button type="button" class="gb-pill who" data-act="pill-who" data-uid="' + p.uid + '" title="Modifier"><i>' + esc(who.charAt(0).toUpperCase()) + '</i>' + esc(who) + '</button>' +
          (b ? '<button type="button" class="gb-pill" data-act="pill-barber" data-uid="' + p.uid + '" title="Changer de coiffeur">' + ic('scissors') + esc(b) + ic('chev') + '</button>' : '') +
          (p.slot ? '<button type="button" class="gb-pill" data-act="pill-date" data-uid="' + p.uid + '" title="Changer la date ou l\'heure">' + ic('calendar') + esc(fmtDate(p.date)) + ' · <b>' + esc(p.slot.time) + '</b></button>' : '') +
          (s ? '<span class="gb-pill dur" title="Durée estimée">' + ic('clock') + esc(fmtMin(personDuration(p, cfg.services, cfg.extras))) + '</span>' : '') +
          '<button type="button" class="gb-pill-x" data-act="rm" data-uid="' + p.uid + '" title="Retirer ' + esc(who) + '" aria-label="Retirer ' + esc(who) + '">' + ic('x') + '</button>' + menu;
        var rows = '';
        function row(k, n, meta, price) { rows += '<div class="recap-row"><span class="recap-k">' + k + '</span><span class="recap-n">' + esc(n) + (meta ? ' <em>' + esc(meta) + '</em>' : '') + '</span><span class="recap-p">' + price + '</span></div>'; }
        if (s) {
          row('Prestation', s.name, Number(s.duration_min) > 0 ? fmtMin(s.duration_min) : '', eur(Number(s.price_cents) || 0));
          (p.extraIds || []).forEach(function (id) { var x = byId(cfg.extras, id); if (x) row('Supplément', x.name, Number(x.duration_min) > 0 ? '+' + fmtMin(x.duration_min) : '', '+' + eur(Number(x.price_cents) || 0)); });
        }
        cents += personPrice(p, cfg.services, cfg.extras);
        html += '<div class="gb-recap-person' + (p === cur && view !== 'recap' ? ' on' : '') + '"><div class="gb-pills">' + pills + '</div>' +
          (rows ? '<div class="recap-list">' + rows + '</div>' : '') + '</div>';
      });
      return html + '<div class="recap-total"><span>Total · ' + people.length + ' personne' + (people.length > 1 ? 's' : '') + '</span><span><strong>' + eur(cents) + '</strong></span></div>';
    }

    function views() {
      if (view === 'who') {
        var chips = '<button type="button" class="gb-who' + (wsel.self ? ' on' : '') + '" data-act="who-self"><i>M</i>Moi</button>';
        (cfg.relatives || []).forEach(function (r) { chips += '<button type="button" class="gb-who' + (wsel.rels[r.id] ? ' on' : '') + '" data-act="who-rel" data-id="' + esc(r.id) + '"><i>' + esc(String(r.name).charAt(0).toUpperCase()) + '</i>' + esc(r.name) + '</button>'; });
        wsel.extra.forEach(function (x, i) { chips += '<button type="button" class="gb-who on" data-act="who-del" data-i="' + i + '" title="Retirer"><i>' + esc(x.name.charAt(0).toUpperCase()) + '</i>' + esc(x.name) + ic('x') + '</button>'; });
        var n = whoCount();
        return { top: back() + '<div class="eyebrow">Qui vient au salon ?</div><p class="step-sub">Cochez les personnes à inscrire. Vous n\'êtes pas obligé de réserver pour vous.</p>',
          body: '<div class="gb-whos">' + chips + '</div>' +
            '<div class="fld"><label for="gb-who-name">Ajouter quelqu\'un d\'autre</label><div class="gb-addrow"><input id="gb-who-name" maxlength="60" autocomplete="off" placeholder="Prénom" value="' + esc(wsel.draft) + '"><button type="button" class="gb-mini" data-act="who-add">Ajouter</button></div></div>' +
            (cfg.createRelative ? '<label class="gb-save"><input type="checkbox" data-act="who-save"' + (wsel.draftSave ? ' checked' : '') + '> Enregistrer ce prénom dans « Mes proches »</label>' : ''),
          go: goBtn('Suivant', n < 1, 'who-next'), hint: n < 1 ? 'Choisissez au moins une personne.' : n > MAX_PEOPLE ? 'Maximum ' + MAX_PEOPLE + ' personnes.' : '' };
      }
      if (view === 'recap') {
        var ready = people.length > 0 && people.every(complete);
        var used = {}; people.forEach(function (p) { if (p.relativeId) used[p.relativeId] = true; });
        var rels = (cfg.relatives || []).filter(function (r) { return !used[r.id]; });
        var body = '<div class="gb-rows">';
        people.forEach(function (p, i) {
          var s = byId(cfg.services, p.serviceId);
          var line = complete(p) ? esc(s.name) + (barberName(p.slot.barberId) ? ' · ' + esc(barberName(p.slot.barberId)) : '') + '<br>' + esc(fmtDate(p.date)) + ' à ' + esc(p.slot.time) : '<span class="todo">À compléter</span>';
          body += '<div class="gb-row" data-i="' + i + '"><span class="gb-av">' + esc(label(p).charAt(0).toUpperCase()) + '</span><div class="gb-info"><b>' + esc(label(p)) + '</b><span>' + line + '</span></div>' +
            '<button type="button" class="gb-mini" data-act="edit">' + (complete(p) ? 'Modifier' : 'Compléter') + '</button>' +
            '<button type="button" class="gb-mini x" data-act="remove" aria-label="Retirer">' + ic('x') + '</button>' + '</div>';
        });
        body += '</div>';
        if (people.length < MAX_PEOPLE) {
          if (rels.length) body += '<div class="gb-chips">' + rels.map(function (r) { return '<button type="button" class="gb-chip" data-act="add-rel" data-id="' + esc(r.id) + '">+ ' + esc(r.name) + '</button>'; }).join('') + '</div>';
          body += '<button type="button" class="gb-addbtn" data-act="add">+ Ajouter une personne</button>';
        } else body += '<div class="gb-empty">Maximum ' + MAX_PEOPLE + ' personnes par réservation.</div>';
        return { top: back() + '<div class="eyebrow">Réserver pour plusieurs personnes</div><p class="step-sub">Chaque personne a sa prestation, son coiffeur et son horaire : à la suite, en même temps ou décalés.</p>',
                 body: body, go: goBtn(esc(cfg.continueLabel || 'Continuer'), !ready, 'continue'),
                 hint: !people.length ? 'Ajoutez au moins une personne.' : !ready ? 'Complétez chaque personne (prestation et horaire).' : '' };
      }
      var p = cur, who = p.isSelf ? '' : esc(label(p)) + ' — ';
      if (view === 'name') return { top: back() + '<div class="eyebrow">Qui vient avec vous ?</div>',
        body: '<div class="fld"><label for="gb-name">Prénom</label><input id="gb-name" maxlength="60" autocomplete="off" value="' + esc(p.name) + '"></div>' +
          (cfg.createRelative ? '<label class="gb-save"><input type="checkbox" data-act="save"' + (p.saveRelative ? ' checked' : '') + '> Ajouter ce prénom à « Mes proches »</label>' : ''),
        go: goBtn('Suivant', !String(p.name || '').trim()) };
      if (view === 'barber') return { top: back() + '<div class="eyebrow">' + who + 'Choisissez le coiffeur</div>',
        body: '<div class="svc-grid">' +
          cfg.barbers.map(function (b) { return barberCard(b, String(p.pref) === String(b.id)).replace('<button', '<button data-pick="barber"'); }).join('') + '</div>', go: goBtn('Suivant', !p.pref) };
      if (view === 'service') return { top: back() + '<div class="eyebrow">' + who + 'Prestation</div>',
        body: '<div class="item-grid">' + cfg.services.map(function (it) { return itemCard('services', it, String(p.serviceId) === String(it.id)).replace('<button', '<button data-pick="service"'); }).join('') + '</div>',
        go: goBtn('Suivant', !p.serviceId) };
      if (view === 'extras') return { top: back() + '<div class="eyebrow">' + who + 'Suppléments (optionnels)</div><p class="step-sub">Personnalisez la prestation : touchez pour ajouter.</p>',
        body: '<div class="item-grid">' + cfg.extras.map(function (it) { return itemCard('extras', it, p.extraIds.indexOf(String(it.id)) !== -1).replace('<button', '<button data-pick="extra"'); }).join('') + '</div>', go: goBtn('Suivant', false) };
      // date et heure
      var morning = (p.slots || []).filter(function (s) { return s.time < '12:00'; }), aft = (p.slots || []).filter(function (s) { return s.time >= '12:00'; });
      var body2 = '<div class="fld"><label for="gb-date">Date</label><input id="gb-date" type="date" min="' + today() + '" value="' + esc(p.date) + '"></div>';
      if (p.suggestions && p.suggestions.length) body2 += '<div class="gb-chips">' + p.suggestions.map(function (sg) {
        return '<button type="button" class="gb-chip sugg" data-act="sugg" data-time="' + esc(sg.time) + '" data-barber="' + esc(sg.barberId) + '">' + (sg.kind === 'after' ? ic('next') + 'À la suite de ' : ic('same') + 'En même temps que ') + esc(sg.name) + ' · ' + esc(sg.time) + (barberName(sg.barberId) ? ' · ' + esc(barberName(sg.barberId)) : '') + '</button>'; }).join('') + '</div>';
      body2 += '<div class="eyebrow" style="margin-top:20px">Créneaux disponibles</div>';
      if (morning.length && aft.length) body2 += '<div class="half-toggle" style="margin-bottom:14px"><button type="button" class="' + (p.half === 'morning' ? 'sel' : '') + '" data-act="half" data-half="morning">Matin</button><button type="button" class="' + (p.half === 'afternoon' ? 'sel' : '') + '" data-act="half" data-half="afternoon">Après-midi</button></div>';
      var list = (morning.length && aft.length) ? (p.half === 'morning' ? morning : aft) : (p.slots || []);
      body2 += '<div class="slots-grid">' + (p.loading || !p.slots ? '<div class="empty">Chargement…</div>' : !list.length ? '<div class="empty">Aucun créneau disponible ce jour-là</div>' :
        list.map(function (s) { var on = p.slot && p.slot.time === s.time && String(p.slot.barberId) === String(s.barber_id);
          return '<button type="button" class="slot-btn' + (on ? ' sel' : '') + '" data-act="slot" data-time="' + esc(s.time) + '" data-barber="' + esc(s.barber_id) + '">' + esc(s.time) + '</button>'; }).join('')) + '</div>';
      if (p.note || p.alert) body2 += '<div class="gb-warn">' + esc(p.alert || p.note) + '</div>';
      return { top: back() + '<div class="eyebrow">' + who + 'Date et heure</div>', body: body2, go: goBtn('Valider', !p.slot) };
    }

    function paint() {
      var v = views(), keep = zones.body.scrollTop;
      zones.top.innerHTML = v.top; zones.body.innerHTML = v.body;
      zones.bar.innerHTML = '<div class="flow-recap">' + recapHtml() + '</div>' + v.go + (v.hint ? '<div class="gb-empty">' + v.hint + '</div>' : '');
      zones.body.scrollTop = keep;
    }

    /* ---------- Navigation ---------- */
    function go(v) { view = v; menuFor = null; paint(); if (v === 'datetime') loadSlots(cur); }
    function firstStep(p) { return p.isSelf || p.name || p.relativeId ? 'barber' : 'name'; }
    function nextStep() {
      if (view === 'name') return go('barber');
      var seq = stepsFor(cur), i = seq.indexOf(view);
      if (i < seq.length - 1) return go(seq[i + 1]);
      // fin de la personne : si on enchaine depuis « Qui vient ? », on passe a la suivante, sinon retour au recapitulatif
      var nx = fromWho ? nextIncomplete(people.indexOf(cur)) : null;
      if (nx) { cur = nx; return go('barber'); }
      fromWho = false; go('recap');
    }
    function prevStep() {
      var seq = stepsFor(cur), i = seq.indexOf(view);
      if (fromWho && view === 'barber') {
        var k = people.indexOf(cur);
        if (k <= 0) { fromWho = false; return go('who'); }
        cur = people[k - 1]; return go('datetime');
      }
      if (view === 'barber' && !cur.isSelf && !cur.relativeId) return go('name');
      if (i > 0) return go(seq[i - 1]);
      // premiere etape : on quitte la personne
      if (!complete(cur) && !cur.isSelf) people.splice(people.indexOf(cur), 1);
      if (people.length === 1 && !complete(people[0]) && cur.isSelf) { if (cfg.onExit) cfg.onExit(); return; }
      go('recap');
    }
    function addPerson(init) {
      if (people.length >= MAX_PEOPLE) return;
      var prev = people[people.length - 1], np = newPerson(init || {});
      if (prev) np.date = prev.date;
      people.push(np); cur = np; go(firstStep(np));
    }

    el.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-act],[data-pick]') : null; if (!t || !el.contains(t)) return;
      var pick = t.getAttribute('data-pick'), act = t.getAttribute('data-act');
      if (pick) {
        var id = t.getAttribute('data-id') != null && pick !== 'barber' ? t.getAttribute('data-id') : (t.getAttribute('data-barber-id') || t.getAttribute('data-id') || '');
        if (pick === 'barber') { if (String(cur.pref) !== String(id)) { cur.pref = id; cur.slot = null; cur.slots = null; } paint(); return; }
        if (pick === 'service') { if (String(cur.serviceId) !== String(id)) { cur.serviceId = id; cur.slot = null; cur.slots = null; } paint(); return; }
        if (pick === 'extra') { var k = cur.extraIds.indexOf(String(id)); if (k === -1) cur.extraIds.push(String(id)); else cur.extraIds.splice(k, 1); cur.slot = null; cur.slots = null; paint(); return; }
      }
      var row = t.closest('.gb-row'), i = row ? Number(row.getAttribute('data-i')) : -1;
      if (act === 'who-self') { wsel.self = !wsel.self; return paint(); }
      if (act === 'who-rel') { var rid = t.getAttribute('data-id'); wsel.rels[rid] = !wsel.rels[rid]; return paint(); }
      if (act === 'who-del') { wsel.extra.splice(Number(t.getAttribute('data-i')), 1); return paint(); }
      if (act === 'who-add') return addWhoName();
      if (act === 'who-next') {
        if (whoCount() < 1) return;
        if (whoCount() > MAX_PEOPLE) { if (cfg.toast) cfg.toast('Maximum ' + MAX_PEOPLE + ' personnes.', true); return; }
        applyWho(); fromWho = true; cur = nextIncomplete(-1) || people[0]; return go('barber');
      }
      if (act === 'pill-who') { var pw = personByUid(t.getAttribute('data-uid')); if (pw) { cur = pw; go('barber'); } return; }
      if (act === 'pill-date') { var pd = personByUid(t.getAttribute('data-uid')); if (pd && pd.serviceId) { cur = pd; go('datetime'); } return; }
      if (act === 'pill-barber') { var pb = personByUid(t.getAttribute('data-uid')); menuFor = menuFor === (pb && pb.uid) ? null : (pb && pb.uid); return paint(); }
      if (act === 'set-barber') {
        var ps = personByUid(t.getAttribute('data-uid')), bid = t.getAttribute('data-id'); menuFor = null;
        if (!ps) return paint();
        if (String(ps.pref) !== String(bid) || (ps.slot && String(ps.slot.barberId) !== String(bid))) { ps.pref = bid; ps.slot = null; ps.slots = null; ps.suggestions = []; }
        if (ps.serviceId) { cur = ps; return go('datetime'); }   // les creneaux du nouveau coiffeur se rechargent
        return paint();
      }
      if (act === 'rm') {
        var pr = personByUid(t.getAttribute('data-uid')); if (!pr) return;
        people.splice(people.indexOf(pr), 1); menuFor = null;
        if (!people.length) { fromWho = false; wsel = newWho(); return go('who'); }
        if (cur === pr) { cur = people[0]; fromWho = false; return go('recap'); }
        return paint();
      }
      if (act === 'back') return view === 'who' ? (cfg.onExit && cfg.onExit()) : view === 'recap' ? (cfg.onExit && cfg.onExit()) : prevStep();
      if (act === 'next') return nextStep();
      if (act === 'add') return addPerson();
      if (act === 'add-rel') { var r = byId(cfg.relatives || [], t.getAttribute('data-id')); if (r) addPerson({ name: r.name, relativeId: r.id }); return; }
      if (act === 'edit') { cur = people[i]; return go('barber'); }
      if (act === 'remove') { people.splice(i, 1); return paint(); }
      if (act === 'continue') return doContinue();
      if (act === 'half') { cur.half = t.getAttribute('data-half'); return paint(); }
      if (act === 'slot' || act === 'sugg') { cur.slot = { time: t.getAttribute('data-time'), barberId: t.getAttribute('data-barber') }; cur.note = ''; cur.alert = ''; return paint(); }
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'gb-who-name') { e.preventDefault(); addWhoName(); } });
    el.addEventListener('input', function (e) {
      if (e.target.id === 'gb-who-name') wsel.draft = e.target.value;
      if (e.target.id === 'gb-name') { cur.name = e.target.value; var b = zones.bar.querySelector('[data-act=next]'); if (b) b.disabled = !cur.name.trim(); }
    });
    el.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'gb-date') { cur.date = t.value; cur.slot = null; loadSlots(cur); }
      if (t.getAttribute && t.getAttribute('data-act') === 'save') cur.saveRelative = t.checked;
      if (t.getAttribute && t.getAttribute('data-act') === 'who-save') wsel.draftSave = t.checked;
    });

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
      focusPerson: function (i, msg) { var q = people[i]; if (!q) return; q.slot = null; q.alert = msg || ''; cur = q; fromWho = false; go('datetime'); },
      setRelatives: function (list) { cfg.relatives = list || []; if (view === 'recap' || view === 'who') paint(); },
      setCatalog: function (c) { cfg.services = c.services || cfg.services; cfg.extras = c.extras || cfg.extras; cfg.barbers = c.barbers || cfg.barbers; }
    };
  }

  return { MAX_PEOPLE: MAX_PEOPLE, personDuration: personDuration, personPrice: personPrice, heldParam: heldParam, computeSuggestions: computeSuggestions, buildPayload: buildPayload, create: create };
});
