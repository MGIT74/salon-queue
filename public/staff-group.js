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

  window.StaffGroupBooking = { open: open, close: close, buttonHtml: buttonHtml };
})();
