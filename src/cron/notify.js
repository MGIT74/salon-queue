const cron = require('node-cron');
const { pool, getSettings } = require('../db');
const { recompute } = require('../lib/queueMath');
const { sendTurnSoon } = require('../lib/mailer');

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

async function checkAndNotify() {
  try {
    const [salons] = await pool.query('SELECT id FROM salons WHERE active = 1');
    for (const s of salons) {
      try {
        await checkAndNotifyForSalon(s.id);
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
