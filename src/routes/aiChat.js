const express = require('express');
const { pool } = require('../db');
const requireAdmin = require('../middleware/auth');

const router = express.Router();

const FREE_CREDITS_PER_MONTH = 100;
const N8N_CHAT_WEBHOOK_URL = process.env.N8N_CHAT_WEBHOOK_URL;

function wrap(fn) {
  return function (req, res) {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.message });
    });
  };
}

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

/**
 * Lit (et remet à zéro si on a changé de mois) les crédits d'un
 * salon. Le reset se fait "à la volée" à la première question du
 * mois plutôt que par une tâche planifiée séparée - plus simple,
 * jamais en retard, jamais dépendant d'un cron qui pourrait échouer.
 */
async function getOrResetCredits(salonId) {
  const month = currentMonthStr();
  const [[row]] = await pool.query('SELECT * FROM ai_chat_credits WHERE salon_id = ?', [salonId]);

  if (!row) {
    await pool.query(
      'INSERT INTO ai_chat_credits (salon_id, credits_remaining, period_month) VALUES (?, ?, ?)',
      [salonId, FREE_CREDITS_PER_MONTH, month]
    );
    return { credits_remaining: FREE_CREDITS_PER_MONTH, period_month: month };
  }

  if (row.period_month !== month) {
    await pool.query(
      'UPDATE ai_chat_credits SET credits_remaining = ?, period_month = ? WHERE salon_id = ?',
      [FREE_CREDITS_PER_MONTH, month, salonId]
    );
    return { credits_remaining: FREE_CREDITS_PER_MONTH, period_month: month };
  }

  return { credits_remaining: row.credits_remaining, period_month: row.period_month };
}

router.get('/credits', requireAdmin, wrap(async (req, res) => {
  const credits = await getOrResetCredits(req.salon.id);
  res.json({ ok: true, ...credits, free_credits_per_month: FREE_CREDITS_PER_MONTH });
}));

router.post('/message', requireAdmin, wrap(async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Message vide' });
  if (!N8N_CHAT_WEBHOOK_URL) return res.status(500).json({ error: 'N8N_CHAT_WEBHOOK_URL non défini côté serveur' });

  const credits = await getOrResetCredits(req.salon.id);
  if (credits.credits_remaining <= 0) {
    return res.status(402).json({
      error: 'Quota mensuel de questions atteint. Il sera renouvelé au début du mois prochain.',
      credits_remaining: 0
    });
  }

  let answer;
  try {
    const n8nRes = await fetch(N8N_CHAT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ salon_id: req.salon.id, salon_name: req.salon.name, message }),
      signal: AbortSignal.timeout(30000)
    });
    if (!n8nRes.ok) throw new Error('Le service IA a répondu avec une erreur (' + n8nRes.status + ')');
    const data = await n8nRes.json();
    answer = data.answer || data.output || data.text;
    if (!answer) throw new Error('Réponse vide du service IA');
  } catch (err) {
    // Aucun crédit débité si l'appel échoue - le client ne doit
    // jamais payer pour une réponse qu'il n'a pas reçue.
    return res.status(502).json({ error: 'Le chatbot est momentanément indisponible : ' + err.message });
  }

  const newRemaining = credits.credits_remaining - 1;
  await pool.query(
    'UPDATE ai_chat_credits SET credits_remaining = ? WHERE salon_id = ?',
    [newRemaining, req.salon.id]
  );

  res.json({ ok: true, answer, credits_remaining: newRemaining });
}));

module.exports = router;
