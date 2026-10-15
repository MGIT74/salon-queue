/* RDV pour PLUSIEURS personnes, côté salon (Dashboard > RDV, Agenda de la caisse, Mon poste).
 *
 * Aucun écran inventé : on ouvre la VRAIE page de réservation en ligne (rdv.html, mode ?staff=1) dans une grande
 * fenêtre - même déroulé, même présentation (ordinateur ou mobile) que pour le client. Seul l'enregistrement final
 * passe par ici (StaffBookingBridge), vers la route du salon POST /api/appointments/admin-group (email facultatif).
 *
 * StaffGroupBooking.open({ api, onDone })
 *   api(url, opts) -> Promise : api du dashboard, ou barberApi de la caisse / Mon poste (authentification du salon) */
(function () {
  'use strict';

  function close() {
    var o = document.getElementById('sgb-overlay');
    if (o) o.remove();
    document.documentElement.style.overflow = '';
    window.StaffBookingBridge = null;
  }

  function open(cfg) {
    close();
    var slug = (typeof SALON_SLUG === 'string' && SALON_SLUG) ? SALON_SLUG : '';
    var created = null;
    window.StaffBookingBridge = {
      client: cfg.client || null,
      api: function (url, opts) { return cfg.api(url, opts); },
      done: function (r) { created = r; },
      close: function () { close(); if (created && cfg.onDone) cfg.onDone(created); }
    };
    if (!document.getElementById('sgb-style')) {
      var st = document.createElement('style'); st.id = 'sgb-style';
      st.textContent =
        '#sgb-overlay{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:2vh 2vw}' +
        '#sgb-overlay .sgb-panel{position:relative;width:min(1180px,100%);height:min(94vh,980px);background:var(--bg,#000);border-radius:22px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.45)}' +
        '#sgb-overlay iframe{width:100%;height:100%;border:0;display:block;background:var(--bg,#000)}' +
        '#sgb-overlay .sgb-x{position:absolute;top:12px;right:12px;z-index:2;width:36px;height:36px;border-radius:50%;border:none;background:var(--fill,#333);color:var(--grey,#aaa);font-size:16px;cursor:pointer}' +
        '@media (max-width:700px){#sgb-overlay{padding:0}#sgb-overlay .sgb-panel{width:100%;height:100%;border-radius:0}}';
      document.head.appendChild(st);
    }
    var o = document.createElement('div');
    o.id = 'sgb-overlay';
    o.innerHTML = '<div class="sgb-panel"><button type="button" class="sgb-x" aria-label="Fermer">✕</button>' +
      '<iframe title="RDV pour plusieurs personnes" src="/rdv.html?staff=1' + (slug ? '&salon=' + encodeURIComponent(slug) : '') + '"></iframe></div>';
    o.querySelector('.sgb-x').onclick = function () { window.StaffBookingBridge.close(); };
    o.addEventListener('click', function (ev) { if (ev.target === o) window.StaffBookingBridge.close(); });
    document.body.appendChild(o);
    document.documentElement.style.overflow = 'hidden';
    return o;
  }

  /** Bouton à placer dans la fenêtre « Ajouter un RDV » (première étape). */
  function buttonHtml(onclick) {
    return '<button type="button" class="btn btn-soft sgb-open" style="width:100%;margin:4px 0 12px;display:flex;align-items:center;justify-content:center;gap:8px" onclick="' + onclick + '">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17.5 14.2c2.3.3 3.5 2.2 3.5 5.8"/></svg>' +
      'Plusieurs personnes (enfants, amis…)</button>';
  }

  var PERSON_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c0-4 3.4-6.6 7.5-6.6s7.5 2.6 7.5 6.6"/></svg>';
  function escH(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /** PREMIÈRE étape de « Ajouter un RDV » (dashboard, caisse) : le client d'abord (3 lettres -> clients existants),
   *  puis « Une personne » ou « Plusieurs personnes ». P = préfixe des ids (aa, pa). */
  function clientStepHtml(P, soloClick, groupClick) {
    if (!document.getElementById('sgb-client-style')) {
      var st = document.createElement('style'); st.id = 'sgb-client-style';
      st.textContent =
        '.sgb-client-pill{display:inline-flex;align-items:center;gap:7px;max-width:100%;margin:8px 0 2px;padding:6px 12px;border-radius:999px;background:var(--accent-soft,rgba(10,132,255,.14));color:var(--accent,#0a84ff);font-weight:600;font-size:14px;cursor:pointer;border:none;font-family:inherit}' +
        '.sgb-client-pill span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '.sgb-who-choice{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px}' +
        '.sgb-who-choice .btn{display:flex;align-items:center;justify-content:center;gap:8px;min-height:52px;width:100%}' +
        '@media (max-width:520px){.sgb-who-choice{grid-template-columns:1fr}}';
      document.head.appendChild(st);
    }
    return '<div id="' + P + '-step-client">' +
      '<div class="aa-step-title">Client</div>' +
      '<p class="hint" style="margin:-4px 0 10px;font-size:13px;color:var(--grey)">Tapez au moins 3 lettres du nom : les clients déjà connus s\'affichent.</p>' +
      '<div class="fld" style="margin-bottom:10px"><label>Nom du client</label><input class="modal-input" id="' + P + '-name" type="text" autocomplete="off"></div>' +
      '<div class="fld" style="margin-bottom:10px"><label>Email (optionnel)</label><input class="modal-input" id="' + P + '-email" type="email" autocomplete="off"></div>' +
      '<div class="fld" style="margin-bottom:14px"><label>Téléphone (optionnel)</label><input class="modal-input" id="' + P + '-phone" type="tel" autocomplete="off"></div>' +
      '<div class="modal-error" id="' + P + '-client-error" style="display:none"></div>' +
      '<div class="sgb-who-choice">' +
        '<button type="button" class="btn btn-primary" onclick="' + soloClick + '">' + PERSON_SVG + 'Une personne</button>' +
        '<button type="button" class="btn btn-soft sgb-open" onclick="' + groupClick + '"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17.5 14.2c2.3.3 3.5 2.2 3.5 5.8"/></svg>Plusieurs personnes</button>' +
      '</div>' +
    '</div>';
  }

  /** Nom du client affiché en haut de la fenêtre pendant toutes les étapes suivantes (clic = revenir le modifier). */
  function clientPillHtml(P, backClick) {
    return '<button type="button" class="sgb-client-pill" id="' + P + '-client-pill" style="display:none" onclick="' + backClick + '" title="Modifier le client">' + PERSON_SVG + '<span></span></button>';
  }

  /** Lit et vérifie les champs client. Renvoie {name,email,phone} ou null (message affiché). */
  function readClient(overlay, P) {
    var v = function (k) { var el = overlay.querySelector('#' + P + '-' + k); return el ? el.value.trim() : ''; };
    var c = { name: v('name'), email: v('email'), phone: v('phone') };
    // Client choisi dans la liste et qui a un compte : ses proches (enfants…) seront proposés d'emblée.
    var pick = overlay.querySelector('#' + P + '-name')._clientPick;
    if (pick && pick.account_id) { c.account_id = pick.account_id; c.relatives = (pick.relatives || []).slice(); }
    var err = overlay.querySelector('#' + P + '-client-error');
    if (!c.name) { if (err) { err.textContent = 'Le nom du client est requis'; err.style.display = 'block'; } overlay.querySelector('#' + P + '-name').focus(); return null; }
    if (err) err.style.display = 'none';
    var pill = overlay.querySelector('#' + P + '-client-pill');
    if (pill) pill.querySelector('span').textContent = c.name + (c.phone ? ' · ' + c.phone : '') + (c.account_id ? ' · Compte client' : '');
    return c;
  }

  window.StaffGroupBooking = { open: open, close: close, buttonHtml: buttonHtml, clientStepHtml: clientStepHtml, clientPillHtml: clientPillHtml, readClient: readClient, escH: escH };
})();
