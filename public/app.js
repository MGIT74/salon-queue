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

// Date du jour DU SALON ('YYYY-MM-DD'), jamais celle d'UTC (toISOString) ni celle de l'appareil :
// à 00h48 à Paris, UTC est encore la veille. Toute valeur par défaut / borne « aujourd'hui » passe par ici.
function salonToday() { return nowSalonDatetimeString().slice(0, 10); }
if (typeof window !== 'undefined') window.salonToday = salonToday;
// Jour déjà passé (date du salon) : plus aucune prise de RDV depuis les agendas (admin, Mon poste, caisse).
function isPastDay(dateStr) { return String(dateStr) < salonToday(); }
if (typeof window !== 'undefined') window.isPastDay = isPastDay;

// Offre propre à un coiffeur (cf. GET /api/barbers) : prestations/suppléments qu'il ne fait pas, et son tarif
// personnalisé (prix et/ou durée) qui remplace celui du catalogue. Même règle que le serveur (src/lib/barberOffer.js).
// kind = 'services' | 'extras'. Sans coiffeur précis (« premier disponible »), le catalogue tel quel.
function barberItems(barber, kind, items) {
  if (!barber) return items.slice();
  var off = (kind === 'services' ? barber.disabled_service_ids : barber.disabled_extra_ids) || [];
  var ovr = (kind === 'services' ? barber.service_overrides : barber.extra_overrides) || {};
  return items.filter(function (it) { return off.indexOf(it.id) === -1; }).map(function (it) {
    var o = ovr[it.id];
    if (!o) return it;
    return Object.assign({}, it, {
      price_cents: o.price_cents !== undefined ? o.price_cents : it.price_cents,
      duration_min: o.duration_min !== undefined ? o.duration_min : it.duration_min
    });
  });
}
if (typeof window !== 'undefined') window.barberItems = barberItems;

// Devise du salon (EUR par défaut) - chaque page la met à jour après
// avoir chargé les réglages du salon (CURRENCY = data.currency).
var CURRENCY = 'EUR';
function eur(cents) { return (cents / 100).toFixed(2).replace('.', ',') + ' ' + (CURRENCY === 'CHF' ? 'CHF' : '€'); }

/**
 * Version TEXTE (32 colonnes) d'un ticket Z (clôture de caisse), pour l'imprimer via le pont du
 * salon (imprimante thermique), comme les reçus. Même contenu que l'aperçu : modes de paiement,
 * total, détail par coiffeur, par prestation/produit, TVA, fond de caisse.
 * r = réponse de /api/owner/caisse/closings/:id ; o = { salonName, labels }.
 */
