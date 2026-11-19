// Téléphone et coordonnées — COPIE de public/app.js (PHONE_COUNTRIES,
// composePhone, contactProblem) : même liste d'indicatifs, mêmes contrôles
// que le web. Le serveur revérifie tout (src/lib/contact.js).

/** [indicatif, drapeau, pays, iso] — même ordre que le web. */
export type PhoneCountry = [string, string, string, string];

export const PHONE_COUNTRIES: PhoneCountry[] = [
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
  ['+420', '🇨🇿', 'Tchéquie', 'cz'],
];

/** Indicatif + numéro local → format international (web : composePhone). */
export function composePhone(countryCode: string, localRaw: string): string {
  const local = String(localRaw || '').trim();
  if (!local) return '';
  if (local.charAt(0) === '+') return local.replace(/[\s.-]/g, '');
  return countryCode + local.replace(/[\s.-]/g, '').replace(/^0+/, '');
}

function isValidEmailStr(v: string): boolean {
  const e = String(v == null ? '' : v).trim();
  return e.length <= 254 && /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[A-Za-z]{2,}$/.test(e) && !/\.\./.test(e);
}

function isValidPhoneStr(v: string): boolean {
  const s = String(v == null ? '' : v).trim();
  if (!/^\+?[0-9 ().\-/]+$/.test(s)) return false;
  const d = s.replace(/\D/g, '');
  if (s.charAt(0) === '+') return d.indexOf('33') === 0 ? d.length === 11 : d.length >= 8 && d.length <= 15;
  if (d.charAt(0) === '0') return d.length === 10;
  return d.length >= 8 && d.length <= 15;
}

/** Message d'erreur ('' si tout va bien) — web : contactProblem. */
export function contactProblem(
  c: { name?: string; email?: string; phone?: string },
  opts: { emailRequired?: boolean; phoneRequired?: boolean; nameRequired?: boolean } = {}
): string {
  const name = String(c.name ?? '').trim();
  const email = String(c.email ?? '').trim();
  const phone = String(c.phone ?? '').trim();
  if (opts.nameRequired !== false && (name.length < 2 || !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(name))) return 'Nom invalide : au moins 2 lettres.';
  if (!email) {
    if (opts.emailRequired) return "L'email est requis pour la confirmation.";
  } else if (!isValidEmailStr(email)) return 'Adresse email invalide (exemple : prenom@gmail.com).';
  if (!phone) {
    if (opts.phoneRequired) return 'Le téléphone est requis.';
  } else if (!isValidPhoneStr(phone)) return 'Numéro de téléphone invalide (exemple : 06 12 34 56 78).';
  return '';
}
