const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { hashPassword, verifyPassword } = require('../lib/password');
const { sendClientVerificationEmail, sendClientPasswordReset } = require('../lib/mailer');
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

/**
 * Authentifie le client via l'en-tête X-Client-Token (jeton opaque,
 * cf. client_sessions). Ne fait AUCUN lien avec l'auth admin/coiffeur -
 * espace totalement séparé.
 */
async function requireClient(req, res, next) {
  const token = req.headers['x-client-token'];
  if (!token) return res.status(401).json({ error: 'Non connecté' });
  const [[row]] = await pool.query(
    `SELECT c.* FROM client_sessions cs JOIN clients c ON c.id = cs.client_id
     WHERE cs.token = ? AND cs.expires_at > NOW()`,
    [token]
  );
  if (!row) return res.status(401).json({ error: 'Session expirée, reconnectez-vous' });
  req.clientAccount = row;
  next();
}

router.post('/signup', wrap(async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Nom, email et mot de passe requis' });
  if (password.length < 6) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Adresse email invalide' });

  const ownerId = req.salon.owner_id;
  const [[existing]] = await pool.query(
    'SELECT id FROM clients WHERE owner_id = ? AND email = ?', [ownerId, email]
  );
  if (existing) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });

  const passwordHash = await hashPassword(password);
  const verifyToken = crypto.randomBytes(32).toString('hex');
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO clients (id, owner_id, name, email, phone, password_hash, verify_token, verify_token_expires)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, ownerId, name, email, phone || null, passwordHash, verifyToken, verifyExpires]
  );

  try {
    const verifyUrl = String(req.body.base_url || '').replace(/\/$/, '') + '?verify=' + verifyToken;
    await sendClientVerificationEmail(req.salon.id, email, verifyUrl);
  } catch (err) {
    console.error('[client signup] envoi email échoué:', err.message);
  }

  res.json({ ok: true, needs_email_verification: true });
}));

router.post('/verify-email', wrap(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Lien invalide' });
  const [[client]] = await pool.query(
    'SELECT id FROM clients WHERE verify_token = ? AND verify_token_expires > NOW()', [token]
  );
  if (!client) return res.status(400).json({ error: 'Ce lien est invalide ou a expiré.' });
  await pool.query(
    'UPDATE clients SET email_verified = 1, verify_token = NULL, verify_token_expires = NULL WHERE id = ?',
    [client.id]
  );
  res.json({ ok: true });
}));

router.post('/resend-verification', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim();
  const genericMsg = "Si un compte existe avec cet email et n'est pas encore confirmé, un nouveau lien vient d'être envoyé.";
  if (!email) return res.json({ ok: true, message: genericMsg });
  try {
    const [[client]] = await pool.query(
      'SELECT id FROM clients WHERE owner_id = ? AND email = ? AND email_verified = 0', [req.salon.owner_id, email]
    );
    if (client) {
      const verifyToken = crypto.randomBytes(32).toString('hex');
      const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await pool.query('UPDATE clients SET verify_token = ?, verify_token_expires = ? WHERE id = ?', [verifyToken, verifyExpires, client.id]);
      const verifyUrl = String(req.body.base_url || '').replace(/\/$/, '') + '?verify=' + verifyToken;
      await sendClientVerificationEmail(req.salon.id, email, verifyUrl);
    }
  } catch (err) {
    console.error('[client resend-verification]', err.message);
  }
  res.json({ ok: true, message: genericMsg });
}));

router.post('/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  const [[client]] = await pool.query(
    'SELECT * FROM clients WHERE owner_id = ? AND email = ?', [req.salon.owner_id, email]
  );
  if (!client || !(await verifyPassword(password, client.password_hash))) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }
  if (!client.email_verified) {
    return res.status(403).json({ error: 'Confirmez votre email avant de vous connecter (lien envoyé à l\'inscription).', needs_email_verification: true });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 jours
  await pool.query(
    'INSERT INTO client_sessions (token, client_id, expires_at) VALUES (?, ?, ?)',
    [token, client.id, expiresAt]
  );
  res.json({ ok: true, token });
}));

