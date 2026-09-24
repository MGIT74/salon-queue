const cron = require('node-cron');
const { pool } = require('../db');

// Purge périodique des jetons de sécurité expirés, dans les tables qui
// les accumulent au fil des connexions / inscriptions / demandes de
// réinitialisation :
//
// - client_sessions      : sessions de l'espace client (90 jours max)
// - impersonation_tokens : jetons d'assistance du super admin (10 min)
// - clients / owners     : verify_token et reset_token consommables,
//   laissés sur le compte après usage ou expiration (les colonnes ne
//   sont jamais purgées par la logique métier elle-même)
//
// Sans ce nettoyage, la base grossit indéfiniment et surtout des jetons
// morts (mais réellement valides au moment où ils ont été émis) restent
// présents : une fuite de la base les exposerait pour rien. La purge ne
// retire JAMAIS un jeton encore valide (WHERE expires_at <= NOW(), les
// colonnes *_expires ne sont nettoyées que lorsqu'elles sont dans le
// passé).
async function purgeExpiredTokens() {
  const [sessions] = await pool.query('DELETE FROM client_sessions WHERE expires_at <= NOW()');
  const [impersonation] = await pool.query('DELETE FROM impersonation_tokens WHERE expires_at <= NOW()');
  const [clientVerify] = await pool.query(
    'UPDATE clients SET verify_token = NULL, verify_token_expires = NULL WHERE verify_token IS NOT NULL AND verify_token_expires IS NOT NULL AND verify_token_expires <= NOW()'
  );
  const [clientReset] = await pool.query(
    'UPDATE clients SET reset_token = NULL, reset_token_expires = NULL WHERE reset_token IS NOT NULL AND reset_token_expires IS NOT NULL AND reset_token_expires <= NOW()'
  );
  const [ownerVerify] = await pool.query(
    'UPDATE owners SET verify_token = NULL, verify_token_expires = NULL WHERE verify_token IS NOT NULL AND verify_token_expires IS NOT NULL AND verify_token_expires <= NOW()'
  );
  const [ownerReset] = await pool.query(
    'UPDATE owners SET reset_token = NULL, reset_token_expires = NULL WHERE reset_token IS NOT NULL AND reset_token_expires IS NOT NULL AND reset_token_expires <= NOW()'
  );
  // Tickets imprimés depuis plus de 7 jours (tracés une semaine pour
  // dépannage, puis supprimés - la table ne doit pas grossir indéfiniment).
  const [printJobs] = await pool.query(
    'DELETE FROM print_jobs WHERE status IN (\'done\', \'failed\') AND created_at <= (NOW() - INTERVAL 7 DAY)'
  );

  const n = sessions.affectedRows + impersonation.affectedRows +
    clientVerify.changedRows + clientReset.changedRows +
    ownerVerify.changedRows + ownerReset.changedRows;
  if (n > 0) {
    console.log('[purge] jetons expirés nettoyés :', n);
  }
  if (printJobs.affectedRows > 0) {
    console.log('[purge] tickets imprimés supprimés :', printJobs.affectedRows);
  }
}

function startPurgeJob() {
  // Toutes les heures, avec un décalage volontaire (minute 17) pour ne
  // pas coïncider avec le job de notification (toutes les minutes) ni
  // avec le début d'heure, plus chargé.
  cron.schedule('17 * * * *', async () => {
    try {
      await purgeExpiredTokens();
    } catch (err) {
      console.error('[purge] échec :', err.message);
    }
  });
  console.log('[purge] job démarré (toutes les heures, minute 17)');
}

module.exports = { startPurgeJob, purgeExpiredTokens };