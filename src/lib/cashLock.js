const { pool } = require('../db');

/**
 * Erreur "métier" renvoyée telle quelle au client (statut HTTP + message),
 * par opposition aux erreurs techniques que wrap() masque en 500 générique.
 */
class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || {};
  }
}

/**
 * Exécute fn(db) en EXCLUSION MUTUELLE par salon, dans une transaction.
 *
 * Pourquoi : la création d'une vente et la clôture de caisse ne doivent
 * jamais s'entrelacer. Sans ça (constaté par test, 8 essais sur 8) une vente
 * acceptée pendant qu'une clôture calcule ses totaux pouvait être datée
 * AVANT la fin de période mais absente du ticket Z - donc de AUCUN Z, ni ce
 * lui-ci ni le suivant. Le même verrou sérialise aussi l'attribution des
 * numéros de ticket (deux ventes simultanées obtenaient le même numéro).
 *
 * `db` est une connexion dédiée : le verrou (GET_LOCK) et la transaction
 * vivent sur cette connexion. Si fn lève une exception, tout est annulé
 * (ROLLBACK) - par exemple un client marqué "encaissé" alors que la vente
 * est refusée juste après.
 */
async function withCashLock(salonId, fn) {
  const conn = await pool.getConnection();
  const lockName = 'cash:' + salonId;
  let locked = false;
  try {
    const [[row]] = await conn.query('SELECT GET_LOCK(?, 15) AS ok', [lockName]);
    if (row.ok !== 1) throw new HttpError(503, 'La caisse est occupée, réessayez dans un instant.');
    locked = true;
    await conn.beginTransaction();
    try {
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    }
  } finally {
    if (locked) await conn.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    conn.release();
  }
}

module.exports = { withCashLock, HttpError };
