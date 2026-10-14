// Liens envoyés par email (annulation de RDV, vérification d'email, réinitialisation de mot de passe).
//
// Le navigateur envoie base_url (window.location.origin + chemin) pour que le lien pointe vers la bonne page.
// Sans contrôle, n'importe qui pouvait appeler l'API avec base_url = https://site-pirate.example et l'email
// d'une victime : la victime recevait un VRAI email du salon (« réinitialiser votre mot de passe ») dont le
// lien envoyait le jeton secret au site pirate → prise de contrôle du compte (« empoisonnement de lien »).
//
// Règle : le domaine du lien doit faire partie de la liste blanche des domaines de l'application
// (PUBLIC_HOSTS, par défaut prod + test, comme AI_CHAT_ALLOWED_HOSTS). Sinon on garde seulement le chemin et
// les paramètres, sur le domaine officiel. Un base_url légitime reste donc strictement identique.
const { readEnv } = require('./config');

function allowedHosts() {
  return (readEnv('PUBLIC_HOSTS') || 'app.thebarberone.com,rdv.handsgraphic.com')
    .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
}

const isLocal = (host) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);

function isAllowedHost(host) {
  host = String(host || '').toLowerCase();
  return isLocal(host) || allowedHosts().includes(host);
}

/** Domaine officiel quand base_url n'est pas fiable : celui de la requête s'il est dans la liste, sinon le premier de la liste. */
function fallbackOrigin(req) {
  const get = (k) => (req && typeof req.get === 'function' ? req.get(k) : '');
  const candidates = [String(get('x-forwarded-host') || '').split(',')[0], get('host')]
    .map((h) => String(h || '').trim().toLowerCase()).filter(Boolean);
  const ok = candidates.find((h) => !isLocal(h) && allowedHosts().includes(h));
  return 'https://' + (ok || allowedHosts()[0]);
}

function safeBaseUrl(req, raw) {
  const fallback = fallbackOrigin(req);
  let u;
  try { u = new URL(String(raw || '/'), fallback + '/'); } catch (e) { return fallback; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return fallback;
  const path = (u.pathname + u.search).replace(/\/$/, '');
  if (!isAllowedHost(u.host)) return fallback + path;
  return u.protocol + '//' + u.host + path;
}

module.exports = { safeBaseUrl, isAllowedHost };
