const express = require('express');
const crypto = require('crypto');
const { pool, getPlatformSettings, setPlatformSettings } = require('../db');
const { sendTestEmail, sendVerificationEmail, invalidateTransport } = require('../lib/platformMailer');
const { hashPassword } = require('../lib/password');
const { createToken } = require('../lib/impersonation');
const { loginRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

function wrap(fn) {
  return function (req, res) {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.message });
    });
  };
}

function requireSuperAdmin(req, res, next) {
  const expected = (process.env.SUPER_ADMIN_PASSWORD || '').replace(/[\r\n]+$/, '').trim();
  if (!expected) return res.status(500).json({ error: 'SUPER_ADMIN_PASSWORD non défini côté serveur' });
  const given = req.get('X-Super-Admin-Password') || req.query.pw;
  if (given !== expected) return res.status(401).json({ error: 'Mot de passe incorrect' });
  next();
}

router.post('/login', loginRateLimiter('super-admin-login'), wrap(async (req, res) => {
  const expected = (process.env.SUPER_ADMIN_PASSWORD || '').replace(/[\r\n]+$/, '').trim();
  if (!expected) return res.status(500).json({ error: 'SUPER_ADMIN_PASSWORD non défini côté serveur' });
  if ((req.body.password || '') !== expected) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  res.json({ ok: true });
}));

router.get('/salons', requireSuperAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, slug, is_default, active, created_at FROM salons ORDER BY created_at'
  );
  res.json({ ok: true, items: rows });
}));

router.post('/salons', requireSuperAdmin, wrap(async (req, res) => {
  const { name, slug, admin_password } = req.body;
  const email = String(req.body.email || '').trim();
  if (!name || !slug || !admin_password) {
    return res.status(400).json({ error: 'Nom, identifiant et mot de passe requis' });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({
      error: "L'identifiant ne doit contenir que des lettres minuscules, chiffres et tirets"
    });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }

  const [[existing]] = await pool.query('SELECT id FROM salons WHERE slug = ?', [slug]);
  if (existing) return res.status(409).json({ error: 'Cet identifiant est déjà utilisé' });

  if (email) {
    const [[existingEmail]] = await pool.query('SELECT id FROM owners WHERE email = ?', [email]);
    if (existingEmail) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
  }

  // Email renseigné : le client valide son adresse comme pour une
  // auto-inscription, et pourra aussi se connecter par email ensuite
  // (mot de passe haché en plus du mot de passe partagé en clair).
  const ownerId = crypto.randomUUID();
  let verifyToken = null;
  if (email) {
    const passwordHash = await hashPassword(admin_password);
    verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO owners (id, name, email, admin_password, password_hash, verify_token, verify_token_expires)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ownerId, name, email, admin_password, passwordHash, verifyToken, verifyExpires]
    );
  } else {
    await pool.query(
      'INSERT INTO owners (id, name, admin_password) VALUES (?, ?, ?)',
      [ownerId, name, admin_password]
    );
  }

  const id = crypto.randomUUID();
  await pool.query(
    'INSERT INTO salons (id, owner_id, name, slug, admin_password) VALUES (?, ?, ?, ?, ?)',
    [id, ownerId, name, slug, admin_password]
  );

  // Catalogue de départ, comme pour le tout premier salon — sinon la
  // borne n'a ni prestation ni supplément à proposer.
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
    [id, 'notify_before_min', '30'],
    [id, 'salon_name', name],
    [id, 'smtp_host', ''],
    [id, 'smtp_port', '587'],
    [id, 'smtp_user', ''],
    [id, 'smtp_pass', ''],
    [id, 'smtp_from', '']
  ];
  await pool.query('INSERT INTO settings (salon_id, `key`, value) VALUES ?', [settingsRows]);

  if (email && verifyToken) {
    try {
      const verifyUrl = String(req.body.base_url || '').replace(/\/$/, '') + '/verify-email.html?token=' + verifyToken;
      await sendVerificationEmail(email, verifyUrl);
    } catch (err) {
      // N'empêche jamais la création du compte si l'envoi échoue.
      console.error('[super-admin création enseigne] envoi email de vérification échoué:', err.message);
    }
  }

  res.json({ ok: true, item: { id, name, slug }, email_sent: Boolean(email && verifyToken) });
}));

