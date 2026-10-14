/* Reservation a plusieurs (un parent + ses enfants, des amis...) - module commun a rdv.html et compte.html.
 *
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

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  var STYLE = '' +
    '.gb{display:flex;flex-direction:column;gap:14px}' +
    '.gb-hint{color:var(--grey);font-size:14px;margin:-6px 0 4px}' +
    '.gb-person{background:var(--card);border:1px solid var(--sep);border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:12px}' +
    '.gb-head{display:flex;align-items:center;gap:10px}' +
    '.gb-av{width:34px;height:34px;border-radius:50%;background:var(--blue-soft);color:var(--blue);font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}' +
    '.gb-name{flex:1;min-width:0;font-size:16px;font-weight:600;border:none;border-bottom:1px dashed var(--sep);background:none;color:var(--ink);padding:4px 2px;font-family:inherit;outline:none}' +
    '.gb-name:focus{border-bottom-color:var(--blue)}' +
    '.gb-self{flex:1;font-size:16px;font-weight:600}' +
    '.gb-x{border:none;background:var(--fill);color:var(--grey);width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px;line-height:1}' +
    '.gb-x:hover{color:#ff3b30}' +
    '.gb-lbl{font-size:12px;font-weight:600;color:var(--grey);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}' +
    '.gb-chips{display:flex;flex-wrap:wrap;gap:6px}' +
    '.gb-chip{border:1px solid var(--sep);background:var(--fill);color:var(--ink);border-radius:999px;padding:8px 13px;font-family:inherit;font-size:13.5px;cursor:pointer;transition:background .15s,color .15s,border-color .15s}' +
    '.gb-chip small{color:var(--grey);margin-left:5px}' +
    '.gb-chip.on{background:var(--blue);border-color:var(--blue);color:#fff}.gb-chip.on small{color:rgba(255,255,255,.8)}' +
    '.gb-chip.sugg{border-color:var(--blue);color:var(--blue);background:var(--blue-soft)}' +
    '.gb-chip:disabled{opacity:.4;cursor:default}' +
    '.gb-date{border:1px solid var(--sep);background:var(--fill);color:var(--ink);border-radius:12px;padding:10px 12px;font-family:inherit;font-size:15px;max-width:100%}' +
    '.gb-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:6px;max-height:188px;overflow:auto}' +
    '.gb-slot{border:1px solid var(--sep);background:var(--fill);color:var(--ink);border-radius:10px;padding:9px 0;font-family:inherit;font-size:14px;cursor:pointer}' +
    '.gb-slot.on{background:var(--blue);border-color:var(--blue);color:#fff;font-weight:600}' +
    '.gb-empty{color:var(--grey);font-size:13.5px;padding:6px 0}' +
    '.gb-ok{color:var(--blue);font-weight:600;font-size:14px}' +
    '.gb-warn{color:#ff9500;font-size:13px}' +
    '.gb-save{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--grey)}' +
    '.gb-add{display:flex;flex-direction:column;gap:10px}' +
    '.gb-addrow{display:flex;gap:8px}' +
    '.gb-addrow input{flex:1;min-width:0;border:1px solid var(--sep);background:var(--fill);color:var(--ink);border-radius:12px;padding:11px 12px;font-family:inherit;font-size:15px}' +
    '.gb-addbtn{border:1px dashed var(--blue);background:none;color:var(--blue);border-radius:14px;padding:12px;font-family:inherit;font-size:15px;font-weight:600;cursor:pointer;width:100%}' +
    '.gb-foot{display:flex;flex-direction:column;gap:10px;margin-top:2px}' +
    '.gb-total{display:flex;justify-content:space-between;font-weight:600;font-size:15px}';

  function injectStyle() {
    if (typeof document === 'undefined' || document.getElementById('gb-style')) return;
    var st = document.createElement('style'); st.id = 'gb-style'; st.textContent = STYLE; document.head.appendChild(st);
  }

  /**
   * cfg : { mount, api(path), services, extras, barbers, relatives, createRelative(name), onContinue(people), eur, toast,
   *         continueLabel, today() }
   */
  function create(cfg) {
    injectStyle();
    var el = cfg.mount, people = [], uid = 0, eur = cfg.eur || function (c) { return (c / 100).toFixed(2) + ' €'; };
    var today = function () { return cfg.today ? cfg.today() : new Date().toISOString().slice(0, 10); };
    var timers = {};

    function newPerson(init) {
      var p = { uid: ++uid, isSelf: false, name: '', relativeId: null, saveRelative: false, serviceId: '', extraIds: [], pref: '', date: '', slots: null, slot: null,
                loading: false, req: 0, showExtras: false, note: '', suggestions: [], barberSlots: {} };
      for (var k in (init || {})) p[k] = init[k];
      return p;
    }
    function find(u) { for (var i = 0; i < people.length; i++) if (people[i].uid === Number(u)) return people[i]; return null; }
    function label(p) { return p.isSelf ? 'Vous' : (String(p.name || '').trim() || 'Personne ' + (people.indexOf(p) + 1)); }
    function shortName(p) { return p.isSelf ? 'vous' : label(p); }

    function reset() {
      people = [newPerson({ isSelf: true }), newPerson({})];
      var d = today(); people.forEach(function (p) { p.date = d; });
      paint();
    }

    /* ---------- Chargement des creneaux ---------- */
    function slotsUrl(p, barber, held) {
      return '/api/appointments/availability?date=' + p.date + '&service_id=' + p.serviceId + '&extras=' + p.extraIds.join(',') +
        (barber ? '&barber_id=' + barber : '') + (held ? '&held=' + encodeURIComponent(held) : '');
    }
    function loadSlots(p, cascade) {
      if (!p.serviceId || !p.date) { p.slots = null; p.suggestions = []; paintPerson(p); return; }
      var token = ++p.req; p.loading = true; paintPerson(p);
      var held = heldParam(people, people.indexOf(p), p.date, cfg.services, cfg.extras);
      cfg.api(slotsUrl(p, p.pref, held)).then(function (r) {
        if (token !== p.req) return;
        p.slots = r.slots || []; p.loading = false; p.note = '';
        if (p.slot && !p.slots.some(function (s) { return s.time === p.slot.time && String(s.barber_id) === String(p.slot.barberId); })) {
          p.slot = null; p.note = "Ce créneau n'est plus libre, choisissez-en un autre.";
          if (cascade !== false) refreshOthers(p, false);
        }
        return loadSuggestions(p, held, token);
      }).catch(function (e) { if (token !== p.req) return; p.loading = false; p.slots = []; paintPerson(p); if (cfg.toast) cfg.toast(e.message, true); });
    }
    // Raccourcis « a la suite » / « en meme temps » : si la personne est en « premier disponible », on va chercher les creneaux
    // du coiffeur de l'autre personne pour trouver le creneau juste apres elle.
    function loadSuggestions(p, held, token) {
      var others = people.filter(function (o) { return o !== p && o.slot && o.date === p.date; }).map(function (o) {
        return { name: shortName(o), date: o.date, time: o.slot.time, barberId: o.slot.barberId, duration: personDuration(o, cfg.services, cfg.extras) };
      });
      var need = {};
      if (!p.pref) others.forEach(function (o) { need[o.barberId] = true; });
      var ids = Object.keys(need), jobs = ids.map(function (bid) {
        return cfg.api(slotsUrl(p, bid, held)).then(function (r) { return [bid, r.slots || []]; }).catch(function () { return [bid, []]; });
      });
      return Promise.all(jobs).then(function (pairs) {
        if (token !== p.req) return;
        p.barberSlots = {}; pairs.forEach(function (x) { p.barberSlots[x[0]] = x[1]; });
        if (p.pref) others.forEach(function (o) { if (String(o.barberId) === String(p.pref)) p.barberSlots[o.barberId] = p.slots; });
        p.suggestions = computeSuggestions({ date: p.date, pref: p.pref, slots: p.slots, barberSlots: p.barberSlots, others: others });
        paintPerson(p); paintFoot();
      });
    }
    function refreshOthers(except, cascade) {
      people.forEach(function (o) {
        if (o === except || !o.serviceId || !o.date) return;
        clearTimeout(timers[o.uid]);
        timers[o.uid] = setTimeout(function () { loadSlots(o, cascade); }, 120);
      });
    }
    function onSlotChanged(p) { refreshOthers(p, true); }

    /* ---------- Rendu ---------- */
    function fmtDate(d) { try { return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { return d; } }
    function barberName(id) { var b = byId(cfg.barbers, id); return b ? b.name : ''; }

    function personHtml(p) {
      var i = people.indexOf(p), isLast = people.length === 1;
      var h = '<div class="gb-person" data-uid="' + p.uid + '">';
      h += '<div class="gb-head"><span class="gb-av">' + esc(label(p).charAt(0).toUpperCase()) + '</span>';
      h += p.isSelf ? '<span class="gb-self">Vous</span>'
        : '<input class="gb-name" data-act="name" maxlength="60" placeholder="Prénom" value="' + esc(p.name) + '" autocomplete="off">';
      h += '<button type="button" class="gb-x" data-act="remove" title="Retirer" aria-label="Retirer"' + (isLast ? ' disabled style="opacity:.3"' : '') + '>×</button></div>';
      if (!p.isSelf && !p.relativeId && cfg.createRelative && String(p.name || '').trim()) {
        h += '<label class="gb-save"><input type="checkbox" data-act="save"' + (p.saveRelative ? ' checked' : '') + '> Ajouter ce prénom à « Mes proches »</label>';
      }
      h += '<div><div class="gb-lbl">Prestation</div><div class="gb-chips">' + cfg.services.map(function (s) {
        return '<button type="button" class="gb-chip' + (String(p.serviceId) === String(s.id) ? ' on' : '') + '" data-act="service" data-id="' + esc(s.id) + '">' + esc(s.name) + '<small>' + eur(Number(s.price_cents) || 0) + '</small></button>';
      }).join('') + '</div></div>';
      if (cfg.extras && cfg.extras.length && p.serviceId) {
        h += '<div><button type="button" class="gb-chip" data-act="toggle-extras">' + (p.showExtras ? '▾' : '▸') + ' Suppléments' + (p.extraIds.length ? ' (' + p.extraIds.length + ')' : '') + '</button>';
        if (p.showExtras) h += '<div class="gb-chips" style="margin-top:8px">' + cfg.extras.map(function (x) {
          return '<button type="button" class="gb-chip' + (p.extraIds.indexOf(String(x.id)) !== -1 ? ' on' : '') + '" data-act="extra" data-id="' + esc(x.id) + '">' + esc(x.name) + '<small>+' + eur(Number(x.price_cents) || 0) + '</small></button>';
        }).join('') + '</div>';
        h += '</div>';
      }
      if (p.serviceId) {
        h += '<div><div class="gb-lbl">Coiffeur</div><div class="gb-chips"><button type="button" class="gb-chip' + (!p.pref ? ' on' : '') + '" data-act="barber" data-id="">Premier disponible</button>' +
          cfg.barbers.map(function (b) { return '<button type="button" class="gb-chip' + (String(p.pref) === String(b.id) ? ' on' : '') + '" data-act="barber" data-id="' + esc(b.id) + '">' + esc(b.name) + '</button>'; }).join('') + '</div></div>';
        h += '<div><div class="gb-lbl">Date</div><input type="date" class="gb-date" data-act="date" min="' + today() + '" value="' + esc(p.date) + '"></div>';
        h += '<div><div class="gb-lbl">Horaire</div>';
        if (p.suggestions && p.suggestions.length) {
          h += '<div class="gb-chips" style="margin-bottom:8px">' + p.suggestions.map(function (s) {
            return '<button type="button" class="gb-chip sugg" data-act="sugg" data-time="' + esc(s.time) + '" data-barber="' + esc(s.barberId) + '">' +
              (s.kind === 'after' ? '⏩ À la suite de ' : '⏱ En même temps que ') + esc(s.name) + ' · ' + esc(s.time) + (barberName(s.barberId) ? ' · ' + esc(barberName(s.barberId)) : '') + '</button>';
          }).join('') + '</div>';
        }
        if (p.loading && !p.slots) h += '<div class="gb-empty">Chargement…</div>';
        else if (p.slots && !p.slots.length) h += '<div class="gb-empty">Aucun créneau libre ce jour-là.</div>';
        else if (p.slots) h += '<div class="gb-slots">' + p.slots.map(function (s) {
          var on = p.slot && p.slot.time === s.time && String(p.slot.barberId) === String(s.barber_id);
          return '<button type="button" class="gb-slot' + (on ? ' on' : '') + '" data-act="slot" data-time="' + esc(s.time) + '" data-barber="' + esc(s.barber_id) + '">' + esc(s.time) + '</button>';
        }).join('') + '</div>';
        if (p.note) h += '<div class="gb-warn">' + esc(p.note) + '</div>';
        if (p.slot) h += '<div class="gb-ok" style="margin-top:8px">✓ ' + esc(fmtDate(p.date)) + ' à ' + esc(p.slot.time) + (barberName(p.slot.barberId) ? ' · ' + esc(barberName(p.slot.barberId)) : '') + '</div>';
        h += '</div>';
      }
      return h + '</div>';
    }

    function addHtml() {
      var used = {}; people.forEach(function (p) { if (p.relativeId) used[p.relativeId] = true; });
      var rels = (cfg.relatives || []).filter(function (r) { return !used[r.id]; });
      var h = '<div class="gb-add">';
      if (rels.length && people.length < MAX_PEOPLE) h += '<div><div class="gb-lbl">Mes proches</div><div class="gb-chips">' + rels.map(function (r) {
        return '<button type="button" class="gb-chip" data-act="add-rel" data-id="' + esc(r.id) + '">+ ' + esc(r.name) + '</button>'; }).join('') + '</div></div>';
      if (people.length < MAX_PEOPLE) h += '<button type="button" class="gb-addbtn" data-act="add">+ Ajouter une personne</button>';
      else h += '<div class="gb-empty">Maximum ' + MAX_PEOPLE + ' personnes par réservation.</div>';
      return h + '</div>';
    }

    function footHtml() {
      var ready = people.length > 0 && people.every(function (p) { return p.serviceId && p.slot && (p.isSelf || String(p.name || '').trim()); });
      var total = people.reduce(function (t, p) { return t + personPrice(p, cfg.services, cfg.extras); }, 0);
      var missing = people.filter(function (p) { return !(p.serviceId && p.slot && (p.isSelf || String(p.name || '').trim())); }).length;
      return '<div class="gb-foot"><div class="gb-total"><span>' + people.length + ' personne' + (people.length > 1 ? 's' : '') + '</span><span>' + eur(total) + '</span></div>' +
        '<button type="button" class="go" data-act="continue"' + (ready ? '' : ' disabled') + '>' + esc(cfg.continueLabel || 'Continuer') + '</button>' +
        (missing ? '<div class="gb-empty" style="text-align:center">' + (missing === 1 ? "Il reste 1 personne à compléter" : 'Il reste ' + missing + ' personnes à compléter') + ' (prestation et horaire).</div>' : '') + '</div>';
    }

    function paint() {
      el.innerHTML = '<div class="gb"><div class="gb-hint">Chaque personne choisit sa prestation, son coiffeur et son horaire : à la suite, en même temps, ou décalés.</div>' +
        '<div id="gb-people">' + people.map(personHtml).join('') + '</div><div id="gb-add">' + addHtml() + '</div><div id="gb-foot">' + footHtml() + '</div></div>';
    }
    function paintPerson(p) {
      var node = el.querySelector('.gb-person[data-uid="' + p.uid + '"]');
      if (!node) return paint();
      var focus = document.activeElement, keep = focus && node.contains(focus) && focus.getAttribute('data-act') === 'name';
      var sel = keep ? [focus.selectionStart, focus.selectionEnd] : null;
      var tmp = document.createElement('div'); tmp.innerHTML = personHtml(p);
      node.replaceWith(tmp.firstChild);
      if (keep) { var inp = el.querySelector('.gb-person[data-uid="' + p.uid + '"] .gb-name'); if (inp) { inp.focus(); try { inp.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
      paintFoot();
    }
    function paintFoot() { var f = el.querySelector('#gb-foot'); if (f) f.innerHTML = footHtml(); var a = el.querySelector('#gb-add'); if (a) a.innerHTML = addHtml(); }

    /* ---------- Actions ---------- */
    function addPerson(init) {
      if (people.length >= MAX_PEOPLE) return;
      var base = people.filter(function (p) { return p.date; })[0];
      var np = newPerson(init || {}); np.date = base ? base.date : today();
      // Par defaut : meme prestation et meme coiffeur que la personne precedente (cas d'une fratrie) - modifiable en un clic.
      var prev = people[people.length - 1];
      if (prev && prev.serviceId) { np.serviceId = prev.serviceId; np.pref = prev.pref; }
      people.push(np); paint();
      if (np.serviceId) loadSlots(np);
    }

    el.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-act]') : null; if (!b || !el.contains(b)) return;
      var act = b.getAttribute('data-act'), card = b.closest('.gb-person'), p = card ? find(card.getAttribute('data-uid')) : null;
      if (act === 'add') return addPerson();
      if (act === 'add-rel') { var r = byId(cfg.relatives || [], b.getAttribute('data-id')); if (r) addPerson({ name: r.name, relativeId: r.id }); return; }
      if (act === 'continue') return doContinue();
      if (!p) return;
      if (act === 'remove') { if (people.length <= 1) return; people.splice(people.indexOf(p), 1); paint(); refreshOthers(null, true); return; }
      if (act === 'service') { p.serviceId = b.getAttribute('data-id'); p.slot = null; p.slots = null; p.suggestions = []; paintPerson(p); loadSlots(p); onSlotChanged(p); return; }
      if (act === 'toggle-extras') { p.showExtras = !p.showExtras; paintPerson(p); return; }
      if (act === 'extra') { var id = b.getAttribute('data-id'), k = p.extraIds.indexOf(id); if (k === -1) p.extraIds.push(id); else p.extraIds.splice(k, 1); p.slot = null; p.slots = null; paintPerson(p); loadSlots(p); onSlotChanged(p); return; }
      if (act === 'barber') { p.pref = b.getAttribute('data-id'); p.slot = null; p.slots = null; p.suggestions = []; paintPerson(p); loadSlots(p); onSlotChanged(p); return; }
      if (act === 'slot' || act === 'sugg') {
        p.slot = { time: b.getAttribute('data-time'), barberId: b.getAttribute('data-barber') }; p.note = '';
        paintPerson(p); onSlotChanged(p); return;
      }
    });
    el.addEventListener('input', function (e) {
      var t = e.target, act = t.getAttribute && t.getAttribute('data-act'); if (!act) return;
      var card = t.closest('.gb-person'), p = card ? find(card.getAttribute('data-uid')) : null; if (!p) return;
      if (act === 'name') { p.name = t.value; var av = card.querySelector('.gb-av'); if (av) av.textContent = label(p).charAt(0).toUpperCase(); paintFoot(); }
    });
    el.addEventListener('change', function (e) {
      var t = e.target, act = t.getAttribute && t.getAttribute('data-act'); if (!act) return;
      var card = t.closest('.gb-person'), p = card ? find(card.getAttribute('data-uid')) : null; if (!p) return;
      if (act === 'date') { p.date = t.value; p.slot = null; p.slots = null; p.suggestions = []; paintPerson(p); loadSlots(p); onSlotChanged(p); }
      if (act === 'save') p.saveRelative = t.checked;
      if (act === 'name') paintPerson(p);   // affiche (ou non) la case « Mes proches » une fois le prenom saisi
    });

    function doContinue() {
      var todo = people.filter(function (p) { return !p.isSelf && p.saveRelative && !p.relativeId && String(p.name || '').trim() && cfg.createRelative; });
      Promise.all(todo.map(function (p) {
        return cfg.createRelative(String(p.name).trim()).then(function (item) { if (item) { p.relativeId = item.id; if (cfg.relatives && !byId(cfg.relatives, item.id)) cfg.relatives.push(item); } }).catch(function () {});
      })).then(function () { cfg.onContinue(people, buildPayload(people)); });
    }

    reset();
    return {
      reset: reset,
      getPeople: function () { return people; },
      setRelatives: function (list) { cfg.relatives = list || []; paintFoot(); },
      setCatalog: function (c) { cfg.services = c.services || cfg.services; cfg.extras = c.extras || cfg.extras; cfg.barbers = c.barbers || cfg.barbers; paint(); }
    };
  }

  return { MAX_PEOPLE: MAX_PEOPLE, personDuration: personDuration, personPrice: personPrice, heldParam: heldParam, computeSuggestions: computeSuggestions, buildPayload: buildPayload, create: create };
});
