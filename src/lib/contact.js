/**
 * Coordonnees d'un client : verifiees PARTOUT ou on les saisit (RDV en ligne, compte client, borne, caisse, admin...).
 * Avant, « t » passait pour un email et pour un telephone.
 *  - email : forme nom@domaine.ext (extension d'au moins 2 lettres), 254 caracteres max ;
 *  - telephone : chiffres (espaces, points, tirets, parentheses toleres), international « +33612345678 » (8 a 15
 *    chiffres) ou national « 0612345678 » (10 chiffres) ;
 *  - nom : au moins 2 caracteres dont une lettre.
 */
function isValidEmail(v) {
  const e = String(v == null ? '' : v).trim();
  return e.length <= 254 && /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[A-Za-z]{2,}$/.test(e) && !/\.\./.test(e);
}
function isValidPhone(v) {
  const s = String(v == null ? '' : v).trim();
  if (!/^\+?[0-9 ().\-/]+$/.test(s)) return false;
  const d = s.replace(/\D/g, '');
  if (s.charAt(0) === '+') {
    if (d.indexOf('33') === 0) return d.length === 11;   // France : +33 + 9 chiffres
    return d.length >= 8 && d.length <= 15;
  }
  if (d.charAt(0) === '0') return d.length === 10;
  return d.length >= 8 && d.length <= 15;
}
function isValidName(v) {
  const n = String(v == null ? '' : v).trim();
  return n.length >= 2 && /\p{L}/u.test(n);
}
/**
 * Message d'erreur (ou null). opts : { emailRequired, phoneRequired, nameRequired (defaut true) }
 * Un champ vide non obligatoire est accepte ; un champ rempli doit etre valide.
 */
function contactError({ name, email, phone } = {}, opts = {}) {
  // nameRequired: false (saisie par l'equipe) : le nom n'est pas controle ici (un simple « X » reste permis).
  if (opts.nameRequired !== false && !isValidName(name)) return 'Nom invalide : au moins 2 lettres.';
  const e = String(email == null ? '' : email).trim();
  if (!e) { if (opts.emailRequired) return "L'email est requis pour la confirmation."; }
  else if (!isValidEmail(e)) return 'Adresse email invalide (exemple : prenom@gmail.com).';
  const p = String(phone == null ? '' : phone).trim();
  if (!p) { if (opts.phoneRequired) return 'Le téléphone est requis.'; }
  else if (!isValidPhone(p)) return 'Numéro de téléphone invalide (exemple : 06 12 34 56 78).';
  return null;
}
module.exports = { isValidEmail, isValidPhone, isValidName, contactError };