router.put('/salons/:id', requireSuperAdmin, wrap(async (req, res) => {
  const sets = [];
  const params = [];
  if (req.body.name !== undefined) { sets.push('name = ?'); params.push(req.body.name); }
  if (req.body.active !== undefined) { sets.push('active = ?'); params.push(req.body.active ? 1 : 0); }
  if (sets.length) {
    params.push(req.params.id);
    await pool.query(`UPDATE salons SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  if (req.body.admin_password) {
    const [[salon]] = await pool.query('SELECT owner_id FROM salons WHERE id = ?', [req.params.id]);
    if (!salon) return res.status(404).json({ error: 'Salon introuvable' });
    await pool.query('UPDATE owners SET admin_password = ? WHERE id = ?', [req.body.admin_password, salon.owner_id]);
  }

  res.json({ ok: true });
}));

/**
 * Vue d'ensemble de la plateforme : quelques chiffres clés.
 */
router.get('/overview', requireSuperAdmin, wrap(async (req, res) => {
  const [[owners]] = await pool.query('SELECT COUNT(*) AS n FROM owners');
  const [[salons]] = await pool.query('SELECT COUNT(*) AS n FROM salons WHERE active = 1');
  const [[barbersRow]] = await pool.query('SELECT COUNT(*) AS n FROM barbers WHERE active = 1');
  const [[today]] = await pool.query(
    "SELECT COUNT(*) AS n FROM queue WHERE status = 'done' AND end_at >= CURDATE()"
  );
  const [[week]] = await pool.query(
    "SELECT COUNT(*) AS n FROM queue WHERE status = 'done' AND end_at >= (CURDATE() - INTERVAL 7 DAY)"
  );
  const [[signups]] = await pool.query(
    'SELECT COUNT(*) AS n FROM owners WHERE created_at >= (NOW() - INTERVAL 30 DAY)'
  );

  res.json({
    ok: true,
    owners_count: owners.n,
    salons_count: salons.n,
    barbers_count: barbersRow.n,
    clients_today: today.n,
    clients_week: week.n,
    signups_last_30d: signups.n
  });
}));

/**
 * Enseignes (propriétaires) avec leurs salons regroupés dessous — la
 * vraie unité de gestion pour la plateforme, plutôt que des salons isolés.
 */
router.get('/owners', requireSuperAdmin, wrap(async (req, res) => {
  const [owners] = await pool.query(
    'SELECT id, name, email, active, created_at FROM owners ORDER BY created_at DESC'
  );
  const [salons] = await pool.query('SELECT id, owner_id, name, slug, is_default, active FROM salons');

  const items = owners.map((o) => Object.assign({}, o, {
    salons: salons.filter((s) => s.owner_id === o.id)
  }));

  res.json({ ok: true, items });
}));

router.put('/owners/:id', requireSuperAdmin, wrap(async (req, res) => {
  const sets = [];
  const params = [];
  if (req.body.name !== undefined) { sets.push('name = ?'); params.push(req.body.name); }
  if (req.body.active !== undefined) { sets.push('active = ?'); params.push(req.body.active ? 1 : 0); }
  if (!sets.length) return res.json({ ok: true });
  params.push(req.params.id);
  await pool.query(`UPDATE owners SET ${sets.join(', ')} WHERE id = ?`, params);
  res.json({ ok: true });
}));

// Réinitialise le mot de passe d'une enseigne (super admin). Efface aussi
// le hash existant si l'enseigne s'était inscrite par email — sinon
// l'ancien mot de passe hashé resterait prioritaire et le nouveau mot de
// passe en clair n'aurait aucun effet.
router.put('/owners/:id/password', requireSuperAdmin, wrap(async (req, res) => {
  const { admin_password } = req.body;
  if (!admin_password) return res.status(400).json({ error: 'Mot de passe requis' });
  await pool.query(
    'UPDATE owners SET admin_password = ?, password_hash = NULL WHERE id = ?',
    [admin_password, req.params.id]
  );
  res.json({ ok: true });
}));

// Suppression définitive d'une enseigne entière (RGPD, résiliation...).
// Cascade en base : tous ses salons, coiffeurs, prestations, clients
// disparaissent avec elle.
router.delete('/owners/:id', requireSuperAdmin, wrap(async (req, res) => {
  await pool.query('DELETE FROM owners WHERE id = ?', [req.params.id]);
  res.json({ ok: true, deleted: true });
}));

/**
 * Configuration SMTP de la plateforme, modifiable depuis le dashboard
 * super admin plutôt que par variables d'environnement uniquement.
 */
router.get('/smtp', requireSuperAdmin, wrap(async (req, res) => {
  const s = await getPlatformSettings();
  res.json({
    ok: true,
    settings: {
      smtp_host: s.smtp_host || '',
      smtp_port: s.smtp_port || '587',
      smtp_user: s.smtp_user || '',
      smtp_from: s.smtp_from || ''
    },
    smtp_pass_set: Boolean(s.smtp_pass)
  });
}));

router.put('/smtp', requireSuperAdmin, wrap(async (req, res) => {
  const patch = {};
  ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from'].forEach((k) => {
    if (req.body[k] !== undefined && req.body[k] !== null) patch[k] = req.body[k];
  });
  // Champ mot de passe laissé vide = on conserve l'ancien
  if (patch.smtp_pass === '') delete patch.smtp_pass;

  // Un expéditeur sans adresse email valide (ex: juste "Barber Pass") est
  // un en-tête From invalide : Hostinger le laisse passer en interne avec
  // un affichage cassé, mais Gmail et consorts rejettent silencieusement
  // le message (SPF/DKIM ne peuvent rien vérifier). On corrige
  // automatiquement en y accolant l'email authentifié.
  if (patch.smtp_from && !patch.smtp_from.includes('@')) {
    const existing = await getPlatformSettings();
    const email = patch.smtp_user || existing.smtp_user;
    if (email) patch.smtp_from = `${patch.smtp_from} <${email}>`;
  }

  await setPlatformSettings(patch);
  invalidateTransport();
  res.json({ ok: true, smtp_from: patch.smtp_from });
}));

router.post('/test-email', requireSuperAdmin, wrap(async (req, res) => {
  const to = req.body.to;
  if (!to) return res.status(400).json({ error: 'Adresse de destination requise' });
  try {
    await sendTestEmail(to);
    res.json({ ok: true, sent: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

/**
 * Journal d'activité — dérivé des dates de création déjà en base plutôt
 * qu'une table d'audit dédiée, pour rester simple : inscriptions et
 * créations de salon, les deux évènements les plus significatifs.
 */
router.get('/activity', requireSuperAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT 'signup' AS type, name AS label, created_at FROM owners
    UNION ALL
    SELECT 'salon_created' AS type, name AS label, created_at FROM salons
    ORDER BY created_at DESC LIMIT 50
  `);
  res.json({ ok: true, items: rows });
}));

/**
 * Assistance : ouvre un accès temporaire (10 min) à un salon donné, sans
 * connaître son mot de passe — pour dépanner une enseigne cliente.
 */
router.post('/impersonate', requireSuperAdmin, wrap(async (req, res) => {
  const { salon_id } = req.body;
  if (!salon_id) return res.status(400).json({ error: 'salon_id requis' });

  const [[salon]] = await pool.query('SELECT id, slug, owner_id FROM salons WHERE id = ?', [salon_id]);
  if (!salon) return res.status(404).json({ error: 'Salon introuvable' });

  const token = createToken(salon.owner_id);
  res.json({ ok: true, token, slug: salon.slug });
}));

/**
 * Vue d'ensemble de l'assistant IA pour toute l'enseigne (tous les
 * salons) - permet au super admin de voir l'usage réel avant de
 * décider s'il doit "recharger" de son côté (plus de crédits gratuits,
 * infrastructure IA plus grosse, etc).
 */
router.get('/ai-chat/overview', requireSuperAdmin, wrap(async (req, res) => {
  const month = new Date().toISOString().slice(0, 7);
  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.slug,
            COALESCE(c.ai_enabled, 1) AS ai_enabled,
            COALESCE(c.unlimited, 0) AS unlimited,
            COALESCE(c.monthly_credit_limit, 10) AS monthly_credit_limit,
            CASE WHEN c.period_month = ? THEN c.credits_remaining ELSE COALESCE(c.monthly_credit_limit, 10) END AS credits_remaining,
            CASE WHEN c.period_month = ? THEN COALESCE(c.questions_used_this_month, 0) ELSE 0 END AS questions_used_this_month
     FROM salons s
     LEFT JOIN ai_chat_credits c ON c.salon_id = s.id
     WHERE s.active = 1
     ORDER BY s.name`,
    [month, month]
  );

  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    ai_enabled: Boolean(r.ai_enabled),
    unlimited: Boolean(r.unlimited),
    monthly_credit_limit: r.monthly_credit_limit,
    credits_remaining: r.credits_remaining,
    questions_used_this_month: r.questions_used_this_month
  }));

  const totals = {
    salons_count: items.length,
    salons_enabled: items.filter((x) => x.ai_enabled).length,
    salons_unlimited: items.filter((x) => x.unlimited).length,
    total_questions_used_this_month: items.reduce((a, x) => a + x.questions_used_this_month, 0),
    total_credits_allocated_this_month: items.reduce((a, x) => a + (x.unlimited ? 0 : x.monthly_credit_limit), 0)
  };

  res.json({ ok: true, items, totals, period_month: month });
}));

/**
 * Active/désactive l'IA pour un salon précis, change sa limite
 * mensuelle de crédits gratuits, et/ou le passe en gratuit/illimité -
 * crée la ligne si elle n'existe pas encore (salon qui n'a jamais
 * utilisé le chat).
 */
router.put('/ai-chat/:salonId', requireSuperAdmin, wrap(async (req, res) => {
  const salonId = req.params.salonId;
  const [[salon]] = await pool.query('SELECT id FROM salons WHERE id = ?', [salonId]);
  if (!salon) return res.status(404).json({ error: 'Salon introuvable' });

  const aiEnabled = req.body.ai_enabled !== undefined ? (req.body.ai_enabled ? 1 : 0) : null;
  const unlimited = req.body.unlimited !== undefined ? (req.body.unlimited ? 1 : 0) : null;
  const monthlyLimit = req.body.monthly_credit_limit !== undefined ? Math.max(0, Number(req.body.monthly_credit_limit) || 0) : null;
  const month = new Date().toISOString().slice(0, 7);

  const [[existing]] = await pool.query('SELECT * FROM ai_chat_credits WHERE salon_id = ?', [salonId]);

  if (!existing) {
    await pool.query(
      'INSERT INTO ai_chat_credits (salon_id, credits_remaining, period_month, ai_enabled, monthly_credit_limit, unlimited) VALUES (?, ?, ?, ?, ?, ?)',
      [salonId, monthlyLimit != null ? monthlyLimit : 10, month, aiEnabled != null ? aiEnabled : 1, monthlyLimit != null ? monthlyLimit : 10, unlimited != null ? unlimited : 0]
    );
  } else {
    const sets = [];
    const params = [];
    if (aiEnabled != null) { sets.push('ai_enabled = ?'); params.push(aiEnabled); }
    if (unlimited != null) { sets.push('unlimited = ?'); params.push(unlimited); }
    if (monthlyLimit != null) { sets.push('monthly_credit_limit = ?'); params.push(monthlyLimit); }
    if (sets.length) {
      params.push(salonId);
      await pool.query('UPDATE ai_chat_credits SET ' + sets.join(', ') + ' WHERE salon_id = ?', params);
    }
  }

  res.json({ ok: true });
}));

/**
 * Applique "gratuit/illimité" (ou le retire) à TOUTES les enseignes
 * actives en une seule fois - crée la ligne pour les salons qui n'ont
 * encore jamais utilisé le chat.
 */
router.put('/ai-chat-global/unlimited', requireSuperAdmin, wrap(async (req, res) => {
  const unlimited = req.body.unlimited ? 1 : 0;
  const month = new Date().toISOString().slice(0, 7);

  const [salonRows] = await pool.query('SELECT id FROM salons WHERE active = 1');
  for (const s of salonRows) {
    await pool.query(
      `INSERT INTO ai_chat_credits (salon_id, credits_remaining, period_month, ai_enabled, monthly_credit_limit, unlimited)
       VALUES (?, 10, ?, 1, 10, ?)
       ON DUPLICATE KEY UPDATE unlimited = VALUES(unlimited)`,
      [s.id, month, unlimited]
    );
  }

  res.json({ ok: true, salons_updated: salonRows.length, unlimited: Boolean(unlimited) });
}));

/**
 * Active/désactive l'assistant IA pour TOUTES les enseignes actives
 * en une seule fois - même principe que l'action groupée sur
 * "gratuit/illimité".
 */
router.put('/ai-chat-global/enabled', requireSuperAdmin, wrap(async (req, res) => {
  const enabled = req.body.ai_enabled ? 1 : 0;
  const month = new Date().toISOString().slice(0, 7);

  const [salonRows] = await pool.query('SELECT id FROM salons WHERE active = 1');
  for (const s of salonRows) {
    await pool.query(
      `INSERT INTO ai_chat_credits (salon_id, credits_remaining, period_month, ai_enabled, monthly_credit_limit, unlimited)
       VALUES (?, 10, ?, ?, 10, 0)
       ON DUPLICATE KEY UPDATE ai_enabled = VALUES(ai_enabled)`,
      [s.id, month, enabled]
    );
  }

  res.json({ ok: true, salons_updated: salonRows.length, ai_enabled: Boolean(enabled) });
}));

/**
 * Remet immédiatement les crédits d'un salon précis à sa limite
 * mensuelle (sans attendre le changement de mois) - utile après
 * avoir dépanné un salon, ou pour lui offrir un nouveau quota tout de
 * suite.
 */
router.put('/ai-chat/:salonId/reset-credits', requireSuperAdmin, wrap(async (req, res) => {
  const salonId = req.params.salonId;
  const [[salon]] = await pool.query('SELECT id FROM salons WHERE id = ?', [salonId]);
  if (!salon) return res.status(404).json({ error: 'Salon introuvable' });

  const month = new Date().toISOString().slice(0, 7);
  const [[existing]] = await pool.query('SELECT * FROM ai_chat_credits WHERE salon_id = ?', [salonId]);

  if (!existing) {
    await pool.query(
      'INSERT INTO ai_chat_credits (salon_id, credits_remaining, period_month, ai_enabled, monthly_credit_limit) VALUES (?, 10, ?, 1, 10)',
      [salonId, month]
    );
  } else {
    await pool.query(
      'UPDATE ai_chat_credits SET credits_remaining = monthly_credit_limit, period_month = ?, questions_used_this_month = 0 WHERE salon_id = ?',
      [month, salonId]
    );
  }

  res.json({ ok: true });
}));

/**
 * Même réinitialisation immédiate des crédits, mais pour TOUTES les
 * enseignes actives en une seule fois.
 */
router.put('/ai-chat-global/reset-credits', requireSuperAdmin, wrap(async (req, res) => {
  const month = new Date().toISOString().slice(0, 7);
  const [salonRows] = await pool.query('SELECT id FROM salons WHERE active = 1');

  for (const s of salonRows) {
    await pool.query(
      `INSERT INTO ai_chat_credits (salon_id, credits_remaining, period_month, ai_enabled, monthly_credit_limit)
       VALUES (?, 10, ?, 1, 10)
       ON DUPLICATE KEY UPDATE credits_remaining = monthly_credit_limit, period_month = VALUES(period_month), questions_used_this_month = 0`,
      [s.id, month]
    );
  }

  res.json({ ok: true, salons_updated: salonRows.length });
}));

/**
 * Gestion des clés d'API d'automatisation (n8n, projets futurs...) -
 * jamais la valeur en clair renvoyée après création : seule
 * l'empreinte (indirectement, via key_preview) permet de les
 * distinguer ensuite.
 */
router.get('/api-keys', requireSuperAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, key_preview, created_at, revoked_at, last_used_at FROM api_keys ORDER BY created_at DESC'
  );
  res.json({ ok: true, items: rows });
}));

router.post('/api-keys', requireSuperAdmin, wrap(async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nom requis (ex: "Projet X")' });

  const plainKey = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(plainKey).digest('hex');
  const preview = plainKey.slice(0, 8) + '...';
  const id = crypto.randomUUID();

  await pool.query(
    'INSERT INTO api_keys (id, name, key_hash, key_preview) VALUES (?, ?, ?, ?)',
    [id, name, hash, preview]
  );

  // Seule fois où la vraie clé est renvoyée - jamais récupérable
  // après cette réponse.
  res.json({ ok: true, id, key: plainKey });
}));

router.put('/api-keys/:id/revoke', requireSuperAdmin, wrap(async (req, res) => {
  const [[key]] = await pool.query('SELECT id FROM api_keys WHERE id = ?', [req.params.id]);
  if (!key) return res.status(404).json({ error: 'Clé introuvable' });

  await pool.query('UPDATE api_keys SET revoked_at = NOW() WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