router.post('/logout', requireClient, wrap(async (req, res) => {
  await pool.query('DELETE FROM client_sessions WHERE token = ?', [req.headers['x-client-token']]);
  res.json({ ok: true });
}));

router.post('/forgot-password', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim();
  const genericMsg = "Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé.";
  if (!email) return res.json({ ok: true, message: genericMsg });
  try {
    const [[client]] = await pool.query('SELECT id FROM clients WHERE owner_id = ? AND email = ?', [req.salon.owner_id, email]);
    if (client) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000);
      await pool.query('UPDATE clients SET reset_token = ?, reset_token_expires = ? WHERE id = ?', [token, expires, client.id]);
      const resetUrl = String(req.body.base_url || '').replace(/\/$/, '') + '?reset=' + token;
      await sendClientPasswordReset(req.salon.id, email, resetUrl);
    }
  } catch (err) {
    console.error('[client forgot-password]', err.message);
  }
  res.json({ ok: true, message: genericMsg });
}));

router.post('/reset-password', wrap(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Lien et mot de passe requis' });
  if (password.length < 6) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
  const [[client]] = await pool.query('SELECT id FROM clients WHERE reset_token = ? AND reset_token_expires > NOW()', [token]);
  if (!client) return res.status(400).json({ error: 'Ce lien est invalide ou a expiré. Refaites une demande.' });
  const passwordHash = await hashPassword(password);
  await pool.query('UPDATE clients SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?', [passwordHash, client.id]);
  res.json({ ok: true });
}));

/**
 * Profil + fidélité + dernière prestation. Le rapprochement avec
 * l'historique de passages se fait UNIQUEMENT via l'email du compte
 * (cf. clientKey() : email en priorité) - un client ayant réservé/payé
 * autrefois sous un email différent (ou en tant que passage sans-RDV
 * sans email) ne remontera pas ici, limite connue.
 */
router.get('/me', requireClient, wrap(async (req, res) => {
  const c = req.clientAccount;
  const key = clientKey({ email: c.email });

  const [[loyalty]] = await pool.query(
    'SELECT points, rewards_available FROM loyalty_accounts WHERE owner_id = ? AND client_key = ?',
    [c.owner_id, key]
  );

  const [[lastVisit]] = await pool.query(
    `SELECT q.checkin_at, q.status, s.name AS service_name, q.service_id, sl.slug AS salon_slug, sl.name AS salon_name
     FROM queue q
     JOIN salons sl ON sl.id = q.salon_id
     LEFT JOIN services s ON s.id = q.service_id
     WHERE sl.owner_id = ? AND LOWER(TRIM(q.email)) = ?
     ORDER BY q.checkin_at DESC LIMIT 1`,
    [c.owner_id, key]
  );

  res.json({
    ok: true,
    profile: { name: c.name, email: c.email, phone: c.phone },
    loyalty: loyalty || { points: 0, rewards_available: 0 },
    last_visit: lastVisit || null
  });
}));

router.put('/me', requireClient, wrap(async (req, res) => {
  const { name, email, new_password, current_password } = req.body;
  const sets = [];
  const params = [];

  if (name) { sets.push('name = ?'); params.push(name); }

  if (email && email !== req.clientAccount.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Adresse email invalide' });
    const [[existing]] = await pool.query(
      'SELECT id FROM clients WHERE owner_id = ? AND email = ? AND id != ?',
      [req.clientAccount.owner_id, email, req.clientAccount.id]
    );
    if (existing) return res.status(409).json({ error: 'Cet email est déjà utilisé par un autre compte' });
    sets.push('email = ?'); params.push(email);
  }

  if (new_password) {
    if (!current_password || !(await verifyPassword(current_password, req.clientAccount.password_hash))) {
      return res.status(403).json({ error: 'Mot de passe actuel incorrect' });
    }
    if (new_password.length < 6) return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
    sets.push('password_hash = ?'); params.push(await hashPassword(new_password));
  }

  if (!sets.length) return res.json({ ok: true });

  params.push(req.clientAccount.id);
  await pool.query(`UPDATE clients SET ${sets.join(', ')} WHERE id = ?`, params);
  res.json({ ok: true });
}));

module.exports = router;
