const express = require('express');
const crypto = require('crypto');
const { pool, utcIso, getOwnerSettings, setOwnerSettings } = require('../db');
const requireAdmin = require('../middleware/auth');
const requireAdminOrBarber = require('../middleware/barberAuth');
const { hashPassword } = require('../lib/password');
const { sendLoyaltyActivation, sendGiftConfirmation } = require('../lib/mailer');
const { clientKey } = require('../lib/queueMath');

const router = express.Router();

function wrap(fn) {
  return function (req, res) {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.message });
    });
  };
}

// --- Salons de la même enseigne (même propriétaire) ----------------------
router.get('/salons', requireAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, slug, is_default, active FROM salons WHERE owner_id = ? ORDER BY created_at',
    [req.ownerId]
  );
  res.json({ ok: true, items: rows });
}));

// Ajoute un salon à la même enseigne : hérite automatiquement du même
// mot de passe (le propriétaire), pas besoin d'en définir un nouveau.
router.post('/salons', requireAdmin, wrap(async (req, res) => {
  const { name, slug } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Nom et identifiant requis' });
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({
      error: "L'identifiant ne doit contenir que des lettres minuscules, chiffres et tirets"
    });
  }

  const [[existing]] = await pool.query('SELECT id FROM salons WHERE slug = ?', [slug]);
  if (existing) return res.status(409).json({ error: 'Cet identifiant est déjà utilisé' });

  const id = crypto.randomUUID();
  await pool.query(
    'INSERT INTO salons (id, owner_id, name, slug, admin_password) VALUES (?, ?, ?, ?, ?)',
    [id, req.ownerId, name, slug, req.salon.owner_admin_password || req.salon.admin_password || '']
  );

  // Catalogue de départ, comme pour le premier salon de l'enseigne.
  const services = [
    ['Coupe', 30, 2000, 1], ['Barbe', 15, 1200, 2],
    ['Coupe et barbe', 45, 2800, 3], ['Coupe enfant', 20, 1500, 4]
  ];
  const extras = [
    ['Shampooing', 5, 300, 1], ['Serviette chaude', 10, 800, 2],
    ['Contour / traçage', 5, 500, 3], ['Dégradé américain', 10, 500, 4],
    ['Coloration', 25, 2000, 5], ["Soin barbe à l'huile", 10, 1000, 6]
  ];
  const svcRows = services.map((s) => [crypto.randomUUID(), id, s[0], s[1], s[2], s[3]]);
  const extRows = extras.map((e) => [crypto.randomUUID(), id, e[0], e[1], e[2], e[3]]);

  await pool.query(
    'INSERT INTO services (id, salon_id, name, duration_min, price_cents, sort_order) VALUES ?',
    [svcRows]
  );
  await pool.query(
    'INSERT INTO extras (id, salon_id, name, duration_min, price_cents, sort_order) VALUES ?',
    [extRows]
  );

  const settingsRows = [
    [id, 'notify_before_min', '30'], [id, 'salon_name', name],
    [id, 'smtp_host', ''], [id, 'smtp_port', '587'],
    [id, 'smtp_user', ''], [id, 'smtp_pass', ''], [id, 'smtp_from', '']
  ];
  await pool.query('INSERT INTO settings (salon_id, `key`, value) VALUES ?', [settingsRows]);

  res.json({ ok: true, item: { id, name, slug } });
}));

router.put('/salons/:id', requireAdmin, wrap(async (req, res) => {
  const [[owned]] = await pool.query(
    'SELECT id FROM salons WHERE id = ? AND owner_id = ?', [req.params.id, req.ownerId]
  );
  if (!owned) return res.status(403).json({ error: "Ce salon n'appartient pas à votre enseigne" });

  const sets = [];
  const params = [];
  if (req.body.name !== undefined) { sets.push('name = ?'); params.push(req.body.name); }
  if (req.body.active !== undefined) { sets.push('active = ?'); params.push(req.body.active ? 1 : 0); }
  if (!sets.length) return res.json({ ok: true });
  params.push(req.params.id);
  await pool.query(`UPDATE salons SET ${sets.join(', ')} WHERE id = ?`, params);
  res.json({ ok: true });
}));

