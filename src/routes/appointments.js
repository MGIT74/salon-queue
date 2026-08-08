const express = require('express');
const crypto = require('crypto');
const { pool, utcIso, getSettings } = require('../db');
const requireAdmin = require('../middleware/auth');
const requireAdminOrBarber = require('../middleware/barberAuth');
const { sendAppointmentConfirmation } = require('../lib/mailer');

const router = express.Router();

function wrap(fn) {
  return function (req, res) {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.message });
    });
  };
}

const SLOT_STEP_MIN = 15;

/**
 * Heure "de salon" fiable (Europe/Paris), independante du fuseau
 * horaire configure sur le serveur - les horaires coiffeur
 * (barber_schedules) sont saisis en heure locale francaise, donc la
 * comparaison "creneau deja passe ?" doit se faire dans ce meme
 * referentiel, pas en UTC brut du serveur.
 */
function nowInParis() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    dateStr: get('year') + '-' + get('month') + '-' + get('day'),
    minutes: Number(get('hour')) * 60 + Number(get('minute'))
  };
}

/**
 * Chaîne datetime "heure de salon" (Europe/Paris) pour l'instant présent,
 * au format MySQL "YYYY-MM-DD HH:MM:SS" — à utiliser partout où une
 * valeur doit rejoindre scheduled_at (toujours exprimé en heure locale
 * de salon, jamais en UTC), pour rester dans le même référentiel que le
 * reste du module (créneaux, disponibilités, réservations).
 */
function nowParisDatetimeString() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/**
 * Convertit une date+heure exprimées en heure LOCALE de salon
 * (Europe/Paris) en le vrai instant UTC correspondant. Indispensable
 * dès qu'une valeur "heure de salon" (scheduled_at, saisie via le
 * formulaire de RDV) doit rejoindre une colonne qui est, elle, un vrai
 * timestamp UTC (checkin_at, start_at...) — sans cette conversion, les
 * deux référentiels se mélangent et tout calcul d'écart (verrouillage
 * "pas encore commencé", tri par heure d'arrivée...) dérive de 1h ou 2h
 * selon la saison.
 */
