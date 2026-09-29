const { pool } = require('../db');
const { loadQueue } = require('../lib/queueMath');

// loadQueue() retague ses dates en chaine ISO ("...Z") pour un usage cote JS -
// MySQL refuse ce format en ECRITURE (il attend "AAAA-MM-JJ HH:MM:SS"). On
// reformate donc toute date recalculee ici avant de la reinjecter en base.
function toMysqlUtc(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Filet de sécurité pour un coiffeur qui oublie de cliquer "Commencer" ou
 * "Terminer" au bon moment :
 *  - Démarrage automatique : un RDV PROGRAMMÉ (pas un client en attente
 *    libre, qui n'a lui aucune heure prévue) encore "en attente" une fois
 *    son heure de rendez-vous passée est démarré tout seul, à l'heure
 *    PRÉVUE (pas à l'heure où ce job s'en aperçoit) - le chrono affiché au
 *    coiffeur reste donc juste, même détecté avec un peu de retard.
 *  - Arrêt automatique : une prestation "en cours" (RDV ou client libre,
 *    peu importe) dont la durée prévue est dépassée passe "terminée" toute
 *    seule, à l'heure de fin PRÉVUE. Toujours appliqué, même si le coiffeur
 *    est réellement en retard sur cette coupe (choix confirmé) - il pourra
 *    de toute façon encore cliquer "Terminer" lui-même sans effet, la ligne
 *    n'étant plus "en cours".
 *
 * Un client marqué "Absent" ou annulé n'a plus le statut 'waiting'/
 * 'in_progress' : il est donc automatiquement ignoré ici, sans condition
 * à vérifier en plus.
 */
async function autoManageTimersForSalon(salonId) {
  const now = Date.now();

  const waitingRows = await loadQueue(salonId, ['waiting']);
  const appointmentsDue = waitingRows.filter((r) => (
    r.is_appointment && r.barber_id && new Date(r.checkin_at).getTime() <= now
  ));
  for (const r of appointmentsDue) {
    // Un coiffeur ne peut pas commencer 2 prestations à la fois : s'il est
    // déjà occupé, on ne démarre pas celle-ci - le prochain passage (dans
    // la minute) réessaiera, une fois ce coiffeur libéré.
    const [[busy]] = await pool.query(
      "SELECT 1 FROM queue WHERE salon_id = ? AND barber_id = ? AND status = 'in_progress' LIMIT 1",
      [salonId, r.barber_id]
    );
    if (busy) continue;
    const [result] = await pool.query(
      "UPDATE queue SET status = 'in_progress', start_at = checkin_at WHERE id = ? AND salon_id = ? AND status = 'waiting'",
      [r.id, salonId]
    );
    if (result.affectedRows) {
      console.log('[auto-timer]', salonId, '- démarrage automatique (oublié) :', r.client_name);
    }
  }

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
