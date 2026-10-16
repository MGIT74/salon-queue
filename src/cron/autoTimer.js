const { pool } = require('../db');
const { loadQueue } = require('../lib/queueMath');

// loadQueue() retague ses dates en chaine ISO ("...Z") pour un usage cote JS -
// MySQL refuse ce format en ECRITURE (il attend "AAAA-MM-JJ HH:MM:SS"). On
// reformate donc toute date recalculee ici avant de la reinjecter en base.
function toMysqlUtc(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Filet de sécurité pour un coiffeur qui oublie de cliquer "Terminer" :
 * une prestation "en cours" (RDV ou client libre) dont la durée prévue est
 * dépassée passe "terminée" toute seule, à l'heure de fin PRÉVUE.
 *
 * Il n'y a PLUS de démarrage automatique d'un RDV dont l'heure est passée
 * (décision du salon) : un client absent était démarré puis « terminé » tout
 * seul et comptait dans les statistiques. Le RDV reste « en attente » : le
 * coiffeur le commence quand le client est là, ou le marque Absent - ce qui
 * libère aussitôt le créneau pour un client déjà sur place ou en ligne.
 */
async function autoManageTimersForSalon(salonId) {
  const now = Date.now();

  const activeRows = await loadQueue(salonId, ['in_progress']);
  for (const r of activeRows) {
    if (!r.start_at || !r.total_duration_min) continue;
    const scheduledEndMs = new Date(r.start_at).getTime() + r.total_duration_min * 60000;
    if (scheduledEndMs > now) continue;
    const [result] = await pool.query(
      "UPDATE queue SET status = 'done', end_at = ? WHERE id = ? AND salon_id = ? AND status = 'in_progress'",
      [toMysqlUtc(new Date(scheduledEndMs)), r.id, salonId]
    );
    if (result.affectedRows) {
      console.log('[auto-timer]', salonId, '- fin automatique (oubliée) :', r.client_name);
    }
  }
}

module.exports = { autoManageTimersForSalon };
