const express = require('express');
const crypto = require('crypto');
const { pool, utcIso } = require('../db');
const requireAdminOrBarber = require('../middleware/barberAuth');
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
    // Signal de vie : chaque appel authentifié du pont (poll, charge-poll,
    // ack...) met à jour ce timestamp, ce qui permet au dashboard d'afficher
    // un vrai statut "connecté / hors ligne" plutôt qu'une simple case cochée.
    pool.query('UPDATE bridge_keys SET last_seen_at = NOW() WHERE salon_id = ?', [row.salon_id]).catch(() => {});
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

  // Le pont est actif dès qu'une clé a été générée pour ce salon - aucun
  // interrupteur séparé à cocher : générer la clé (Réglages > Terminal de
  // paiement) suffit à tout activer (impression silencieuse + paiement CB).
  const [[bridgeKey]] = await pool.query(
    'SELECT key_preview FROM bridge_keys WHERE salon_id = ?',
    [req.salon.id]
  );
  if (!bridgeKey) {
    return res.status(400).json({ error: 'Aucun pont local configuré (Réglages > Terminal de paiement > Générer la clé du pont)' });
  }

  const merchantTxId = crypto.randomBytes(8).toString('hex');

  // Le serveur (hébergé sur un VPS, jamais sur le réseau du salon) ne
  // peut pas joindre l'IP locale du TPE : on délègue systématiquement au
  // pont du salon - dépôt de la demande, le pont la réclame par polling,
  // parle au TPE en TCP local et rapporte le résultat ; cette route
  // attend la réponse (long polling jusqu'à 110 s, sous le timeout de
  // la caisse) puis renvoie le résultat au navigateur.
  const jobId = crypto.randomUUID();
  await pool.query(
    'INSERT INTO tpe_charge_jobs (id, salon_id, amount_cents) VALUES (?, ?, ?)',
    [jobId, req.salon.id, amountCents]
  );

  const deadline = Date.now() + 110_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const [[job]] = await pool.query(
      'SELECT status, result_json FROM tpe_charge_jobs WHERE id = ?',
      [jobId]
    );
    if (!job || job.status === 'pending' || job.status === 'processing') continue;
    if (job.status === 'done' && job.result_json) {
      const result = JSON.parse(job.result_json);
      return res.json({
        ok: true,
        success: result.success,
        auth_number: result.authNumber || null,
        failure_code: result.failureCode || result.resultCode || null,
        failure_reason: result.failureReason || null,
        merchant_tx_id: merchantTxId
      });
    }
    return res.status(502).json({ error: 'Paiement impossible : ' + (job.result_json || 'le pont n\'a pas pu joindre le terminal') });
  }
  // Délai dépassé. Une demande que le pont n'a JAMAIS prise en charge est
  // annulée : sinon, si le pont revenait en ligne quelques secondes plus
  // tard, il enverrait quand même le montant au terminal - un paiement
  // "fantôme" que plus personne n'attend. Une demande déjà prise en charge
  // ('processing') n'est PAS touchée : le client est peut-être en train de
  // payer, on ne peut pas savoir.
  const [expired] = await pool.query(
    "UPDATE tpe_charge_jobs SET status = 'expired', updated_at = NOW() WHERE id = ? AND status = 'pending'",
    [jobId]
  );
  if (expired.affectedRows === 0) {
    return res.status(504).json({ error: 'Le terminal n\'a pas répondu à temps. VÉRIFIEZ SUR LE TERMINAL si le paiement est passé avant de recommencer, pour ne pas débiter le client deux fois.' });
  }
  return res.status(504).json({ error: 'Le terminal de paiement n\'a pas répondu à temps (pont hors ligne ?)' });
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
  // Un ticket ou une ouverture de tiroir déposé pendant que le pont était
  // éteint (nuit, PC redémarré) ne doit PAS s'exécuter au retour du pont :
  // le tiroir s'ouvrirait tout seul, et une pile de vieux tickets sortirait.
  // Tiroir : 2 min de validité. Tickets : 30 min.
  await pool.query(
    "UPDATE print_jobs SET status = 'expired', error = 'Expiré (pont hors ligne trop longtemps)' " +
    "WHERE salon_id = ? AND status = 'pending' AND " +
    "((mode = 'drawer' AND created_at < (NOW() - INTERVAL 2 MINUTE)) OR created_at < (NOW() - INTERVAL 30 MINUTE))",
    [req.salon.id]
  );
  const [jobs] = await pool.query(
    "SELECT id, text, mode FROM print_jobs WHERE salon_id = ? AND status = 'pending' ORDER BY created_at LIMIT 10",
    [req.salon.id]
  );
  res.json({ ok: true, jobs });
}));