function parisLocalToUtcDate(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [hh, mi, se] = String(timeStr).split(':').map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, hh, mi, se || 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(guess);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const hour24 = get('hour') === 24 ? 0 : get('hour');
  const asIfParis = Date.UTC(get('year'), get('month') - 1, get('day'), hour24, get('minute'), get('second'));
  const offsetMs = asIfParis - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

function toMysqlDatetime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function timeToMinutes(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
}
function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/**
 * Estime le nombre de minutes avant que ce coiffeur soit REELLEMENT
 * libre, en tenant compte de sa file d'attente ACTUELLE (coupe en
 * cours + clients deja en attente qui lui sont explicitement
 * assignes, sans-RDV ou RDV deja promus confondus) - c'est ce qui
 * synchronise la prise de RDV en ligne avec la vraie charge du salon,
 * pour ne jamais proposer un creneau deja pris par l'affluence sans
 * RDV. Les clients "premier disponible" (barber_id NULL) ne sont pas
 * comptes ici : on ne peut pas savoir a l'avance sur quel coiffeur
 * ils vont finalement tomber.
 */
async function getBarberBusyMinutesToday(barberId) {
  const [rows] = await pool.query(
    `SELECT status, start_at, checkin_at, total_duration_min FROM queue
     WHERE barber_id = ? AND status IN ('waiting', 'in_progress')`,
    [barberId]
  );
  const OVERRUN_BUFFER_MIN = 5;
  const nowMs = Date.now();
  let busy = 0;
  rows.forEach((r) => {
    if (r.status === 'in_progress') {
      const elapsedMin = r.start_at ? (nowMs - new Date(r.start_at + 'Z').getTime()) / 60000 : 0;
      const remaining = (r.total_duration_min || 0) - elapsedMin;
      busy += remaining > 0 ? remaining : OVERRUN_BUFFER_MIN;
    } else {
      // 'waiting' : ne compte comme charge immédiate QUE si l'heure
      // prévue est déjà arrivée (file d'attente réelle / RDV en
      // retard pas encore démarré). Un RDV futur pas encore dû
      // (ex: 18h35 alors qu'il est 18h06) n'occupe PAS le coiffeur
      // maintenant - sa plage est déjà bloquée séparément via
      // busyRanges au bon horaire, inutile (et faux) de la compter
      // deux fois en avance.
      const due = r.checkin_at ? new Date(r.checkin_at + 'Z').getTime() <= nowMs : true;
      if (due) busy += r.total_duration_min || 0;
    }
  });
  return busy;
}

/**
 * Calcule les créneaux disponibles d'UN coiffeur pour une date et une
 * durée données — à partir de ses horaires (barber_schedules), ses
 * congés (barber_leaves), les RDV déjà pris ce jour-là, ET (pour
 * aujourd'hui uniquement) sa charge réelle de file d'attente sans RDV
 * en ce moment même.
 */
async function computeSlotsForBarber(barberId, dateStr, durationMin, rdvSettings, opts) {
  rdvSettings = rdvSettings || {};
  opts = opts || {};
  const stepMin = Number(rdvSettings.rdv_slot_step_min) || 15;
  const leadMin = opts.skipLead ? 0 : (Number(rdvSettings.rdv_min_lead_min) || 0);
  const bufferMin = Number(rdvSettings.rdv_buffer_min) || 0;

  const date = new Date(dateStr + 'T00:00:00Z');
  const weekday = date.getUTCDay(); // 0=dimanche ... 6=samedi

  const [[schedule]] = await pool.query(
    'SELECT start_time, end_time FROM barber_schedules WHERE barber_id = ? AND weekday = ? AND active = 1',
    [barberId, weekday]
  );
  if (!schedule) return [];

  const [[onLeave]] = await pool.query(
    'SELECT id FROM barber_leaves WHERE barber_id = ? AND ? BETWEEN start_date AND end_date',
    [barberId, dateStr]
  );
  if (onLeave) return [];

  const [existing] = await pool.query(
    `SELECT a.scheduled_at, s.duration_min AS svc_duration,
            COALESCE(SUM(e.duration_min), 0) AS extras_duration,
            q.status AS queue_status
     FROM appointments a
     JOIN services s ON s.id = a.service_id
     LEFT JOIN appointment_extras ae ON ae.appointment_id = a.id
     LEFT JOIN extras e ON e.id = ae.extra_id
     LEFT JOIN queue q ON q.id = a.promoted_queue_id
     WHERE a.barber_id = ? AND a.status = 'confirmed' AND DATE(a.scheduled_at) = ?
     GROUP BY a.id`,
    [barberId, dateStr]
  );
  // Un RDV déjà honoré (terminé) ou annulé ne bloque plus sa plage
  // théorique - s'il a été pris en charge en avance et fini plus tôt
  // que prévu, le reste de sa plage doit redevenir réservable tout de
  // suite, pas seulement à l'heure théorique de fin. La marge tampon
  // (rdv_buffer_min) prolonge chaque plage occupée après la fin
  // théorique, pour laisser un temps de battement avant le RDV suivant.
  const busyRanges = existing
    .filter((a) => a.queue_status !== 'done' && a.queue_status !== 'cancelled')
    .map((a) => {
      const start = timeToMinutes(a.scheduled_at.split(' ')[1].slice(0, 5));
      return [start, start + a.svc_duration + Number(a.extras_duration) + bufferMin];
    });

  // Pauses (déjeuner, etc.) — bloquent les créneaux au même titre qu'un
  // RDV déjà pris, pour ce jour de la semaine précis. Pas de marge
  // tampon ici, ce sont des horaires fixes déjà volontairement posés.
  const [breaks] = await pool.query(
    'SELECT start_time, end_time FROM barber_breaks WHERE barber_id = ? AND weekday = ? AND active = 1',
    [barberId, weekday]
  );
  breaks.forEach((b) => busyRanges.push([timeToMinutes(b.start_time), timeToMinutes(b.end_time)]));

  const startMin = timeToMinutes(schedule.start_time);
  const endMin = timeToMinutes(schedule.end_time);
  const paris = nowInParis();
  const isToday = dateStr === paris.dateStr;
  let nowMin = isToday ? paris.minutes : -1;

  if (isToday) {
    const busyMin = await getBarberBusyMinutesToday(barberId);
    nowMin = paris.minutes + busyMin + leadMin;
  }

  const slots = [];
  for (let t = startMin; t + durationMin <= endMin; t += stepMin) {
    if (isToday && t <= nowMin) continue;
    const overlaps = busyRanges.some(([bStart, bEnd]) => t < bEnd && t + durationMin > bStart);
    if (!overlaps) slots.push(minutesToTime(t));
  }
  return slots;
}

/**
 * true si dateStr dépasse la fenêtre de réservation maximale à l'avance
 * (rdv_max_advance_days, 0 = illimité) - comparaison en jours civils,
 * heure de salon.
 */
function isBeyondAdvanceWindow(dateStr, rdvSettings) {
  const maxDays = Number(rdvSettings.rdv_max_advance_days) || 0;
  if (!maxDays) return false;
  const todayStr = nowInParis().dateStr;
  const diffDays = Math.round((new Date(dateStr + 'T00:00:00Z') - new Date(todayStr + 'T00:00:00Z')) / 86400000);
  return diffDays > maxDays;
}

/**
 * Disponibilité — un coiffeur précis, ou "n'importe lequel" (union
 * des créneaux de tous les coiffeurs en mode RDV).
 */
router.get('/availability', wrap(async (req, res) => {
  const { date, service_id, barber_id } = req.query;
  if (!date || !service_id) return res.status(400).json({ error: 'date et service_id requis' });

  const rdvSettings = await getSettings(req.salon.id);
  if (isBeyondAdvanceWindow(date, rdvSettings)) {
    return res.json({ ok: true, slots: [] });
  }

  const [[service]] = await pool.query(
    'SELECT duration_min FROM services WHERE id = ? AND salon_id = ?', [service_id, req.salon.id]
  );
  if (!service) return res.status(404).json({ error: 'Prestation introuvable' });

  let extraDuration = 0;
  if (req.query.extras) {
    const extraIds = String(req.query.extras).split(',').filter(Boolean);
    if (extraIds.length) {
      const [rows] = await pool.query('SELECT duration_min FROM extras WHERE id IN (?)', [extraIds]);
      extraDuration = rows.reduce((a, r) => a + r.duration_min, 0);
    }
  }
  const durationMin = service.duration_min + extraDuration;

  if (barber_id) {
    const slots = await computeSlotsForBarber(barber_id, date, durationMin, rdvSettings);
    return res.json({ ok: true, slots: slots.map((s) => ({ time: s, barber_id })) });
  }

  const [barbers] = await pool.query(
    'SELECT id FROM barbers WHERE salon_id = ? AND active = 1 AND accepts_appointments = 1', [req.salon.id]
  );
  const allSlots = {};
  for (const b of barbers) {
    const slots = await computeSlotsForBarber(b.id, date, durationMin, rdvSettings);
    slots.forEach((s) => { if (!allSlots[s]) allSlots[s] = b.id; });
  }
  const merged = Object.keys(allSlots).sort().map((time) => ({ time, barber_id: allSlots[time] }));
  res.json({ ok: true, slots: merged });
}));

/**
 * Liste des rendez-vous à venir (admin) — pour une future vue
 * "Rendez-vous du jour" dans le dashboard.
 */
router.get('/', requireAdminOrBarber, wrap(async (req, res) => {
  const conditions = ['a.salon_id = ?'];
  const params = [req.salon.id];

  // Un coiffeur connecté (PIN, pas admin) ne voit que SES propres RDV -
  // utilisé par 'Mon poste' pour son propre agenda, jamais l'admin
  // complet du salon.
  if (req.barberId) {
    conditions.push('a.barber_id = ?');
    params.push(req.barberId);
  }

  if (req.query.month) {
    // Format attendu : YYYY-MM
    conditions.push('DATE_FORMAT(a.scheduled_at, "%Y-%m") = ?');
    params.push(req.query.month);
  } else if (!req.query.all) {
    // Comportement par defaut (sans mois precise) : uniquement les
    // RDV confirmes et a venir, comme avant.
    conditions.push("a.status = 'confirmed'");
    conditions.push('a.scheduled_at >= NOW()');
  }

  const [rows] = await pool.query(
    `SELECT a.*, s.name AS service_name, b.name AS barber_name,
            q.status AS queue_status
     FROM appointments a
     LEFT JOIN services s ON s.id = a.service_id
     LEFT JOIN barbers b ON b.id = a.barber_id
     LEFT JOIN queue q ON q.id = a.promoted_queue_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.scheduled_at ASC LIMIT 500`,
    params
  );

  res.json({
    ok: true,
    items: rows.map((r) => {
      // Statut affiche : annule reste annule ; termine si la coupe
      // promue en file est marquee "done" ; sinon confirme (a venir,
      // ou en cours d'attente/de coupe le jour meme).
      let displayStatus = 'confirmed';
      if (r.status === 'cancelled') displayStatus = 'cancelled';
      else if (r.queue_status === 'done') displayStatus = 'completed';
      else if (r.queue_status === 'cancelled') displayStatus = 'no_show';

      return Object.assign({}, r, {
        scheduled_at: utcIso(r.scheduled_at),
        created_at: utcIso(r.created_at),
        display_status: displayStatus
      });
    })
  });
}));

/**
 * Création d'un rendez-vous — public, comme le check-in kiosk. Si
 * pour AUJOURD'HUI, promeut immédiatement en entrée de file.
 */
router.post('/', wrap(async (req, res) => {
  const { client_name, email, phone, service_id, barber_id, extras, date, time } = req.body;
  const clientNote = req.body.client_note ? String(req.body.client_note).slice(0, 500) : null;
  if (!client_name) return res.status(400).json({ error: 'Le nom est requis' });
  if (!email) return res.status(400).json({ error: "L'email est requis pour la confirmation" });
  if (!service_id || !date || !time) return res.status(400).json({ error: 'Prestation, date et créneau requis' });

  // Le champ 'min' du calendrier n'est qu'une protection côté
  // navigateur (fiable sur desktop, pas garantie sur toutes les
  // versions mobile/tablette) - on revérifie ici, côté serveur, que le
  // créneau demandé n'est pas déjà passé (heure de salon, pas UTC).
  if (`${date} ${time}:00` < nowParisDatetimeString()) {
    return res.status(400).json({ error: 'Ce créneau est déjà passé, choisissez une date/heure à venir.' });
  }

  const rdvSettings = await getSettings(req.salon.id);
  if (isBeyondAdvanceWindow(date, rdvSettings)) {
    return res.status(400).json({ error: 'Cette date est trop éloignée, choisissez une date plus proche.' });
  }

  const [[service]] = await pool.query(
    'SELECT name, duration_min FROM services WHERE id = ? AND salon_id = ?', [service_id, req.salon.id]
  );
  if (!service) return res.status(404).json({ error: 'Prestation introuvable' });

  let extraIds = Array.isArray(extras) ? extras : [];
  let extraDuration = 0;
  let extraNames = [];
  if (extraIds.length) {
    const [rows] = await pool.query('SELECT id, name, duration_min FROM extras WHERE id IN (?)', [extraIds]);
    extraDuration = rows.reduce((a, r) => a + r.duration_min, 0);
    extraNames = rows.map((r) => r.name);
  }
  const durationMin = service.duration_min + extraDuration;

  // Détermine le coiffeur final (précis, ou le premier disponible
  // parmi ceux en mode RDV pour ce créneau precis).
  let finalBarberId = barber_id || null;
  if (!finalBarberId) {
    const [barbers] = await pool.query(
      'SELECT id FROM barbers WHERE salon_id = ? AND active = 1 AND accepts_appointments = 1', [req.salon.id]
    );
    for (const b of barbers) {
      const slots = await computeSlotsForBarber(b.id, date, durationMin, rdvSettings);
      if (slots.includes(time)) { finalBarberId = b.id; break; }
    }
    if (!finalBarberId) return res.status(409).json({ error: "Ce créneau n'est plus disponible" });
  } else {
    const slots = await computeSlotsForBarber(finalBarberId, date, durationMin, rdvSettings);
    if (!slots.includes(time)) return res.status(409).json({ error: "Ce créneau n'est plus disponible" });
  }

  const id = crypto.randomUUID();
  const cancelToken = crypto.randomBytes(24).toString('hex');
  const scheduledAt = date + ' ' + time + ':00';

  await pool.query(
    `INSERT INTO appointments (id, salon_id, barber_id, client_name, email, phone, service_id, scheduled_at, status, cancel_token, client_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)`,
    [id, req.salon.id, finalBarberId, client_name, email, phone || null, service_id, scheduledAt, cancelToken, clientNote]
  );
  if (extraIds.length) {
    await pool.query(
      'INSERT INTO appointment_extras (appointment_id, extra_id) VALUES ?',
      [extraIds.map((eid) => [id, eid])]
    );
  }

  const [[barber]] = finalBarberId
    ? await pool.query('SELECT name FROM barbers WHERE id = ?', [finalBarberId])
    : [[null]];

  const when = new Date(scheduledAt.replace(' ', 'T')).toLocaleString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'
  });

  // base_url (envoyé par le navigateur) contient déjà le chemin complet
  // vers rdv.html, avec son éventuel ?salon=xxx — on ne doit donc jamais
  // recoller un second "/rdv.html" par-dessus (ça produisait une URL du
  // type ".../rdv.html?salon=xxx/rdv.html?cancel=yyy", où le paramètre
  // cancel finissait noyé dans la valeur de salon, rendant le lien
  // d'annulation inopérant). On ajoute juste le paramètre cancel, avec
  // le bon séparateur selon qu'un ?salon= est déjà présent ou non.
  const baseUrl = String(req.body.base_url || '').replace(/\/$/, '');
  const cancelUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'cancel=' + cancelToken;

  try {
    await sendAppointmentConfirmation(req.salon.id, email, {
      clientName: client_name,
      when,
      serviceName: service.name + (extraNames.length ? ' + ' + extraNames.join(', ') : ''),
      barberName: barber ? barber.name : null,
      cancelUrl
    });
  } catch (err) {
    console.error('[rdv] envoi email de confirmation échoué:', err.message);
  }

  // Si c'est pour aujourd'hui, on le fait apparaître tout de suite
  // dans la file (verrouillé jusqu'à l'heure prévue côté interface).
  const today = nowInParis().dateStr;
  if (date === today) {
    await promoteAppointment({ id, salon_id: req.salon.id, barber_id: finalBarberId, client_name, email, phone, service_id, scheduled_at: scheduledAt }, extraIds);
  }

  res.json({ ok: true, id });
}));

