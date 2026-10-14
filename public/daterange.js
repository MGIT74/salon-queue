/* ===== Sélecteur de période (Du / Au) =====
   Remplace les couples de champs « Du / Au » par un seul bouton qui ouvre un calendrier à deux mois avec des raccourcis
   (Aujourd'hui, Cette semaine, Mois en cours...) et les boutons Appliquer / Annuler.
   Les deux <input type="date"> d'origine restent dans la page (cachés) comme source de vérité : la valeur reste au format
   AAAA-MM-JJ, tout le code existant (.value, onchange) fonctionne sans changement, même quand une autre fonction modifie
   .value (le libellé du bouton se met à jour). Branchement : data-range-to="<id du champ Au>" sur le champ Du.
   Les champs ajoutés plus tard par un rendu sont repérés automatiquement. */
(function (root) {
  var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var DOW = ['lu', 'ma', 'me', 'je', 've', 'sa', 'di'];
  var ICON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/></svg>';

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(v) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function todayDate() {
    try { if (typeof root.nowSalonDatetimeString === 'function') { var p = parse(root.nowSalonDatetimeString().slice(0, 10)); if (p) return p; } } catch (e) {}
    var t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }

  // Raccourcis (semaine du lundi au dimanche). from/to = '' pour « toutes les dates ».
  function presets(t) {
    var y = t.getFullYear(), m = t.getMonth(), dow = (t.getDay() + 6) % 7, mon = addDays(t, -dow);
    function r(id, label, a, b) { return { id: id, label: label, from: a ? iso(a) : '', to: b ? iso(b) : '' }; }
    return [
      r('today', "Aujourd'hui", t, t),
      r('tomorrow', 'Demain', addDays(t, 1), addDays(t, 1)),
      r('yesterday', 'Hier', addDays(t, -1), addDays(t, -1)),
      r('week', 'Cette semaine', mon, addDays(mon, 6)),
      r('next7', 'Les 7 prochains jours', t, addDays(t, 6)),
      r('next30', 'Les 30 prochains jours', t, addDays(t, 29)),
      r('last7', '7 derniers jours', addDays(t, -6), t),
      r('last30', '30 derniers jours', addDays(t, -29), t),
      r('month', 'Mois en cours', new Date(y, m, 1), new Date(y, m + 1, 0)),
      r('nextmonth', 'Mois suivant', new Date(y, m + 1, 1), new Date(y, m + 2, 0)),
      r('lastmonth', 'Mois dernier', new Date(y, m - 1, 1), new Date(y, m, 0)),
      r('year', 'Cette année', new Date(y, 0, 1), new Date(y, 11, 31)),
      r('all', 'Toutes les dates', null, null)
    ];
  }

  function fmtDay(v, withYear) { var d = parse(v); return d ? d.getDate() + ' ' + SHORT[d.getMonth()] + (withYear ? ' ' + d.getFullYear() : '') : ''; }
  function label(from, to) {
    if (!from && !to) return 'Toutes les dates';
    if (from && !to) return 'Depuis le ' + fmtDay(from, true);
    if (!from && to) return "Jusqu'au " + fmtDay(to, true);
    if (from === to) return fmtDay(from, true);
    var a = parse(from), b = parse(to);
    return fmtDay(from, a.getFullYear() !== b.getFullYear()) + ' → ' + fmtDay(to, true);
  }

  var valueDesc = typeof HTMLInputElement !== 'undefined' ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') : null;
  var pop = null, backdrop = null, active = null;

  function closePop() {
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    if (active && active.btn) active.btn.setAttribute('aria-expanded', 'false');
    pop = null; backdrop = null; active = null;
    root.removeEventListener('resize', closePop);
  }

  function narrow() { return root.matchMedia ? root.matchMedia('(max-width: 719px)').matches : false; }

  function openPop(inst) {
    closePop();
    var t = todayDate();
    var st = { from: inst.from.value || '', to: inst.to.value || '', anchor: null, hover: '', vy: 0, vm: 0 };
    var base = parse(st.from) || t;
    st.vy = base.getFullYear(); st.vm = base.getMonth();
    active = { inst: inst, st: st, btn: inst.btn };
    inst.btn.setAttribute('aria-expanded', 'true');
    var two = !narrow();

    backdrop = document.createElement('div'); backdrop.className = 'dr-backdrop';
    backdrop.addEventListener('mousedown', function (e) { e.preventDefault(); closePop(); });
    pop = document.createElement('div'); pop.className = 'dr-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Choisir une période');
    document.body.appendChild(backdrop); document.body.appendChild(pop);

    function monthHtml(y, m, side) {
      var yearNow = t.getFullYear(), years = [];
      for (var yy = Math.min(yearNow - 6, y); yy <= Math.max(yearNow + 3, y); yy++) years.push(yy);
      var h = '<div class="dr-cal"><div class="dr-head">' +
        (side === 'left' ? '<button type="button" class="dr-nav" data-a="prev" aria-label="Mois précédent">‹</button>' : '<span class="dr-nav-sp"></span>') +
        '<select class="dr-sel" data-a="month" data-side="' + side + '" aria-label="Mois">' + MONTHS.map(function (n, i) { return '<option value="' + i + '"' + (i === m ? ' selected' : '') + '>' + SHORT[i].charAt(0).toUpperCase() + SHORT[i].slice(1) + '</option>'; }).join('') + '</select>' +
        '<select class="dr-sel" data-a="year" data-side="' + side + '" aria-label="Année">' + years.map(function (n) { return '<option value="' + n + '"' + (n === y ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select>' +
        ((side === 'right' || !two) ? '<button type="button" class="dr-nav" data-a="next" aria-label="Mois suivant">›</button>' : '<span class="dr-nav-sp"></span>') +
        '</div><div class="dr-dow">' + DOW.map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div><div class="dr-days">';
      var first = (new Date(y, m, 1).getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate(), prevDim = new Date(y, m, 0).getDate();
      var cells = Math.ceil((first + dim) / 7) * 7, today = iso(t);
      for (var c = 0; c < cells; c++) {
        var d = c - first + 1, out = false, dt;
        if (c < first) { d = prevDim - first + c + 1; dt = new Date(y, m - 1, d); out = true; }
        else if (c >= first + dim) { d = c - first - dim + 1; dt = new Date(y, m + 1, d); out = true; }
        else dt = new Date(y, m, d);
        var s = iso(dt);
        h += '<button type="button" class="dr-d' + (out ? ' out' : '') + (s === today ? ' today' : '') + '" data-v="' + s + '">' + d + '</button>';
      }
      return h + '</div></div>';
    }

    function range() {
      var a = st.from, b = st.to;
      if (st.anchor && st.hover) { a = st.anchor < st.hover ? st.anchor : st.hover; b = st.anchor < st.hover ? st.hover : st.anchor; }
      return [a, b];
    }
    function paintDays() {
      var r = range(), a = r[0], b = r[1];
      Array.prototype.forEach.call(pop.querySelectorAll('.dr-d'), function (el) {
        var v = el.getAttribute('data-v');
        var inR = a && b && v >= a && v <= b;
        el.classList.toggle('in', !!inR);
        el.classList.toggle('start', !!(a && v === a));
        el.classList.toggle('end', !!(b && v === b));
      });
    }
    function paintPresets() {
      Array.prototype.forEach.call(pop.querySelectorAll('.dr-preset'), function (el) {
        el.classList.toggle('on', el.getAttribute('data-from') === st.from && el.getAttribute('data-to') === st.to);
      });
    }
    function render() {
      var ps = presets(t), ny = st.vy, nm = st.vm + 1; if (nm > 11) { nm = 0; ny++; }
      pop.innerHTML =
        '<div class="dr-body"><div class="dr-presets">' + ps.map(function (p) {
          return '<button type="button" class="dr-preset" data-p="' + p.id + '" data-from="' + p.from + '" data-to="' + p.to + '">' + p.label + '</button>';
        }).join('') + '</div><div class="dr-cals"><div class="dr-months">' + monthHtml(st.vy, st.vm, 'left') + (two ? monthHtml(ny, nm, 'right') : '') +
        '</div><div class="dr-today"><button type="button" class="dr-link" data-a="today">Accéder à aujourd\'hui</button></div></div></div>' +
        '<div class="dr-foot"><span class="dr-sum" id="dr-sum"></span><button type="button" class="dr-apply" data-a="apply">Appliquer</button><button type="button" class="dr-cancel" data-a="cancel">Annuler</button></div>';
      paintDays(); paintPresets(); sum();
    }
    function sum() { var el = pop.querySelector('#dr-sum'); if (el) el.textContent = label(st.from, st.to); }
    function place() {
      if (narrow()) { pop.classList.add('sheet'); pop.style.left = pop.style.top = ''; return; }
      var r = inst.btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
      var left = Math.max(8, Math.min(r.left, root.innerWidth - w - 8)), top = r.bottom + 6;
      if (top + h > root.innerHeight - 8) top = (r.top - h - 6 > 8) ? r.top - h - 6 : root.innerHeight - h - 8;
      pop.style.left = left + 'px'; pop.style.top = Math.max(8, top) + 'px';
    }
    function apply() {
      var f = st.from, to = st.to;
      if (f && !to) to = f;
      var changed = inst.from.value !== f || inst.to.value !== to;
      inst.from.value = f; inst.to.value = to;
      closePop();
      if (changed) {
        inst.from.dispatchEvent(new Event('input', { bubbles: true }));
        inst.to.dispatchEvent(new Event('input', { bubbles: true }));
        inst.to.dispatchEvent(new Event('change', { bubbles: true }));
      }
      try { inst.btn.focus(); } catch (e) {}
    }
    function shift(k) { st.vm += k; if (st.vm < 0) { st.vm = 11; st.vy--; } else if (st.vm > 11) { st.vm = 0; st.vy++; } }

    pop.addEventListener('mousedown', function (e) { if (!/^(select|option)$/i.test(e.target.tagName)) e.preventDefault(); });
    pop.addEventListener('mouseover', function (e) {
      var b = e.target.closest && e.target.closest('.dr-d');
      if (!b || !st.anchor) return;
      var v = b.getAttribute('data-v');
      if (st.hover !== v) { st.hover = v; paintDays(); }
    });
    pop.addEventListener('change', function (e) {
      var el = e.target; if (!el.getAttribute) return;
      var a = el.getAttribute('data-a'), side = el.getAttribute('data-side');
      if (a !== 'month' && a !== 'year') return;
      var left = pop.querySelectorAll('.dr-sel[data-side="left"]'), right = pop.querySelectorAll('.dr-sel[data-side="right"]');
      var pair = side === 'right' && right.length ? right : left;
      var m = +pair[0].value, y = +pair[1].value;
      if (side === 'right' && right.length) { m--; if (m < 0) { m = 11; y--; } }
      st.vm = m; st.vy = y; render();
    });
    pop.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button'); if (!b) return;
      var a = b.getAttribute('data-a'), v = b.getAttribute('data-v'), p = b.getAttribute('data-p');
      if (v) {
        if (!st.anchor) { st.anchor = v; st.hover = v; st.from = v; st.to = v; }
        else { var lo = st.anchor < v ? st.anchor : v, hi = st.anchor < v ? v : st.anchor; st.from = lo; st.to = hi; st.anchor = null; st.hover = ''; }
        paintDays(); paintPresets(); sum(); return;
      }
      if (p) {
        st.anchor = null; st.hover = ''; st.from = b.getAttribute('data-from'); st.to = b.getAttribute('data-to');
        var base2 = parse(st.from); if (base2) { st.vy = base2.getFullYear(); st.vm = base2.getMonth(); }
        render(); return;
      }
      if (a === 'prev') { shift(-1); return render(); }
      if (a === 'next') { shift(1); return render(); }
      if (a === 'today') { st.vy = t.getFullYear(); st.vm = t.getMonth(); return render(); }
      if (a === 'apply') return apply();
      if (a === 'cancel') return closePop();
    });
    root.addEventListener('resize', closePop);
    render(); place();
  }

  function enhance(from, to) {
    if (!from || !to || from._dr) return;
    var inst = { from: from, to: to };
    var fldF = from.closest ? from.closest('.fld') : null, fldT = to.closest ? to.closest('.fld') : null;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'dr-btn'; btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
    inst.btn = btn;
    function refresh() { btn.innerHTML = ICON + '<span>' + label(from.value, to.value) + '</span>'; }
    var host = fldF || from;
    host.parentNode.insertBefore(btn, host);
    [[from, fldF], [to, fldT]].forEach(function (x) {
      x[0]._dr = inst;
      if (x[1]) x[1].style.display = 'none'; else x[0].style.display = 'none';
      if (valueDesc) {
        Object.defineProperty(x[0], 'value', {
          configurable: true,
          get: function () { return valueDesc.get.call(this); },
          set: function (v) { valueDesc.set.call(this, v); refresh(); }
        });
      }
    });
    btn.addEventListener('click', function () { if (active && active.inst === inst) closePop(); else openPop(inst); });
    inst.refresh = refresh; refresh();
    return inst;
  }

  function scan(rootEl) {
    var list = (rootEl || document).querySelectorAll ? (rootEl || document).querySelectorAll('input[data-range-to]') : [];
    Array.prototype.forEach.call(list, function (from) {
      if (from._dr) return;
      var to = document.getElementById(from.getAttribute('data-range-to'));
      if (to) enhance(from, to);
    });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pop) { e.stopPropagation(); closePop(); } }, true);
    root.addEventListener('scroll', function (e) { if (pop && !narrow() && !pop.contains(e.target)) closePop(); }, true);
    var go = function () {
      scan(document);
      if (root.MutationObserver) new MutationObserver(function () { scan(document); }).observe(document.body, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }

  root.DateRange = { presets: presets, label: label, enhance: enhance, scan: scan, close: closePop };
})(typeof window !== 'undefined' ? window : this);
