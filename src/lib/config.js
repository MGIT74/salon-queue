// Réglages d'environnement d'une installation, lus à un seul endroit.
// Une même base de code tourne sur plusieurs installations (test, client
// unique, SaaS) : ce qui les distingue se règle ici, jamais par une copie du code.

function readEnv(name) {
  const v = process.env[name];
  // xCloud peut laisser un \r collé à la fin des valeurs (fins de ligne Windows).
  return typeof v === 'string' ? v.replace(/[\r\n]+$/, '').trim() : '';
}

const FALSE_VALUES = ['false', '0', 'no', 'non', 'off', 'disabled'];

/**
 * Inscription publique de nouveaux salons (page /signup.html et POST
 * /api/signup). OUVERTE par défaut - comportement historique. À FERMER
 * (SIGNUP_ENABLED=false) sur l'installation d'un client unique : sans ça,
 * n'importe qui trouvant /signup.html pourrait s'y créer un compte.
 *
 * Fermer l'inscription ne touche ni aux comptes existants (connexion, mot de
 * passe oublié, renvoi de vérification), ni à l'ajout d'un salon par un
 * propriétaire ("Mes salons"), ni à la création d'un salon par le super
 * administrateur - qui reste la façon de créer le compte du client.
 */
function signupEnabled() {
  return !FALSE_VALUES.includes(readEnv('SIGNUP_ENABLED').toLowerCase());
}

module.exports = { signupEnabled };