// Suppression définitive d'un salon de l'enseigne. Le salon par défaut
// (secours pour les pages ouvertes sans ?salon=...) ne peut jamais être
// supprimé, sinon les bornes déjà configurées sans ce paramètre casseraient.
// Les coiffeurs/prestations/suppléments/clients de ce salon disparaissent
// avec lui (cascade en base) — irréversible.
router.delete('/salons/:id', requireAdmin, wrap(async (req, res) => {
  const [[salon]] = await pool.query(
    'SELECT id, name, is_default FROM salons WHERE id = ? AND owner_id = ?',
    [req.params.id, req.ownerId]
  );
  if (!salon) return res.status(403).json({ error: "Ce salon n'appartient pas à votre enseigne" });
  if (salon.is_default) {
    return res.status(400).json({
      error: 'Ce salon est le salon par défaut, il ne peut pas être supprimé (utilisé quand aucun ?salon= n\'est précisé dans l\'URL).'
    });
  }

  const [[{ count }]] = await pool.query(
    'SELECT COUNT(*) AS count FROM salons WHERE owner_id = ?', [req.ownerId]
  );
  if (count <= 1) {
    return res.status(400).json({ error: 'Impossible de supprimer le seul salon de votre enseigne.' });
  }

  await pool.query('DELETE FROM salons WHERE id = ?', [req.params.id]);
  res.json({ ok: true, deleted: true, name: salon.name });
}));