/**
 * Le pont réclame les demandes de paiement CB en attente. Le pont
 * (tpe-bridge.js) n'appelle JAMAIS cette route s'il n'a pas d'IP de TPE
 * configurée localement (voir pollOnce : "if (!opts.tpe) return;") - un
 * appel ici est donc la preuve que le TPE est effectivement réglé côté
 * pont, ce que le serveur ne peut pas savoir autrement depuis qu'on ne
 * stocke plus cette IP côté dashboard.
 */
router.get('/bridge/charge-poll', requireBridgeKey, wrap(async (req, res) => {
  pool.query('UPDATE bridge_keys SET last_charge_poll_at = NOW() WHERE salon_id = ?', [req.salon.id]).catch(() => {});
  const [candidates] = await pool.query(
    "SELECT id, amount_cents FROM tpe_charge_jobs WHERE salon_id = ? AND status = 'pending' AND created_at > (NOW() - INTERVAL 2 MINUTE) ORDER BY created_at LIMIT 5",
    [req.salon.id]
  );
  // Prise en charge ATOMIQUE : chaque demande passe de 'pending' à
  // 'processing' et n'est livrée qu'au pont qui a réussi cette bascule.
  // Avant, elle restait 'pending' jusqu'au retour du pont : si ce retour
  // (charge-ack) se perdait - coupure réseau au mauvais moment - la même
  // demande était renvoyée au terminal 3 s plus tard, donc un second
  // débit possible pour un seul achat.
  const jobs = [];
  for (const c of candidates) {
    const [claim] = await pool.query(
      "UPDATE tpe_charge_jobs SET status = 'processing', updated_at = NOW() WHERE id = ? AND salon_id = ? AND status = 'pending'",
      [c.id, req.salon.id]
    );
    if (claim.affectedRows === 1) jobs.push(c);
  }
  res.json({ ok: true, jobs });
}));

/** Le pont rapporte le résultat d'une demande de paiement CB. */
router.post('/bridge/charge-ack', requireBridgeKey, wrap(async (req, res) => {
  const { job_id, result, error } = req.body;
  if (!job_id) return res.status(400).json({ error: 'job_id requis' });
  const status = result ? 'done' : 'failed';
  await pool.query(
    "UPDATE tpe_charge_jobs SET status = ?, result_json = ?, updated_at = NOW() WHERE id = ? AND salon_id = ? AND status IN ('pending', 'processing')",
    [status, result ? JSON.stringify(result) : (error ? String(error).slice(0, 500) : null), job_id, req.salon.id]
  );
  res.json({ ok: true });
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

/**
 * Statut de connexion du pont, pour l'affichage dans le dashboard (icônes
 * "TPE" / "Imprimante" avec pastille verte/rouge). "En ligne" = a donné
 * signe de vie (n'importe quel appel authentifié) il y a moins de 10 s -
 * le pont interroge le serveur toutes les 3 s, donc 10 s laisse une marge
 * confortable sans faire clignoter le statut pour une latence réseau normale.
 */
router.get('/bridge-status', requireAdminOrBarber, wrap(async (req, res) => {
  const [[row]] = await pool.query(
    'SELECT key_preview, created_at, last_seen_at, last_charge_poll_at FROM bridge_keys WHERE salon_id = ?',
    [req.salon.id]
  );
  // MySQL renvoie les dates en UTC sans fuseau ("2026-09-26 15:39:12") :
  // utcIso() les tague explicitement, sinon new Date() les lirait dans le
  // fuseau du serveur Node et décalerait le statut de 1-2 h selon la config.
  const toDate = (v) => (v ? new Date(utcIso(String(v))) : null);
  const lastSeenAt = row ? toDate(row.last_seen_at) : null;
  const lastTpeAt = row ? toDate(row.last_charge_poll_at) : null;
  const createdAt = row ? toDate(row.created_at) : null;
  const online = Boolean(lastSeenAt && (Date.now() - lastSeenAt.getTime()) < 10_000);
  const tpeOnline = Boolean(lastTpeAt && (Date.now() - lastTpeAt.getTime()) < 10_000);
  res.json({
    ok: true,
    configured: Boolean(row),
    // Début de la clé + date de création : permet d'afficher qu'une clé
    // existe déjà (la clé complète, elle, n'est visible qu'à sa génération).
    key_preview: row ? row.key_preview : null,
    key_created_at: createdAt ? createdAt.toISOString() : null,
    online,
    last_seen_at: lastSeenAt ? lastSeenAt.toISOString() : null,
    tpe_online: tpeOnline,
    tpe_last_seen_at: lastTpeAt ? lastTpeAt.toISOString() : null
  });
}));

module.exports = router;
