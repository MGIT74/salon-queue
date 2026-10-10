// Lance toute la batterie de la caisse, remet la base de TEST a zero entre
// les scripts et VERIFIE les resultats (pas seulement leur affichage).
// Prerequis : voir README.md (serveur lance avec TPE_CHARGE_WAIT_MS=4000,
// jsdom installe). Sortie : code 0 si tout est OK, 1 sinon.
const { spawnSync, execSync } = require('child_process');
const path = require('path');
const sql = (q) => execSync(`mariadb -uroot salonq -e "${q.replace(/"/g,'\\"')}"`, { stdio: 'pipe' });
const reset = () => sql("DELETE FROM cash_closings; DELETE FROM sales; DELETE FROM queue; DELETE FROM appointments; DELETE FROM gift_cards; DELETE FROM print_jobs; DELETE FROM tpe_charge_jobs; DELETE FROM bridge_keys; UPDATE products SET stock_quantity=3 WHERE id='p1';");
const run = (file) => {
  const r = spawnSync('node', [path.join(__dirname, file)], { encoding: 'utf8', timeout: 240000, env: process.env });
  return { out: (r.stdout || '') + (r.stderr || ''), code: r.status };
};

// [fichier, reinitialiser avant ?, controles sur la sortie | 'exit' = code de sortie du script]
const suite = [
  ['01-ventes.js', true, [
    'numeros en double : aucun', 'queue.paid_at apres refus : NULL', '2e tentative (sans le produit) : 200',
    'qte 2.5 : 400', 'qte 1e9 : 400']],
  // 02 enchaine sur les ventes creees par 01 (sa cloture en a besoin) : pas de reset
  ['02-pont-cloture-recomptage.js', false, [
    '2e poll (3 s plus tard, sans ack) : 0 job(s)', 'vente apres cloture : 423', '2e cloture : 400',
    'confirm-recount 2e fois (double clic) -> 200', 'pending-recount SANS authentification -> 401',
    'apres 1 poll du pont -> online = true']],
  ['03-cloture-pendant-ventes.js', true, ['runs avec vente perdue : 0/8']],
  ['04-rejouabilite-stock-cloture.js', true, [
    'marques "duplicate" : 4', 'ventes en base pour cette demande : 1', '=> COHERENT',
    '409 Stock insuffisant pour "Gel" (3 restant, 4 demandé', 'sans authentification : 401']],
  ['05-ecran-caisse.js', true, ['exit']],
  ['06-paiement-cb-bout-en-bout.js', true, ['exit']],
  ['07-cadeau-limite-et-ecran-incertain.js', true, ['exit']],
  ['08-heure-de-reouverture.js', true, ['exit']],
  ['09-guide-demarrage-pont.js', true, ['exit']],
  ['10-connexion-caisse.js', true, ['exit']],
  ['11-inscription-publique.js', true, ['exit']],
  ['12-timer-automatique.js', true, ['exit']],
  ['13-pastille-pendant-paiement.js', true, ['exit']],
  ['14-scan-code-barres.js', true, ['exit']],
  ['15-deplacer-dans-tiroir.js', false, ['exit']],
  ['16-alignement-clients.js', false, ['exit']],
  ['17-kiosk-sans-rdv.js', true, ['exit']],
  ['18-liste-suivants-timer.js', true, ['exit']],
  ['19-produits-preselectionnes-rdv.js', true, ['exit']],
  ['20-produits-rdv-dashboard.js', true, ['exit']],
  ['21-produits-rdv-caisse-poste.js', true, ['exit']],
  ['22-produits-rdv-compte.js', true, ['exit']],
  ['23-sans-rdv-sur-frise.js', true, ['exit']],
  ['24-nom-bienvenue-dashboard.js', false, ['exit']],
  ['25-logo-menu-lateral.js', false, ['exit']],
  ['26-menu-lateral-trois-zones.js', false, ['exit']],
  ['27-retrait-des-photos.js', false, ['exit']],
  ['28-chrono-pas-des-creneaux.js', false, ['exit']],
  ['29-catalogue-suppression-ordre.js', true, ['exit']],
  ['30-catalogue-ecran-supprimer-deplacer.js', false, ['exit']],
  ['31-poste-suit-ordre-catalogue.js', false, ['exit']],
  ['32-schema-applique-au-demarrage.js', false, ['exit']],
  ['33-catalogue-mouvement.js', false, ['exit']],
  ['34-compte-client-inscription.js', false, ['exit']],
  ['35-adresse-sans-salon.js', false, ['exit']],
  ['36-installation-salon-par-defaut.js', false, ['exit']],
  ['37-identifiant-salon-alias.js', false, ['exit']],
  ['38-logo-connexion-et-ecran-identifiant.js', false, ['exit']],
  ['39-photos-prestations-reservation.js', false, ['exit']],
  ['40-vitrine-supplements-produits.js', false, ['exit']],
  ['41-vitrine-compte.js', false, ['exit']],
  ['42-vitrine-assistants-borne.js', false, ['exit']],
  ['43-coiffeurs-en-conge.js', false, ['exit']],
  ['44-photo-coiffeur-entiere.js', false, ['exit']],
  ['45-rdv-en-ligne-3-zones.js', false, ['exit']],
  ['46-calendrier-maison.js', false, ['exit']],
  ['47-caisse-cartes-vitrine.js', false, ['exit']],
  ['48-notifications-email-textes.js', false, ['exit']],
  ['49-vendeur-par-ligne.js', false, ['exit']],
  ['50-ticket-etire.js', false, ['exit']],
  ['51-tiroir-sur-especes.js', false, ['exit']],
  ['52-paiement-partage.js', false, ['exit']],
  ['53-lignes-separees.js', false, ['exit']],
  ['54-ticket-z-long-defile.js', false, ['exit']],
  ['55-ticket-z-pont.js', false, ['exit']],
  ['56-z-montants-non-coupes.js', false, ['exit']],
  ['57-compose-env-ia.js', false, ['exit']],
  ['58-ia-base-url.js', false, ['exit']],
  ['59-ia-ventes-caisse.js', false, ['exit']]
];

let bad = 0;
for (const [file, doReset, checks] of suite) {
  if (doReset) reset();
  const { out, code } = run(file);
  const problems = [];
  for (const c of checks) {
    if (c === 'exit') { if (code !== 0) problems.push('code de sortie ' + code + ' (voir ci-dessous)'); }
    else if (!out.includes(c)) problems.push('sortie attendue absente : "' + c + '"');
  }
  console.log((problems.length ? 'ECHEC ' : 'OK    ') + file);
  if (problems.length) { bad++; problems.forEach((p) => console.log('        - ' + p)); console.log(out.split('\n').slice(-25).map((l) => '        | ' + l).join('\n')); }
}
reset();
console.log(bad ? `\n${bad} script(s) en echec` : '\nTOUTE LA BATTERIE EST OK (' + suite.length + ' scripts)');
process.exit(bad ? 1 : 0);
