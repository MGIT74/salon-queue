/* Actualisation discrète en arrière-plan.
 *
 *   AutoRefresh.start(function () { return maybePromise; }, { idleMs: 15000, busy: function () { return false; } });
 *
 * - Ne s'exécute qu'après `idleMs` SANS aucune interaction (toucher, clic, frappe, défilement) : chaque
 *   interaction repousse la prochaine actualisation.
 * - Saute le tour si l'onglet est masqué, si une requête précédente est encore en cours ou si busy() est vrai
 *   (saisie en cours, fenêtre ouverte...). Reprend à l'interaction/au tour suivant.
 * - Conserve la position de défilement de la page et des zones défilantes pendant le rechargement. */
(function () {
  var lastTouch = Date.now();
  ['pointerdown', 'touchstart', 'mousedown', 'keydown', 'wheel', 'input'].forEach(function (ev) {
    window.addEventListener(ev, function () { lastTouch = Date.now(); }, { passive: true, capture: true });
  });
  window.addEventListener('scroll', function () { lastTouch = Date.now(); }, { passive: true, capture: true });

  function snapshotScroll() {
    var snap = [];
    try {
      document.querySelectorAll('*').forEach(function (el) { if (el.scrollTop > 0 || el.scrollLeft > 0) snap.push([el, el.scrollTop, el.scrollLeft]); });
    } catch (e) { /* ignore */ }
    return { x: window.scrollX, y: window.scrollY, els: snap };
  }
  function restoreScroll(s) {
    s.els.forEach(function (t) { if (t[0].isConnected) { t[0].scrollTop = t[1]; t[0].scrollLeft = t[2]; } });
    if (window.scrollY !== s.y || window.scrollX !== s.x) window.scrollTo(s.x, s.y);
  }

  function start(fn, opts) {
    opts = opts || {};
    var idleMs = opts.idleMs || 15000;
    var running = false;
    var id = setInterval(function () {
      if (running || document.hidden) return;
      if (Date.now() - lastTouch < idleMs) return;
      if (opts.busy && opts.busy()) return;
      var ae = document.activeElement;
      if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.id !== 'scan-catcher' && !opts.ignoreFocus) return;
      running = true;
      var snap = snapshotScroll();
      var done = function () { running = false; restoreScroll(snap); };
      try { Promise.resolve(fn()).then(done, done); } catch (e) { done(); }
    }, opts.tickMs || 1000);
    return function stop() { clearInterval(id); };
  }

  window.AutoRefresh = { start: start, idleFor: function () { return Date.now() - lastTouch; } };
})();
