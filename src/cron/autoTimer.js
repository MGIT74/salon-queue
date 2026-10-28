const { pool } = require('../db');
const { loadQueue, recompute } = require('../lib/queueMath');

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
 * RDV jamais démarré (le coiffeur n'a cliqué ni « Commencer » ni « Absent ») : il reste « en attente »
 * pendant son créneau, puis À LA FIN du créneau prévu il passe tout seul « terminé » (aux heures prévues)
 * et part dans « À encaisser » marqué auto_unstarted = 1 : « Non démarré — à vérifier ». La file n'est plus
 * bloquée. Il ne compte dans les statistiques qu'une fois encaissé ; « Absent » en caisse le retire (avant,
 * un client absent démarré tout seul comptait comme une vraie coupe).
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

  // RDV du jour jamais démarré, créneau prévu terminé -> « À encaisser », à vérifier.
  // Pas si son coiffeur est EN TRAIN de coiffer quelqu'un : il a pris du retard, le client attend sans doute au salon.
  const busy = new Set((await loadQueue(salonId, ['in_progress'])).map((r) => r.barber_id).filter(Boolean));
  const waitingRows = await loadQueue(salonId, ['waiting']);
  let moved = 0;
  for (const r of waitingRows) {
    if (!r.is_appointment || !r.barber_id || !r.checkin_at || !r.total_duration_min) continue;
    if (busy.has(r.barber_id)) continue;
    const startMs = new Date(r.checkin_at).getTime();   // checkin_at d'un RDV = son heure prévue
    const endMs = startMs + r.total_duration_min * 60000;
    if (endMs > now) continue;
    const [result] = await pool.query(
      "UPDATE queue SET status = 'done', start_at = ?, end_at = ?, auto_unstarted = 1 WHERE id = ? AND salon_id = ? AND status = 'waiting'",
      [toMysqlUtc(new Date(startMs)), toMysqlUtc(new Date(endMs)), r.id, salonId]
    );
    if (result.affectedRows) {
      moved++;
      console.log('[auto-timer]', salonId, '- RDV non démarré passé en caisse (à vérifier) :', r.client_name);
    }
  }
  if (moved) await recompute(salonId);
}

module.exports = { autoManageTimersForSalon };
