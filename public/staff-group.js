/* RDV pour PLUSIEURS personnes, côté salon (Dashboard > RDV, Agenda de la caisse, Mon poste).
 *
 * Même réservation que celle du client en ligne (une ligne par personne : prénom, prestation, coiffeur, heure),
 * mais dans une seule fenêtre : le salon saisit les coordonnées de celui qui réserve (email facultatif) puis
 * chaque personne. Les heures proposées pour une personne tiennent compte de celles déjà choisies pour les
 * autres (paramètre « held » de /availability) : deux personnes ne se chevauchent jamais chez le même coiffeur.
 * Envoi : POST /api/appointments/admin-group.
 *
 * StaffGroupBooking.open({ api, apiOpts?(barberId), barbers, services, date, barberId?, onDone })
 *   api(url, opts) -> Promise (api du dashboard, ou barberApi de la caisse / Mon poste)
 *   apiOpts(barberId) -> options supplémentaires (ex. { actingAs }) pour la caisse partagée */
(function () {
  'use strict';
  var MAX = 6;
  function e(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i]; return null; }

  function open(cfg) {
    var services = (cfg.services || []).filter(function (s) { return s.active !== 0; });
    var barbers = (cfg.barbers || []).filter(function (b) { return b.active !== 0 && b.accepts_appointments !== 0; });
    var date = cfg.date;
    var uid = 0;
    var people = [newPerson(''), newPerson('')];
    function newPerson(name) { return { uid: ++uid, name: name, serviceId: services[0] ? String(services[0].id) : '', barberId: cfg.barberId || (barbers[0] ? String(barbers[0].id) : ''), time: '', slots: null }; }
    function duration(p) { var s = byId(services, p.serviceId); return s ? Number(s.duration_min) || 0 : 0; }
    function held(p) {
      return people.filter(function (o) { return o !== p && o.time && o.barberId; })
        .map(function (o) { return o.barberId + '|' + date + '|' + o.time + '|' + duration(o); }).join(',');
    }
    function opts(p) { return cfg.apiOpts ? cfg.apiOpts(p.barberId) : undefined; }

    var when = function () { return new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }); };
    var overlay = _buildModal(
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">' +
        '<div class="modal-title" style="margin-bottom:0">RDV pour plusieurs personnes</div>' +
        '<button type="button" data-x="close" style="background:var(--fill);border:none;width:30px;height:30px;border-radius:50%;color:var(--grey);font-size:14px;cursor:pointer;flex-shrink:0;margin-left:10px">✕</button>' +
      '</div>' +
      '<div class="sgb">' +
        '<div class="fld" style="margin-bottom:10px"><label>Jour</label><input class="modal-input" type="date" data-x="date" value="' + e(date) + '"></div>' +
        '<div class="sgb-sec">Personne qui réserve</div>' +
        '<div class="fld" style="margin-bottom:8px"><label>Nom</label><input class="modal-input" type="text" data-x="name" placeholder="Ex. Karim Benali"></div>' +
        '<div class="sgb-two"><div class="fld"><label>Téléphone (optionnel)</label><input class="modal-input" type="tel" data-x="phone"></div>' +
        '<div class="fld"><label>Email (optionnel)</label><input class="modal-input" type="email" data-x="email"></div></div>' +
        '<div class="sgb-sec">Personnes <span class="hint" style="margin:0;font-weight:400" data-x="count"></span></div>' +
        '<div data-x="rows"></div>' +
        '<button type="button" class="sgb-add" data-x="add">+ Ajouter une personne</button>' +
        '<div class="modal-error" data-x="err" style="display:none"></div>' +
        '<div class="modal-actions"><button type="button" class="btn btn-soft" data-x="close">Annuler</button>' +
        '<button type="button" class="btn btn-primary" data-x="save">Ajouter les RDV</button></div>' +
      '</div>'
    );
    var q = function (k) { return overlay.querySelector('[data-x="' + k + '"]'); };
    if (!document.getElementById('sgb-style')) {
      var st = document.createElement('style'); st.id = 'sgb-style';
      st.textContent = '.sgb-sec{font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--grey);margin:14px 0 8px}' +
        '.sgb-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
        '.sgb-row{background:var(--fill);border-radius:14px;padding:10px 12px;margin-bottom:8px}' +
        '.sgb-row-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}.sgb-row-head input{flex:1;min-width:0}' +
        '.sgb-row-head button{border:none;background:none;color:var(--grey);font-size:16px;cursor:pointer;padding:4px 8px}.sgb-row-head button:hover{color:var(--red)}' +
        '.sgb-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr) 92px;gap:8px}.sgb-grid select{width:100%;min-width:0;padding:10px 8px;font-size:14px}' +
        '.sgb-row-head input{padding:10px 12px}' +
        '.sgb-add{width:100%;border:1px dashed var(--blue);background:none;color:var(--blue);border-radius:12px;padding:10px;font:inherit;font-weight:600;cursor:pointer;margin:2px 0 6px}' +
        '.sgb-add:disabled{opacity:.4;cursor:default}' +
        '@media (max-width:560px){.sgb-two,.sgb-grid{grid-template-columns:1fr}}';
      document.head.appendChild(st);
    }

    function render() {
      q('count').textContent = '(' + people.length + ' / ' + MAX + ')';
      q('add').disabled = people.length >= MAX;
      q('rows').innerHTML = people.map(function (p, i) {
        var slotOpts = p.slots === null ? '<option value="">…</option>'
          : (p.slots.length ? '<option value="">Heure</option>' + p.slots.map(function (t) { return '<option value="' + e(t) + '"' + (t === p.time ? ' selected' : '') + '>' + e(t) + '</option>'; }).join('')
            : '<option value="">Complet</option>');
        return '<div class="sgb-row" data-uid="' + p.uid + '">' +
          '<div class="sgb-row-head"><input class="modal-input" type="text" data-f="name" placeholder="' + (i === 0 ? 'Prénom (facultatif : celui qui réserve)' : 'Prénom') + '" value="' + e(p.name) + '">' +
          (people.length > 1 ? '<button type="button" data-f="rm" title="Retirer">✕</button>' : '') + '</div>' +
          '<div class="sgb-grid">' +
            '<select class="modal-input" data-f="service">' + services.map(function (s) { return '<option value="' + e(s.id) + '"' + (String(s.id) === p.serviceId ? ' selected' : '') + '>' + e(s.name) + (s.duration_min ? ' · ' + s.duration_min + ' min' : '') + '</option>'; }).join('') + '</select>' +
            '<select class="modal-input" data-f="barber">' + barbers.map(function (b) { return '<option value="' + e(b.id) + '"' + (String(b.id) === p.barberId ? ' selected' : '') + '>' + e(b.name) + '</option>'; }).join('') + '</select>' +
            '<select class="modal-input" data-f="time">' + slotOpts + '</select>' +
          '</div></div>';
      }).join('');
    }

    // Recharge les heures libres de chaque personne (en tenant compte des heures déjà choisies pour les autres).
    var token = 0;
    function loadAll() {
      var t = ++token;
      people.forEach(function (p) {
        if (!p.serviceId || !p.barberId) { p.slots = []; return; }
        var url = '/api/appointments/availability?date=' + date + '&service_id=' + encodeURIComponent(p.serviceId) +
          '&barber_id=' + encodeURIComponent(p.barberId) + '&held=' + encodeURIComponent(held(p));
        cfg.api(url, opts(p)).then(function (r) {
          if (t !== token) return;
          p.slots = (r.slots || []).map(function (s) { return s.time; });
          if (p.time && p.slots.indexOf(p.time) === -1) p.time = '';
          render();
        }).catch(function () { if (t === token) { p.slots = []; render(); } });
      });
      render();
    }

    overlay.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-x],[data-f]'); if (!t) return;
      var x = t.getAttribute('data-x'), f = t.getAttribute('data-f');
      if (x === 'close') return _closeModal(overlay);
      if (x === 'add' && people.length < MAX) {
        var last = people[people.length - 1];
        var np = newPerson(''); if (last) { np.barberId = last.barberId; np.serviceId = last.serviceId; }
        people.push(np); return loadAll();
      }
      if (f === 'rm') { var row = t.closest('[data-uid]'); people = people.filter(function (p) { return String(p.uid) !== row.getAttribute('data-uid'); }); return loadAll(); }
      if (x === 'save') return save();
    });
    overlay.addEventListener('change', function (ev) {
      var t = ev.target, x = t.getAttribute('data-x'), f = t.getAttribute('data-f');
      if (x === 'date') { date = t.value; people.forEach(function (p) { p.time = ''; p.slots = null; }); return loadAll(); }
      var row = t.closest('[data-uid]'); if (!row) return;
      var p = people.filter(function (o) { return String(o.uid) === row.getAttribute('data-uid'); })[0]; if (!p) return;
      if (f === 'service') { p.serviceId = t.value; p.time = ''; loadAll(); }
      if (f === 'barber') { p.barberId = t.value; p.time = ''; loadAll(); }
      if (f === 'time') { p.time = t.value; loadAll(); }
    });
    overlay.addEventListener('input', function (ev) {
      var t = ev.target; if (t.getAttribute('data-f') !== 'name') return;
      var row = t.closest('[data-uid]'); var p = people.filter(function (o) { return String(o.uid) === row.getAttribute('data-uid'); })[0];
      if (p) p.name = t.value;
    });

    function save() {
      var err = q('err'); err.style.display = 'none';
      var name = q('name').value.trim();
      var fail = function (m) { err.textContent = m; err.style.display = 'block'; };
      if (!name) return fail('Le nom de la personne qui réserve est requis.');
      for (var i = 0; i < people.length; i++) {
        var p = people[i];
        if (i > 0 && !p.name.trim()) return fail('Le prénom de la personne ' + (i + 1) + ' est requis.');
        if (!p.time) return fail('Choisissez une heure pour ' + (p.name.trim() || name) + '.');
      }
      var btn = q('save'); btn.disabled = true;
      cfg.api('/api/appointments/admin-group', Object.assign({
        method: 'POST',
        body: {
          client_name: name, email: q('email').value.trim(), phone: q('phone').value.trim(),
          base_url: window.location.origin + '/rdv.html',
          people: people.map(function (p) { return { name: p.name.trim(), service_id: p.serviceId, barber_id: p.barberId, date: date, time: p.time }; })
        }
      }, opts(people[0]) || {})).then(function (r) {
        _closeModal(overlay);
        if (typeof toast === 'function') toast(people.length + ' RDV ajoutés');
        if (cfg.onDone) cfg.onDone(r);
      }).catch(function (e2) { btn.disabled = false; fail(e2.message); });
    }

    loadAll();
    setTimeout(function () { var n = q('name'); if (n) n.focus(); }, 50);
    return overlay;
  }

  /** Bouton à placer dans la fenêtre « Ajouter un RDV » (première étape). */
  function buttonHtml(onclick) {
    return '<button type="button" class="btn btn-soft sgb-open" style="width:100%;margin:4px 0 12px;display:flex;align-items:center;justify-content:center;gap:8px" onclick="' + onclick + '">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17.5 14.2c2.3.3 3.5 2.2 3.5 5.8"/></svg>' +
      'Plusieurs personnes (enfants, amis…)</button>';
  }

  window.StaffGroupBooking = { open: open, buttonHtml: buttonHtml, MAX: MAX };
})();