function buildZText(r, o) {
  o = o || {};
  var COLS = 32;
  var code = (CURRENCY || 'EUR');   // pas de symbole € : absent de CP850, on écrit le code devise
  function money(c) { return (c / 100).toFixed(2).replace('.', ',') + ' ' + code; }
  function center(t) { t = String(t); return ' '.repeat(Math.max(0, Math.floor((COLS - t.length) / 2))) + t; }
  function sep() { return '-'.repeat(COLS); }
  function twoCols(a, b) {
    a = String(a); b = String(b);
    var space = COLS - a.length - b.length;
    return space < 1 ? (a + ' ' + b).slice(0, COLS) : a + ' '.repeat(space) + b;
  }
  function wrapWords(text, first, next) {
    var lines = [], cur = '', width = first;
    String(text).split(/\s+/).filter(Boolean).forEach(function (word) {
      while (true) {
        var cand = cur ? cur + ' ' + word : word;
        if (cand.length <= width) { cur = cand; break; }
        if (cur) { lines.push(cur); cur = ''; width = next; continue; }
        lines.push(word.slice(0, width)); word = word.slice(width); width = next;
        if (!word) break;
      }
    });
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }
  // Libellé long + montant à droite (retour à la ligne sans jamais tronquer le montant).
  function row(name, price) {
    var lines = wrapWords(name, COLS, COLS - 2).map(function (t, i) { return (i ? '  ' : '') + t; });
    var last = lines[lines.length - 1];
    if (last.length + 1 + price.length <= COLS) lines[lines.length - 1] = last + ' '.repeat(COLS - last.length - price.length) + price;
    else lines.push(' '.repeat(Math.max(0, COLS - price.length)) + price);
    return lines;
  }
  var labels = o.labels || { especes: 'Especes', cb: 'Carte bancaire', autre: 'Autre' };
  function dt(v) { return new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); }
  var out = [];
  var push = function (arr) { arr.forEach(function (l) { out.push(l); }); };
  if (o.salonName) out.push(center(o.salonName));
  out.push(center('CLOTURE Z' + String(r.z_number).padStart(3, '0')));
  out.push(center('Du ' + (r.period_start ? dt(r.period_start) : 'mise en service')));
  out.push(center('au ' + dt(r.period_end)));
  if (r.closed_by) out.push(center('Cloture par : ' + r.closed_by));
  out.push(sep());
  out.push('PAIEMENTS');
  Object.keys(r.breakdown || {}).forEach(function (m) { out.push(twoCols(labels[m] || m, money(r.breakdown[m]))); });
  out.push(sep());
  out.push(twoCols('TOTAL (' + r.sales_count + ' vente' + (r.sales_count > 1 ? 's' : '') + ')', money(r.total_cents)));

  var barbers = Object.keys(r.by_barber || {}).map(function (k) { return r.by_barber[k]; }).sort(function (a, b) { return b.total_cents - a.total_cents; });
  if (barbers.length) { out.push(sep()); out.push('PAR COIFFEUR'); barbers.forEach(function (b) { push(row(b.name + ' (' + b.count + ')', money(b.total_cents))); }); }

  var items = Object.keys(r.by_item || {}).map(function (n) { return Object.assign({ name: n }, r.by_item[n]); }).sort(function (a, b) { return b.total_cents - a.total_cents; });
  if (items.length) { out.push(sep()); out.push('PAR PRESTATION / PRODUIT'); items.forEach(function (it) { push(row(it.quantity + ' x ' + it.name, money(it.total_cents))); }); }

  var rates = Object.keys(r.by_vat || {}).sort(function (a, b) { return Number(b) - Number(a); });
  if (rates.length) {
    out.push(sep()); out.push('TVA');
    var totalVat = 0;
    rates.forEach(function (rate) { var v = r.by_vat[rate]; totalVat += v.vat_cents; push(row('TVA ' + rate + '% (HT ' + money(v.ht_cents) + ')', money(v.vat_cents))); });
    out.push(twoCols('TOTAL TVA', money(totalVat)));
  }

  var cash = (r.breakdown || {}).especes || 0, start = r.starting_cash_cents || 0;
  out.push(sep()); out.push('FOND DE CAISSE');
  push(row('Fond de caisse (reste en caisse)', money(start)));
  out.push(twoCols('+ Ventes en especes', money(cash)));
  out.push(twoCols('= Especes attendues', money(start + cash)));
  out.push(sep());
  return out.join('\n');
}

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
      if (!r.ok) { var err = new Error(data.error || 'Erreur ' + r.status); err.data = data; err.status = r.status; throw err; }
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
      // Bouton d'action en plus (ex. « Ouvrir tiroir » à la clôture) : agit sans fermer la fenêtre.
      (opts.extraLabel ? '<button class="btn btn-soft" id="modal-extra-btn" style="display:inline-flex;align-items:center;justify-content:center;gap:7px">' +
        (opts.extraIcon || '') + esc(opts.extraLabel) + '</button>' : '') +   // extraIcon : SVG fixe du code, jamais une saisie
      '<button class="btn ' + (opts.danger ? 'modal-danger-btn' : 'btn-primary') + '" id="modal-confirm-btn">' +
      esc(opts.confirmLabel || 'Valider') + '</button>' +
      '</div>'
    );
    var input = overlay.querySelector('#modal-prompt-input');
    var extraBtn = overlay.querySelector('#modal-extra-btn');
    // 3 boutons : fenêtre plus large pour que chaque libellé tienne sur une ligne.
    if (extraBtn) overlay.querySelector('.modal-box').classList.add('modal-3btn');
    if (extraBtn && opts.onExtra) extraBtn.onclick = function () { opts.onExtra(); };
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
    // Nom retapé à la main : ce n'est plus forcément le client choisi dans la liste.
    nameInput._clientPick = null;
    var q = nameInput.value.trim();
    clearTimeout(debounceId);
    if (q.length < 3) { hide(); return; }
    debounceId = setTimeout(function () {
      fetchFn('/api/queue/clients-search?q=' + encodeURIComponent(q)).then(function (r) {
        if (!r.items || !r.items.length) { hide(); return; }
        dropdown.innerHTML = r.items.map(function (c, i) {
          return '<div class="autocomplete-item" data-i="' + i + '">' +
            '<div class="ac-name">' + esc(c.name) +
              (c.account_id ? ' <span class="ac-badge">Compte client' + (c.relatives && c.relatives.length ? ' · ' + c.relatives.length + ' proche' + (c.relatives.length > 1 ? 's' : '') : '') + '</span>' : '') +
            '</div>' +
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
            nameInput._clientPick = c;   // compte client + proches, repris par « Plusieurs personnes »
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

/** Coiffeur « sans RDV » ce jour-la (jour coche dans le calendrier de sa fiche) ? Ce jour-la : pas de RDV, borne seulement. */
function isWalkinOn(b, dateStr) {
  if (!b) return false;
  if (!dateStr) return Boolean(b.walkin_today);
  return (b.walkin_days || []).some(function (w) { return dateStr >= w.start_date && dateStr <= w.end_date; });
}

/** Coiffeur en conge ce jour-la ? (dateStr "YYYY-MM-DD" ; sans date : aujourd'hui, calcule par le serveur) */
function isOnLeaveOn(b, dateStr) {
  if (!dateStr) return Boolean(b.on_leave_today);
  return (b.leaves || []).some(function (l) { return dateStr >= l.start_date && dateStr <= l.end_date; });
}

/**
 * Le coiffeur peut-il prendre des RDV ce jour-la ? Non s'il est en conge, en « sans RDV » ce jour-la (calendrier de sa
 * fiche), ou s'il ne travaille pas ce jour de la semaine (horaires). Sert a griser ces jours dans le calendrier de
 * reservation, au lieu de laisser le client tomber sur « aucun creneau ».
 */
function barberBookableOn(b, dateStr) {
  if (!b || !dateStr) return true;
  if (isOnLeaveOn(b, dateStr) || isWalkinOn(b, dateStr)) return false;
  var schedules = (b.schedules || []).filter(function (s) { return s.active; });
  if (!schedules.length) return true;   // horaires inconnus : on ne grise pas
  var wd = new Date(dateStr + 'T12:00:00Z').getUTCDay();
  return schedules.some(function (s) { return Number(s.weekday) === wd; });
}
// Jour a griser pour ce choix : un coiffeur precis, ou « Premier disponible » (grise seulement si AUCUN n'est la).
function bookingDayBlocked(selectedBarberId, barberList, dateStr) {
  if (selectedBarberId === null || selectedBarberId === undefined) return false;
  var list = selectedBarberId === '' ? (barberList || []) : (barberList || []).filter(function (b) { return String(b.id) === String(selectedBarberId); });
  if (!list.length) return false;
  return !list.some(function (b) { return barberBookableOn(b, dateStr); });
}

/* ---------- Zoom des plannings du jour (admin, caisse, Mon poste) : un curseur a glisser ----------
   De 0 % (toute la journee a l'ecran) a 250 %. Pendant le glissement, seule la largeur des plannings change (aucun
   redessin : le curseur reste sous le doigt / la souris). Les traits entre les heures restent toujours affiches. */
function timelineZoomCtrlHtml(zoom) {
  var pct = Math.round(Math.max(0, zoom) * 100);
  return '<div class="timeline-zoom-ctrl"><div class="timeline-zoom-ctrl-inner" onclick="event.stopPropagation()">' +
    '<svg class="tz-ic" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
    '<input type="range" class="timeline-zoom-range" min="0" max="250" step="5" value="' + pct + '" aria-label="Zoom du planning" ' +
    'oninput="liveTimelineZoom(this)" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation()">' +
    '<span class="timeline-zoom-val">' + pct + '%</span></div></div>';
}
function liveTimelineZoom(el) {
  var pct = Math.max(0, Math.min(250, Number(el.value) || 0)), z = pct / 100;
  window.timelineZoom = z; window.timelineEffectiveZoom = z;
  document.querySelectorAll('.timeline-inner[data-fit]').forEach(function (inner) {
    var hours = Number(inner.dataset.hours), fit = Number(inner.dataset.fit), minZoom = Number(inner.dataset.minzoom);
    var compact = z < minZoom, width = Math.round(hours * fit * z);
    if (compact) {
      var avail = (inner.parentElement && inner.parentElement.clientWidth) || 900;
      var readable = Math.round(hours * fit * minZoom);
      width = readable <= avail ? 0 : Math.round(avail + (readable - avail) * (z / minZoom));
    }
    inner.style.minWidth = width + 'px';
    inner.classList.toggle('compact', compact);
    inner.classList.toggle('fit', z === 0);
  });
  timelineFitLabels();
  document.querySelectorAll('.timeline-zoom-range').forEach(function (r) { if (r !== el) r.value = pct; });
  document.querySelectorAll('.timeline-zoom-val').forEach(function (v) { v.textContent = pct + '%'; });
}

// Libelles des minutes (08:05, 08:10...) : on garde le plus fin qui a la place (au moins 44 px entre deux), en multiples
// du pas : a 70 % on voit encore 08:10 / 08:20..., plus serre 08:15 / 08:30, puis seulement les heures pleines.
function timelineFitLabels(root) {
  (root || document).querySelectorAll('.timeline-inner[data-step]').forEach(function (inner) {
    var start = Number(inner.dataset.rangeStart), end = Number(inner.dataset.rangeEnd), step = Number(inner.dataset.step) || 15;
    var width = inner.getBoundingClientRect().width - 22;
    if (!(end > start)) return;
    if (!(width > 0)) {   // planning pas encore visible (onglet masque) : seules les heures pleines en vue resserree
      var compact = inner.classList.contains('compact');
      inner.querySelectorAll('.timeline-hours span[data-m]').forEach(function (sp) { sp.classList.toggle('lbl-off', compact && Number(sp.dataset.m) % 60 !== 0); });
      return;
    }
    var pxPerMin = width / (end - start), every = 60;
    [step, 10, 15, 20, 30].forEach(function (c) { if (c >= step && c % step === 0 && 60 % c === 0 && c * pxPerMin >= 42 && c < every) every = c; });
    inner.querySelectorAll('.timeline-hours span[data-m]').forEach(function (sp) {
      var m = Number(sp.dataset.m);
      // Le dernier libelle (fermeture) est cale a droite : celui juste avant lui laisse la place.
      sp.classList.toggle('lbl-off', m % 60 !== 0 && (m % every !== 0 || (end - m) * pxPerMin < 88));
    });
  });
}
(function () {
  var pending = false;
  function later() { if (pending) return; pending = true; requestAnimationFrame(function () { pending = false; timelineFitLabels(); }); }
  if (window.MutationObserver) new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) for (var j = 0; j < muts[i].addedNodes.length; j++) {
      var n = muts[i].addedNodes[j];
      if (n.nodeType === 1 && (n.matches('.timeline-inner, .timeline-scroll') || n.querySelector('.timeline-inner'))) { later(); return; }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', later);
  document.addEventListener('click', later, true);   // onglet / jour qui s'affiche
})();

// « Premier disponible » : des qu'un creneau est choisi, on affiche le coiffeur que le systeme a retenu pour cette
// heure (celui qui sera reellement reserve), au lieu de « Premier disponible ».
function anyBarberLabel(list, barberId) {
  var b = barberId && (list || []).find(function (x) { return String(x.id) === String(barberId); });
  return b ? b.name + ' (premier disponible)' : 'Premier disponible';
}
// Pastille d'un coiffeur : sa photo, sinon son initiale sur sa couleur (comme les bulles de la caisse).
function barberAvatarHtml(b, list, size) {
  var px = size || 30, initial = String((b && b.name) || '?').trim().charAt(0).toUpperCase();
  var style = 'width:' + px + 'px;height:' + px + 'px;border-radius:50%;flex:none;display:inline-flex;align-items:center;justify-content:center;' +
    'color:#fff;font-weight:700;font-size:' + Math.round(px * 0.42) + 'px;background-size:cover;background-position:center;' +
    (b && b.photo_url ? "background-image:url('" + esc(b.photo_url) + "')" : 'background:' + barberColorOf(b, list));
  return '<span class="b-avatar" style="' + style + '" aria-hidden="true">' + (b && b.photo_url ? '' : esc(initial)) + '</span>';
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
// Couleur d'un coiffeur PARTOUT : celle choisie dans sa fiche, sinon la couleur automatique (meme id = meme couleur).
// b : le coiffeur, ou son id + la liste ou le chercher.
function barberColorOf(b, list) {
  if (b && typeof b !== 'object') b = (list || []).filter(function (x) { return String(x.id) === String(b); })[0] || { id: String(b) };
  if (!b || !b.id) return 'var(--grey)';
  return b.color || stableColorForId(String(b.id));
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
function groupItems(kind, items, cats) {
  if (kind !== 'products') return [{ title: '', items: items }];
  // Catégories créées dans l'administration (ordre choisi par l'admin) ; sinon l'ancien libellé texte.
  if (cats && cats.length) {
    var byId = Object.create(null), rest = [];
    cats.forEach(function (c) { byId[c.id] = []; });
    items.forEach(function (it) { if (it.category_id && byId[it.category_id]) byId[it.category_id].push(it); else rest.push(it); });
    var gs = cats.filter(function (c) { return byId[c.id].length; }).map(function (c) { return { title: c.name, id: c.id, items: byId[c.id] }; });
    if (gs.length) { if (rest.length) gs.push({ title: 'Autres', id: '__none', items: rest }); return gs; }
  }
  var order = [], map = Object.create(null);
  items.forEach(function (it) {
    var c = String(it.category || '').trim();
    if (!(c in map)) { map[c] = []; order.push(c); }
    map[c].push(it);
  });
  var named = order.filter(function (c) { return c; });
  if (!named.length) return [{ title: '', items: items }];
  var groups = named.map(function (c) { return { title: c, id: 'txt:' + c, items: map[c] }; });
  if (map['']) groups.push({ title: 'Autres', id: '__none', items: map[''] });
  return groups;
}

/* Catégories de produits du salon (publiques), chargées une fois par salon pour les étapes « Produits » des
   réservations (en ligne, compte client, dashboard, caisse, Mon poste). */
function vitrineCategories(cfg) {
  var store = window.__vitrineCats = window.__vitrineCats || {};
  var slug = (typeof SALON_SLUG === 'string' && SALON_SLUG) || '';
  var c = store[slug];
  if (c && c.list) return c.list;
  if (!c) {
    c = store[slug] = { list: null, waiting: [] };
    if (typeof fetch !== 'function') { c.list = []; return c.list; }
    var headers = {}; if (slug) headers['X-Salon-Slug'] = slug;
    fetch('/api/catalog/categories', { headers: headers }).then(function (r) { return r.json(); }).then(function (d) {
      c.list = (d && d.categories && d.categories.products) || [];
    }).catch(function () { c.list = []; }).then(function () {
      // Grilles déjà affichées avant l'arrivée des catégories : on les redessine (sélection conservée).
      c.waiting.forEach(function (w) { if (document.getElementById(w.gridId)) vitrineRender(w); });
      c.waiting = [];
    });
  }
  if (cfg && c.waiting.indexOf(cfg) === -1) c.waiting.push(cfg);
  return null;
}

/* Pastilles de catégories au-dessus d'une grille de produits (étapes avec recherche) : « Tous », puis chaque
   catégorie qui a au moins un produit. Seulement s'il y a au moins deux familles à distinguer. */
function vitrineCatChipsHtml(cfg, groups) {
  var named = groups.filter(function (g) { return g.title; });
  if (named.length < 2) return '';
  var f = cfg._cat || '';
  var chip = function (id, label, n) {
    return '<button type="button" class="vitrine-cat' + (f === id ? ' on' : '') + '" data-cat="' + esc(id) + '" aria-pressed="' + (f === id) + '">' +
      esc(label) + ' <span>' + n + '</span></button>';
  };
  return chip('', 'Tous', cfg.items.length) + named.map(function (g) { return chip(g.id, g.title, g.items.length); }).join('');
}

/**
 * HTML d'une carte. kind : 'services' (choix unique : coche sur l'image) | 'extras' | 'products' (bouton + qui devient une coche).
 * onclick : expression JS executee au clic ; "{id}" y est remplace par l'identifiant de l'article, ex. "toggleExtra(this,'{id}')".
 * Photo EN HAUT (entiere, jamais recadree), nom / duree / prix EN DESSOUS sur fond uni : jamais de texte pose sur un dessin.
 */
function vitrineCardHtml(kind, it, selected, onclick, opts) {
  opts = opts || {};
  var isSvc = kind === 'services';
  var out = kind === 'products' && it.stock_enabled && Number(it.stock_quantity) <= 0;
  var photo = it.image_url ? ' style="background-image:url(&quot;' + esc(it.image_url) + '&quot;)"' : ' aria-hidden="true"';
  var icon = it.image_url ? '' : (kind === 'extras' ? extraIcon(it.name) : kind === 'products' ? productIcon(it.name) : vitrineBaseIcon(it.name));
  var meta = '';
  if (isSvc) meta = formatMinutes(it.duration_min);
  else if (kind === 'extras' && Number(it.duration_min) > 0) meta = '+' + formatMinutes(it.duration_min);
  else if (kind === 'products' && it.stock_enabled && it.stock_quantity > 0 && (opts.stock || it.stock_quantity <= 3)) meta = opts.stock ? it.stock_quantity + ' en stock' : 'Plus que ' + it.stock_quantity;
  var price = (kind === 'extras' ? '+' : '') + (it.price_from ? 'dès ' : '') + eur(it.price_cents);
  var action = (isSvc && !opts.add) ? '' : out ? '<span class="item-out">Épuisé</span>' : '<span class="item-add">' + VITRINE_PLUS_SVG + VITRINE_CHECK_SVG + '</span>';
  var on = !out && selected;
  return '<button type="button" class="item-card' + (it.image_url ? ' has-photo' : '') + (on ? ' sel' : '') + (out ? ' out' : '') + '"' +
    ' data-id="' + it.id + '" data-name="' + esc(normText(it.name)) + '" title="' + esc(it.name) + '"' +
    ' aria-pressed="' + (on ? 'true' : 'false') + '"' + (out ? ' disabled' : ' onclick="' + String(onclick).replace(/\{id\}/g, it.id) + '"') + '>' +
    '<span class="item-media"' + photo + '>' + icon + (isSvc && !opts.add ? '<span class="item-check">' + VITRINE_CHECK_SM_SVG + '</span>' : '') + '</span>' +
    '<span class="item-body"><span class="item-name">' + esc(it.name) + '</span>' +
    (meta ? '<span class="item-meta">' + esc(meta) + '</span>' : '') +
    '<span class="item-foot"><span class="item-price">' + price + '</span>' + action + '</span></span></button>';
}

/**
 * Remplit une liste de cartes. cfg : { kind, gridId, items, chosen (tableau d'identifiants, par reference), onclick,
 *   searchId?, qId?, emptyId?, summaryId? }. La recherche n'apparait que si la liste depasse 8 articles ; elle repart vide.
 */
function vitrineRender(cfg) {
  var live = window.__vitrineLive = window.__vitrineLive || {};
  var prev = live[cfg.gridId];
  if (prev && prev !== cfg && cfg._cat === undefined) cfg._cat = prev._cat || '';   // catégorie gardée d'un rendu à l'autre
  live[cfg.gridId] = cfg;
  var chosen = cfg.chosen || [];
  var withCats = cfg.kind === 'products' && cfg.searchId;   // étapes de réservation (pas la grille de la caisse)
  var cats = withCats && typeof vitrineCategories === 'function' ? vitrineCategories(cfg) : null;
  var groups = groupItems(cfg.kind, cfg.items, cats);
  var grid = document.getElementById(cfg.gridId);
  grid.innerHTML = groups.map(function (g) {
    return (g.title ? '<div class="item-group"' + (withCats ? ' data-cat="' + esc(g.id || '') + '"' : '') + '>' + esc(g.title) + '</div>' : '') +
      g.items.map(function (it) {
        var html = vitrineCardHtml(cfg.kind, it, chosen.indexOf(it.id) !== -1, cfg.onclick, cfg.card);
        return withCats ? html.replace('<button', '<button data-cat="' + esc(g.id || '') + '"') : html;
      }).join('');
  }).join('');
  if (withCats && typeof vitrineCatChipsHtml === 'function') {
    var bar = document.getElementById(cfg.gridId + '-cats');
    if (!bar) { bar = document.createElement('div'); bar.id = cfg.gridId + '-cats'; bar.className = 'vitrine-cats'; grid.parentNode.insertBefore(bar, grid); }
    if (cfg._cat && !groups.some(function (g) { return g.id === cfg._cat; })) cfg._cat = '';
    bar.innerHTML = vitrineCatChipsHtml(cfg, groups);
    bar.style.display = bar.innerHTML ? '' : 'none';
    Array.prototype.forEach.call(bar.querySelectorAll('.vitrine-cat'), function (b) {
      b.onclick = function () {
        cfg._cat = b.getAttribute('data-cat');
        Array.prototype.forEach.call(bar.querySelectorAll('.vitrine-cat'), function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
        if (cfg.qId) vitrineFilter(cfg); else vitrineApplyCat(cfg);
      };
    });
  }
  if (cfg.searchId) document.getElementById(cfg.searchId).style.display = cfg.items.length > 8 ? '' : 'none';
  if (cfg.qId) document.getElementById(cfg.qId).value = '';
  if (cfg.emptyId) {
    var empty = document.getElementById(cfg.emptyId);
    var none = { services: 'Aucune prestation disponible pour le moment.', extras: 'Aucun supplément disponible pour le moment.', products: 'Aucun produit disponible pour le moment.' }[cfg.kind];
    empty.textContent = cfg.items.length ? 'Aucun résultat' : none;
    empty.style.display = cfg.items.length ? 'none' : 'block';
  }
  if (cfg._cat && typeof vitrineApplyCat === 'function') { if (cfg.qId) vitrineFilter(cfg); else vitrineApplyCat(cfg); }
  if (cfg.summaryId) vitrineSummary(cfg);
}

function vitrineApplyCat(cfg) {
  var f = cfg._cat || '', grid = document.getElementById(cfg.gridId);
  grid.querySelectorAll('.item-card').forEach(function (c) { c.hidden = !!f && c.getAttribute('data-cat') !== f; });
  grid.querySelectorAll('.item-group').forEach(function (g) { g.hidden = !!f && g.getAttribute('data-cat') !== f; });
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
  // La catégorie choisie (pastilles) se combine avec la recherche : on garde la config affichée en dernier.
  var live = ((window.__vitrineLive || {})[cfg.gridId] || cfg), f = live._cat || '';
  grid.querySelectorAll('.item-card').forEach(function (c) {
    var ok = (!q || c.getAttribute('data-name').indexOf(q) !== -1) && (!f || c.getAttribute('data-cat') === f);
    c.hidden = !ok;
    if (ok) any = true;
  });
  grid.querySelectorAll('.item-group').forEach(function (g) {
    var n = g.nextElementSibling, visible = false;
    while (n && !n.classList.contains('item-group')) { if (!n.hidden) visible = true; n = n.nextElementSibling; }
    g.hidden = !visible;
  });
  var empty = document.getElementById(cfg.emptyId);
  empty.textContent = raw.trim() ? 'Aucun résultat pour « ' + raw.trim() + ' »' : 'Aucun produit dans cette catégorie';
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
  // « Seulement un supplement » : pas de ligne Prestation, seulement les supplements.
  // Heure de debut du RDV a cote de la prestation des qu'un creneau est choisi.
  var meta = (Number(s.duration_min) > 0 ? formatMinutes(s.duration_min) : '') + (sel.time ? (Number(s.duration_min) > 0 ? ' · ' : '') + 'à ' + sel.time : '');
  if (!s.extras_only) row('Prestation', s.name, meta, eur(Number(s.price_cents) || 0));
  (sel.extras || []).forEach(function (x) {
    cents += Number(x.price_cents) || 0; mins += Number(x.duration_min) || 0;
    row('Supplément', x.name, Number(x.duration_min) > 0 ? '+' + formatMinutes(x.duration_min) : '', '+' + eur(Number(x.price_cents) || 0));
  });
  (sel.products || []).forEach(function (x) {
    cents += Number(x.price_cents) || 0;
    row('Produit', x.name, '', eur(Number(x.price_cents) || 0));
  });
  var ctx = [];
  if (sel.who) ctx.push('<b style="color:var(--ink)">' + esc(sel.who) + '</b>');   // a plusieurs : la personne en cours
  if (sel.barber) ctx.push(esc(sel.barber));
  if (sel.when) ctx.push(esc(sel.when) + (sel.time ? ' à ' + esc(sel.time) : ''));
  // RDV a plusieurs : les personnes deja validees, chacune avec son heure de debut.
  var cartHtml = (sel.cart || []).map(function (c) {
    return '<div class="recap-row recap-cart"><span class="recap-k">' + esc(c.name) + '</span><span class="recap-n">' + esc(c.label) +
      ' <em>à ' + esc(c.time) + (c.barber ? ' · ' + esc(c.barber) : '') + '</em></span><span class="recap-p">' + eur(Number(c.price_cents) || 0) + '</span></div>';
  }).join('');
  return (cartHtml ? '<div class="recap-list recap-cart-list">' + cartHtml + '</div>' : '') +
    (ctx.length ? '<div class="recap-ctx">' + ctx.join(' · ') + '</div>' : '') +
    '<div class="recap-list">' + rows + '</div>' +
    (sel.cart && sel.cart.length
      // A plusieurs : total de tout le groupe (personnes deja validees + personne en cours).
      ? '<div class="recap-total"><span>Total (' + (sel.cart.length + 1) + ' personnes)</span><span><strong>' +
          eur(cents + sel.cart.reduce(function (t, c) { return t + (Number(c.price_cents) || 0); }, 0)) + '</strong></span></div>'
      : '<div class="recap-total"><span>Total</span><span>' + (mins ? formatMinutes(mins) + ' · ' : '') + '<strong>' + eur(cents) + '</strong></span></div>');
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

/* ---------- « Je veux seulement un supplement » (sans prestation) ----------
   Choix EXTRAS_ONLY a la place d'une prestation : le client passe aux supplements (au moins un), puis la suite est
   normale. Le serveur utilise une prestation cachee « Supplement seul » (0 min, 0 EUR) : on envoie service_id vide. */
var EXTRAS_ONLY = '__extras__';
var EXTRAS_ONLY_NAME = 'Supplément seul';
var EXTRAS_ONLY_SERVICE = { id: EXTRAS_ONLY, name: 'Seulement un supplément', duration_min: 0, price_cents: 0, extras_only: true };
function svcParam(id) { return id === EXTRAS_ONLY ? '' : (id || ''); }
// Libelle d'un passage / RDV : « Soin visage » pour un supplement seul, sinon « Coupe + Soin visage ».
function svcLabel(name, extras) {
  var names = (extras || []).map(function (x) { return typeof x === 'string' ? x : (x && x.name); }).filter(Boolean);
  if ((!name || name === EXTRAS_ONLY_NAME) && names.length) return names.join(', ');
  return (name || '') + (names.length ? ' + ' + names.join(', ') : '');
}
// Premiere carte de la grille des prestations (meme habillage que les autres cartes).
function extrasOnlyCardHtml(selected, onclick) {
  return '<button type="button" class="item-card extras-only-card' + (selected ? ' sel' : '') + '" data-id="' + EXTRAS_ONLY + '" data-name="supplement seul"' +
    ' aria-pressed="' + (selected ? 'true' : 'false') + '" onclick="' + onclick + '">' +
    '<span class="item-media" aria-hidden="true"><span class="extras-only-ic"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg></span>' +
    '<span class="item-check">' + VITRINE_CHECK_SM_SVG + '</span></span>' +
    '<span class="item-body"><span class="item-name">Seulement un supplément</span><span class="item-meta">Sans prestation</span>' +
    '<span class="item-foot"><span class="item-price">Choisir ensuite</span></span></span></button>';
}

/* Tuile "coiffeur" des pages de reservation : la photo est affichee ENTIERE (jamais recadree), le nom en dessous.
   Sans photo : l'initiale. onclick : code JS de l'attribut (ex. "selectBarber(this,'id')"). */
function barberTileHtml(b, selected, onclick) {
  var cls = 'svc-card barber-tile' + (b.photo_url ? ' has-photo' : '') + (selected ? ' sel' : '');
  return '<button class="' + cls + '" data-barber-id="' + b.id + '" onclick="' + onclick + '">' +
    (b.photo_url ? '<span class="barber-photo" style="background-image:url(&quot;' + esc(b.photo_url) + '&quot;)"></span>'
                 : '<span class="icon">' + esc(String(b.name || '?').charAt(0).toUpperCase()) + '</span>') +
    '<span class="name">' + esc(b.name) + '</span></button>';
}

/* ---------- « Premier disponible » : le salon choisit le coiffeur ----------
   Tuile en tete de la grille des coiffeurs (reservation en ligne, Mon compte, groupe, « Ajouter un RDV » du salon). */
function anyBarberTileHtml(selected, onclick) {
  return '<button class="svc-card barber-tile any-barber' + (selected ? ' sel' : '') + '" data-barber-id="" onclick="' + onclick + '">' +
    '<span class="icon any-ic"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="m15.5 11 2 2 4-4.5"/></svg></span>' +
    '<span class="name">Premier disponible</span><span class="meta">On choisit pour vous</span></button>';
}
// Catalogue propose en « Premier disponible » : ce qu'au moins un coiffeur fait ; prix le plus bas, « dès » s'ils different.
// File d'attente : un client SANS coiffeur venu sans RDV (« Premier disponible ») n'est pris que par un coiffeur
// sans RDV aujourd'hui (mode sans RDV, ou jour « sans RDV » de son calendrier) ; un RDV promu sans coiffeur reste
// ouvert a tous ; un client avec un coiffeur n'est que pour lui. Meme regle que le serveur (queue.js).
function takesWalkinsToday(b) { return !!b && (!b.kiosk_hidden || !!b.walkin_today); }
function canTakeQueueEntry(q, barberId, barberList) {
  if (!q) return false;
  if (q.barber_id) return q.barber_id === barberId;
  if (q.is_appointment) return true;
  return takesWalkinsToday((barberList || []).filter(function (b) { return b.id === barberId; })[0]);
}
if (typeof window !== 'undefined') { window.takesWalkinsToday = takesWalkinsToday; window.canTakeQueueEntry = canTakeQueueEntry; }

// Icones « RDV » (calendrier) et « sans RDV » (personne qui marche) : les memes que dans l'agenda (sourceBadge).
function rdvModeIconSvg(walkin, size) {
  var sz = size || 14;
  return walkin
    ? '<svg viewBox="0 0 24 24" width="' + sz + '" height="' + sz + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13" cy="4" r="1.5"/><path d="M9.5 21l2-6-1.5-1.5.5-4.5 3-1 2 2.5 2.5 1"/><path d="M14.5 21l-1-5"/></svg>'
    : '<svg viewBox="0 0 24 24" width="' + sz + '" height="' + sz + '" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M4 9.5h16"/><path d="M8 3.5v3.5M16 3.5v3.5"/></svg>';
}
// Client du Timer : venu sans RDV (borne / ajoute au salon) ou client d'un rendez-vous.
function queueSourceIconHtml(q) {
  var walkin = !(q && q.is_appointment);
  return '<span class="src-ic ' + (walkin ? 'walk' : 'rdv') + '" title="' + (walkin ? 'Sans RDV (passage au salon)' : 'Rendez-vous') + '">' + rdvModeIconSvg(walkin, 15) + '</span>';
}
// Etiquette a cote du nom : « Sans RDV » / « RDV ».
function barberModeTagHtml(b) {
  if (!b) return '';
  var walkin = takesWalkinsToday(b);
  return '<span class="mode-tag ' + (walkin ? 'walk' : 'rdv') + '">' + rdvModeIconSvg(walkin, 13) + (walkin ? 'Sans RDV' : 'RDV') + '</span>';
}

// keepAll : la borne (coiffeurs SANS RDV, qui n'acceptent pas forcement de RDV) prend tous les coiffeurs presents.
function anyBarberItems(barberList, kind, items, keepAll) {
  var list = (barberList || []).filter(function (b) { return b && (keepAll || b.accepts_appointments !== 0); });
  if (!list.length) return items.slice();
  var out = [];
  items.forEach(function (it) {
    var prices = [], durs = [];
    list.forEach(function (b) {
      var mine = barberItems(b, kind, [it])[0];
      if (mine) { prices.push(Number(mine.price_cents) || 0); durs.push(Number(mine.duration_min) || 0); }
    });
    if (!prices.length) return;
    var min = Math.min.apply(null, prices), max = Math.max.apply(null, prices);
    out.push(Object.assign({}, it, { price_cents: min, price_from: max > min, duration_min: Math.min.apply(null, durs) }));
  });
  return out;
}
if (typeof window !== 'undefined') { window.anyBarberTileHtml = anyBarberTileHtml; window.anyBarberItems = anyBarberItems; }

/* Tuile « Utiliser un cadeau » des pages de reservation (rdv.html et compte.html) : l'image choisie dans
   Reglages > Marketing (la meme que sur la borne) la remplit, sinon l'icone cadeau par defaut. */
function giftTileHtml(imageUrl, onclick) {
  return '<button class="svc-card gift-tile' + (imageUrl ? ' has-photo' : '') + '" onclick="' + onclick + '">' +
    (imageUrl ? '<span class="barber-photo" style="background-image:url(&quot;' + esc(imageUrl) + '&quot;)"></span>'
              : '<span class="icon">🎁</span>') +
    '<span class="name">Utiliser un cadeau</span></button>';
}

/* Page de reservation publique (rdv.html) : meme decoupage en 3 zones que les fenetres d'ajout de RDV (vitrineFlow).
   En haut : retour + titre de l'etape. Au milieu : la liste, qui defile. En bas : recapitulatif detaille + bouton, fixes.
   Le decoupage ne change rien sur mobile (display: contents, voir app.css) : seul le bureau (>= 900px) passe en 3 zones. */
function vitrinePageFlow(wrap, panelIds) {
  wrap.classList.add('page-flow');
  var BODY_START = '.item-grid,.aa-grid,.slots-grid,.fld,.dt-split,.modal-error,.hint,.items-empty,.items-search';
  panelIds.forEach(function (id) {
    var panel = document.getElementById(id);
    if (!panel || panel.classList.contains('flow')) return;
    panel.classList.add('flow');
    var kids = Array.prototype.slice.call(panel.children);
    var top = document.createElement('div'); top.className = 'flow-top';
    var body = document.createElement('div'); body.className = 'flow-body';
    var bar = null, go = null, inTop = true;
    kids.forEach(function (k) {
      if (k.classList.contains('step-bar')) { bar = k; return; }
      if (k.classList.contains('go')) { go = k; return; }
      if (k.classList.contains('flow-recap')) k.classList.add('recap-top');
      if (inTop && k.matches(BODY_START) && !k.classList.contains('items-search')) inTop = false;
      (inTop ? top : body).appendChild(k);
    });
    if (!bar) {
      bar = document.createElement('div'); bar.className = 'step-bar own-bar';
      var rc = document.createElement('div'); rc.className = 'flow-recap recap-foot'; rc.setAttribute('data-recap', '');
      bar.appendChild(rc);
      if (go) bar.appendChild(go);
    }
    panel.appendChild(top); panel.appendChild(body); panel.appendChild(bar);
  });
}

/* ===== Calendrier maison (ordinateur) =====
   Remplace la fenetre native des <input type="date"> sur grand ecran avec souris (>= 900px). La valeur reste au format AAAA-MM-JJ et
   les evenements input / change sont emis : tout le code existant (onchange, .value) fonctionne sans changement.
   Sur mobile / tablette tactile, le selecteur natif du telephone reste utilise. Les champs ajoutes plus tard sont geres (ecoute globale). */
(function () {
  var MQ = '(min-width: 900px) and (pointer: fine)';
  var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var DOW = ['lu', 'ma', 'me', 'je', 've', 'sa', 'di'];
  var pop = null, cur = null, vy = 0, vm = 0, mode = 'days';
  function on() { return window.matchMedia && window.matchMedia(MQ).matches; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function parse(v) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; }
  function todayIso() { var t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); }
  function close() { if (pop) { pop.remove(); pop = null; } cur = null; }
  function setValue(v) {
    if (!cur) return;
    var inp = cur; inp.value = v; close();
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    try { inp.focus(); } catch (e) {}
  }
  function render() {
    if (!pop || !cur) return;
    var min = cur.getAttribute('min') || '', max = cur.getAttribute('max') || '', sel = cur.value || '', today = todayIso(), h = '';
    h += '<div class="dp-head"><button type="button" class="dp-nav" data-a="prev" aria-label="Précédent">‹</button>' +
         '<button type="button" class="dp-title" data-a="mode">' + (mode === 'days' ? MONTHS[vm] + ' ' + vy : vy) + ' <span class="dp-caret">▾</span></button>' +
         '<button type="button" class="dp-nav" data-a="next" aria-label="Suivant">›</button></div>';
    if (mode === 'months') {
      h += '<div class="dp-months">';
      for (var i = 0; i < 12; i++) h += '<button type="button" class="dp-m' + (i === vm ? ' cur' : '') + '" data-m="' + i + '">' + MONTHS[i].slice(0, 4) + (MONTHS[i].length > 4 ? '.' : '') + '</button>';
      h += '</div>';
    } else {
      h += '<div class="dp-dow">' + DOW.map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div><div class="dp-days">';
      var first = (new Date(vy, vm, 1).getDay() + 6) % 7, dim = new Date(vy, vm + 1, 0).getDate(), prevDim = new Date(vy, vm, 0).getDate();
      var cells = Math.ceil((first + dim) / 7) * 7;
      for (var c = 0; c < cells; c++) {
        var d, y = vy, m = vm, out = false;
        if (c < first) { d = prevDim - first + c + 1; m = vm - 1; out = true; }
        else if (c >= first + dim) { d = c - first - dim + 1; m = vm + 1; out = true; }
        else d = c - first + 1;
        if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
        var s = iso(y, m, d), dis = (min && s < min) || (max && s > max);
        h += '<button type="button" class="dp-d' + (out ? ' out' : '') + (s === today ? ' today' : '') + (s === sel ? ' sel' : '') + '" data-v="' + s + '"' + (dis ? ' disabled' : '') + '>' + d + '</button>';
      }
      h += '</div>';
    }
    h += '<div class="dp-foot"><button type="button" class="dp-link" data-a="clear">Effacer</button><button type="button" class="dp-link" data-a="today">Aujourd\'hui</button></div>';
    pop.innerHTML = h;
  }
  function place() {
    var r = cur.getBoundingClientRect(), w = pop.offsetWidth, hh = pop.offsetHeight;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    var top = r.bottom + 6;
    if (top + hh > window.innerHeight - 8 && r.top - hh - 6 > 8) top = r.top - hh - 6;
    pop.style.left = left + 'px'; pop.style.top = Math.max(8, top) + 'px';
  }
  function open(inp) {
    if (cur === inp && pop) return;
    close(); cur = inp; mode = 'days';
    var p = parse(inp.value) || parse(todayIso()); vy = p.y; vm = p.m;
    pop = document.createElement('div'); pop.className = 'dp-pop'; pop.setAttribute('role', 'dialog');
    document.body.appendChild(pop); render(); place();
  }
  document.addEventListener('mousedown', function (e) {
    var t = e.target;
    if (pop && pop.contains(t)) { e.preventDefault(); return; }
    if (t && t.matches && t.matches('input[type="date"]') && on() && !t.disabled && !t.readOnly) { e.preventDefault(); try { t.focus(); } catch (x) {} open(t); return; }
    if (pop) close();
  }, true);
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.matches && t.matches('input[type="date"]') && on()) { e.preventDefault(); return; }
    if (!pop || !pop.contains(t)) return;
    var b = t.closest('button'); if (!b) return;
    if (b.dataset.v) return setValue(b.dataset.v);
    if (b.dataset.m !== undefined) { vm = +b.dataset.m; mode = 'days'; return render(); }
    var a = b.dataset.a;
    if (a === 'clear') return setValue('');
    if (a === 'today') return setValue(todayIso());
    if (a === 'mode') { mode = mode === 'days' ? 'months' : 'days'; return render(); }
    if (a === 'prev' || a === 'next') {
      var k = a === 'prev' ? -1 : 1;
      if (mode === 'months') vy += k; else { vm += k; if (vm < 0) { vm = 11; vy--; } else if (vm > 11) { vm = 0; vy++; } }
      render();
    }
  }, true);
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (e.key === 'Escape' && pop) { close(); return; }
    if (t && t.matches && t.matches('input[type="date"]') && on() && (e.key === 'ArrowDown' && e.altKey || e.key === 'F4')) { e.preventDefault(); open(t); }
  }, true);
  window.addEventListener('resize', close);
  window.addEventListener('scroll', function (e) { if (pop && !pop.contains(e.target)) close(); }, true);
})();


/* ---------- Onglets : pastille qui glisse + contenu en fondu (tous les écrans) ----------
   Repère tout seul les barres d'onglets (.subtabs, .period-picker, .cat-tabs, .tabs, barres du bas...) : une pastille se glisse
   sous le bouton actif au lieu de sauter. Rien à brancher dans chaque page : on observe les classes « on » / « sel » des boutons,
   même quand la barre est recréée par un rendu. Les panneaux .tab-panel / .panel apparaissent en fondu via app.css. */
(function () {
  if (typeof document === 'undefined' || !window.MutationObserver) return;
  var SEL = '.subtabs, .period-picker, .cat-tabs, .cal-view-switch, .half-toggle, .dash-leader-tabs, .tabs, .caisse-footer, .poste-footer, .client-footer';
  var queued = [];

  function activeBtn(c) {
    var list = c.querySelectorAll('button.on, button.sel');
    for (var i = 0; i < list.length; i++) if (list[i].closest(SEL) === c) return list[i];
    return null;
  }

  function enhance(c) {
    if (c._tfx) return;
    c._tfx = true;
    c.classList.add('tfx');
    if (getComputedStyle(c).position === 'static') c.style.position = 'relative';
    ensureInd(c);
    if (window.ResizeObserver) new ResizeObserver(function () { place(c, false); }).observe(c);
    place(c, false);
  }

  function ensureInd(c) {
    if (!c._tfxInd) { c._tfxInd = document.createElement('span'); c._tfxInd.className = 'st-ind'; c._tfxInd.setAttribute('aria-hidden', 'true'); }
    if (c._tfxInd.parentNode !== c) c.appendChild(c._tfxInd);
    return c._tfxInd;
  }

  function off(c) { c.classList.remove('tfx-on'); if (c._tfxInd) c._tfxInd.style.opacity = '0'; c._tfxPlaced = false; }

  // Place la pastille sous le bouton actif ; « animate » = glisse (sinon elle apparait directement au bon endroit).
  function place(c, animate) {
    var ind = ensureInd(c), on = activeBtn(c);
    if (!on || !c.offsetWidth || !on.offsetWidth || getComputedStyle(c).display === 'grid') { off(c); return; }
    // Lit le style d'origine du bouton actif (fond, ombre, couleur) sans transition parasite, pour que la pastille lui ressemble.
    c.classList.remove('tfx-on'); c.classList.add('tfx-probe');
    var cs = getComputedStyle(on);
    var bg = cs.backgroundColor, shadow = cs.boxShadow, radius = cs.borderRadius, color = cs.color;
    c.classList.remove('tfx-probe'); c.classList.add('tfx-on');
    var plain = !bg || bg === 'transparent' || /,\s*0\)$/.test(bg);
    var w = on.offsetWidth, h = on.offsetHeight, l = on.offsetLeft, t = on.offsetTop;
    if (plain) {                                    // barre du bas : simple trait coloré sur le bouton actif
      var bw = Math.min(30, w * 0.6);
      l += (w - bw) / 2; w = bw; h = 3;
      bg = color; shadow = 'none'; radius = '0 0 4px 4px';
    }
    if (!animate || !c._tfxPlaced) ind.style.transition = 'none';
    ind.style.opacity = '1'; ind.style.background = bg; ind.style.boxShadow = shadow; ind.style.borderRadius = radius;
    ind.style.left = l + 'px'; ind.style.top = t + 'px'; ind.style.width = w + 'px'; ind.style.height = h + 'px';
    if (!animate || !c._tfxPlaced) { void ind.offsetWidth; ind.style.transition = ''; }
    c._tfxPlaced = true;
  }

  function schedule(c, animate) {
    for (var i = 0; i < queued.length; i++) if (queued[i].c === c) { queued[i].a = queued[i].a || animate; return; }
    queued.push({ c: c, a: animate });
    if (queued.length === 1) requestAnimationFrame(function () { var q = queued; queued = []; q.forEach(function (x) { place(x.c, x.a); }); });
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches(SEL)) enhance(root);
    if (root.querySelectorAll) [].forEach.call(root.querySelectorAll(SEL), enhance);
  }

  function placeAll() { [].forEach.call(document.querySelectorAll('.tfx'), function (c) { schedule(c, false); }); }

  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i], t = m.target;
      if (m.type === 'attributes') {
        if (t === document.documentElement) { placeAll(); continue; }
        if (t.tagName === 'BUTTON') { var c = t.closest('.tfx'); if (c) schedule(c, c._tfxPlaced === true); }
      } else {
        for (var j = 0; j < m.addedNodes.length; j++) scan(m.addedNodes[j]);
        if (t.classList && t.classList.contains('tfx')) { ensureInd(t); schedule(t, false); }
      }
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-theme'] });

  function init() { scan(document.body); if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeAll); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.addEventListener('load', placeAll);
})();

/* ===== Choix du coiffeur au-dessus des creneaux, PARTOUT ou l'on prend / ajoute un RDV =====
   Regle : tous les coiffeurs qui font la prestation (et les supplements) choisis sont proposes, MEME absents ce jour-la
   (conge, jour « sans RDV », jour non travaille) : estompes avec un point rouge, et « indisponible » a la place des
   creneaux si on les choisit. On change de coiffeur sans refaire la prise de RDV. Utilise par l'admin, la caisse et le
   poste (la prise de RDV en ligne et le compte client ont leur propre version, meme dessin). */
function barberDoesChoice(b, serviceId, extraIds, servicesAll, extrasAll, extrasOnlyId) {
  var sv = barberItems(b, 'services', servicesAll || []), ex = barberItems(b, 'extras', extrasAll || []);
  if (serviceId && serviceId !== extrasOnlyId && !sv.some(function (x) { return String(x.id) === String(serviceId); })) return false;
  return (extraIds || []).every(function (id) { return ex.some(function (x) { return String(x.id) === String(id); }); });
}
function barberOffOn(b, dateStr) { return Boolean(b && dateStr && !barberBookableOn(b, dateStr)); }
/** Message a la place des creneaux quand le coiffeur choisi est absent ce jour-la. */
function barberOffSlotsHtml(b, dateStr, canChangeDay) {
  return '<div class="empty barber-off-msg" style="grid-column:1/-1">' + esc(b.name) + ' est indisponible ce jour-là' +
    (isOnLeaveOn(b, dateStr) ? ' (en congé)' : '') + '. Choisissez ' + (canChangeDay ? 'un autre jour, ou ' : '') + 'un autre coiffeur ci-dessus.</div>';
}
/**
 * Pastilles des coiffeurs. o = { list (coiffeurs proposes), all (pour les couleurs), selected ('' = Premier disponible),
 * dateStr, onPick (nom de fonction globale appelee avec l'id), slotBarber (coiffeur retenu par « Premier disponible »),
 * any (proposer « Premier disponible ») }.
 */
function barberChipsHtml(o) {
  ensureBarberChipsCss();
  var avail = o.list.filter(function (b) { return !barberOffOn(b, o.dateStr); });
  var showAny = o.any !== false && avail.length > 1;
  var auto = o.selected === '' && o.slotBarber ? String(o.slotBarber) : '';
  function chip(id, label, b, on) {
    var off = b && barberOffOn(b, o.dateStr), isAuto = b && auto && String(b.id) === auto;
    var ic = b ? barberChipAvatarHtml(b, o.all || o.list)
      : '<span class="b-avatar b-any" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 11l2 2 4-4"/></svg></span>';
    var tip = label + (isAuto ? ' — retenu pour ce créneau' : '') + (off ? ' — indisponible ce jour-là' : '');
    return '<button type="button" class="dt-barber' + (b ? ' dt-barber-pic' : '') + (on ? ' on' : '') + (isAuto ? ' auto' : '') + (off ? ' off' : '') +
      '" onclick="' + o.onPick + '(\'' + id + '\')" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
      ic + (b ? '' : esc(label)) + (isAuto ? '<span class="dt-auto" aria-hidden="true">✓</span>' : '') + '</button>';
  }
  if (!o.list.length) return '';
  return '<div class="eyebrow dt-barbers-title">Coiffeur</div><div class="dt-barber-row">' +
    (showAny ? chip('', 'Premier disponible', null, o.selected === '') : '') +
    o.list.map(function (b) { return chip(b.id, b.name, b, String(o.selected) === String(b.id)); }).join('') + '</div>';
}
// Photo du coiffeur, sinon son initiale sur sa couleur (copie locale : le tableau de bord a sa propre barberAvatarHtml).
function barberChipAvatarHtml(b, list) {
  var initial = String(b.name || '?').trim().charAt(0).toUpperCase();
  var style = 'width:40px;height:40px;border-radius:50%;flex:none;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:17px;background-size:cover;background-position:center;' +
    (b.photo_url ? "background-image:url('" + esc(b.photo_url) + "')" : 'background:' + barberColorOf(b, list));
  return '<span class="b-avatar" style="' + style + '" aria-hidden="true">' + (b.photo_url ? '' : esc(initial)) + '</span>';
}
function ensureBarberChipsCss() {
  if (document.getElementById('dt-barber-css')) return;
  var st = document.createElement('style'); st.id = 'dt-barber-css';
  st.textContent = '.dt-barbers{margin:0 0 10px}.dt-barbers-title{margin:0 0 8px;font-size:13px;font-weight:600;color:var(--grey)}' +
    '.dt-barber-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
    '.dt-barber{display:inline-flex;align-items:center;gap:8px;min-height:42px;padding:0 14px 0 5px;border-radius:999px;border:1.5px solid var(--sep);background:var(--card);color:var(--ink);font:inherit;font-size:14px;font-weight:600;cursor:pointer}' +
    '.dt-barber .b-any{width:30px;height:30px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--fill);color:var(--blue);flex:none}' +
    '.dt-barber.on{background:var(--blue);border-color:var(--blue);color:#fff}.dt-barber.on .b-any{background:rgba(255,255,255,.22);color:#fff}' +
    '.dt-barber-pic{position:relative;padding:0;min-height:0;width:48px;height:48px;justify-content:center;border-radius:50%;border:2px solid transparent;background:none}' +
    '.dt-barber-pic.on{background:none;border-color:var(--blue);box-shadow:0 0 0 2px var(--blue-soft)}.dt-barber-pic.auto{border-color:var(--blue)}' +
    '.dt-auto{position:absolute;right:-3px;bottom:-3px;width:18px;height:18px;border-radius:50%;background:var(--blue);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid var(--card)}' +
    '.dt-barber-pic.off{opacity:.45}.dt-barber-pic.off.on{opacity:.7}' +
    ".dt-barber-pic.off::after{content:'';position:absolute;right:0;bottom:0;width:12px;height:12px;border-radius:50%;background:var(--red);border:2px solid var(--card)}";
  document.head.appendChild(st);
}

/* ===== Timer : commencer un client avec RDV un peu avant son heure =====
   Reglages > Timer : pour tout le salon (active ou non, X min, 10 par defaut) et, pour chaque coiffeur, « comme le
   salon », ses propres minutes, ou desactive. cfg = reglages publics (/api/settings/public). */
function timerEarlyMinFor(cfg, barberId) {
  if (!cfg) return 0;
  var own = barberId && cfg.timer_early_barbers ? cfg.timer_early_barbers[barberId] : null;
  if (own && own.mode === 'off') return 0;
  if (own && own.mode === 'custom') return Math.max(0, Number(own.min) || 0);
  return cfg.timer_early_enabled === false ? 0 : Math.max(0, Number(cfg.timer_early_min) || 0);
}
/** Heure (ms) a partir de laquelle on peut commencer ce client avec RDV. */
function timerStartAllowedAt(q, cfg, barberId) {
  return new Date(q.checkin_at).getTime() - timerEarlyMinFor(cfg, barberId) * 60000;
}

/* ===== Coordonnees du client : memes regles que le serveur (src/lib/contact.js) =====
   email nom@domaine.ext ; telephone +33612345678 / 0612345678 (8 a 15 chiffres a l'international) ; nom 2 lettres min.
   Un champ vide non obligatoire est accepte ; un champ rempli doit etre valide. Renvoie le message d'erreur, ou ''. */
function isValidEmailStr(v) {
  var e = String(v == null ? '' : v).trim();
  return e.length <= 254 && /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[A-Za-z]{2,}$/.test(e) && !/\.\./.test(e);
}
function isValidPhoneStr(v) {
  var s = String(v == null ? '' : v).trim();
  if (!/^\+?[0-9 ().\-/]+$/.test(s)) return false;
  var d = s.replace(/\D/g, '');
  if (s.charAt(0) === '+') return d.indexOf('33') === 0 ? d.length === 11 : (d.length >= 8 && d.length <= 15);
  if (d.charAt(0) === '0') return d.length === 10;
  return d.length >= 8 && d.length <= 15;
}
function contactProblem(c, opts) {
  c = c || {}; opts = opts || {};
  var name = String(c.name == null ? '' : c.name).trim(), email = String(c.email == null ? '' : c.email).trim(), phone = String(c.phone == null ? '' : c.phone).trim();
  if (opts.nameRequired !== false && (name.length < 2 || !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(name))) return 'Nom invalide : au moins 2 lettres.';
  if (!email) { if (opts.emailRequired) return "L'email est requis pour la confirmation."; }
  else if (!isValidEmailStr(email)) return 'Adresse email invalide (exemple : prenom@gmail.com).';
  if (!phone) { if (opts.phoneRequired) return 'Le téléphone est requis.'; }
  else if (!isValidPhoneStr(phone)) return 'Numéro de téléphone invalide (exemple : 06 12 34 56 78).';
  return '';
}

/** Premier jour (YYYY-MM-DD, a partir de fromStr inclus) ou le coiffeur peut prendre des RDV, sur 6 mois ; null sinon.
 *  isClosed(dateStr) facultatif : jours de fermeture du salon a sauter. */
function firstBookableDayFor(b, fromStr, isClosed) {
  var d = new Date(fromStr + 'T12:00:00');
  for (var n = 0; n < 183; n++) {
    var s = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (barberBookableOn(b, s) && !(isClosed && isClosed(s))) return s;
    d.setDate(d.getDate() + 1);
  }
  return null;
}

/** Pourquoi on ne peut pas prendre de RDV avec ce coiffeur ce jour-la ('' s'il travaille). */
function barberOffReason(b, dateStr) {
  if (!b || !dateStr || barberBookableOn(b, dateStr)) return '';
  if (isOnLeaveOn(b, dateStr)) return 'est en congé ce jour-là';
  if (isWalkinOn(b, dateStr)) return 'est en « sans RDV » ce jour-là';
  return 'ne travaille pas ce jour-là';
}