/**
 * Création manuelle d'un RDV par l'admin (ex: client au téléphone) -
 * email optionnel (pas de confirmation envoyée si absent, contrairement
 * à une réservation en ligne où il est obligatoire), mais le coiffeur
 * est TOUJOURS requis explicitement (pas de "premier disponible"
 * automatique comme pour le grand public).
 */
router.post('/admin-create', requireAdmin, wrap(async (req, res) => {
  const { client_name, email, phone, service_id, barber_id, extras, date, time } = req.body;
  const clientNote = req.body.client_note ? String(req.body.client_note).slice(0, 500) : null;
  if (!client_name) return res.status(400).json({ error: 'Le nom est requis' });
  if (!barber_id) return res.status(400).json({ error: 'Le coiffeur est requis' });
  if (!service_id || !date || !time) return res.status(400).json({ error: 'Prestation, date et créneau requis' });

  if (`${date} ${time}:00` < nowParisDatetimeString()) {
    return res.status(400).json({ error: 'Ce créneau est déjà passé, choisissez une date/heure à venir.' });
  }

  const rdvSettings = await getSettings(req.salon.id);

  const [[service]] = await pool.query(
    'SELECT name, duration_min FROM services WHERE id = ? AND salon_id = ?', [service_id, req.salon.id]
  );
  if (!service) return res.status(404).json({ error: 'Prestation introuvable' });

  let extraIds = Array.isArray(extras) ? extras : [];
  let extraDuration = 0;
  let extraNames = [];
  if (extraIds.length) {
    const [rows] = await pool.query('SELECT id, name, duration_min FROM extras WHERE id IN (?)', [extraIds]);
    extraDuration = rows.reduce((a, r) => a + r.duration_min, 0);
    extraNames = rows.map((r) => r.name);
  }
  const durationMin = service.duration_min + extraDuration;

  // Admin exempté du délai minimum de réservation (rdv_min_lead_min) et
  // de la fenêtre max à l'avance (pas vérifiée ici du tout) - ce sont
  // des garde-fous pour le grand public, pas pour un ajout manuel gu
  // idé par le staff. Le pas des créneaux et la marge tampon restent
  // appliqués (évite un vrai conflit d'agenda).
  const slots = await computeSlotsForBarber(barber_id, date, durationMin, rdvSettings, { skipLead: true });
  if (!slots.includes(time)) return res.status(409).json({ error: "Ce créneau n'est plus disponible" });

  const id = crypto.randomUUID();
  const cancelToken = crypto.randomBytes(24).toString('hex');
  const scheduledAt = date + ' ' + time + ':00';

  await pool.query(
    `INSERT INTO appointments (id, salon_id, barber_id, client_name, email, phone, service_id, scheduled_at, status, cancel_token, client_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)`,
    [id, req.salon.id, barber_id, client_name, email || null, phone || null, service_id, scheduledAt, cancelToken, clientNote]
  );
  if (extraIds.length) {
    await pool.query('INSERT INTO appointment_extras (appointment_id, extra_id) VALUES ?', [extraIds.map((eid) => [id, eid])]);
  }

  if (email) {
    const [[barber]] = await pool.query('SELECT name FROM barbers WHERE id = ?', [barber_id]);
    const when = new Date(scheduledAt.replace(' ', 'T')).toLocaleString('fr-FR', {
      weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'
    });
    const baseUrl = String(req.body.base_url || '').replace(/\/$/, '');
    const cancelUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'cancel=' + cancelToken;
    try {
      await sendAppointmentConfirmation(req.salon.id, email, {
        clientName: client_name, when,
        serviceName: service.name + (extraNames.length ? ' + ' + extraNames.join(', ') : ''),
        barberName: barber ? barber.name : null,
        cancelUrl
      });
    } catch (err) {
      console.error('[admin-create] envoi email échoué:', err.message);
    }
  }

  const today = nowInParis().dateStr;
  if (date === today) {
    await promoteAppointment(
      { id, salon_id: req.salon.id, barber_id, client_name, email: email || null, phone, service_id, scheduled_at: scheduledAt },
      extraIds
    );
  }

  res.json({ ok: true, id });
}));

