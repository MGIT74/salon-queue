const cron = require('node-cron');
const { pool, getSettings, parisLocalToUtcDate } = require('../db');
const { recompute } = require('../lib/queueMath');
const { sendTurnSoon, sendAppointmentReminder } = require('../lib/mailer');
const { nowParisDatetimeString } = require('../routes/appointments');

const MARGIN_MIN = 5;

async function checkAndNotifyForSalon(salonId) {
  await recompute(salonId);

  const s = await getSettings(salonId);
  if (!s.smtp_host) return; // SMTP pas encore configuré pour ce salon

  const threshold = Number(s.notify_before_min || 30);

  const [rows] = await pool.query(
    `SELECT id, client_name, email, estimated_wait_min FROM queue
     WHERE salon_id = ? AND status = 'waiting' AND notified = 0 AND email IS NOT NULL
     AND estimated_wait_min <= ? AND estimated_wait_min >= ?`,
    [salonId, threshold, threshold - MARGIN_MIN]
  );

  for (const c of rows) {
    try {
      await sendTurnSoon(salonId, c.email, c.client_name, c.estimated_wait_min);
      await pool.query('UPDATE queue SET notified = 1 WHERE id = ?', [c.id]);
      console.log('[notify]', salonId, '- email envoyé à', c.email);
    } catch (mailErr) {
      console.error('[notify]', salonId, '- échec pour', c.email, ':', mailErr.message);
    }
  }
}

/**
 * Rappel d'un RDV programmé à l'avance, N minutes avant l'heure fixée
 * (notify_before_min) - mécanisme séparé de checkAndNotifyForSalon
 * ci-dessus (celui-ci reste dédié à la file d'attente physique, basé
 * sur une estimation dynamique de position - inadapté à un horaire
 * fixe connu à l'avance, d'où le rappel qui arrivait bien trop tard
 * dans les faits).
 *
 * Un RDV réservé trop tard pour qu'un rappel "N minutes avant" ait un
 * sens (ex: pris 10 min avant l'heure alors que le seuil est 30 min)
 * ne déclenche jamais d'envoi - juste marqué comme traité pour ne pas
 * être réévalué en boucle.
 */
async function checkAndNotifyAppointmentsForSalon(salonId) {
  const s = await getSettings(salonId);
  if (!s.smtp_host) return;

  const threshold = Number(s.notify_before_min || 30);
  const nowMs = new Date(nowParisDatetimeString().replace(' ', 'T') + 'Z').getTime();

  const [rows] = await pool.query(
    `SELECT a.id, a.client_name, a.email, a.scheduled_at, a.created_at, s.name AS service_name
     FROM appointments a
     LEFT JOIN services s ON s.id = a.service_id
     WHERE a.salon_id = ? AND a.status = 'confirmed' AND a.reminder_sent = 0 AND a.email IS NOT NULL`,
    [salonId]
  );

  for (const a of rows) {
    const scheduledAtStr = String(a.scheduled_at);
    const apptMs = new Date(scheduledAtStr.replace(' ', 'T') + 'Z').getTime();
    const minutesUntil = (apptMs - nowMs) / 60000;
    if (minutesUntil > threshold || minutesUntil < threshold - MARGIN_MIN) continue;

    const [dateStr, timeStr] = scheduledAtStr.split(' ');
    const apptUtcMs = parisLocalToUtcDate(dateStr, timeStr.slice(0, 5)).getTime();
    const createdMs = new Date(a.created_at).getTime();
    const leadMinAtBooking = (apptUtcMs - createdMs) / 60000;

    if (leadMinAtBooking < threshold) {
      // Réservé trop près de l'heure du RDV - aucun rappel pertinent
      // à envoyer, on marque quand même comme traité.
      await pool.query('UPDATE appointments SET reminder_sent = 1 WHERE id = ?', [a.id]);
      continue;
    }

    try {
      const when = new Date(scheduledAtStr.replace(' ', 'T')).toLocaleString('fr-FR', {
        weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'
      });
      await sendAppointmentReminder(salonId, a.email, {
        clientName: a.client_name, serviceName: a.service_name || 'votre prestation', when
      });
      await pool.query('UPDATE appointments SET reminder_sent = 1 WHERE id = ?', [a.id]);
      console.log('[notify-rdv]', salonId, '- rappel envoyé à', a.email);
    } catch (mailErr) {
      console.error('[notify-rdv]', salonId, '- échec pour', a.email, ':', mailErr.message);
    }
  }
}

async function checkAndNotify() {
  try {
    const [salons] = await pool.query('SELECT id FROM salons WHERE active = 1');
    for (const s of salons) {
      try {
        await checkAndNotifyForSalon(s.id);
        await checkAndNotifyAppointmentsForSalon(s.id);
      } catch (err) {
        console.error('[notify] erreur salon', s.id, ':', err.message);
      }
    }
  } catch (err) {
    console.error('[notify] erreur générale:', err.message);
  }
}

function startNotifyJob() {
  cron.schedule('* * * * *', checkAndNotify);
  console.log('[notify] job démarré (toutes les minutes, tous salons actifs)');
}

module.exports = { startNotifyJob, checkAndNotify };
