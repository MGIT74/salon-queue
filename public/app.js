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