/**
 * Annulation publique via le lien envoyé par email — retrouvé
 * uniquement par le token (le lien ne contient que ça, pas l'id).
 */
router.post('/cancel', wrap(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token requis' });

  const [[appt]] = await pool.query(
    'SELECT id, salon_id, status, scheduled_at, promoted_queue_id FROM appointments WHERE cancel_token = ?', [token]
  );
  if (!appt) return res.status(404).json({ error: 'Rendez-vous introuvable' });
  if (appt.status === 'cancelled') return res.status(409).json({ error: 'Ce rendez-vous est déjà annulé' });

  // Délai limite d'annulation : recherché via le salon RÉEL du RDV
  // (appt.salon_id), pas req.salon - cette route est publique, le
  // salon envoyé par le client ne fait pas forcément foi.
  const rdvSettings = await getSettings(appt.salon_id);
  const deadlineMin = Number(rdvSettings.rdv_cancel_deadline_min) || 0;
  if (deadlineMin > 0) {
    const minutesUntil = (new Date(appt.scheduled_at.replace(' ', 'T') + 'Z') - new Date(nowParisDatetimeString().replace(' ', 'T') + 'Z')) / 60000;
    if (minutesUntil < deadlineMin) {
      return res.status(403).json({ error: "Trop tard pour annuler ce rendez-vous en ligne, contactez directement le salon." });
    }
  }

  await pool.query('UPDATE appointments SET status = ? WHERE id = ?', ['cancelled', appt.id]);
  if (appt.promoted_queue_id) {
    await pool.query(
      "UPDATE queue SET status = 'cancelled' WHERE id = ? AND status IN ('waiting','in_progress')",
      [appt.promoted_queue_id]
    );
  }
  res.json({ ok: true });
}));

