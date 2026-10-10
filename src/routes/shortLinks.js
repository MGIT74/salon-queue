const express = require('express');
const { pool } = require('../db');
const { wrap } = require('../lib/wrap');

const router = express.Router();

/**
 * Lien court d'annulation envoye par SMS : /c/<16 caracteres>.
 * Redirige vers la page publique d'annulation (rdv.html?salon=..&cancel=<jeton complet>).
 */
router.get('/c/:short', wrap(async (req, res) => {
  const short = String(req.params.short || '');
  if (!/^[0-9a-f]{16}$/.test(short)) return res.status(404).send('Lien invalide');
  const [rows] = await pool.query(
    `SELECT a.cancel_token, s.slug FROM appointments a JOIN salons s ON s.id = a.salon_id
     WHERE a.cancel_token LIKE ? LIMIT 2`, [short + '%']
  );
  if (rows.length !== 1) return res.status(404).send('Lien invalide ou expire');
  res.redirect(302, '/rdv.html?salon=' + encodeURIComponent(rows[0].slug) + '&cancel=' + rows[0].cancel_token);
}));

module.exports = router;
