/**
 * Outils SMS (rappel 24h) : numero de telephone, nom d'expediteur,
 * message et nombre de segments factures par Brevo.
 *
 * Regle Brevo/operateurs : un SMS en alphabet GSM (lettres sans accents
 * ou avec les accents courants du francais, chiffres, ponctuation
 * usuelle) = 160 caracteres, puis 153 par segment si le message est
 * long. Un seul caractere hors GSM (emoji, apostrophe typographique,
 * certains accents...) fait passer TOUT le message en Unicode :
 * 70 caracteres, puis 67 par segment. Chaque segment = 1 credit.
 */

const DEFAULT_TEMPLATE = 'Bonjour {prenom}, rappel de votre RDV {date} a {heure} chez {salon}. A demain !';

const GSM_BASIC = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€\f';

/** Nombre de segments (= credits) que coutera ce message. */
function countSegments(text) {
  const s = String(text || '');
  if (!s) return 0;
  let gsmLen = 0;
  let isGsm = true;
  for (const ch of s) {
    if (GSM_BASIC.includes(ch)) gsmLen += 1;
    else if (GSM_EXT.includes(ch)) gsmLen += 2;
    else { isGsm = false; break; }
  }
  if (isGsm) return gsmLen <= 160 ? 1 : Math.ceil(gsmLen / 153);
  const len = [...s].reduce((n, ch) => n + (ch.codePointAt(0) > 0xFFFF ? 2 : 1), 0);
  return len <= 70 ? 1 : Math.ceil(len / 67);
}

/** true si le message tient entierement dans l'alphabet GSM (sinon Brevo doit l'envoyer en Unicode). */
function isGsm(text) {
  for (const ch of String(text || '')) if (!GSM_BASIC.includes(ch) && !GSM_EXT.includes(ch)) return false;
  return true;
}

/** Supprime les accents et remplace les signes typographiques (SMS moins chers). */
function stripAccents(text) {
  return String(text || '')
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/œ/g, 'oe').replace(/Œ/g, 'OE')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .normalize('NFC');
}

/**
 * Numero -> format international sans "+" (ex : 33612345678), comme
 * attend Brevo. Gere 06 12 34 56 78, +33 6 12 34 56 78, 0033..., 0041...
 * Renvoie null si le numero n'est pas exploitable.
 */
function normalizePhone(raw) {
  let p = String(raw || '').trim();
  if (!p) return null;
  const hadPlus = p.startsWith('+');
  p = p.replace(/[^0-9]/g, '');
  if (!p) return null;
  if (!hadPlus && p.startsWith('00')) p = p.slice(2);
  else if (!hadPlus && p.startsWith('0')) p = '33' + p.slice(1);
  else if (!hadPlus && !/^(33|41|32|352|49|34|39|44)/.test(p) && p.length === 9) p = '33' + p;
  // France : 33 + 9 chiffres ; Suisse/Belgique : 41/32 + 9 chiffres ; autres : 8 a 15 chiffres.
  if (p.startsWith('33')) return p.length === 11 ? p : null;
  if (p.startsWith('41') || p.startsWith('32')) return p.length === 11 ? p : null;
  return p.length >= 8 && p.length <= 15 ? p : null;
}

/** Nom d'expediteur valide Brevo : 11 caracteres alphanumeriques max (sans accents ni espaces). */
function sanitizeSender(raw, fallback) {
  const clean = (v) => stripAccents(v).replace(/[^A-Za-z0-9]/g, '').slice(0, 11);
  const s = clean(raw);
  if (s.length >= 3) return s;
  const f = clean(fallback);
  return f.length >= 3 ? f : 'RDV';
}

const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** 'YYYY-MM-DD HH:MM:SS' (heure de salon) -> { date: 'samedi 10 octobre', heure: '14h30' } */
function formatAppointmentWhen(scheduledAt) {
  const m = String(scheduledAt || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return { date: '', heure: '' };
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return {
    date: JOURS[d.getUTCDay()] + ' ' + Number(m[3]) + ' ' + MOIS[Number(m[2]) - 1],
    heure: m[4] + 'h' + m[5]
  };
}

/** Remplace {prenom} {nom} {date} {heure} {salon} (les inconnues sont retirees). */
function buildMessage(template, vars, opts) {
  const o = opts || {};
  const tpl = String(template || '').trim() || DEFAULT_TEMPLATE;
  const full = String(vars.client_name || '').trim();
  const parts = full.split(/\s+/).filter(Boolean);
  const map = {
    prenom: parts[0] || '',
    nom: parts.slice(1).join(' '),
    date: vars.date || '',
    heure: vars.heure || '',
    salon: vars.salon || ''
  };
  let msg = tpl.replace(/\{(\w+)\}/g, (all, k) => (k in map ? map[k] : ''));
  msg = msg.replace(/[ \t]+/g, ' ').replace(/ ([,.])/g, '$1').trim();
  return o.stripAccents ? stripAccents(msg) : msg;
}

/**
 * SMS de test : l'app ne detient pas la cle Brevo, c'est n8n (webhook
 * "TBO - Test SMS (app)") qui envoie. Meme logique que le chat IA : meme
 * serveur n8n, meme cle d'automatisation.
 */
function testWebhookUrl() {
  const explicit = String(process.env.N8N_SMS_TEST_WEBHOOK_URL || '').replace(/[\r\n"']/g, '').trim();
  if (explicit) return explicit;
  const chat = String(process.env.N8N_CHAT_WEBHOOK_URL || '').replace(/[\r\n"']/g, '').trim();
  return chat ? chat.replace(/\/webhook(-test)?\/[^/]+$/, '/webhook$1/tbo-sms-test') : '';
}

async function sendTestSms({ phone, sender, message }) {
  const url = testWebhookUrl();
  if (!url) throw new Error("l'envoi de SMS n'est pas configure sur ce serveur (N8N_CHAT_WEBHOOK_URL manquant)");
  const key = String(process.env.AUTOMATION_API_KEY || '').replace(/[\r\n"']/g, '').trim();
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Automation-Key': key },
    body: JSON.stringify({ phone, sender, message, unicode: !isGsm(message) }),
    signal: AbortSignal.timeout(20000)
  });
  let data = null;
  try { data = await r.json(); } catch (e) { /* reponse non JSON */ }
  if (!r.ok) throw new Error('le service d\'envoi a repondu ' + r.status);
  if (!data || data.ok !== true) throw new Error((data && data.error) || 'echec de l\'envoi');
  return data;
}

module.exports = {
  sendTestSms, testWebhookUrl,
  DEFAULT_TEMPLATE, countSegments, isGsm, stripAccents, normalizePhone, sanitizeSender,
  formatAppointmentWhen, buildMessage
};
