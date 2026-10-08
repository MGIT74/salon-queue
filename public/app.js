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

/**
 * Barre laterale du dashboard repliee en rail d'icones (desktop/tablette
 * uniquement - masque en mode telephone, bandeau du bas). Memorise sur cet
 * appareil ; applique avant le premier affichage par le script anti-flash
 * en tete de dashboard.html (meme principe que le mode sombre), pour ne
 * jamais voir la barre large une fraction de seconde avant de se replier.
 */
function toggleSidebarCollapsed() {
  var html = document.documentElement;
  var collapsed = html.getAttribute('data-sidebar-collapsed') === '1';
  if (collapsed) html.removeAttribute('data-sidebar-collapsed');
  else html.setAttribute('data-sidebar-collapsed', '1');
  try { localStorage.setItem('sidebar-collapsed', collapsed ? '0' : '1'); } catch (e) {}
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
  // textContent -> innerHTML n'échappe que &, < et > : les guillemets
  // simples/doubles passent tels quels. Insuffisant pour une valeur
  // ensuite placée DANS un attribut HTML (ex: style="...&quot;VALEUR&quot;...")
  // - un guillemet non échappé y termine prématurément l'attribut et
  // permet d'injecter un attribut/évènement arbitraire juste après.
  return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ============ Sélecteur d'indicatif téléphonique (drapeaux réels) ============ */
/* Partagé par compte.html (inscription/profil client) et signup.html
   (création d'enseigne) - une seule liste/logique à maintenir. */
var PHONE_COUNTRIES = [
  ['+33', '🇫🇷', 'France', 'fr'],
  ['+32', '🇧🇪', 'Belgique', 'be'],
  ['+41', '🇨🇭', 'Suisse', 'ch'],
  ['+352', '🇱🇺', 'Luxembourg', 'lu'],
  ['+1', '🇨🇦', 'Canada', 'ca'],
  ['+49', '🇩🇪', 'Allemagne', 'de'],
  ['+213', '🇩🇿', 'Algérie', 'dz'],
  ['+61', '🇦🇺', 'Australie', 'au'],
  ['+43', '🇦🇹', 'Autriche', 'at'],
  ['+973', '🇧🇭', 'Bahreïn', 'bh'],
  ['+229', '🇧🇯', 'Bénin', 'bj'],
  ['+55', '🇧🇷', 'Brésil', 'br'],
  ['+359', '🇧🇬', 'Bulgarie', 'bg'],
  ['+226', '🇧🇫', 'Burkina Faso', 'bf'],
  ['+237', '🇨🇲', 'Cameroun', 'cm'],
  ['+86', '🇨🇳', 'Chine', 'cn'],
  ['+357', '🇨🇾', 'Chypre', 'cy'],
  ['+57', '🇨🇴', 'Colombie', 'co'],
  ['+242', '🇨🇬', 'Congo', 'cg'],
  ['+243', '🇨🇩', 'Congo (RDC)', 'cd'],
  ['+82', '🇰🇷', 'Corée du Sud', 'kr'],
  ['+225', '🇨🇮', "Côte d'Ivoire", 'ci'],
  ['+45', '🇩🇰', 'Danemark', 'dk'],
  ['+20', '🇪🇬', 'Égypte', 'eg'],
  ['+971', '🇦🇪', 'Émirats arabes unis', 'ae'],
  ['+34', '🇪🇸', 'Espagne', 'es'],
  ['+372', '🇪🇪', 'Estonie', 'ee'],
  ['+1', '🇺🇸', 'États-Unis', 'us'],
  ['+358', '🇫🇮', 'Finlande', 'fi'],
  ['+590', '🇬🇵', 'Guadeloupe', 'gp'],
  ['+594', '🇬🇫', 'Guyane', 'gf'],
  ['+30', '🇬🇷', 'Grèce', 'gr'],
  ['+509', '🇭🇹', 'Haïti', 'ht'],
  ['+36', '🇭🇺', 'Hongrie', 'hu'],
  ['+91', '🇮🇳', 'Inde', 'in'],
  ['+62', '🇮🇩', 'Indonésie', 'id'],
  ['+353', '🇮🇪', 'Irlande', 'ie'],
  ['+354', '🇮🇸', 'Islande', 'is'],
  ['+972', '🇮🇱', 'Israël', 'il'],
  ['+39', '🇮🇹', 'Italie', 'it'],
  ['+81', '🇯🇵', 'Japon', 'jp'],
  ['+7', '🇰🇿', 'Kazakhstan', 'kz'],
  ['+965', '🇰🇼', 'Koweït', 'kw'],
  ['+371', '🇱🇻', 'Lettonie', 'lv'],
  ['+961', '🇱🇧', 'Liban', 'lb'],
  ['+370', '🇱🇹', 'Lituanie', 'lt'],
  ['+261', '🇲🇬', 'Madagascar', 'mg'],
  ['+223', '🇲🇱', 'Mali', 'ml'],
  ['+212', '🇲🇦', 'Maroc', 'ma'],
  ['+230', '🇲🇺', 'Maurice', 'mu'],
  ['+596', '🇲🇶', 'Martinique', 'mq'],
  ['+52', '🇲🇽', 'Mexique', 'mx'],
  ['+377', '🇲🇨', 'Monaco', 'mc'],
  ['+227', '🇳🇪', 'Niger', 'ne'],
  ['+47', '🇳🇴', 'Norvège', 'no'],
  ['+64', '🇳🇿', 'Nouvelle-Zélande', 'nz'],
  ['+31', '🇳🇱', 'Pays-Bas', 'nl'],
  ['+51', '🇵🇪', 'Pérou', 'pe'],
  ['+63', '🇵🇭', 'Philippines', 'ph'],
  ['+48', '🇵🇱', 'Pologne', 'pl'],
  ['+351', '🇵🇹', 'Portugal', 'pt'],
  ['+974', '🇶🇦', 'Qatar', 'qa'],
  ['+262', '🇷🇪', 'Réunion', 're'],
  ['+44', '🇬🇧', 'Royaume-Uni', 'gb'],
  ['+40', '🇷🇴', 'Roumanie', 'ro'],
  ['+7', '🇷🇺', 'Russie', 'ru'],
  ['+221', '🇸🇳', 'Sénégal', 'sn'],
  ['+65', '🇸🇬', 'Singapour', 'sg'],
  ['+421', '🇸🇰', 'Slovaquie', 'sk'],
  ['+386', '🇸🇮', 'Slovénie', 'si'],
  ['+46', '🇸🇪', 'Suède', 'se'],
  ['+216', '🇹🇳', 'Tunisie', 'tn'],
  ['+90', '🇹🇷', 'Turquie', 'tr'],
  ['+380', '🇺🇦', 'Ukraine', 'ua'],
  ['+228', '🇹🇬', 'Togo', 'tg'],
  ['+420', '🇨🇿', 'Tchéquie', 'cz']
];

function findPhoneCountryByCode(code) {
  var found = PHONE_COUNTRIES.filter(function (p) { return p[0] === code; });
  return found[0] || PHONE_COUNTRIES[0];
}

function setPhoneCCDisplay(prefix, code, iso) {
  var entry = iso
    ? (PHONE_COUNTRIES.filter(function (p) { return p[0] === code && p[3] === iso; })[0] || findPhoneCountryByCode(code))
    : findPhoneCountryByCode(code);
  var countryEl = document.getElementById(prefix + '-phone-country');
  if (!countryEl) return;
  countryEl.value = entry[0];
  countryEl.dataset.iso = entry[3];
  document.getElementById(prefix + '-phone-cc-flag').textContent = entry[1];
  document.getElementById(prefix + '-phone-cc-label').textContent = entry[0];
}

function renderPhoneCCList(prefix) {
  var listEl = document.getElementById(prefix + '-phone-cc-list');
  listEl.innerHTML = PHONE_COUNTRIES.map(function (p) {
    return '<div class="phone-cc-opt" onclick="event.stopPropagation();selectPhoneCC(\'' + prefix + '\',\'' + p[0] + '\',\'' + p[3] + '\')">' +
      '<span class="flag-emoji">' + p[1] + '</span>' +
      '<span class="code">' + p[0] + '</span><span class="name">' + esc(p[2]) + '</span></div>';
  }).join('');
}

function selectPhoneCC(prefix, code, iso) {
  setPhoneCCDisplay(prefix, code, iso);
  document.getElementById(prefix + '-phone-cc-list').classList.remove('on');
}

function togglePhoneCC(prefix) {
  var list = document.getElementById(prefix + '-phone-cc-list');
  var isOpen = list.classList.contains('on');
  document.querySelectorAll('.phone-cc-list').forEach(function (l) { l.classList.remove('on'); });
  if (!isOpen) { renderPhoneCCList(prefix); list.classList.add('on'); }
}

document.addEventListener('click', function (e) {
  if (!e.target.closest('.phone-cc-picker')) {
    document.querySelectorAll('.phone-cc-list').forEach(function (l) { l.classList.remove('on'); });
  }
});

// Sépare un téléphone stocké (idéalement au format international, mais
// peut être un ancien format local pour des comptes créés avant l'ajout
// de l'indicatif) en {code, local}, pour préremplir les deux champs
// correctement. Par défaut +33 si aucun indicatif connu détecté. Trie
// les indicatifs du plus long au plus court pour ne jamais matcher un
// préfixe trop court par erreur.
var PHONE_COUNTRY_CODES = Array.from(new Set(PHONE_COUNTRIES.map(function (p) { return p[0]; })))
  .sort(function (a, b) { return b.length - a.length; });
function splitPhoneCountry(phone) {
  phone = String(phone || '').trim();
  for (var i = 0; i < PHONE_COUNTRY_CODES.length; i++) {
    if (phone.indexOf(PHONE_COUNTRY_CODES[i]) === 0) {
      return { code: PHONE_COUNTRY_CODES[i], local: phone.slice(PHONE_COUNTRY_CODES[i].length) };
    }
  }
  return { code: '+33', local: phone };
}
function composePhone(countryCode, localRaw) {
  var local = String(localRaw || '').trim();
  if (!local) return '';
  if (local.charAt(0) === '+') return local.replace(/[\s.-]/g, '');
  return countryCode + local.replace(/[\s.-]/g, '').replace(/^0+/, '');
}

/**
 * Heure "de salon" actuelle (Europe/Paris) sous forme de texte
 * "YYYY-MM-DD HH:MM:SS", pour comparer directement (par chaîne) à
 * appointments.scheduled_at (texte local de salon brut, jamais de la
 * vraie UTC) - jamais construire un objet Date à partir de
 * scheduled_at pour un test passé/futur : le fuseau du NAVIGATEUR du
 * client (pas forcément Paris) fausserait la comparaison, comme
 * new Date(chaine_sans_Z) est interprété en heure locale du poste.
 */
/**
 * Couleur d'accentuation personnalisable (Compte > Logo du salon) -
 * remplace le bleu Apple par défaut (--blue) partout dans l'app pour
 * CE salon précis, avec des teintes dérivées automatiquement
 * (survol plus foncé, fond léger plus clair/sombre selon le thème).
 * Appelée sur chaque page avec la valeur de GET /api/settings/public
 * - ne fait rien si aucune couleur personnalisée n'est enregistrée
 * (garde le bleu Apple d'origine).
 */
/**
 * Bascule un champ mot de passe entre masqué/visible - ajoute
 * dynamiquement l'icône œil juste après l'input ciblé (pas besoin de
 * dupliquer le HTML sur chaque page, un seul appel par champ).
 */
function addPasswordToggle(inputId) {
  var input = document.getElementById(inputId);
  if (!input || input.dataset.toggleAdded) return;
  input.dataset.toggleAdded = '1';

  var wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;display:flex';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);
  input.style.paddingRight = '44px';
  input.style.flex = '1';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Afficher le mot de passe');
  btn.style.cssText = 'position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--grey);padding:8px;display:flex;align-items:center;justify-content:center';
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  btn.onclick = function () {
    var showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.innerHTML = showing
      ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>'
      : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.4 10.4 0 0112 19c-7 0-11-7-11-7a18.6 18.6 0 015.1-5.6M9.9 4.2A10.6 10.6 0 0112 4c7 0 11 7 11 7a18.5 18.5 0 01-2.2 3.1M14.1 14.1a3 3 0 11-4.2-4.2"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    btn.setAttribute('aria-label', showing ? 'Afficher le mot de passe' : 'Masquer le mot de passe');
  };
  wrapper.appendChild(btn);
}

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
  var num = parseInt(hex, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function shadeColor(hex, percent) {
  var rgb = hexToRgb(hex);
  function adjust(c) {
    var t = percent < 0 ? 0 : 255;
    var p = Math.abs(percent) / 100;
    return Math.round((t - c) * p + c);
  }
  var r = adjust(rgb.r), g = adjust(rgb.g), b = adjust(rgb.b);
  return '#' + [r, g, b].map(function (c) { return c.toString(16).padStart(2, '0'); }).join('');
}

function applyAccentColor(hex) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  var hover = shadeColor(hex, -22);
  var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  // Ne touche JAMAIS --blue/--blue-hover/--blue-soft (couleur des
  // étiquettes, badges de statut, icônes RDV...) - seulement --accent,
  // utilisé uniquement par les boutons principaux et les vrais liens.
  // --accent-rgb (composantes séparées) permet les dégradés
  // semi-transparents (rgba(var(--accent-rgb), .3)) des pages de connexion.
  var style = document.createElement('style');
  style.textContent =
    ':root { --accent: ' + hex + '; --accent-hover: ' + hover + '; --accent-rgb: ' + r + ',' + g + ',' + b + '; }' +
    '[data-theme="dark"] { --accent: ' + hex + '; --accent-hover: ' + hover + '; --accent-rgb: ' + r + ',' + g + ',' + b + '; }';
  document.head.appendChild(style);
}

// Fuseau horaire du salon (Europe/Paris par défaut) - chaque page le met
// à jour après avoir chargé les réglages (SALON_TIMEZONE = data.timezone),
// comme CURRENCY ci-dessous. Utilisé pour tout affichage/calcul de date
// "heure de salon" côté client, cohérent avec le calcul serveur.
var SALON_TIMEZONE = 'Europe/Paris';

function nowSalonDatetimeString() {
  var parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SALON_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  var get = function (type) { return parts.find(function (p) { return p.type === type; }).value; };
  return get('year') + '-' + get('month') + '-' + get('day') + ' ' + get('hour') + ':' + get('minute') + ':' + get('second');
}

// Devise du salon (EUR par défaut) - chaque page la met à jour après
// avoir chargé les réglages du salon (CURRENCY = data.currency).
var CURRENCY = 'EUR';
function eur(cents) { return (cents / 100).toFixed(2).replace('.', ',') + ' ' + (CURRENCY === 'CHF' ? 'CHF' : '€'); }

// Format lisible d'une durée en minutes : sous 60 -> "45 min", au-delà
// -> "1h", "1h20"... jamais un grand nombre de minutes brut (ex:
// "200 min" fait fuir un client qui ne veut pas calculer que ça fait
// 3h20). Utilisé partout où une attente/durée peut dépasser 59 min.
function formatMinutes(mins) {
  mins = Math.round(Number(mins) || 0);
  if (mins < 60) return mins + ' min';
  var h = Math.floor(mins / 60);
  var m = mins % 60;
  return h + 'h' + (m > 0 ? String(m).padStart(2, '0') : '');
}

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

var IMPERSONATE_TOKEN = '';
function setImpersonateToken(t) { IMPERSONATE_TOKEN = t || ''; }

var SALON_SLUG = (function () {
  try { return new URLSearchParams(window.location.search).get('salon') || ''; }
  catch (e) { return ''; }
})();

/**
 * Pages liees a UN salon (poste, caisse, borne, affichage) ouvertes SANS ?salon=... : quand la plateforme heberge
 * plusieurs salons, une telle adresse est ambigue - elle retombait sur le salon "par defaut" (celui que la base cree
 * toute seule) et affichait, par exemple, le clavier de code PIN d'un salon que la personne n'a pas choisi. On affiche
 * alors un message neutre a la place. Une installation a UN seul salon garde son comportement ; en cas de doute (serveur
 * injoignable) la page s'ouvre comme avant. Le tableau de bord n'appelle PAS cette fonction : sa connexion par email
 * retrouve le salon toute seule, depuis une adresse nue.
 * A coupler avec le script d'entete de la page (classe "no-slug") qui evite tout eclair de la page avant ce controle.
 */
function requireSalonInUrl(sentence) {
  if (SALON_SLUG) return;
  function reveal() { document.documentElement.classList.remove('no-slug'); }
  var timer = setTimeout(reveal, 4000);   // filet de securite : la page ne reste jamais masquee
  fetch('/api/signup/status').then(function (r) { return r.json(); }).then(function (d) {
    clearTimeout(timer);
    if (!(d && d.multi_salon)) { reveal(); return; }
    var box = document.createElement('div');
    box.id = 'no-salon'; box.setAttribute('role', 'alert');
    box.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:28px;text-align:center;background:var(--bg,#000);color:var(--ink,#fff);font-family:inherit';
    box.innerHTML = '<div style="max-width:420px"><h1 style="font-size:26px;font-weight:600;letter-spacing:-.03em;margin:0 0 12px">Lien incomplet</h1><p style="font-size:16px;line-height:1.5;color:var(--grey,#8e8e93);margin:0"></p></div>';
    box.querySelector('p').textContent = 'Cette adresse ne précise pas de salon. ' + sentence;
    document.body.appendChild(box);
  }).catch(function () { clearTimeout(timer); reveal(); });
}

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
  if (IMPERSONATE_TOKEN) headers['X-Impersonate-Token'] = IMPERSONATE_TOKEN;
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

// Bloque le défilement de l'arrière-plan tant qu'au moins un popup est
// ouvert - un simple overflow:hidden sur body ne suffit pas de façon
// fiable partout (Safari iOS notamment laisse parfois défiler
// l'arrière-plan "à travers" un popup ouvert, provoquant de petits
// bugs d'interaction, ex: dans l'agenda en ajoutant un RDV). Un
// compteur gère les popups imbriqués (ex: une confirmation ouverte
// depuis un autre popup) sans débloquer trop tôt.
var _modalLockCount = 0;
var _modalScrollY = 0;

function _lockBodyScroll() {
  if (_modalLockCount === 0) {
    _modalScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + _modalScrollY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
  }
  _modalLockCount++;
}

function _unlockBodyScroll() {
  _modalLockCount = Math.max(0, _modalLockCount - 1);
  if (_modalLockCount === 0) {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.overflow = '';
    window.scrollTo(0, _modalScrollY);
  }
}

function _buildModal(innerHtml) {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal-box">' + innerHtml + '</div>';
  document.body.appendChild(overlay);
  _lockBodyScroll();
  requestAnimationFrame(function () { overlay.classList.add('on'); });
  return overlay;
}

function _closeModal(overlay) {
  overlay.classList.remove('on');
  setTimeout(function () { overlay.remove(); _unlockBodyScroll(); }, 180);
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
      '<input class="modal-input" id="modal-prompt-input" type="' + esc(opts.inputType || 'text') + '"' +
      (opts.inputMode ? ' inputmode="' + esc(opts.inputMode) + '"' : '') +
      ' value="' + esc(opts.defaultValue || '') + '" placeholder="' + esc(opts.placeholder || '') + '">' +
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

/**
 * Autocomplétion "client connu" pour un champ Nom du client (ajout
 * manuel d'un RDV, admin ou coiffeur) - dès 3 caractères, propose les
 * clients correspondants (GET /api/queue/clients-search), et
 * pré-remplit email/téléphone au clic sur une suggestion.
 *
 * container : l'élément overlay/racine dans lequel chercher les champs.
 * fetchFn : la fonction d'appel API à utiliser (api ou barberApi selon
 * la page), pour respecter l'authentification propre à chaque contexte.
 */
function attachClientAutocomplete(container, nameId, emailId, phoneId, fetchFn) {
  var nameInput = container.querySelector('#' + nameId);
  if (!nameInput) return;
  var emailInput = container.querySelector('#' + emailId);
  var phoneInput = container.querySelector('#' + phoneId);

  nameInput.parentElement.style.position = 'relative';
  var dropdown = document.createElement('div');
  dropdown.className = 'autocomplete-dropdown';
  dropdown.style.display = 'none';
  nameInput.parentElement.appendChild(dropdown);

  var debounceId = null;
  function hide() { dropdown.style.display = 'none'; }

  nameInput.addEventListener('input', function () {
    var q = nameInput.value.trim();
    clearTimeout(debounceId);
    if (q.length < 3) { hide(); return; }
    debounceId = setTimeout(function () {
      fetchFn('/api/queue/clients-search?q=' + encodeURIComponent(q)).then(function (r) {
        if (!r.items || !r.items.length) { hide(); return; }
        dropdown.innerHTML = r.items.map(function (c, i) {
          return '<div class="autocomplete-item" data-i="' + i + '">' +
            '<div class="ac-name">' + esc(c.name) + '</div>' +
            (c.email || c.phone ? '<div class="ac-meta">' + esc([c.email, c.phone].filter(Boolean).join(' · ')) + '</div>' : '') +
            '</div>';
        }).join('');
        dropdown.style.display = 'block';
        dropdown.querySelectorAll('.autocomplete-item').forEach(function (el, i) {
          el.onmousedown = function (e) {
            e.preventDefault(); // évite que le blur du champ ne ferme la liste avant le clic
            var c = r.items[i];
            nameInput.value = c.name;
            if (emailInput) emailInput.value = c.email || '';
            if (phoneInput) phoneInput.value = c.phone || '';
            hide();
          };
        });
      }).catch(hide);
    }, 250);
  });

  nameInput.addEventListener('blur', function () { setTimeout(hide, 150); });
}

/**
 * Un coiffeur ne doit être proposable pour un RDV que s'il a au moins un
 * jour d'horaire activé - sinon il n'aura jamais le moindre créneau
 * disponible, quelle que soit la date choisie (ça ferait perdre du temps
 * à l'admin comme au client, qui ne le découvriraient qu'à l'étape
 * "créneau"). Aucune ligne d'horaire du tout = jamais configuré, pas
 * "désactivé partout" - on le garde alors disponible par défaut, pour ne
 * pas masquer un coiffeur qu'on vient de créer avant qu'il ait réglé ses
 * horaires. Ne vérifie pas ici `accepts_appointments`/`active` : à
 * l'appelant de les avoir déjà filtrés selon son propre contexte (ex:
 * l'API publique /api/barbers exclut déjà les coiffeurs inactifs).
 */
function hasBookableSchedule(b) {
  var schedules = b.schedules || [];
  if (schedules.length === 0) return true;
  return schedules.some(function (s) { return s.active; });
}

// Palette de couleurs stables pour associer une couleur à un coiffeur
// sans champ "color" explicite (bulles, timeline...) - le même id donne
// toujours la même couleur, sans avoir besoin de la stocker en base.
var DOT_COLORS = ['#3b82f6', '#f97316', '#10b981', '#a855f7', '#ec4899', '#eab308', '#14b8a6', '#ef4444'];
function stableColorForId(id) {
  var hash = 0;
  for (var i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return DOT_COLORS[hash % DOT_COLORS.length];
}


/* ---------- Connexion TPE / imprimante (programme de connexion local) ----------
 * Partage par la caisse et le dashboard. Une page web ne peut PAS lancer un
 * programme : on ouvre un lien tpebridge://start que Windows sait traiter
 * (declare par l'installeur) et qui lance run-hidden.vbs. La fenetre
 * d'autorisation qui suit est celle du NAVIGATEUR - impossible a restyler ou
 * renommer depuis une page web : on affiche donc d'abord notre propre guide.
 * Cote utilisateur on parle de "connexion", jamais de "pont". */
var BRIDGE_ICON_PRINTER = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
var BRIDGE_ICON_CARD = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>';
var BRIDGE_GUIDE_KEY = 'bridge-start-guide-hidden';

function startBridgeFlow() {
  var hidden = false;
  try { hidden = localStorage.getItem(BRIDGE_GUIDE_KEY) === '1'; } catch (e) { /* stockage indisponible */ }
  if (hidden) { launchBridgeLink(); return; }

  var overlay = _buildModal(
    '<div class="modal-title">Connecter le TPE et l\'imprimante</div>' +
    '<p class="modal-message" style="margin-bottom:8px">Votre navigateur va afficher une petite fenêtre pour demander l\'autorisation. C\'est normal et sans danger.</p>' +
    '<ol class="bridge-guide-steps">' +
      '<li><span><b>Cochez</b> « Toujours autoriser… » pour ne plus avoir à le refaire.</span></li>' +
      '<li><span>Cliquez sur <b>« Ouvrir Microsoft Windows Based Script Host »</b>. C\'est le nom que Windows donne au programme de connexion.</span></li>' +
    '</ol>' +
    '<label class="bridge-guide-never"><input type="checkbox" id="bridge-guide-never"> Ne plus afficher ce guide</label>' +
    '<div class="modal-actions">' +
      '<button class="btn btn-soft" id="bridge-guide-cancel">Annuler</button>' +
      '<button class="btn btn-primary" id="bridge-guide-go">Continuer</button>' +
    '</div>'
  );
  overlay.querySelector('#bridge-guide-cancel').onclick = function () { _closeModal(overlay); };
  overlay.querySelector('#bridge-guide-go').onclick = function () {
    if (overlay.querySelector('#bridge-guide-never').checked) {
      try { localStorage.setItem(BRIDGE_GUIDE_KEY, '1'); } catch (e) { /* tant pis */ }
    }
    _closeModal(overlay);
    launchBridgeLink();
  };
}

function launchBridgeLink() {
  // Lien clique par programme, dans le geste de l'utilisateur (le clic sur
  // "Continuer") : le navigateur affiche alors sa demande d'autorisation.
  var a = document.createElement('a');
  a.href = 'tpebridge://start';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  onBridgeStartClick();
}

function onBridgeStartClick() {
  toast('Connexion demandée - quelques secondes...');
  // Le navigateur ne dit pas si Windows a reussi (ni si la fenetre a ete
  // validee) : on juge sur le statut reel (window.__bridgeOnline, tenu a jour
  // par la page), en laissant le temps de repondre.
  setTimeout(function () {
    if (!window.__bridgeOnline) {
      toast('Toujours pas connecté. Vérifiez que vous avez bien cliqué sur « Ouvrir » dans la fenêtre du navigateur, et que vous êtes sur l\'ordinateur relié à l\'imprimante et au TPE.', true);
    }
  }, 45000);
}

/* =====================================================================================================================
 * CARTES DE VITRINE - prestations, supplements, produits (le style est dans app.css).
 * Partagees par la reservation en ligne (rdv.html), "Mon compte" (compte.html), la borne (kiosk.html) et les assistants
 * "Ajouter un RDV" du tableau de bord et de "Mon poste" : meme rendu partout, un seul code a maintenir.
 * ===================================================================================================================== */
var VITRINE_PLUS_SVG = '<svg class="ic-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>';
var VITRINE_CHECK_SVG = '<svg class="ic-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
var VITRINE_CHECK_SM_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';

// Minuscules et sans accents : "Epilation" retrouve "Épilation".
function normText(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Icone par defaut d'une prestation SANS photo, d'apres son nom.
function vitrineIcon(name) {
  var n = (name || '').toLowerCase();
  if (n.indexOf('enfant') !== -1) return '🧒';
  if (n.indexOf('barbe') !== -1) return '🧔';
  if (n.indexOf('shampoo') !== -1 || n.indexOf('shampooing') !== -1) return '🧴';
  if (n.indexOf('couleur') !== -1 || n.indexOf('colorat') !== -1) return '🎨';
  if (n.indexOf('serviette') !== -1 || n.indexOf('chaude') !== -1) return '🔥';
  if (n.indexOf('contour') !== -1 || n.indexOf('traçage') !== -1 || n.indexOf('tracage') !== -1) return '📏';
  if (n.indexOf('dégradé') !== -1 || n.indexOf('degrade') !== -1 || n.indexOf('américain') !== -1) return '💈';
  if (n.indexOf('huile') !== -1 || n.indexOf('soin') !== -1) return '💧';
  if (n.indexOf('cire') !== -1 || n.indexOf('gel') !== -1) return '🧴';
  if (n.indexOf('zéro') !== -1 || n.indexOf('zero') !== -1) return '🪒';
  if (n.indexOf('parfum') !== -1) return '🌸';
  if (n.indexOf('coupe') !== -1) return '✂️';
  return '✂️';
}

// Une page qui a sa propre fonction iconForItem (reservation, compte, borne, caisse) garde la sienne.
function vitrineBaseIcon(name) {
  return (typeof iconForItem === 'function' ? iconForItem : vitrineIcon)(name);
}

// Icone par defaut d'un supplement / produit SANS photo (d'apres son nom).
function extraIcon(name) {
  var n = normText(name);
  var rules = [['bougie', '🕯️'], ['meche', '🎨'], ['color', '🎨'], ['epilation', '✨'], ['defris', '💇'], ['visage', '🧖'], ['masque', '🧖'], ['mask', '🧖']];
  for (var k = 0; k < rules.length; k++) if (n.indexOf(rules[k][0]) !== -1) return rules[k][1];
  var common = vitrineBaseIcon(name);
  return common === '✂️' ? '✨' : common;
}
function productIcon(name) {
  var n = normText(name);
  if (/\b(canette|redbull|red bull|eau|pago|soda|coca|jus|boisson|orangina)\b/.test(n)) return '🥤';
  if (/shampo/.test(n)) return '🚿';
  if (/(huile|serum|baume)/.test(n)) return '💧';
  if (/(poudre|fibre)/.test(n)) return '✨';
  if (/(cire|gel|pate|spray|creme|pommade|laque)/.test(n)) return '🧴';
  return '🛍️';
}

// Les produits sont regroupes par categorie quand le gerant en a renseigne ; sinon une simple liste.
function groupItems(kind, items) {
  if (kind !== 'products') return [{ title: '', items: items }];
  var order = [], map = Object.create(null);
  items.forEach(function (it) {
    var c = String(it.category || '').trim();
    if (!(c in map)) { map[c] = []; order.push(c); }
    map[c].push(it);
  });
  var named = order.filter(function (c) { return c; });
  if (!named.length) return [{ title: '', items: items }];
  var groups = named.map(function (c) { return { title: c, items: map[c] }; });
  if (map['']) groups.push({ title: 'Autres', items: map[''] });
  return groups;
}

/**
 * HTML d'une carte. kind : 'services' (choix unique : coche sur l'image) | 'extras' | 'products' (bouton + qui devient une coche).
 * onclick : expression JS executee au clic ; "{id}" y est remplace par l'identifiant de l'article, ex. "toggleExtra(this,'{id}')".
 * Photo EN HAUT (entiere, jamais recadree), nom / duree / prix EN DESSOUS sur fond uni : jamais de texte pose sur un dessin.
 */
function vitrineCardHtml(kind, it, selected, onclick) {
  var isSvc = kind === 'services';
  var out = kind === 'products' && it.stock_enabled && Number(it.stock_quantity) <= 0;
  var photo = it.image_url ? ' style="background-image:url(&quot;' + esc(it.image_url) + '&quot;)"' : ' aria-hidden="true"';
  var icon = it.image_url ? '' : (kind === 'extras' ? extraIcon(it.name) : kind === 'products' ? productIcon(it.name) : vitrineBaseIcon(it.name));
  var meta = '';
  if (isSvc) meta = formatMinutes(it.duration_min);
  else if (kind === 'extras' && Number(it.duration_min) > 0) meta = '+' + formatMinutes(it.duration_min);
  else if (kind === 'products' && it.stock_enabled && it.stock_quantity > 0 && it.stock_quantity <= 3) meta = 'Plus que ' + it.stock_quantity;
  var price = (kind === 'extras' ? '+' : '') + eur(it.price_cents);
  var action = isSvc ? '' : out ? '<span class="item-out">Épuisé</span>' : '<span class="item-add">' + VITRINE_PLUS_SVG + VITRINE_CHECK_SVG + '</span>';
  var on = !out && selected;
  return '<button type="button" class="item-card' + (it.image_url ? ' has-photo' : '') + (on ? ' sel' : '') + (out ? ' out' : '') + '"' +
    ' data-id="' + it.id + '" data-name="' + esc(normText(it.name)) + '" title="' + esc(it.name) + '"' +
    ' aria-pressed="' + (on ? 'true' : 'false') + '"' + (out ? ' disabled' : ' onclick="' + String(onclick).replace(/\{id\}/g, it.id) + '"') + '>' +
    '<span class="item-media"' + photo + '>' + icon + (isSvc ? '<span class="item-check">' + VITRINE_CHECK_SM_SVG + '</span>' : '') + '</span>' +
    '<span class="item-body"><span class="item-name">' + esc(it.name) + '</span>' +
    (meta ? '<span class="item-meta">' + esc(meta) + '</span>' : '') +
    '<span class="item-foot"><span class="item-price">' + price + '</span>' + action + '</span></span></button>';
}

/**
 * Remplit une liste de cartes. cfg : { kind, gridId, items, chosen (tableau d'identifiants, par reference), onclick,
 *   searchId?, qId?, emptyId?, summaryId? }. La recherche n'apparait que si la liste depasse 8 articles ; elle repart vide.
 */
function vitrineRender(cfg) {
  var chosen = cfg.chosen || [];
  document.getElementById(cfg.gridId).innerHTML = groupItems(cfg.kind, cfg.items).map(function (g) {
    return (g.title ? '<div class="item-group">' + esc(g.title) + '</div>' : '') +
      g.items.map(function (it) { return vitrineCardHtml(cfg.kind, it, chosen.indexOf(it.id) !== -1, cfg.onclick); }).join('');
  }).join('');
  if (cfg.searchId) document.getElementById(cfg.searchId).style.display = cfg.items.length > 8 ? '' : 'none';
  if (cfg.qId) document.getElementById(cfg.qId).value = '';
  if (cfg.emptyId) {
    var empty = document.getElementById(cfg.emptyId);
    var none = { services: 'Aucune prestation disponible pour le moment.', extras: 'Aucun supplément disponible pour le moment.', products: 'Aucun produit disponible pour le moment.' }[cfg.kind];
    empty.textContent = cfg.items.length ? 'Aucun résultat' : none;
    empty.style.display = cfg.items.length ? 'none' : 'block';
  }
  if (cfg.summaryId) vitrineSummary(cfg);
}

// Resume du choix : combien, et l'effet sur la duree et le prix. cfg : { kind, summaryId, items, chosen }.
function vitrineSummary(cfg) {
  var el = document.getElementById(cfg.summaryId);
  if (!el) return;
  var picked = cfg.items.filter(function (it) { return cfg.chosen.indexOf(it.id) !== -1; });
  var noun = cfg.kind === 'extras' ? 'supplément' : 'produit';
  if (!picked.length) {
    el.className = 'step-summary';
    el.innerHTML = '<span>Aucun ' + noun + ' choisi</span><span>Facultatif</span>';
    return;
  }
  var cents = picked.reduce(function (t, it) { return t + (Number(it.price_cents) || 0); }, 0);
  var minutes = cfg.kind === 'extras' ? picked.reduce(function (t, it) { return t + (Number(it.duration_min) || 0); }, 0) : 0;
  el.className = 'step-summary has';
  el.innerHTML = '<span><strong>' + picked.length + ' ' + noun + (picked.length > 1 ? 's' : '') + '</strong></span>' +
    '<span>' + (minutes ? '+' + formatMinutes(minutes) + ' · ' : '') + (cfg.kind === 'extras' ? '+' : '') + eur(cents) + '</span>';
}

// Recherche instantanee (sans accents ni majuscules) ; les en-tetes de categorie vides disparaissent. cfg : { gridId, qId, emptyId }.
function vitrineFilter(cfg) {
  var raw = document.getElementById(cfg.qId).value;
  var q = normText(raw).trim();
  var grid = document.getElementById(cfg.gridId), any = false;
  grid.querySelectorAll('.item-card').forEach(function (c) {
    var ok = !q || c.getAttribute('data-name').indexOf(q) !== -1;
    c.hidden = !ok;
    if (ok) any = true;
  });
  grid.querySelectorAll('.item-group').forEach(function (g) {
    var n = g.nextElementSibling, visible = false;
    while (n && !n.classList.contains('item-group')) { if (!n.hidden) visible = true; n = n.nextElementSibling; }
    g.hidden = !visible;
  });
  var empty = document.getElementById(cfg.emptyId);
  empty.textContent = 'Aucun résultat pour « ' + raw.trim() + ' »';
  empty.style.display = any ? 'none' : 'block';
}

// Choix unique (prestation) : desélectionne les autres cartes de la liste et marque celle-ci.
function vitrineSelectOne(el) {
  el.parentNode.querySelectorAll('.item-card').forEach(function (c) { c.classList.remove('sel'); c.setAttribute('aria-pressed', 'false'); });
  el.classList.add('sel');
  el.setAttribute('aria-pressed', 'true');
}
// Choix multiple (supplement / produit) : bascule la carte.
function vitrineToggle(el) {
  el.classList.toggle('sel');
  el.setAttribute('aria-pressed', el.classList.contains('sel') ? 'true' : 'false');
}

// Bloc HTML du champ de recherche (pour les assistants construits en JavaScript). idBase : ex. "aa-extras".
function vitrineSearchHtml(idBase, placeholder, filterCall) {
  return '<div class="items-search" id="' + idBase + '-search" style="display:none">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
    '<input type="search" id="' + idBase + '-q" placeholder="' + placeholder + '" autocomplete="off" oninput="' + filterCall + '"></div>';
}

/* ---- Recapitulatif du panier (prestation + supplements + produits, avec le detail) et fenetres "Ajouter un RDV" a zones fixes ----
   sel : { service, extras[], products[], barber?, when?, time? } (objets du catalogue). Retourne '' tant qu'aucune prestation n'est choisie. */
function vitrineRecapHtml(sel) {
  if (!sel || !sel.service) return '';
  var rows = '', cents = 0, mins = 0;
  function row(label, name, meta, price) {
    rows += '<div class="recap-row"><span class="recap-k">' + label + '</span><span class="recap-n">' + esc(name) +
      (meta ? ' <em>' + esc(meta) + '</em>' : '') + '</span><span class="recap-p">' + price + '</span></div>';
  }
  var s = sel.service;
  cents += Number(s.price_cents) || 0; mins += Number(s.duration_min) || 0;
  row('Prestation', s.name, Number(s.duration_min) > 0 ? formatMinutes(s.duration_min) : '', eur(Number(s.price_cents) || 0));
  (sel.extras || []).forEach(function (x) {
    cents += Number(x.price_cents) || 0; mins += Number(x.duration_min) || 0;
    row('Supplément', x.name, Number(x.duration_min) > 0 ? '+' + formatMinutes(x.duration_min) : '', '+' + eur(Number(x.price_cents) || 0));
  });
  (sel.products || []).forEach(function (x) {
    cents += Number(x.price_cents) || 0;
    row('Produit', x.name, '', eur(Number(x.price_cents) || 0));
  });
  var ctx = [];
  if (sel.barber) ctx.push(esc(sel.barber));
  if (sel.when) ctx.push(esc(sel.when) + (sel.time ? ' à ' + esc(sel.time) : ''));
  return (ctx.length ? '<div class="recap-ctx">' + ctx.join(' · ') + '</div>' : '') +
    '<div class="recap-list">' + rows + '</div>' +
    '<div class="recap-total"><span>Total</span><span>' + (mins ? formatMinutes(mins) + ' · ' : '') + '<strong>' + eur(cents) + '</strong></span></div>';
}

/**
 * Met une fenetre "Ajouter un RDV" en trois zones : en-tete fixe (titre, retour, recherche), liste qui defile, pied fixe
 * (recapitulatif + bouton). Regroupe automatiquement le contenu de chaque etape (div id="...-step-...").
 * getSel() renvoie l'objet attendu par vitrineRecapHtml ; le recapitulatif se met a jour apres chaque clic.
 */
function vitrineFlow(overlay, getSel) {
  var box = overlay.querySelector('.modal-box');
  box.classList.add('modal-flow', 'modal-wide');
  if (box.firstElementChild) box.firstElementChild.classList.add('flow-head');
  var BODY_START = '.item-grid,.aa-grid,.aa-slots,.fld,.modal-error,.hint,.items-empty';
  var recaps = [];
  Array.prototype.slice.call(box.children).forEach(function (step) {
    if (!/-step-/.test(step.id || '')) return;
    var kids = Array.prototype.slice.call(step.children);
    var top = document.createElement('div'); top.className = 'flow-top';
    var body = document.createElement('div'); body.className = 'flow-body';
    var bar = null, actions = null, inTop = true;
    kids.forEach(function (k) {
      if (k.classList.contains('step-bar')) { bar = k; return; }
      if (k.classList.contains('modal-actions')) { actions = k; return; }
      if (inTop && k.matches(BODY_START)) inTop = false;
      (inTop ? top : body).appendChild(k);
    });
    if (!bar) { bar = document.createElement('div'); bar.className = 'step-bar' + (actions ? '' : ' recap-only'); }
    if (actions) bar.appendChild(actions);
    var recap = document.createElement('div'); recap.className = 'flow-recap';
    bar.insertBefore(recap, bar.firstChild);
    recaps.push({ el: recap, bar: bar });
    step.appendChild(top); step.appendChild(body); step.appendChild(bar);
  });
  function refresh() {
    var html = vitrineRecapHtml(getSel());
    recaps.forEach(function (r) {
      r.el.innerHTML = html;
      if (r.bar.classList.contains('recap-only')) r.bar.style.display = html ? '' : 'none';
    });
  }
  overlay.addEventListener('click', function () { setTimeout(refresh, 0); });
  refresh();
  return refresh;
}

/* Remplit tous les emplacements <div data-recap> de la page avec le recapitulatif (pages de reservation). */
function vitrineRecapFill(sel) {
  var html = vitrineRecapHtml(sel);
  document.querySelectorAll('[data-recap]').forEach(function (el) { el.innerHTML = html; });
}
