// Journal des erreurs serveur, lisible depuis l'espace super admin (onglet « Erreurs »).
// Le detail technique n'est jamais renvoye au navigateur (voir wrap.js) : il est garde ici pour le super admin.
// On ne garde PAS le contenu de la requete (noms, emails...), ni le texte SQL complet : seulement la page appelee,
// le message et la pile d'appels. Une erreur d'ecriture dans ce journal ne casse jamais la reponse.
let inserts = 0;
function recordServerError(req, err) {
  try {
    const { pool } = require('../db');
    const e = err || {};
    const message = String(e.sqlMessage || e.message || e).slice(0, 1000);
    const detail = [e.code ? 'Code : ' + e.code : '', String(e.stack || '').split('\n').slice(0, 12).join('\n')].filter(Boolean).join('\n').slice(0, 6000);
    const path = String((req && (req.originalUrl || req.url)) || '').split('?')[0].slice(0, 300);
    const salonId = req && req.salon && req.salon.id ? String(req.salon.id) : null;
    pool.query('INSERT INTO server_errors (salon_id, method, path, message, detail) VALUES (?, ?, ?, ?, ?)',
      [salonId, String((req && req.method) || '').slice(0, 10), path, message, detail])
      .then(() => {
        if (++inserts % 50 === 0) {
          return pool.query('DELETE FROM server_errors WHERE id <= (SELECT id FROM (SELECT id FROM server_errors ORDER BY id DESC LIMIT 1 OFFSET 500) t)');
        }
      })
      .catch(() => {});
  } catch (e2) { /* jamais bloquant */ }
}
module.exports = { recordServerError };
