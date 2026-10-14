const { pool } = require('../db');

/**
 * Prise de rendez-vous en EXCLUSION MUTUELLE par salon.
 *
 * Chaque route vérifie d'abord que le créneau est libre, puis insère le RDV. Sans verrou, deux clients qui
 * valident le même créneau à quelques millisecondes d'écart passaient tous les deux la vérification et
 * obtenaient le même coiffeur à la même heure (double réservation).
 *
 * Verrou MariaDB nommé (GET_LOCK), donc valable même avec plusieurs processus Node. Pour ne jamais
 * épuiser le pool de connexions, une requête en attente ne garde AUCUNE connexion : elle retente
 * GET_LOCK(nom, 0) toutes les 100 ms, et seule la requête qui détient le verrou garde sa connexion.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function acquire(name, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const conn = await pool.getConnection();
    let ok = false;
    try {
      const [[row]] = await conn.query('SELECT GET_LOCK(?, 0) AS ok', [name]);
      ok = row && Number(row.ok) === 1;
    } catch (e) { ok = false; }
    if (ok) return conn;
    conn.release();
    if (Date.now() >= deadline) return null;
    await sleep(100);
  }
}

/** Enveloppe un gestionnaire Express (req, res) => Promise : il s'exécute seul pour ce salon. */
function withBookingLock(handler, timeoutMs) {
  return async function (req, res) {
    const name = 'rdv:' + (req.salon && req.salon.id);
    const conn = await acquire(name, timeoutMs || 10000);
    if (!conn) return res.status(503).json({ error: 'Beaucoup de réservations en même temps, réessayez dans un instant.' });
    try {
      return await handler(req, res);
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?)', [name]).catch(() => {});
      conn.release();
    }
  };
}

module.exports = { withBookingLock };
