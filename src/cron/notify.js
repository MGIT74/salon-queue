const cron = require('node-cron');
const { pool, getSettings } = require('../db');
const { recompute } = require('../lib/queueMath');
const { sendTurnSoon } = require('../lib/mailer');

const MARGIN_MIN = 5;

async function checkAndNotify() {
  try {
    await recompute();

    const s = await getSettings();
    if (!s.smtp_host) return; // SMTP pas encore configuré, on ne fait rien
    const threshold = Number(s.notify_before_min || 30);

    const [rows] = await pool.query(
      `SELECT id, client_name, email, estimated_wait_min FROM queue
       WHERE status = 'waiting' AND notified = 0 AND email IS NOT NULL
       AND estimated_wait_min <= ? AND estimated_wait_min >= ?`,
      [threshold, threshold - MARGIN_MIN]
    );

    for (const c of rows) {
      try {
        await sendTurnSoon(c.email, c.client_name, c.estimated_wait_min);
        await pool.query('UPDATE queue SET notified = 1 WHERE id = ?', [c.id]);
        console.log('[notify] email envoyé à', c.email);
      } catch (mailErr) {
        console.error('[notify] échec pour', c.email, ':', mailErr.message);
      }
    }
  } catch (err) {
    console.error('[notify] erreur:', err.message);
  }
}

function startNotifyJob() {
  cron.schedule('* * * * *', checkAndNotify);
  console.log('[notify] job démarré (toutes les minutes)');
}

module.exports = { startNotifyJob, checkAndNotify };
