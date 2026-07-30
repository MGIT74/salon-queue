/* Utilitaires partagés par les trois écrans. */

function initTheme() {
  var saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) {}
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

function toggleTheme() {
  var el = document.documentElement;
  var next = el.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  el.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch (e) {}
}

var THEME_BTN =
  '<button class="theme-btn" onclick="toggleTheme()" aria-label="Changer de theme">' +
  '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
  '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' +
  '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg></button>';

function mountThemeButton() {
  document.body.insertAdjacentHTML('beforeend', THEME_BTN);
}

function esc(s) {
  var d = document.createElement('div');
  d.textContent = s == null ? '' : s;
  return d.innerHTML;
}

function eur(cents) { return (cents / 100).toFixed(2).replace('.', ',') + ' €'; }

function mmss(sec) {
  return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
}

function hm(min) {
  var h = Math.floor(min / 60), m = Math.round(min % 60);
  return h > 0 ? h + ' h ' + String(m).padStart(2, '0') : m + ' min';
}

function toast(msg, isError) {
  var el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'toast on' + (isError ? ' err' : '');
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.className = 'toast' + (isError ? ' err' : ''); }, 3200);
}

/* Appels API. Le mot de passe admin est ajouté si présent en mémoire.
   Le salon courant est déterminé par ?salon=slug dans l'URL de la page ;
   sans ce paramètre, le serveur retombe sur le salon par défaut. */
var ADMIN_PW = '';
function setAdminPw(pw) { ADMIN_PW = pw || ''; }

var SALON_SLUG = (function () {
  try { return new URLSearchParams(window.location.search).get('salon') || ''; }
  catch (e) { return ''; }
})();

// Change de salon SANS recharger la page : met à jour l'en-tête envoyé à
// chaque appel API, et l'URL (pour rester partageable/rafraîchissable),
// sans navigation complète.
function setSalonSlug(slug) {
  SALON_SLUG = slug || '';
  try {
    var url = new URL(window.location.href);
    if (SALON_SLUG) url.searchParams.set('salon', SALON_SLUG);
    else url.searchParams.delete('salon');
    window.history.replaceState({}, '', url.toString());
  } catch (e) {}
}

function api(path, opts) {
  opts = opts || {};
  var headers = { 'Content-Type': 'application/json' };
  if (ADMIN_PW) headers['X-Admin-Password'] = ADMIN_PW;
  if (SALON_SLUG) headers['X-Salon-Slug'] = SALON_SLUG;
  return fetch(path, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(function (r) {
    return r.json().then(function (data) {
      if (!r.ok) throw new Error(data.error || 'Erreur ' + r.status);
      return data;
    });
  });
}

/* Rafraîchissement périodique de la file. Pas de realtime pousse-serveur
   avec MySQL : on interroge l'API à intervalle court, suffisant pour
   une file d'attente physique où quelques secondes de latence ne se voient pas. */
function subscribeQueue(onChange) {
  setInterval(onChange, 4000);
}

initTheme();

/* ============ Fenêtres modales professionnelles ============
   Remplacent alert()/confirm()/prompt() natifs par des fenêtres stylées
   cohérentes avec le reste de l'app. Toutes renvoient une Promise. */

function _buildModal(innerHtml) {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal-box">' + innerHtml + '</div>';
  document.body.appendChild(overlay);
  requestAnimationFrame(function () { overlay.classList.add('on'); });
  return overlay;
}

function _closeModal(overlay) {
  overlay.classList.remove('on');
  setTimeout(function () { overlay.remove(); }, 180);
}

function showAlert(message, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    var overlay = _buildModal(
      (opts.title ? '<div class="modal-title">' + esc(opts.title) + '</div>' : '') +
      '<div class="modal-message">' + esc(message) + '</div>' +
      '<div class="modal-actions"><button class="btn btn-primary" id="modal-ok-btn">' +
      esc(opts.okLabel || 'OK') + '</button></div>'
    );
    function close() { _closeModal(overlay); resolve(); }
    overlay.querySelector('#modal-ok-btn').onclick = close;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  });
}

function showConfirm(message, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    var overlay = _buildModal(
      (opts.title ? '<div class="modal-title">' + esc(opts.title) + '</div>' : '') +
      '<div class="modal-message">' + esc(message) + '</div>' +
      '<div class="modal-actions">' +
      '<button class="btn btn-soft" id="modal-cancel-btn">' + esc(opts.cancelLabel || 'Annuler') + '</button>' +
      '<button class="btn ' + (opts.danger ? 'modal-danger-btn' : 'btn-primary') + '" id="modal-confirm-btn">' +
      esc(opts.confirmLabel || 'Confirmer') + '</button>' +
      '</div>'
    );
    overlay.querySelector('#modal-cancel-btn').onclick = function () { _closeModal(overlay); resolve(false); };
    overlay.querySelector('#modal-confirm-btn').onclick = function () { _closeModal(overlay); resolve(true); };
  });
}

function showPrompt(message, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    var overlay = _buildModal(
      (opts.title ? '<div class="modal-title">' + esc(opts.title) + '</div>' : '') +
      (message ? '<div class="modal-message">' + esc(message) + '</div>' : '') +
      '<div class="modal-error" id="modal-prompt-error" style="display:none"></div>' +
      '<input class="modal-input" id="modal-prompt-input" type="text" value="' +
      esc(opts.defaultValue || '') + '" placeholder="' + esc(opts.placeholder || '') + '">' +
      '<div class="modal-actions">' +
      '<button class="btn btn-soft" id="modal-cancel-btn">Annuler</button>' +
      '<button class="btn ' + (opts.danger ? 'modal-danger-btn' : 'btn-primary') + '" id="modal-confirm-btn">' +
      esc(opts.confirmLabel || 'Valider') + '</button>' +
      '</div>'
    );
    var input = overlay.querySelector('#modal-prompt-input');
    var errEl = overlay.querySelector('#modal-prompt-error');
    setTimeout(function () { input.focus(); input.select(); }, 50);

    function submit() {
      var val = input.value.trim();
      if (opts.requireExact && val !== opts.requireExact) {
        errEl.textContent = 'Le texte tapé ne correspond pas à « ' + opts.requireExact + ' ».';
        errEl.style.display = 'block';
        return;
      }
      _closeModal(overlay);
      resolve(val || null);
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    overlay.querySelector('#modal-cancel-btn').onclick = function () { _closeModal(overlay); resolve(null); };
    overlay.querySelector('#modal-confirm-btn').onclick = submit;
  });
}
