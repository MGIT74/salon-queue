const express = require('express');
const crypto = require('crypto');
const { getSettings, pool } = require('../db');
const requireAdminOrBarber = require('../middleware/barberAuth');
const { chargeCard } = require('../lib/tpeNepting');
const { concertCharge } = require('../lib/tpeConcert');
const { wrap } = require('../lib/wrap');

const router = express.Router();

/**
 * Authentifie le pont d'impression du salon via X-Bridge-Key (clé
 * générée dans le dashboard, stockée hashée en base - même modèle que
 * les clés d'automatisation). Pose req.salon du pont.
 */
async function requireBridgeKey(req, res, next) {
  const given = (req.get('X-Bridge-Key') || '').replace(/[\r\n]+$/, '').trim();
  if (!given) return res.status(401).json({ error: 'Clé du pont manquante' });
  const hash = crypto.createHash('sha256').update(given).digest('hex');
  try {
    const [[row]] = await pool.query(
      'SELECT bk.salon_id FROM bridge_keys bk WHERE bk.key_hash = ? LIMIT 1',
      [hash]
    );
    if (!row) return res.status(401).json({ error: 'Clé du pont invalide' });
    const [[salon]] = await pool.query('SELECT * FROM salons WHERE id = ? AND active = 1', [row.salon_id]);
    if (!salon) return res.status(404).json({ error: 'Salon du pont introuvable ou inactif' });
    req.salon = salon;
    req.ownerId = salon.owner_id;
    return next();
  } catch (err) {
    console.error('[bridgeKey]', err);
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
}

/**
 * Déclenche un paiement carte sur le TPE configuré pour ce salon.
 * Ne crée PAS la vente elle-même (voir /api/sales) - le front n'appelle
 * /api/sales qu'une fois que cette route a répondu succès, pour ne
 * jamais enregistrer une vente dont le paiement carte a en réalité
 * échoué ou n'a pas eu lieu.
 */
router.post('/charge', requireAdminOrBarber, wrap(async (req, res) => {
  const amountCents = Number(req.body.amount_cents);
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return res.status(400).json({ error: 'Montant invalide' });
  }

  const s = await getSettings(req.salon.id);
  if (!s.tpe_ip) {
    return res.status(400).json({ error: 'Aucun terminal de paiement configuré (Réglages > Terminal de paiement)' });
  }
  if (!s.tpe_cash_register_id) {
    return res.status(400).json({ error: 'Identifiant de caisse manquant (Réglages > Terminal de paiement)' });
  }

  const merchantTxId = crypto.randomBytes(8).toString('hex');

  // Deux protocoles supportés selon la configuration du terminal :
  // - "nepting" (défaut)  : trames TLV "Protocole Caisse" (API locale
  //   Nepting, cf. lib/tpeNepting.js)
  // - "concert"           : Concert version 3 IP — le protocole historique
  //   annoncé "PROTOCOL: ConcertV3 IP" sur les tickets de config
  //   (Crédit Agricole / Nepting, PAX A920Pro, Ingenico...).
  try {
    let result;
    if (s.tpe_protocol === 'concert') {
      result = await concertCharge({
        host: s.tpe_ip,
        port: Number(s.tpe_port) || 8888,
        posNumber: String(s.tpe_cash_register_number || '1').slice(0, 1),
        transactionType: 'debit',
        private: merchantTxId.slice(0, 10)
      }, { amountCents, timeoutMs: 120000 });
    } else {
      result = await chargeCard({
        host: s.tpe_ip,
        port: Number(s.tpe_port) || 20002,
        replyMode: s.tpe_reply_mode === 'callback' ? 'callback' : 'same',
        callbackPort: Number(s.tpe_callback_port) || 20006,
        cashRegisterId: s.tpe_cash_register_id,
        cashRegisterNumber: s.tpe_cash_register_number || '01'
      }, { amountCents, merchantTxId });
    }

    res.json({
      ok: true,
      success: result.success,
      auth_number: result.authNumber || null,
      failure_code: result.failureCode || result.resultCode || null,
      failure_reason: result.failureReason || null,
      merchant_tx_id: merchantTxId
    });
  } catch (err) {
    res.status(502).json({ error: `Impossible de joindre le terminal de paiement : ${err.message}` });
  }
}));

/**
 * Dépose un ticket à imprimer (appelé par la caisse en HTTPS). Le pont
 * installé dans le salon le récupère ensuite via /bridge/poll et
 * l'imprime via CUPS. La réponse est immédiate : l'impression réelle
 * arrive quelques secondes plus tard (le pont interroge toutes les 3 s).
 * Le résultat (done/failed) est visible dans l'historique du pont, pas
 * renvoyé ici — le navigateur n'attend pas.
 */
router.post('/print', requireAdminOrBarber, wrap(async (req, res) => {
  const text = typeof req.body.text === 'string' ? req.body.text : '';
  // 'escpos' : ticket avec transcodage CP850 + découpe | 'drawer' :
  // commande ESC/POS brute d'ouverture de tiroir | 'text' : imprimante
  // classique via filtres CUPS.
  const mode = ['escpos', 'drawer', 'text'].includes(req.body.mode) ? req.body.mode : 'escpos';
  if (!text.trim()) return res.status(400).json({ error: 'Ticket vide' });
  if (text.length > 50_000) return res.status(400).json({ error: 'Ticket trop long' });

  const id = crypto.randomUUID();
  await pool.query(
    'INSERT INTO print_jobs (id, salon_id, text, mode) VALUES (?, ?, ?, ?)',
    [id, req.salon.id, text, mode]
  );
  res.json({ ok: true, job_id: id });
}));

/* ---------- Endpoints pour le PONT (auth X-Bridge-Key) ---------- */

/** Le pont réclame les tickets en attente de son salon. */
router.get('/bridge/poll', requireBridgeKey, wrap(async (req, res) => {
  const [jobs] = await pool.query(
    "SELECT id, text, mode FROM print_jobs WHERE salon_id = ? AND status = 'pending' ORDER BY created_at LIMIT 10",
    [req.salon.id]
  );
  res.json({ ok: true, jobs });
}));

/** Le pont signale le résultat d'impression d'un ticket. */
router.post('/bridge/ack', requireBridgeKey, wrap(async (req, res) => {
  const { job_id, ok, error } = req.body;
  if (!job_id) return res.status(400).json({ error: 'job_id requis' });
  const status = ok ? 'done' : 'failed';
  await pool.query(
    "UPDATE print_jobs SET status = ?, error = ?, printed_at = NOW() WHERE id = ? AND salon_id = ? AND status = 'pending'",
    [status, error ? String(error).slice(0, 2000) : null, job_id, req.salon.id]
  );
  res.json({ ok: true });
}));

/**
 * Génère (ou régénère) la clé du pont pour CE salon - réservé admin.
 * La clé en clair n'apparaît qu'une fois, dans cette réponse ; seul son
 * hash est conservé. Un bouton du dashboard l'affiche avec la commande
 * prête à copier sur l'ordinateur du salon.
 */
router.post('/bridge-key', requireAdminOrBarber, wrap(async (req, res) => {
  const plainKey = crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(plainKey).digest('hex');
  const preview = plainKey.slice(0, 6) + '...';
  const id = crypto.randomUUID();

  await pool.query(
    'DELETE FROM bridge_keys WHERE salon_id = ?',
    [req.salon.id]
  );
  await pool.query(
    'INSERT INTO bridge_keys (id, salon_id, key_hash, key_preview) VALUES (?, ?, ?, ?)',
    [id, req.salon.id, hash, preview]
  );
  res.json({ ok: true, key: plainKey });
}));

module.exports = router;