/**
 * Promeut une entrée d'appointment en vraie ligne de file — checkin_at
 * fixé à l'heure PREVUE (pas la date de création), ce qui la classe
 * naturellement au bon endroit dans la file (ni trop tôt, ni trop
 * tard) et verrouille "Commencer" côté interface tant que cette heure
 * n'est pas encore là.
 *
 * Reservation ATOMIQUE avant toute creation : deux appels concurrents
 * (dashboard + Mon poste qui rafraichissent la file en meme temps, par
 * exemple) pourraient sinon tous les deux voir promoted_queue_id
 * encore NULL et creer chacun leur propre entree en double. On genere
 * l'id de la future ligne de file D'ABORD, puis on tente de
 * "reserver" ce RDV avec un UPDATE conditionne sur promoted_queue_id
 * IS NULL - un seul appel peut reussir cette reservation, l'autre
 * voit 0 ligne affectee et abandonne proprement sans rien creer.
 */
async function promoteAppointment(appt, extraIds) {
  const queueId = crypto.randomUUID();

  const [claimResult] = await pool.query(
    'UPDATE appointments SET promoted_queue_id = ? WHERE id = ? AND promoted_queue_id IS NULL',
    [queueId, appt.id]
  );
  if (claimResult.affectedRows === 0) {
    // Deja promu (ou en cours de promotion) par un autre appel concurrent.
    return null;
  }

  // appt.scheduled_at est en heure de salon (Europe/Paris) ; checkin_at
  // est un vrai timestamp UTC comme le reste de la file — conversion
  // obligatoire ici, sinon le verrouillage "pas encore commencé" et
  // l'ordre d'arrivée dérivent de 1h à 2h selon la saison.
  const checkinUtc = toMysqlDatetime(
    parisLocalToUtcDate(appt.scheduled_at.slice(0, 10), appt.scheduled_at.slice(11, 19))
  );

  await pool.query(
    `INSERT INTO queue (id, salon_id, client_name, email, phone, service_id, barber_id, status, checkin_at, is_appointment)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting', ?, 1)`,
    [queueId, appt.salon_id, appt.client_name, appt.email, appt.phone || null, appt.service_id, appt.barber_id, checkinUtc]
  );
  if (extraIds && extraIds.length) {
    await pool.query(
      'INSERT INTO queue_extras (queue_id, extra_id) VALUES ?',
      [extraIds.map((eid) => [queueId, eid])]
    );
  }
  return queueId;
}

/**
 * Promeut automatiquement tous les RDV du jour pas encore promus —
 * appelée à chaque chargement de la file (comme recompute()), pas
 * besoin de tâche planifiée séparée.
 */
async function promoteTodayAppointments(salonId) {
  const today = nowInParis().dateStr;
  const [rows] = await pool.query(
    `SELECT * FROM appointments
     WHERE salon_id = ? AND status = 'confirmed' AND promoted_queue_id IS NULL AND DATE(scheduled_at) = ?`,
    [salonId, today]
  );
  for (const appt of rows) {
    const [extraRows] = await pool.query('SELECT extra_id FROM appointment_extras WHERE appointment_id = ?', [appt.id]);
    await promoteAppointment(appt, extraRows.map((r) => r.extra_id));
  }
}

module.exports = { router, promoteTodayAppointments, nowParisDatetimeString };