// --- Coiffeurs de toute l'enseigne, avec leur salon -----------------------
router.get('/barbers', requireAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT b.id, b.name, b.active, b.salon_id, s.name AS salon_name
     FROM barbers b JOIN salons s ON s.id = b.salon_id
     WHERE s.owner_id = ? ORDER BY s.name, b.name`,
    [req.ownerId]
  );
  res.json({ ok: true, items: rows });
}));

// Réassigne un coiffeur à un autre salon de la MÊME enseigne uniquement.
router.put('/barbers/:id/salon', requireAdmin, wrap(async (req, res) => {
  const { salon_id } = req.body;
  if (!salon_id) return res.status(400).json({ error: 'salon_id requis' });

  const [[target]] = await pool.query(
    'SELECT id FROM salons WHERE id = ? AND owner_id = ?', [salon_id, req.ownerId]
  );
  if (!target) return res.status(403).json({ error: "Ce salon n'appartient pas à votre enseigne" });

  const [[barber]] = await pool.query(
    `SELECT b.id FROM barbers b JOIN salons s ON s.id = b.salon_id
     WHERE b.id = ? AND s.owner_id = ?`,
    [req.params.id, req.ownerId]
  );
  if (!barber) return res.status(404).json({ error: 'Coiffeur introuvable' });

  await pool.query('UPDATE barbers SET salon_id = ? WHERE id = ?', [salon_id, req.params.id]);
  res.json({ ok: true });
}));

// --- Clients : tous les salons de l'enseigne, ou un seul ------------------
router.get('/clients', requireAdmin, wrap(async (req, res) => {
  const salonFilter = req.query.salon; // absent ou 'all' => tous les salons

  let salonIds;
  if (!salonFilter || salonFilter === 'all') {
    const [rows] = await pool.query('SELECT id FROM salons WHERE owner_id = ?', [req.ownerId]);
    salonIds = rows.map((r) => r.id);
  } else {
    const [[owned]] = await pool.query(
      'SELECT id FROM salons WHERE id = ? AND owner_id = ?', [salonFilter, req.ownerId]
    );
    if (!owned) return res.status(403).json({ error: "Ce salon n'appartient pas à votre enseigne" });
    salonIds = [salonFilter];
  }

  if (salonIds.length === 0) return res.json({ ok: true, items: [] });

  const [rows] = await pool.query(
    `SELECT q.*, s.name AS service_name, sal.name AS salon_name
     FROM queue q
     LEFT JOIN services s ON s.id = q.service_id
     JOIN salons sal ON sal.id = q.salon_id
     WHERE q.salon_id IN (?)
     ORDER BY q.checkin_at DESC LIMIT 300`,
    [salonIds]
  );

  const items = rows.map((r) => Object.assign({}, r, {
    position: r.queue_position,
    checkin_at: utcIso(r.checkin_at),
    start_at: utcIso(r.start_at),
    end_at: utcIso(r.end_at)
  }));

  res.json({ ok: true, items });
}));

// Permet à un compte déjà connecté (même via l'ancien mot de passe partagé
// en clair) d'ajouter un email de récupération, pour pouvoir ensuite
// utiliser "mot de passe oublié". Ne change pas le mot de passe lui-même.
router.put('/email', requireAdmin, wrap(async (req, res) => {
  const email = String(req.body.email || '').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }

  const [[existing]] = await pool.query('SELECT id FROM owners WHERE email = ? AND id != ?', [email, req.ownerId]);
  if (existing) return res.status(409).json({ error: 'Un autre compte utilise déjà cet email' });

  await pool.query('UPDATE owners SET email = ? WHERE id = ?', [email, req.ownerId]);
  res.json({ ok: true });
}));

// Permet à un compte déjà connecté de changer SON PROPRE mot de passe
// (celui partagé par toute l'enseigne). requireAdmin ayant déjà vérifié
// l'accès, on ne redemande pas l'ancien mot de passe.
router.put('/password', requireAdmin, wrap(async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
  }
  const hash = await hashPassword(new_password);
  await pool.query('UPDATE owners SET password_hash = ? WHERE id = ?', [hash, req.ownerId]);
  res.json({ ok: true });
}));

const DEFAULT_MARKETING_SETTINGS = {
  loyalty_threshold: 10,
  loyalty_service_discount_pct: 50,
  loyalty_product_discount_pct: 20
};

/**
 * Réglages marketing (fidélité) — au niveau de l'ENSEIGNE, pas du
 * salon, cohérent avec le cumul des points partagé entre tous les
 * salons du même propriétaire.
 */
router.get('/marketing-settings', requireAdminOrBarber, wrap(async (req, res) => {
  const raw = await getOwnerSettings(req.ownerId);
  const out = {};
  Object.keys(DEFAULT_MARKETING_SETTINGS).forEach((k) => {
    out[k] = raw[k] !== undefined ? Number(raw[k]) : DEFAULT_MARKETING_SETTINGS[k];
  });
  res.json({ ok: true, settings: out });
}));

router.put('/marketing-settings', requireAdmin, wrap(async (req, res) => {
  const updates = {};
  Object.keys(DEFAULT_MARKETING_SETTINGS).forEach((k) => {
    if (req.body[k] !== undefined) updates[k] = Number(req.body[k]);
  });

  if (Object.values(updates).some((n) => !Number.isFinite(n))) {
    return res.status(400).json({ error: 'Valeur invalide' });
  }
  if (updates.loyalty_threshold !== undefined && updates.loyalty_threshold < 1) {
    return res.status(400).json({ error: 'Le seuil doit être au moins 1 passage' });
  }
  for (const k of ['loyalty_service_discount_pct', 'loyalty_product_discount_pct']) {
    if (updates[k] !== undefined && (updates[k] < 0 || updates[k] > 100)) {
      return res.status(400).json({ error: 'Le pourcentage doit être entre 0 et 100' });
    }
  }

  await setOwnerSettings(req.ownerId, updates);
  res.json({ ok: true });
}));

/**
 * Historique des cadeaux vendus dans CE salon (achat, utilisation,
 * bénéficiaire, contenu) — vue admin uniquement.
 */
router.get('/gift-cards', requireAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM gift_cards WHERE salon_id = ? ORDER BY created_at DESC LIMIT 300',
    [req.salon.id]
  );
  res.json({
    ok: true,
    items: rows.map((g) => {
      let items = [];
      try { items = JSON.parse(g.items_json || '[]'); } catch (e) { items = []; }
      return {
        id: g.id,
        recipient_name: g.recipient_name,
        recipient_email: g.recipient_email,
        recipient_phone: g.recipient_phone,
        amount_cents: g.amount_cents,
        items,
        code: g.code,
        used_at: g.used_at ? utcIso(g.used_at) : null,
        created_at: utcIso(g.created_at)
      };
    })
  });
}));

/**
 * Renvoie l'email de confirmation d'un cadeau (avec son code) — filet
 * de sécurité en cas de souci d'envoi (spam, mauvaise adresse
 * corrigée depuis, etc.). Inutile pour un cadeau déjà utilisé.
 */
router.post('/gift-cards/:id/resend', requireAdmin, wrap(async (req, res) => {
  const [[gift]] = await pool.query(
    'SELECT * FROM gift_cards WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!gift) return res.status(404).json({ error: 'Cadeau introuvable' });
  if (gift.used_at) return res.status(409).json({ error: 'Ce cadeau a déjà été utilisé' });

  let giftItems = [];
  try { giftItems = JSON.parse(gift.items_json || '[]'); } catch (e) { giftItems = []; }

  try {
    await sendGiftConfirmation(req.salon.id, gift.recipient_email, {
      recipientName: gift.recipient_name,
      amountEur: (gift.amount_cents / 100).toFixed(2).replace('.', ',') + ' €',
      items: giftItems,
      code: gift.code
    });
  } catch (err) {
    return res.status(502).json({ error: "Échec de l'envoi — vérifiez la configuration SMTP du salon (Réglages)." });
  }

  res.json({ ok: true });
}));

/**
 * Comptes fidélité de cette ENSEIGNE (tous salons confondus) — vue
 * admin, pour voir qui a combien de points/récompenses en attente.
 */
router.get('/loyalty-accounts', requireAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT client_name, client_key, points, rewards_available, activated_at, updated_at FROM loyalty_accounts ' +
    'WHERE owner_id = ? AND activated_at IS NOT NULL ORDER BY updated_at DESC LIMIT 300',
    [req.ownerId]
  );
  res.json({
    ok: true,
    items: rows.map((r) => Object.assign({}, r, {
      activated_at: utcIso(r.activated_at),
      updated_at: utcIso(r.updated_at)
    }))
  });
}));

/**
 * Active la carte de fidélité d'un client — SEULEMENT sur demande
 * explicite du coiffeur (qui a demandé l'accord du client). Tant que
 * ce n'est pas fait, ce client n'accumule jamais le moindre point,
 * même s'il revient plusieurs fois. Email obligatoire pour envoyer la
 * confirmation. Accessible aux coiffeurs par PIN (activation depuis la
 * caisse), pas seulement l'admin.
 */
router.post('/loyalty-accounts/activate', requireAdminOrBarber, wrap(async (req, res) => {
  const clientName = String(req.body.client_name || '').trim();
  const email = String(req.body.client_email || '').trim();
  const phone = String(req.body.client_phone || '').trim();
  if (!clientName) return res.status(400).json({ error: 'Le nom du client est requis' });
  if (!email) return res.status(400).json({ error: "L'email du client est requis pour activer sa carte" });

  const key = clientKey({ email, phone, client_name: clientName });
  if (!key) return res.status(400).json({ error: 'Impossible d\'identifier ce client' });

  const [[existing]] = await pool.query(
    'SELECT id, activated_at FROM loyalty_accounts WHERE owner_id = ? AND client_key = ?',
    [req.ownerId, key]
  );
  if (existing && existing.activated_at) {
    return res.status(409).json({ error: 'Ce client a déjà une carte de fidélité active' });
  }

  if (existing) {
    await pool.query(
      'UPDATE loyalty_accounts SET activated_at = NOW(), recipient_email = ?, client_name = ? WHERE id = ?',
      [email, clientName, existing.id]
    );
  } else {
    try {
      await pool.query(
        `INSERT INTO loyalty_accounts (id, owner_id, client_key, client_name, recipient_email, activated_at)
         VALUES (UUID(), ?, ?, ?, ?, NOW())`,
        [req.ownerId, key, clientName, email]
      );
    } catch (err) {
      // Deux activations envoyées au même instant (double clic) peuvent
      // toutes les deux passer la vérification ci-dessus avant qu'aucune
      // n'ait encore inséré sa ligne — la contrainte d'unicité sur
      // (owner_id, client_key) fait échouer la seconde avec ce code
      // d'erreur précis, qu'on transforme en refus propre plutôt qu'une
      // erreur serveur générique.
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Ce client a déjà une carte de fidélité active' });
      }
      throw err;
    }
  }

  try {
    const settings = await getOwnerSettings(req.ownerId);
    const threshold = Math.max(1, Number(settings.loyalty_threshold) || 10);
    await sendLoyaltyActivation(req.salon.id, email, { clientName, threshold });
  } catch (err) {
    console.error('[fidélité] envoi email d\'activation échoué:', err.message);
  }

  res.json({ ok: true });
}));

/**
 * Statut marketing (fidélité + cadeaux non utilisés) d'un client
 * précis, identifié par ses coordonnées — pour le tiroir "fiche
 * client" du dashboard admin.
 */
router.get('/client-marketing', requireAdmin, wrap(async (req, res) => {
  const email = String(req.query.email || '').trim();
  const phone = String(req.query.phone || '').trim();
  const name = String(req.query.name || '').trim();
  const key = clientKey({ email, phone, client_name: name });
  if (!key) return res.json({ ok: true, loyalty: null, gifts: [] });

  const [[loyalty]] = await pool.query(
    'SELECT points, rewards_available, activated_at FROM loyalty_accounts WHERE owner_id = ? AND client_key = ?',
    [req.ownerId, key]
  );

  const [allGifts] = await pool.query(
    'SELECT id, recipient_name, recipient_phone, recipient_email, amount_cents, items_json, used_at, created_at ' +
    'FROM gift_cards WHERE salon_id = ? ORDER BY created_at DESC',
    [req.salon.id]
  );
  const relevantGifts = allGifts.filter((g) => {
    const gKey = clientKey({ email: g.recipient_email, phone: g.recipient_phone, client_name: g.recipient_name });
    return gKey === key;
  }).map((g) => {
    let items = [];
    try { items = JSON.parse(g.items_json || '[]'); } catch (e) { items = []; }
    return {
      id: g.id,
      amount_cents: g.amount_cents,
      items,
      used_at: g.used_at ? utcIso(g.used_at) : null,
      created_at: utcIso(g.created_at)
    };
  });

  res.json({
    ok: true,
    loyalty: loyalty ? {
      points: loyalty.points,
      rewards_available: loyalty.rewards_available,
      activated: Boolean(loyalty.activated_at)
    } : null,
    gifts: relevantGifts
  });
}));

/**
 * Periode de caisse actuellement OUVERTE (depuis la derniere cloture,
 * ou depuis le debut si jamais cloture) - total, nombre de ventes,
 * detail par mode de paiement, detail par coiffeur.
 */
router.get('/caisse/current-period', requireAdmin, wrap(async (req, res) => {
  const [[lastClosing]] = await pool.query(
    'SELECT period_end FROM cash_closings WHERE salon_id = ? ORDER BY period_end DESC LIMIT 1',
    [req.salon.id]
  );
  const periodStart = lastClosing ? lastClosing.period_end : null;

  const [sales] = await pool.query(
    periodStart
      ? 'SELECT s.*, b.name AS barber_name FROM sales s LEFT JOIN barbers b ON b.id = s.barber_id WHERE s.salon_id = ? AND s.created_at > ? ORDER BY s.created_at DESC'
      : 'SELECT s.*, b.name AS barber_name FROM sales s LEFT JOIN barbers b ON b.id = s.barber_id WHERE s.salon_id = ? ORDER BY s.created_at DESC',
    periodStart ? [req.salon.id, periodStart] : [req.salon.id]
  );

  const byMethod = {};
  const byBarber = {};
  let total = 0;
  sales.forEach((s) => {
    total += s.total_price_cents;
    byMethod[s.payment_method] = (byMethod[s.payment_method] || 0) + s.total_price_cents;
    const bName = s.barber_name || 'Non assigné';
    if (!byBarber[bName]) byBarber[bName] = { total_cents: 0, count: 0 };
    byBarber[bName].total_cents += s.total_price_cents;
    byBarber[bName].count += 1;
  });

  res.json({
    ok: true,
    period_start: periodStart ? utcIso(periodStart) : null,
    total_cents: total,
    sales_count: sales.length,
    by_method: byMethod,
    by_barber: byBarber
  });
}));

/**
 * Cloture la periode ouverte actuelle - fige les chiffres dans
 * cash_closings. Admin uniquement (jamais accessible depuis la caisse
 * elle-meme, authentifiee par PIN coiffeur).
 */
router.post('/caisse/close', requireAdmin, wrap(async (req, res) => {
  const [[lastClosing]] = await pool.query(
    'SELECT period_end FROM cash_closings WHERE salon_id = ? ORDER BY period_end DESC LIMIT 1',
    [req.salon.id]
  );
  const periodStart = lastClosing ? lastClosing.period_end : null;

  const [sales] = await pool.query(
    periodStart
      ? 'SELECT payment_method, total_price_cents FROM sales WHERE salon_id = ? AND created_at > ?'
      : 'SELECT payment_method, total_price_cents FROM sales WHERE salon_id = ?',
    periodStart ? [req.salon.id, periodStart] : [req.salon.id]
  );

  if (sales.length === 0) {
    return res.status(400).json({ error: 'Aucune vente à clôturer sur cette période.' });
  }

  const byMethod = {};
  let total = 0;
  sales.forEach((s) => {
    total += s.total_price_cents;
    byMethod[s.payment_method] = (byMethod[s.payment_method] || 0) + s.total_price_cents;
  });

  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO cash_closings (id, salon_id, period_start, period_end, total_cents, sales_count, breakdown_json)
     VALUES (?, ?, ?, NOW(), ?, ?, ?)`,
    [id, req.salon.id, periodStart, total, sales.length, JSON.stringify(byMethod)]
  );

  res.json({ ok: true, id, total_cents: total, sales_count: sales.length });
}));

/**
 * Historique des clotures precedentes.
 */
router.get('/caisse/closings', requireAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM cash_closings WHERE salon_id = ? ORDER BY period_end DESC LIMIT 100',
    [req.salon.id]
  );
  res.json({
    ok: true,
    items: rows.map((r) => {
      let breakdown = {};
      try { breakdown = JSON.parse(r.breakdown_json || '{}'); } catch (e) { breakdown = {}; }
      return {
        id: r.id,
        period_start: r.period_start ? utcIso(r.period_start) : null,
        period_end: utcIso(r.period_end),
        total_cents: r.total_cents,
        sales_count: r.sales_count,
        breakdown
      };
    })
  });
}));

module.exports = router;
