const express = require('express');
const { safeBaseUrl } = require('../lib/safeUrl');
const { withBookingLock } = require('../lib/bookingLock');
const { signupRateLimiter } = require('../middleware/rateLimiter');

// Réservation en ligne publique : sans limite, un script pouvait remplir l'agenda de faux RDV et faire
// envoyer des centaines d'emails de confirmation (au nom du salon) à n'importe quelle adresse.
// 30 réservations par heure et par adresse IP, largement au-dessus d'un usage normal (une famille).
const bookingRateLimiter = signupRateLimiter('rdv-booking', { max: 30, windowMs: 60 * 60 * 1000, blockMs: 30 * 60 * 1000 });
// Saisie / renvoi du code à 6 chiffres (RDV sans compte) : compteur à part, 3 essais par code limitent déjà les devinettes.
const codeRateLimiter = signupRateLimiter('rdv-code', { max: 60, windowMs: 60 * 60 * 1000, blockMs: 30 * 60 * 1000 });
const crypto = require('crypto');
const { pool, utcIso, getSettings } = require('../db');
const requireAdmin = require('../middleware/auth');
const requireAdminOrBarber = require('../middleware/barberAuth');
const { logActivity } = require('../lib/activityLog');
const { clientKey, recompute } = require('../lib/queueMath');
const { sendAppointmentConfirmation, sendGroupAppointmentConfirmation, sendAppointmentCancelledByAdmin, sendAppointmentRescheduled, sendAppointmentServicesChanged, sendBookingCode, sendGiftCodeRenewed } = require('../lib/mailer');
const { wrap } = require('../lib/wrap');
const groupBooking = require('../lib/groupBooking');
const { loadCatalog, offerFor, resolveOffer } = require('../lib/barberOffer');
const { serviceLabel, serviceNameSql } = require('../lib/extrasOnly');
const { saleForPassage } = require('../lib/salePassage');
const { contactError, isValidEmail, isValidPhone } = require('../lib/contact');

const router = express.Router();

// Même alphabet que generateGiftCode() dans sales.js (sans caractères
// ambigus à l'oral/à l'écrit) - dupliqué ici plutôt que partagé pour
// éviter un couplage entre ces deux fichiers pour 8 lignes de code.
const GIFT_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateGiftCode() {
  let code = '';
  for (let i = 0; i < 8; i++) code += GIFT_CODE_CHARS[crypto.randomInt(GIFT_CODE_CHARS.length)];
  return code;
}

const SLOT_STEP_MIN = 15;

/**
 * Libère un cadeau qui bloquait un rendez-vous désormais annulé, avec
 * un NOUVEAU code (l'ancien, déjà transmis par email et potentiellement
 * partagé, ne doit plus jamais pouvoir resservir). Ne fait rien si le
 * cadeau a entre-temps été réellement consommé en salon (used_at) - ce
 * cas ne devrait normalement pas se produire pour un RDV qu'on annule,
 * mais mieux vaut ne rien casser si jamais.
 */
async function releaseGiftAfterCancellation(salonId, giftCardId, appointmentId) {
  if (!appointmentId) return;
  const [[gift]] = await pool.query(
    'SELECT recipient_name, recipient_email, amount_cents, items_json, used_at, voided_at FROM gift_cards WHERE id = ? AND salon_id = ? AND pending_appointment_id = ?',
    [giftCardId, salonId, appointmentId]
  );
  if (!gift || gift.used_at || gift.voided_at) return;

  const newCode = generateGiftCode();
  const [released] = await pool.query(
    'UPDATE gift_cards SET code = ?, pending_appointment_id = NULL WHERE id = ? AND salon_id = ? AND pending_appointment_id = ? AND used_at IS NULL AND voided_at IS NULL',
    [newCode, giftCardId, salonId, appointmentId]
  );
  if (released.affectedRows !== 1) return;
  let items = [];
  try { items = JSON.parse(gift.items_json || '[]'); } catch (e) { items = []; }
  try {
    await sendGiftCodeRenewed(salonId, gift.recipient_email, {
      recipientName: gift.recipient_name,
      amountEur: (gift.amount_cents / 100).toFixed(2) + ' €',
      items,
      code: newCode
    });
  } catch (err) {
    console.error('[rdv] envoi du nouveau code cadeau échoué:', err.message);
  }
}

/**
 * Heure "de salon" fiable, indépendante du fuseau horaire configuré sur
 * le serveur - les horaires coiffeur (barber_schedules) sont saisis en
 * heure locale du salon, donc la comparaison "créneau déjà passé ?" doit
 * se faire dans ce même référentiel, pas en UTC brut du serveur. Le
 * fuseau du salon (réglages > Fuseau horaire) doit être passé en `tz` ;
 * "Europe/Paris" reste le repli par défaut pour les appels qui n'ont pas
 * encore ce contexte (compatibilité ascendante).
 */
function nowInParis(tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    dateStr: get('year') + '-' + get('month') + '-' + get('day'),
    minutes: Number(get('hour')) * 60 + Number(get('minute'))
  };
}

/**
 * Chaîne datetime "heure de salon" pour l'instant présent, au format
 * MySQL "YYYY-MM-DD HH:MM:SS" — à utiliser partout où une valeur doit
 * rejoindre scheduled_at (toujours exprimé en heure locale de salon,
 * jamais en UTC), pour rester dans le même référentiel que le reste du
 * module (créneaux, disponibilités, réservations).
 */
function nowParisDatetimeString(tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/**
 * Convertit une date+heure exprimées en heure LOCALE de salon en le vrai
 * instant UTC correspondant. Indispensable dès qu'une valeur "heure de
 * salon" (scheduled_at, saisie via le formulaire de RDV) doit rejoindre
 * une colonne qui est, elle, un vrai timestamp UTC (checkin_at,
 * start_at...) — sans cette conversion, les deux référentiels se
 * mélangent et tout calcul d'écart (verrouillage "pas encore commencé",
 * tri par heure d'arrivée...) dérive selon le fuseau et la saison.
 */
function parisLocalToUtcDate(dateStr, timeStr, tz) {
  const zone = tz || 'Europe/Paris';
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [hh, mi, se] = String(timeStr).split(':').map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, hh, mi, se || 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23',
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
// Message clair quand un creneau est refuse parce que le coiffeur est « sans RDV » ce jour-la (calendrier de sa fiche).
async function walkinRefusal(barberId, dateStr) {
  const [[w]] = await pool.query(
    `SELECT b.name FROM barber_walkin_days w JOIN barbers b ON b.id = w.barber_id
     WHERE w.barber_id = ? AND ? BETWEEN w.start_date AND w.end_date LIMIT 1`, [barberId, dateStr]);
  return w ? (w.name + ' est en « sans RDV » ce jour-là : pas de rendez-vous possible.') : null;
}

// ---------- « Premier disponible » : le systeme choisit le coiffeur ----------
// Candidats = coiffeurs qui prennent des RDV et font la prestation, avec leurs creneaux du jour.
async function anyBarberCandidates(salonId, cat, date, rdvSettings, optsFor) {
  const [barbers] = await pool.query(
    'SELECT id FROM barbers WHERE salon_id = ? AND active = 1 AND accepts_appointments = 1 ORDER BY sort_order, name', [salonId]
  );
  const out = [];
  for (const b of barbers) {
    const offer = await offerFor(b.id, cat);
    if (!offer.ok) continue;
    const slots = await computeSlotsForBarber(b.id, date, offer.durationMin, rdvSettings, optsFor ? optsFor(b.id) : {});
    out.push({ id: b.id, offer, slots });
  }
  if (out.length > 1) {
    // Departage : nombre de RDV sur 7 jours a partir de ce jour (le moins charge d'abord).
    const [loads] = await pool.query(
      `SELECT barber_id, COUNT(*) AS n FROM appointments WHERE salon_id = ? AND barber_id IN (?) AND status NOT IN ('cancelled','no_show')
         AND scheduled_at >= ? AND scheduled_at < DATE_ADD(?, INTERVAL 7 DAY) GROUP BY barber_id`,
      [salonId, out.map((c) => c.id), date + ' 00:00:00', date + ' 00:00:00']
    );
    const byId = Object.fromEntries(loads.map((l) => [l.barber_id, Number(l.n)]));
    out.forEach((c, i) => { c.week = byId[c.id] || 0; c.order = i; });
  }
  return out;
}
// Pour UNE heure : parmi les coiffeurs libres, celui qui a le plus de creneaux libres ce jour-la (le moins charge),
// puis le moins de RDV sur la semaine, puis l'ordre habituel des coiffeurs.
function chooseAnyBarber(cands, time) {
  const free = cands.filter((c) => c.slots.includes(time));
  free.sort((a, b) => (b.slots.length - a.slots.length) || ((a.week || 0) - (b.week || 0)) || ((a.order || 0) - (b.order || 0)));
  return free[0] || null;
}

async function computeSlotsForBarber(barberId, dateStr, durationMin, rdvSettings, opts) {
  rdvSettings = rdvSettings || {};
  opts = opts || {};
  const configuredStep = Number(rdvSettings.rdv_slot_step_min);
  const stepMin = Number.isSafeInteger(configuredStep) && configuredStep > 0 && configuredStep <= 120 ? configuredStep : 15;
  const leadMin = opts.skipLead ? 0 : (Number(rdvSettings.rdv_min_lead_min) || 0);
  const bufferMin = Number(rdvSettings.rdv_buffer_min) || 0;

  const date = new Date(dateStr + 'T00:00:00Z');
  const weekday = date.getUTCDay(); // 0=dimanche ... 6=samedi

  const [[schedule]] = await pool.query(
    'SELECT start_time, end_time FROM barber_schedules WHERE barber_id = ? AND weekday = ? AND active = 1',
    [barberId, weekday]
  );
  if (!schedule) return [];

  // Fermeture exceptionnelle du salon : aucun créneau, quel que soit le coiffeur.
  const [[salonClosure]] = await pool.query(
    `SELECT id FROM salon_closures WHERE salon_id = (SELECT salon_id FROM barbers WHERE id = ?)
       AND start_date <= ? AND end_date >= ? LIMIT 1`,
    [barberId, dateStr, dateStr]
  );
  if (salonClosure) return [];

  const [[onLeave]] = await pool.query(
    'SELECT id FROM barber_leaves WHERE barber_id = ? AND ? BETWEEN start_date AND end_date',
    [barberId, dateStr]
  );
  if (onLeave) return [];

  // Jour « sans RDV » choisi pour ce coiffeur (calendrier de l'onglet Congés) : aucun creneau ce jour-la.
  const [[walkinDay]] = await pool.query(
    'SELECT id FROM barber_walkin_days WHERE barber_id = ? AND ? BETWEEN start_date AND end_date LIMIT 1',
    [barberId, dateStr]
  );
  if (walkinDay) return [];

  const [existing] = await pool.query(
    `SELECT a.scheduled_at, COALESCE(MAX(bsp.duration_min), MAX(s.duration_min)) AS svc_duration,
            COALESCE(SUM(COALESCE(bep.duration_min, e.duration_min)), 0) AS extras_duration,
            q.status AS queue_status
     FROM appointments a
     JOIN services s ON s.id = a.service_id
     LEFT JOIN barber_service_prices bsp ON bsp.barber_id = a.barber_id AND bsp.service_id = a.service_id
     LEFT JOIN appointment_extras ae ON ae.appointment_id = a.id
     LEFT JOIN extras e ON e.id = ae.extra_id
     LEFT JOIN barber_extra_prices bep ON bep.barber_id = a.barber_id AND bep.extra_id = ae.extra_id
     LEFT JOIN queue q ON q.id = a.promoted_queue_id
     WHERE a.barber_id = ? AND a.status = 'confirmed' AND DATE(a.scheduled_at) = ?
       AND a.id != ?
     GROUP BY a.id`,
    [barberId, dateStr, opts.excludeAppointmentId || '']
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
  // Creneaux deja choisis (pas encore enregistres) par les autres personnes d'une reservation de groupe.
  (opts.extraBusy || []).forEach((r) => busyRanges.push(r));
  // Créneaux gardés pendant qu'un client vérifie son email par code (60 s par code), sauf le sien.
  (await verificationHolds(barberId, dateStr, opts.excludeVerificationId)).forEach((r) => busyRanges.push([r[0], r[1] + bufferMin]));

  const startMin = timeToMinutes(schedule.start_time);
  const endMin = timeToMinutes(schedule.end_time);
  const paris = nowInParis(rdvSettings.timezone);
  // Une date passée ne doit jamais exposer de créneau, même si l'horaire
  // hebdomadaire du coiffeur est actif ce jour-là.
  if (dateStr < paris.dateStr) return [];
  const isToday = dateStr === paris.dateStr;
  let nowMin = isToday ? paris.minutes : -1;

  if (isToday) {
    // Coiffeur sans chrono/file d'attente en temps reel (timer_enabled=0,
    // ex. loueur de fauteuil independant) : on ne consulte PAS son
    // eventuel retard reel, la reservation reste un calcul classique
    // horaires + duree uniquement.
    const [[barberRow]] = await pool.query('SELECT timer_enabled FROM barbers WHERE id = ?', [barberId]);
    if (!barberRow || barberRow.timer_enabled) {
      const busyMin = await getBarberBusyMinutesToday(barberId);
      nowMin = paris.minutes + busyMin + leadMin;
    } else {
      nowMin = paris.minutes + leadMin;
    }
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
  const todayStr = nowInParis(rdvSettings.timezone).dateStr;
  const diffDays = Math.round((new Date(dateStr + 'T00:00:00Z') - new Date(todayStr + 'T00:00:00Z')) / 86400000);
  return diffDays > maxDays;
}

/**
 * Disponibilité — un coiffeur précis, ou "n'importe lequel" (union
 * des créneaux de tous les coiffeurs en mode RDV).
 */
function validBookingDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return false;
  const d = new Date(date + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}
function validBookingTime(time) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || ''));
}

router.get('/availability', wrap(async (req, res) => {
  const { date, service_id, barber_id } = req.query;
  // Sans prestation : seulement des supplements (« Supplement seul », voir lib/extrasOnly).
  if (!date || ((!service_id || service_id === '__extras__') && !req.query.extras)) return res.status(400).json({ error: 'date et service_id requis' });
  if (!validBookingDate(date)) return res.status(400).json({ error: 'Date invalide' });
  if (barber_id) {
    const [[owned]] = await pool.query('SELECT id FROM barbers WHERE id = ? AND salon_id = ? AND active = 1', [barber_id, req.salon.id]);
    if (!owned) return res.status(404).json({ error: 'Coiffeur introuvable' });
  }

  const rdvSettings = await getSettings(req.salon.id);
  if (isBeyondAdvanceWindow(date, rdvSettings)) {
    return res.json({ ok: true, slots: [] });
  }
  // Verrou : une date deja passee (dans le fuseau DU SALON, pas UTC) n'a jamais de creneau.
  if (String(date) < nowParisDatetimeString(rdvSettings.timezone).slice(0, 10)) {
    return res.json({ ok: true, slots: [] });
  }

  // Prestation + suppléments du catalogue, puis durée PROPRE à chaque coiffeur (tarif personnalisé, exclusions).
  let extraIds = req.query.extras ? String(req.query.extras).split(',').filter(Boolean) : [];
  // Déplacement d'un RDV existant : ses suppléments à lui (durée réelle ; un RDV « supplément seul » n'a pas de
  // prestation, il était refusé avec « Choisissez au moins un supplément »).
  if (req.query.exclude_appointment_id && !req.query.extras) {
    const [own] = await pool.query(
      `SELECT ae.extra_id FROM appointment_extras ae JOIN appointments a ON a.id = ae.appointment_id
       WHERE ae.appointment_id = ? AND a.salon_id = ?`, [req.query.exclude_appointment_id, req.salon.id]);
    extraIds = own.map((x) => x.extra_id);
  }
  const cat = await loadCatalog(req.salon.id, service_id, extraIds);
  if (!cat.ok) return res.status(cat.status).json({ error: cat.error });
  var slotOpts = req.query.exclude_appointment_id ? { excludeAppointmentId: req.query.exclude_appointment_id } : {};
  // Reservation a plusieurs : creneaux deja retenus par les AUTRES personnes du groupe (cf. lib/groupBooking).
  const held = groupBooking.parseHeld(req.query.held);
  const bufferMinForHeld = Number(rdvSettings.rdv_buffer_min) || 0;
  const optsFor = (bid) => Object.assign({}, slotOpts, held.length ? { extraBusy: groupBooking.heldRanges(held, bid, date, bufferMinForHeld) } : {});

  if (barber_id) {
    const offer = await offerFor(barber_id, cat);
    if (!offer.ok) return res.json({ ok: true, slots: [], reason: offer.error });
    const slots = await computeSlotsForBarber(barber_id, date, offer.durationMin, rdvSettings, optsFor(barber_id));
    return res.json({ ok: true, slots: slots.map((s) => ({ time: s, barber_id })), duration_min: offer.durationMin, price_cents: offer.priceCents });
  }

  // « Premier disponible » : toutes les heures ou au moins un coiffeur est libre ; pour chacune, le coiffeur que le
  // systeme choisirait (le plus de creneaux libres ce jour-la), avec SON prix et SA duree.
  const cands = await anyBarberCandidates(req.salon.id, cat, date, rdvSettings, optsFor);
  const times = Array.from(new Set([].concat(...cands.map((c) => c.slots)))).sort();
  const merged = times.map((time) => {
    const c = chooseAnyBarber(cands, time);
    return { time, barber_id: c.id, price_cents: c.offer.priceCents, duration_min: c.offer.durationMin };
  });
  const prices = cands.map((c) => c.offer.priceCents);
  res.json({ ok: true, slots: merged, any: true, price_min_cents: prices.length ? Math.min(...prices) : null, price_max_cents: prices.length ? Math.max(...prices) : null });
}));

// Jours qui ont AU MOINS un creneau (meme calcul que /availability), pour griser dans le calendrier de reservation
// les jours ou le coiffeur choisi (ou aucun coiffeur, en « Premier disponible ») n'a rien : conge, jour non travaille,
// jour « sans RDV », journee complete ou deja terminee. ?from=&to= (62 jours max) + service_id/extras/barber_id.
router.get('/availability-days', wrap(async (req, res) => {
  const { from, to, service_id, barber_id } = req.query;
  if (!validBookingDate(from) || !validBookingDate(to) || to < from) return res.status(400).json({ error: 'Periode invalide' });
  if ((!service_id || service_id === '__extras__') && !req.query.extras) return res.status(400).json({ error: 'service_id requis' });
  const span = Math.round((new Date(to + 'T00:00:00Z') - new Date(from + 'T00:00:00Z')) / 86400000);
  if (span > 62) return res.status(400).json({ error: 'Periode trop longue' });
  if (barber_id) {
    const [[owned]] = await pool.query('SELECT id FROM barbers WHERE id = ? AND salon_id = ? AND active = 1', [barber_id, req.salon.id]);
    if (!owned) return res.status(404).json({ error: 'Coiffeur introuvable' });
  }
  const rdvSettings = await getSettings(req.salon.id);
  const cat = await loadCatalog(req.salon.id, service_id, req.query.extras ? String(req.query.extras).split(',').filter(Boolean) : []);
  if (!cat.ok) return res.status(cat.status).json({ error: cat.error });
  let ids;
  if (barber_id) ids = [barber_id];
  else {
    const [rows] = await pool.query('SELECT id FROM barbers WHERE salon_id = ? AND active = 1 AND accepts_appointments = 1 ORDER BY sort_order, name', [req.salon.id]);
    ids = rows.map((r) => r.id);
  }
  const offers = [];
  for (const id of ids) { const offer = await offerFor(id, cat); if (offer.ok) offers.push({ id, offer }); }
  const todayStr = nowParisDatetimeString(rdvSettings.timezone).slice(0, 10);
  const days = [];
  const d = new Date(from + 'T00:00:00Z'), end = new Date(to + 'T00:00:00Z');
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    if (dateStr < todayStr || isBeyondAdvanceWindow(dateStr, rdvSettings)) continue;
    for (const o of offers) {
      const slots = await computeSlotsForBarber(o.id, dateStr, o.offer.durationMin, rdvSettings, {});
      if (slots.length) { days.push(dateStr); break; }
    }
  }
  res.json({ ok: true, days });
}));

/**
 * Liste des rendez-vous à venir (admin) — pour une future vue
 * "Rendez-vous du jour" dans le dashboard.
 */
/**
 * Met en forme des lignes `appointments` pour l'interface : statut affiché,
 * durée totale, note interne du client (client_notes, rattachée par
 * clientKey() - jamais jointe en SQL direct car ce n'est pas une colonne
 * stricte), même pattern que /api/queue/history.
 */
/**
 * Detail du prix de chaque RDV, pour l'afficher dans les tiroirs (admin, caisse, poste) :
 *  - prestation : tarif PERSONNALISE du coiffeur s'il existe (custom: true), sinon celui du catalogue ;
 *  - supplements choisis, chacun a son tarif (coiffeur ou catalogue) ;
 *  - produits choisis d'avance (en ligne / borne), avec quantite - sans duree ;
 *  - total = prestation + supplements + produits ; charged_cents = montant de la ligne de file (prestation + supplements).
 * Meme regle que barberOffer / queueMath : c'est ce qui est encaisse.
 */
async function apptPricing(rows) {
  const out = {};
  const ids = rows.map((r) => r.id).filter(Boolean);
  if (!ids.length) return out;
  const [svc] = await pool.query(
    `SELECT a.id, s.price_cents AS cat_price, s.duration_min AS cat_duration, bsp.price_cents AS b_price, bsp.duration_min AS b_duration,
            s.system_kind, q.total_price_cents AS charged_cents
     FROM appointments a
     LEFT JOIN services s ON s.id = a.service_id
     LEFT JOIN barber_service_prices bsp ON bsp.barber_id = a.barber_id AND bsp.service_id = a.service_id
     LEFT JOIN queue q ON q.id = a.promoted_queue_id
     WHERE a.id IN (?)`, [ids]
  );
  const [ext] = await pool.query(
    `SELECT ae.appointment_id, ae.extra_id, e.name, e.price_cents AS cat_price, e.duration_min AS cat_duration,
            bep.price_cents AS b_price, bep.duration_min AS b_duration
     FROM appointment_extras ae
     JOIN appointments a ON a.id = ae.appointment_id
     JOIN extras e ON e.id = ae.extra_id
     LEFT JOIN barber_extra_prices bep ON bep.barber_id = a.barber_id AND bep.extra_id = ae.extra_id
     WHERE ae.appointment_id IN (?) ORDER BY e.name`, [ids]
  );
  // Produits choisis d'avance (en ligne ou a la borne) : ceux de la ligne de file si le RDV y est deja
  // (c'est ce que la caisse ajoutera au ticket), sinon ceux du RDV. Jamais de duree.
  const [prodA] = await pool.query(
    `SELECT ap.appointment_id, ap.product_id, p.name, p.price_cents, ap.quantity FROM appointment_products ap
     JOIN products p ON p.id = ap.product_id WHERE ap.appointment_id IN (?) ORDER BY p.name`, [ids]
  );
  const [prodQ] = await pool.query(
    `SELECT a.id AS appointment_id, qp.product_id, p.name, p.price_cents, qp.quantity FROM appointments a
     JOIN queue_products qp ON qp.queue_id = a.promoted_queue_id
     JOIN products p ON p.id = qp.product_id WHERE a.id IN (?) ORDER BY p.name`, [ids]
  );
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  svc.forEach((r) => {
    const extrasOnly = Boolean(r.system_kind);
    const custom = !extrasOnly && (num(r.b_price) !== null || num(r.b_duration) !== null);
    out[r.id] = {
      service_price_cents: extrasOnly ? 0 : (num(r.b_price) !== null ? num(r.b_price) : Number(r.cat_price) || 0),
      service_duration_min: extrasOnly ? 0 : (num(r.b_duration) !== null ? num(r.b_duration) : Number(r.cat_duration) || 0),
      service_catalog_price_cents: extrasOnly ? 0 : Number(r.cat_price) || 0,
      service_catalog_duration_min: extrasOnly ? 0 : Number(r.cat_duration) || 0,
      custom,
      extras: [],
      products: [],
      charged_cents: num(r.charged_cents),
    };
  });
  ext.forEach((e) => {
    const p = out[e.appointment_id];
    if (!p) return;
    p.extras.push({
      id: e.extra_id,
      name: e.name,
      price_cents: num(e.b_price) !== null ? num(e.b_price) : Number(e.cat_price) || 0,
      duration_min: num(e.b_duration) !== null ? num(e.b_duration) : Number(e.cat_duration) || 0,
      custom: num(e.b_price) !== null || num(e.b_duration) !== null,
    });
  });
  const fromQueue = new Set(prodQ.map((x) => x.appointment_id));
  prodQ.concat(prodA.filter((x) => !fromQueue.has(x.appointment_id))).forEach((x) => {
    const p = out[x.appointment_id];
    if (p) p.products.push({ id: x.product_id, name: x.name, unit_price_cents: Number(x.price_cents) || 0, quantity: Number(x.quantity) || 1 });
  });
  Object.values(out).forEach((p) => {
    // services_total_cents = prestation + supplements (= montant de la ligne de file, qui ne compte pas les produits)
    p.services_total_cents = p.service_price_cents + p.extras.reduce((t, x) => t + x.price_cents, 0);
    p.products_total_cents = p.products.reduce((t, x) => t + x.unit_price_cents * x.quantity, 0);
    p.total_cents = p.services_total_cents + p.products_total_cents;
    p.total_duration_min = p.service_duration_min + p.extras.reduce((t, x) => t + x.duration_min, 0);
  });
  return out;
}

async function buildApptItems(salonId, rows) {
  const [notes] = await pool.query('SELECT client_key, note FROM client_notes WHERE salon_id = ?', [salonId]);
  const noteByKey = Object.fromEntries(notes.map((n) => [n.client_key, n.note]));
  // Detail du prix : simple affichage, ne doit jamais empecher de lister les RDV.
  const pricing = await apptPricing(rows).catch((e) => { console.error('apptPricing', e && e.message); return {}; });
  return rows.map((r) => {
      // Statut affiche : annule reste annule ; termine si la coupe
      // promue en file est marquee "done" ; sinon confirme (a venir,
      // ou en cours d'attente/de coupe le jour meme).
      let displayStatus = 'confirmed';
      if (r.status === 'cancelled') displayStatus = 'cancelled';
      else if (r.queue_status === 'done') displayStatus = 'completed';
      else if (r.queue_status === 'cancelled') displayStatus = 'no_show';

      return Object.assign({}, r, {
        // scheduled_at reste une chaîne locale de SALON (Europe/Paris)
        // brute, JAMAIS passée par utcIso() - contrairement à
        // created_at (vraie UTC), lui étiqueter 'Z' comme si c'était de
        // l'UTC décale l'heure réelle de 1 à 2h (été/hiver), ce qui
        // faisait apparaître un RDV déjà terminé comme "encore à venir"
        // pendant ce délai (bouton Annuler resté actif à tort).
        scheduled_at: r.scheduled_at,
        created_at: utcIso(r.created_at),
        display_status: displayStatus,
        note: noteByKey[clientKey(r)] || '',
        duration_min: (r.service_duration_min || 0) + Number(r.extras_duration_min || 0),
        // Detail du prix (tiroirs) : prestation au tarif du coiffeur (personnalise ou catalogue) + supplements.
        pricing: pricing[r.id] || null,
        // Le jeton d'annulation est le secret du lien envoyé AU CLIENT par email : jamais renvoyé au salon.
        cancel_token: undefined
      });
  });
}

router.get('/', requireAdminOrBarber, wrap(async (req, res) => {
  const conditions = ['a.salon_id = ?'];
  const params = [req.salon.id];

  // Un coiffeur connecté (PIN, pas admin) ne voit que SES propres RDV -
  // utilisé par 'Mon poste' pour son propre agenda, jamais l'admin
  // complet du salon. L'Agenda de la caisse (vue multi-coiffeurs, filtre
  // fait côté client par bulle sélectionnée) passe explicitement
  // caisse_view=1 pour recevoir tout le monde, comme un admin.
  if (req.barberId && req.query.caisse_view !== '1') {
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

  // En mode 'all' sans mois précis (utilisé par la liste 'À venir' du
  // dashboard, pour pouvoir filtrer/exporter n'importe quel statut, pas
  // seulement les confirmés) : trier du plus récent au plus ancien,
  // pas l'inverse - sinon, sur un salon avec beaucoup d'historique, la
  // limite de 500 lignes se remplirait des plus VIEUX RDV et pourrait
  // exclure les RDV à venir les plus proches.
  const orderDirection = (req.query.all && !req.query.month) ? 'DESC' : 'ASC';

  const [rows] = await pool.query(
    `SELECT a.*, ${serviceNameSql()} AS service_name, COALESCE(bsp.duration_min, s.duration_min) AS service_duration_min, b.name AS barber_name,
            q.status AS queue_status,
            COALESCE((
              SELECT SUM(COALESCE(bep.duration_min, e.duration_min)) FROM appointment_extras ae
              JOIN extras e ON e.id = ae.extra_id
              LEFT JOIN barber_extra_prices bep ON bep.barber_id = a.barber_id AND bep.extra_id = ae.extra_id
              WHERE ae.appointment_id = a.id
            ), 0) AS extras_duration_min
     FROM appointments a
     LEFT JOIN services s ON s.id = a.service_id
     LEFT JOIN barber_service_prices bsp ON bsp.barber_id = a.barber_id AND bsp.service_id = a.service_id
     LEFT JOIN barbers b ON b.id = a.barber_id
     LEFT JOIN queue q ON q.id = a.promoted_queue_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.scheduled_at ${orderDirection} LIMIT 500`,
    params
  );

  res.json({ ok: true, items: await buildApptItems(req.salon.id, rows) });
}));

/**
 * Un seul RDV (même forme qu'un élément de la liste ci-dessus), retrouvé par
 * son id OU par la ligne de file à laquelle il a été promu - utilisé par le
 * tiroir client de la caisse (clic sur un RDV de la frise ou des suivants).
 */
router.get('/lookup', requireAdminOrBarber, wrap(async (req, res) => {
  const id = String(req.query.id || ''), queueId = String(req.query.queue_id || '');
  if (!id && !queueId) return res.status(400).json({ error: 'id ou queue_id requis' });
  const [rows] = await pool.query(
    `SELECT a.*, ${serviceNameSql()} AS service_name, COALESCE(bsp.duration_min, s.duration_min) AS service_duration_min, b.name AS barber_name,
            q.status AS queue_status,
            COALESCE((
              SELECT SUM(COALESCE(bep.duration_min, e.duration_min)) FROM appointment_extras ae
              JOIN extras e ON e.id = ae.extra_id
              LEFT JOIN barber_extra_prices bep ON bep.barber_id = a.barber_id AND bep.extra_id = ae.extra_id
              WHERE ae.appointment_id = a.id
            ), 0) AS extras_duration_min
     FROM appointments a
     LEFT JOIN services s ON s.id = a.service_id
     LEFT JOIN barber_service_prices bsp ON bsp.barber_id = a.barber_id AND bsp.service_id = a.service_id
     LEFT JOIN barbers b ON b.id = a.barber_id
     LEFT JOIN queue q ON q.id = a.promoted_queue_id
     WHERE a.salon_id = ? AND (a.id = ? OR a.promoted_queue_id = ?) LIMIT 1`,
    [req.salon.id, id, queueId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Rendez-vous introuvable' });
  const [item] = await buildApptItems(req.salon.id, rows);
  res.json({ ok: true, item });
}));

/**
 * Création d'un rendez-vous — public, comme le check-in kiosk. Si
 * pour AUJOURD'HUI, promeut immédiatement en entrée de file.
 */
router.post('/', bookingRateLimiter, wrap(withBookingLock((req, res) => bookSingle(req, res))));

async function bookSingle(req, res) {
  if (!req.dryRun && !(await guestEmailVerified(req))) return verifyRequired(res);
  const { client_name, email, phone, service_id, barber_id, extras, date, time, gift_id } = req.body;
  const clientNote = req.body.client_note ? String(req.body.client_note).slice(0, 500) : null;
  if (!client_name) return res.status(400).json({ error: 'Le nom est requis' });
  if (!email) return res.status(400).json({ error: "L'email est requis pour la confirmation" });
  if (!date || !time) return res.status(400).json({ error: 'Prestation, date et créneau requis' });
  if (!validBookingDate(date) || !validBookingTime(time)) return res.status(400).json({ error: 'Date ou heure invalide' });
  if (String(client_name).length > 255 || String(email).length > 255) return res.status(400).json({ error: 'Nom ou email trop long' });
  // Coordonnees valides (avant : « t » passait pour un email et un telephone).
  const contactErr = contactError({ name: client_name, email, phone }, { emailRequired: true });
  if (contactErr) return res.status(400).json({ error: contactErr });

  // Produits choisis d'avance (ex: une boisson) - jamais d'impact sur la
  // duree/le creneau, juste une liste a retrouver au moment d'encaisser.
  // Chaque quantite est bornee (1-99) et le produit doit vraiment
  // appartenir a ce salon, sinon silencieusement ignore plutot que de
  // planter toute la reservation pour une ligne invalide.
  const rawProducts = Array.isArray(req.body.products) ? req.body.products : [];
  let productSelections = [];
  if (rawProducts.length) {
    const productIds = rawProducts.map((p) => p && p.id).filter(Boolean);
    const [rows] = productIds.length
      ? await pool.query('SELECT id FROM products WHERE id IN (?) AND salon_id = ? AND online_bookable = 1', [productIds, req.salon.id])
      : [[]];
    const validIds = new Set(rows.map((r) => r.id));
    productSelections = rawProducts
      .filter((p) => p && validIds.has(p.id))
      .map((p) => ({ id: p.id, quantity: Math.min(99, Math.max(1, Number(p.quantity) || 1)) }));
  }

  const rdvSettings = await getSettings(req.salon.id);

  // Le champ 'min' du calendrier n'est qu'une protection côté
  // navigateur (fiable sur desktop, pas garantie sur toutes les
  // versions mobile/tablette) - on revérifie ici, côté serveur, que le
  // créneau demandé n'est pas déjà passé (heure de salon, pas UTC).
  if (`${date} ${time}:00` < nowParisDatetimeString(rdvSettings.timezone)) {
    return res.status(400).json({ error: 'Ce créneau est déjà passé, choisissez une date/heure à venir.' });
  }

  if (isBeyondAdvanceWindow(date, rdvSettings)) {
    return res.status(400).json({ error: 'Cette date est trop éloignée, choisissez une date plus proche.' });
  }

  const cat = await loadCatalog(req.salon.id, service_id, Array.isArray(extras) ? extras : []);
  if (!cat.ok) return res.status(cat.status).json({ error: cat.error });
  const service = cat.service;
  let extraIds = cat.extras.map((e) => e.id);
  let extraNames = cat.extras.map((e) => e.name);
  let durationMin;

  // Détermine le coiffeur final (précis, ou le premier disponible
  // parmi ceux en mode RDV pour ce créneau precis).
  let finalBarberId = barber_id || null;
  if (!finalBarberId) {
    // « Premier disponible » : choisi au moment de confirmer (le plus de creneaux libres ce jour-la).
    const pick = chooseAnyBarber(await anyBarberCandidates(req.salon.id, cat, date, rdvSettings), time);
    if (!pick) return res.status(409).json({ error: "Ce créneau n'est plus disponible" });
    finalBarberId = pick.id; durationMin = pick.offer.durationMin;
  } else {
    // Le coiffeur demandé doit appartenir à CE salon - sans ça, un
    // barber_id d'un autre salon (deviné/connu) était accepté tel
    // quel, computeSlotsForBarber ne vérifiant lui-même aucun salon_id.
    const [[ownedBarber]] = await pool.query(
      'SELECT id FROM barbers WHERE id = ? AND salon_id = ? AND active = 1', [finalBarberId, req.salon.id]
    );
    if (!ownedBarber) return res.status(404).json({ error: 'Coiffeur introuvable' });

    const offer = await offerFor(finalBarberId, cat);
    if (!offer.ok) return res.status(offer.status).json({ error: offer.error });
    durationMin = offer.durationMin;
    const slots = await computeSlotsForBarber(finalBarberId, date, durationMin, rdvSettings, { excludeVerificationId: req.verificationId });
    if (!slots.includes(time)) return res.status(409).json({ error: (await walkinRefusal(finalBarberId, date)) || "Ce créneau n'est plus disponible" });
  }

  // Vérification de l'email par code (client sans compte) : on s'arrête ici, rien n'est enregistré.
  // On renvoie le créneau à garder pendant la vérification et le résumé pour l'email du code.
  if (req.dryRun) {
    const [[bRow]] = await pool.query('SELECT name FROM barbers WHERE id = ?', [finalBarberId]);
    const startMin = timeToMinutes(time);
    return res.json({
      ok: true, dry: true,
      resolved: { barber_id: finalBarberId },
      holds: [{ barber_id: finalBarberId, date, start: startMin, end: startMin + durationMin }],
      summary: [{ name: client_name, when: date + ' ' + time, service: serviceLabel(service.name, extraNames, service.extras_only), barber: bRow ? bRow.name : null }]
    });
  }

  const id = crypto.randomUUID();
  const cancelToken = crypto.randomBytes(24).toString('hex');
  const scheduledAt = date + ' ' + time + ':00';

  // Un cadeau ne peut servir qu'a UN SEUL rendez-vous en attente a la
  // fois - la mise a jour conditionnelle (WHERE ... IS NULL) est
  // atomique, elle protege contre deux reservations lancees en meme
  // temps avec le meme code (l'une des deux perd la course et se voit
  // refusee proprement, plutot que les deux reussissent).
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
  if (gift_id) {
    const [giftLock] = await conn.query(
      `UPDATE gift_cards SET pending_appointment_id = ?
       WHERE id = ? AND salon_id = ? AND used_at IS NULL AND voided_at IS NULL AND pending_appointment_id IS NULL`,
      [id, gift_id, req.salon.id]
    );
    if (giftLock.affectedRows === 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'Ce cadeau n\'est plus disponible (déjà utilisé ou réservé pour un autre rendez-vous).' });
    }
  }

  await conn.query(
    `INSERT INTO appointments (id, salon_id, barber_id, client_name, email, phone, service_id, scheduled_at, status, cancel_token, client_note, gift_card_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)`,
    [id, req.salon.id, finalBarberId, client_name, email, phone || null, service.id, scheduledAt, cancelToken, clientNote, gift_id || null]
  );
  if (extraIds.length) {
    await conn.query(
      'INSERT INTO appointment_extras (appointment_id, extra_id) VALUES ?',
      [extraIds.map((eid) => [id, eid])]
    );
  }
  if (productSelections.length) {
    await conn.query(
      'INSERT INTO appointment_products (appointment_id, product_id, quantity) VALUES ?',
      [productSelections.map((p) => [id, p.id, p.quantity])]
    );
  }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
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
  const baseUrl = safeBaseUrl(req, req.body.base_url);
  const cancelUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'cancel=' + cancelToken;

  try {
    await sendAppointmentConfirmation(req.salon.id, email, {
      clientName: client_name,
      when,
      serviceName: serviceLabel(service.name, extraNames, service.extras_only),
      barberName: barber ? barber.name : null,
      cancelUrl,
      giftNote: gift_id ? 'Ce rendez-vous est réglé avec votre carte cadeau - présentez-vous en salon, rien à payer sur place.' : null
    });
  } catch (err) {
    console.error('[rdv] envoi email de confirmation échoué:', err.message);
  }

  // Si c'est pour aujourd'hui, on le fait apparaître tout de suite
  // dans la file (verrouillé jusqu'à l'heure prévue côté interface).
  const today = nowInParis(rdvSettings.timezone).dateStr;
  if (date === today) {
    await promoteAppointment({ id, salon_id: req.salon.id, barber_id: finalBarberId, client_name, email, phone, service_id: service.id, scheduled_at: scheduledAt }, extraIds, productSelections);
  }

  // Le coiffeur retenu (utile surtout en « Premier disponible ») : affiche au client apres confirmation.
  res.json({ ok: true, id, barber_id: finalBarberId, barber_name: barber ? barber.name : null });
}

/* ---------- RDV en ligne sans compte : vérification de l'email par code à 6 chiffres ----------
   Le client sans compte reçoit un code par email ; le RDV n'est enregistré qu'avec le bon code. Le créneau est
   gardé pendant les 60 s de validité du code ; 3 codes au plus (le 1er + 2 renvois) et 3 essais par code ;
   ensuite le créneau est rendu aux autres clients. Les clients connectés à leur compte (email déjà vérifié)
   et les RDV pris par le salon ne sont pas concernés. Réglage rdv_guest_email_code = '0' : désactivé. */
const CODE_TTL_SEC = 60, CODE_MAX_SENDS = 3, CODE_MAX_ATTEMPTS = 3;
const codeHash = (id, code) => crypto.createHash('sha256').update(id + ':' + String(code)).digest('hex');

/** Le client qui réserve a-t-il le droit de ne pas passer par le code ? */
async function guestEmailVerified(req) {
  if (req.emailVerifiedByCode) return true;
  const s = await getSettings(req.salon.id);
  if (String(s.rdv_guest_email_code) === '0') return true;
  const token = req.headers && req.headers['x-client-token'];
  if (token) {
    const [[c]] = await pool.query(
      `SELECT c.email_verified FROM client_sessions cs JOIN clients c ON c.id = cs.client_id
       WHERE cs.token = ? AND cs.expires_at > NOW()
         AND c.salon_id IN (SELECT id FROM salons WHERE owner_id = (SELECT owner_id FROM salons WHERE id = ?))`, [token, req.salon.id]);
    if (c && c.email_verified) return true;
  }
  return false;
}
function verifyRequired(res) {
  return res.status(403).json({ code: 'verify_required', error: 'Pour confirmer, vérifiez votre email avec le code reçu (rechargez la page si besoin).' });
}

/** Créneaux gardés par les vérifications en cours (code encore valable) pour ce coiffeur ce jour-là. */
async function verificationHolds(barberId, dateStr, excludeId) {
  const [rows] = await pool.query(
    `SELECT holds FROM booking_verifications
     WHERE salon_id = (SELECT salon_id FROM barbers WHERE id = ?) AND status = 'pending' AND expires_at > NOW() AND id != ?`,
    [barberId, excludeId || '']
  ).catch(() => [[]]);
  const out = [];
  rows.forEach((r) => {
    let hs = [];
    try { hs = JSON.parse(r.holds || '[]'); } catch (e) { hs = []; }
    hs.forEach((h) => { if (h && h.barber_id === barberId && h.date === dateStr) out.push([Number(h.start), Number(h.end)]); });
  });
  return out;
}

/** Fait tourner la réservation « à blanc » (rien n'est enregistré) : erreurs, coiffeur retenu, créneaux, résumé. */
async function dryRunBooking(req, kind, body, verificationId) {
  const fakeReq = Object.assign(Object.create(Object.getPrototypeOf(req)), req, { body, dryRun: true, verificationId });
  const out = { status: 200, data: null };
  const fakeRes = { status(c) { out.status = c; return this; }, json(d) { out.data = d; return this; } };
  if (kind === 'group') await createGroupBooking(fakeReq, fakeRes, false); else await bookSingle(fakeReq, fakeRes);
  return out;
}
/** La réservation à enregistrer plus tard, avec le coiffeur retenu (« premier disponible » figé). */
function resolvedPayload(kind, body, data) {
  const p = JSON.parse(JSON.stringify(body));
  if (kind === 'group') {
    const ids = (data.resolved && data.resolved.barber_ids) || [];
    (p.people || []).forEach((person, i) => { if (ids[i]) person.barber_id = ids[i]; });
  } else if (data.resolved && data.resolved.barber_id) p.barber_id = data.resolved.barber_id;
  return p;
}
async function sendCodeEmail(req, v, code, summary) {
  const fmt = (w) => new Date(String(w).replace(' ', 'T')).toLocaleString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });
  const lines = (summary || []).map((x) => fmt(x.when) + ' · ' + x.service + (x.barber ? ' · avec ' + x.barber : '') + ((summary || []).length > 1 ? ' (' + x.name + ')' : ''));
  const payload = JSON.parse(v.payload);
  await sendBookingCode(req.salon.id, v.email, { clientName: payload.client_name, code, lines, ttlSec: CODE_TTL_SEC });
}
function newCode() { return String(crypto.randomInt(0, 1000000)).padStart(6, '0'); }

// 1) Le client demande son code : la réservation est vérifiée à blanc, le créneau gardé 60 s, le code envoyé.
router.post('/verify/start', bookingRateLimiter, wrap(withBookingLock(async (req, res) => {
  const kind = req.body.kind === 'group' ? 'group' : 'single';
  const body = req.body.booking && typeof req.body.booking === 'object' ? req.body.booking : null;
  if (!body) return res.status(400).json({ error: 'Réservation manquante' });
  if (!body.email || !isValidEmail(body.email)) return res.status(400).json({ error: 'Entrez un email valide pour recevoir le code' });
  const dry = await dryRunBooking(req, kind, body, null);
  if (dry.status >= 400 || !dry.data || !dry.data.dry) return res.status(dry.status >= 400 ? dry.status : 400).json(dry.data || { error: 'Réservation impossible' });
  const id = crypto.randomUUID(), code = newCode();
  const payload = resolvedPayload(kind, body, dry.data);
  await pool.query(
    `INSERT INTO booking_verifications (id, salon_id, email, kind, payload, holds, code_hash, expires_at, sends, attempts, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW() + INTERVAL ? SECOND, 1, 0, 'pending')`,
    [id, req.salon.id, String(body.email).trim(), kind, JSON.stringify(payload), JSON.stringify(dry.data.holds || []), codeHash(id, code), CODE_TTL_SEC]
  );
  const [[v]] = await pool.query('SELECT * FROM booking_verifications WHERE id = ?', [id]);
  try { await sendCodeEmail(req, v, code, dry.data.summary); } catch (err) {
    await pool.query("UPDATE booking_verifications SET status = 'failed' WHERE id = ?", [id]);
    console.error('[rdv-code] envoi du code échoué:', err.message);
    return res.status(502).json({ error: "L'email avec le code n'a pas pu être envoyé. Vérifiez l'adresse ou réessayez." });
  }
  res.json({ ok: true, verification_id: id, email: v.email, expires_in: CODE_TTL_SEC, sends_left: CODE_MAX_SENDS - 1, attempts_left: CODE_MAX_ATTEMPTS });
})));

// 2) Pas reçu / expiré / trop d'essais : nouveau code (3 codes en tout), le créneau est revérifié et regardé 60 s.
router.post('/verify/resend', codeRateLimiter, wrap(withBookingLock(async (req, res) => {
  const [[v]] = await pool.query('SELECT * FROM booking_verifications WHERE id = ? AND salon_id = ?', [String(req.body.verification_id || ''), req.salon.id]);
  if (!v || v.status !== 'pending') return res.status(410).json({ code: 'closed', error: 'Cette vérification est terminée : recommencez la réservation.' });
  if (v.sends >= CODE_MAX_SENDS) {
    await pool.query("UPDATE booking_verifications SET status = 'failed' WHERE id = ?", [v.id]);
    return res.status(410).json({ code: 'no_more', error: 'Le créneau a été libéré pour les autres clients.' });
  }
  const dry = await dryRunBooking(req, v.kind, JSON.parse(v.payload), v.id);
  if (dry.status >= 400 || !dry.data || !dry.data.dry) {
    await pool.query("UPDATE booking_verifications SET status = 'failed' WHERE id = ?", [v.id]);
    return res.status(409).json({ code: 'slot_taken', error: (dry.data && dry.data.error) || "Ce créneau n'est plus disponible : choisissez-en un autre." });
  }
  const code = newCode();
  await pool.query(
    'UPDATE booking_verifications SET code_hash = ?, expires_at = NOW() + INTERVAL ? SECOND, sends = sends + 1, attempts = 0, holds = ? WHERE id = ?',
    [codeHash(v.id, code), CODE_TTL_SEC, JSON.stringify(dry.data.holds || []), v.id]
  );
  try { await sendCodeEmail(req, v, code, dry.data.summary); } catch (err) {
    console.error('[rdv-code] renvoi du code échoué:', err.message);
    return res.status(502).json({ error: "L'email avec le code n'a pas pu être envoyé. Réessayez." });
  }
  res.json({ ok: true, expires_in: CODE_TTL_SEC, sends_left: CODE_MAX_SENDS - v.sends - 1, attempts_left: CODE_MAX_ATTEMPTS });
})));

// 3) Le bon code : le RDV est enregistré (même chemin qu'une réservation normale), sinon l'erreur et ce qu'il reste.
router.post('/verify/confirm', codeRateLimiter, wrap(withBookingLock(async (req, res) => {
  const [[v]] = await pool.query(
    'SELECT *, expires_at <= NOW() AS is_expired FROM booking_verifications WHERE id = ? AND salon_id = ?',
    [String(req.body.verification_id || ''), req.salon.id]
  );
  if (!v || v.status !== 'pending') return res.status(410).json({ code: 'closed', error: 'Cette vérification est terminée : recommencez la réservation.' });
  const sendsLeft = Math.max(0, CODE_MAX_SENDS - v.sends);
  if (Number(v.is_expired)) return res.status(410).json({ code: 'expired', sends_left: sendsLeft, error: 'Les 60 secondes sont écoulées : ce code ne marche plus.' });
  if (!v.code_hash) return res.status(400).json({ code: 'locked', attempts_left: 0, sends_left: sendsLeft, error: 'Trop d\'essais : demandez un nouveau code.' });
  const code = String(req.body.code || '').replace(/\D/g, '');
  if (code.length !== 6 || codeHash(v.id, code) !== v.code_hash) {
    const attempts = v.attempts + 1, left = Math.max(0, CODE_MAX_ATTEMPTS - attempts);
    await pool.query('UPDATE booking_verifications SET attempts = ?, code_hash = IF(? >= ?, NULL, code_hash) WHERE id = ?', [attempts, attempts, CODE_MAX_ATTEMPTS, v.id]);
    return res.status(400).json(left
      ? { code: 'wrong', attempts_left: left, sends_left: sendsLeft, error: 'Code incorrect. Il vous reste ' + left + (left > 1 ? ' essais.' : ' essai.') }
      : { code: 'locked', attempts_left: 0, sends_left: sendsLeft, error: 'Trop d\'essais : demandez un nouveau code.' });
  }
  const [used] = await pool.query("UPDATE booking_verifications SET status = 'used' WHERE id = ? AND status = 'pending'", [v.id]);
  if (!used.affectedRows) return res.status(410).json({ code: 'closed', error: 'Cette vérification est terminée.' });
  const realReq = Object.assign(Object.create(Object.getPrototypeOf(req)), req, { body: JSON.parse(v.payload), emailVerifiedByCode: true, verificationId: v.id });
  if (v.kind === 'group') return createGroupBooking(realReq, res, false);
  return bookSingle(realReq, res);
})));

/**
 * Reservation a PLUSIEURS (un parent + ses enfants...) : une seule demande, un rendez-vous par personne,
 * chacun avec sa prestation, son coiffeur (le meme ou un autre) et son horaire (a la suite ou en meme
 * temps). Tout ou rien : si un creneau n'est plus libre, rien n'est enregistre et on dit pour qui.
 * Les personnes sont enregistrees l'une apres l'autre : chaque verification voit donc les rendez-vous
 * deja poses pour les precedentes (deux personnes ne peuvent pas se chevaucher chez le meme coiffeur).
 * Le rendez-vous reste au nom d'email/telephone du client qui reserve (annulation, fidelite).
 */
router.post('/group', bookingRateLimiter, wrap(withBookingLock((req, res) => createGroupBooking(req, res, false))));

/**
 * Même réservation à plusieurs, faite par le SALON (dashboard, caisse, Mon poste) : email facultatif
 * (confirmation envoyée seulement s'il est renseigné), pas de délai minimum ni de fenêtre maximale,
 * coiffeur au choix pour chaque personne.
 */
router.post('/admin-group', requireAdminOrBarber, wrap(withBookingLock((req, res) => createGroupBooking(req, res, true))));

async function createGroupBooking(req, res, staff) {
  if (!staff && !req.dryRun && !(await guestEmailVerified(req))) return verifyRequired(res);
  const { client_name, email, phone } = req.body;
  if (!email && !staff) return res.status(400).json({ error: "L'email est requis pour la confirmation" });
  if (!client_name) return res.status(400).json({ error: 'Le nom est requis' });
  const contactErr = contactError({ name: client_name, email, phone }, { emailRequired: !staff, nameRequired: !staff });
  if (contactErr) return res.status(400).json({ error: contactErr });
  const clientNote = req.body.client_note ? String(req.body.client_note).slice(0, 500) : null;

  const norm = groupBooking.normalizePeople(req.body);
  if (norm.error) return res.status(400).json({ error: norm.error, person_index: norm.index });

  const rdvSettings = await getSettings(req.salon.id);
  const nowStr = nowParisDatetimeString(rdvSettings.timezone);
  const groupId = crypto.randomUUID();
  const created = [];   // { id, cancelToken, person, barberId, scheduledAt, serviceName, extraIds, products, durationMin }

  const fail = async (status, index, message) => {
    if (created.length) await pool.query('DELETE FROM appointments WHERE id IN (?)', [created.map((c) => c.id)]);
    return res.status(status).json({ error: message, person_index: index });
  };

  for (let i = 0; i < norm.people.length; i++) {
    const p = norm.people[i];
    if (!validBookingDate(p.date) || !validBookingTime(p.time)) return fail(400, i, 'Date ou heure invalide.');
    if (await isSalonClosedOnDate(req.salon.id, p.date)) return fail(409, i, 'Salon fermé ce jour : rendez-vous impossible.');
    if (`${p.date} ${p.time}:00` < nowStr) return fail(400, i, 'Le créneau de ' + p.name + ' est déjà passé, choisissez une date/heure à venir.');
    if (!staff && isBeyondAdvanceWindow(p.date, rdvSettings)) return fail(400, i, 'La date de ' + p.name + ' est trop éloignée, choisissez une date plus proche.');

    const cat = await loadCatalog(req.salon.id, p.service_id, p.extras);
    if (!cat.ok) return fail(cat.status, i, cat.error + ' (' + p.name + ').');
    const service = cat.service;
    p.service_id = service.id;   // « Supplement seul » : la prestation cachee
    const extraIds = cat.extras.map((e) => e.id), extraNames = cat.extras.map((e) => e.name);
    let productSelections = [];
    if (p.products.length) {
      const [rows] = await pool.query('SELECT id FROM products WHERE id IN (?) AND salon_id = ? AND online_bookable = 1', [p.products.map((x) => x.id), req.salon.id]);
      const valid = new Set(rows.map((r) => r.id));
      productSelections = p.products.filter((x) => valid.has(x.id));
    }
    let durationMin;

    // Coiffeur : celui demande (doit etre de CE salon) ou le premier libre a cette heure precise.
    let barberId = p.barber_id;
    if (barberId) {
      const [[owned]] = await pool.query('SELECT id FROM barbers WHERE id = ? AND salon_id = ? AND active = 1', [barberId, req.salon.id]);
      if (!owned) return fail(404, i, 'Coiffeur introuvable pour ' + p.name + '.');
      const offer = await offerFor(barberId, cat);
      if (!offer.ok) return fail(offer.status, i, offer.error + ' (' + p.name + ').');
      durationMin = offer.durationMin;
      const slots = await computeSlotsForBarber(barberId, p.date, durationMin, rdvSettings, staff ? { skipLead: true } : { excludeVerificationId: req.verificationId });
      if (!slots.includes(p.time)) return fail(409, i, (await walkinRefusal(barberId, p.date)) || ("Le créneau de " + p.name + " n'est plus disponible (" + p.time + ")."));
    } else {
      // « Premier disponible » pour cette personne (les RDV deja crees du groupe comptent : ils sont en base).
      const pick = chooseAnyBarber(await anyBarberCandidates(req.salon.id, cat, p.date, rdvSettings, () => (staff ? { skipLead: true } : { excludeVerificationId: req.verificationId })), p.time);
      if (!pick) return fail(409, i, "Le créneau de " + p.name + " n'est plus disponible (" + p.time + ").");
      barberId = pick.id; durationMin = pick.offer.durationMin;
    }

    const id = crypto.randomUUID();
    const cancelToken = crypto.randomBytes(24).toString('hex');
    const scheduledAt = p.date + ' ' + p.time + ':00';
    await pool.query(
      `INSERT INTO appointments (id, salon_id, barber_id, client_name, email, phone, service_id, scheduled_at, status, cancel_token, client_note, group_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)`,
      [id, req.salon.id, barberId, p.name, email || null, phone || null, p.service_id, scheduledAt, cancelToken, clientNote, groupId]
    );
    created.push({ id, cancelToken, person: p, barberId, scheduledAt, serviceName: serviceLabel(service.name, extraNames, service.extras_only), extraIds, productSelections, durationMin });
    if (extraIds.length) await pool.query('INSERT INTO appointment_extras (appointment_id, extra_id) VALUES ?', [extraIds.map((eid) => [id, eid])]);
    if (productSelections.length) await pool.query('INSERT INTO appointment_products (appointment_id, product_id, quantity) VALUES ?', [productSelections.map((x) => [id, x.id, x.quantity])]);
  }

  // Vérification de l'email par code : tout est possible -> on retire ces RDV d'essai et on renvoie les créneaux
  // à garder (un par personne, coiffeur retenu compris) et le résumé pour l'email du code.
  if (req.dryRun) {
    await pool.query('DELETE FROM appointments WHERE id IN (?)', [created.map((c) => c.id)]);
    const ids = Array.from(new Set(created.map((c) => c.barberId)));
    const [bRows] = await pool.query('SELECT id, name FROM barbers WHERE id IN (?)', [ids]);
    const nm = Object.fromEntries(bRows.map((b) => [b.id, b.name]));
    return res.json({
      ok: true, dry: true,
      resolved: { barber_ids: created.map((c) => c.barberId) },
      holds: created.map((c) => { const st = timeToMinutes(c.person.time); return { barber_id: c.barberId, date: c.person.date, start: st, end: st + c.durationMin }; }),
      summary: created.map((c) => ({ name: c.person.name, when: c.person.date + ' ' + c.person.time, service: c.serviceName, barber: nm[c.barberId] || null }))
    });
  }

  // Tout est enregistre : mail unique, puis mise en file immediate des passages d'AUJOURD'HUI.
  const baseUrl = safeBaseUrl(req, req.body.base_url);
  const cancelLink = (token, all) => baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'cancel=' + token + (all ? '&all=1' : '');
  const barberIds = Array.from(new Set(created.map((c) => c.barberId).filter(Boolean)));
  const nameById = {};
  if (barberIds.length) {
    const [bRows] = await pool.query('SELECT id, name FROM barbers WHERE id IN (?)', [barberIds]);
    bRows.forEach((b) => { nameById[b.id] = b.name; });
  }
  const fmtWhen = (at) => new Date(at.replace(' ', 'T')).toLocaleString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });
  if (email) try {
    await sendGroupAppointmentConfirmation(req.salon.id, email, {
      clientName: client_name,
      items: created.map((c) => ({ personName: c.person.name, when: fmtWhen(c.scheduledAt), serviceName: c.serviceName, barberName: nameById[c.barberId] || null, cancelUrl: cancelLink(c.cancelToken, false) })),
      cancelAllUrl: cancelLink(created[0].cancelToken, true)
    });
  } catch (err) {
    console.error('[rdv] envoi email de confirmation de groupe échoué:', err.message);
  }

  const today = nowInParis(rdvSettings.timezone).dateStr;
  for (const c of created) {
    if (c.person.date === today) {
      await promoteAppointment({ id: c.id, salon_id: req.salon.id, barber_id: c.barberId, client_name: c.person.name, email, phone, service_id: c.person.service_id, scheduled_at: c.scheduledAt }, c.extraIds, c.productSelections);
    }
  }

  res.json({
    ok: true, group_id: groupId,
    appointments: created.map((c) => ({ id: c.id, name: c.person.name, scheduled_at: c.scheduledAt, service_name: c.serviceName, barber_name: nameById[c.barberId] || null }))
  });
}

/**
 * Annule TOUS les rendez-vous encore a venir du groupe auquel appartient ce lien (bouton « Annuler tout »
 * de l'email de groupe). Le delai limite d'annulation s'applique a chaque rendez-vous : ceux qui sont
 * deja trop proches sont gardes, et le client est prevenu.
 */
// Verrouiller les annulations publiques sur le salon propriétaire du RDV,
// même si le lien d'annulation est ouvert depuis un autre contexte de salon.
const resolveCancellationSalon = (req, res, next) => {
  (async () => {
    const token = req.body && req.body.token;
    if (!token) return res.status(400).json({ error: 'Token requis' });
    const [[row]] = await pool.query('SELECT salon_id FROM appointments WHERE cancel_token = ? LIMIT 1', [token]);
    if (!row) return res.status(404).json({ error: 'Rendez-vous introuvable' });
    req.bookingLockSalonId = row.salon_id;
    next();
  })().catch(next);
};

router.post('/cancel-group', resolveCancellationSalon, wrap(withBookingLock(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token requis' });
  const [[appt]] = await pool.query('SELECT id, salon_id, group_id FROM appointments WHERE cancel_token = ?', [token]);
  if (!appt) return res.status(404).json({ error: 'Rendez-vous introuvable' });

  const members = appt.group_id
    ? (await pool.query("SELECT id, salon_id, scheduled_at, promoted_queue_id, gift_card_id FROM appointments WHERE group_id = ? AND salon_id = ? AND status = 'confirmed'", [appt.group_id, appt.salon_id]))[0]
    : (await pool.query("SELECT id, salon_id, scheduled_at, promoted_queue_id, gift_card_id FROM appointments WHERE id = ? AND status = 'confirmed'", [appt.id]))[0];
  if (!members.length) return res.status(409).json({ error: 'Ces rendez-vous sont déjà annulés' });

  const rdvSettings = await getSettings(appt.salon_id);
  const deadlineMin = Number(rdvSettings.rdv_cancel_deadline_min) || 0;
  const nowMs = new Date(nowParisDatetimeString(rdvSettings.timezone).replace(' ', 'T') + 'Z');
  let cancelled = 0, kept = 0;
  for (const m of members) {
    const scheduledLocal = m.scheduled_at instanceof Date ? m.scheduled_at.toISOString().slice(0, 19).replace('T', ' ') : String(m.scheduled_at).replace('T', ' ').slice(0, 19);
    const minutesUntil = (new Date(scheduledLocal.replace(' ', 'T') + 'Z') - nowMs) / 60000;
    if (minutesUntil <= 0) { kept++; continue; }
    if (m.promoted_queue_id) {
      const paid = await saleForPassage(pool, m.salon_id, m.promoted_queue_id);
      if (paid) { kept++; continue; }
    }
    if (deadlineMin > 0 && minutesUntil < deadlineMin) { kept++; continue; }
    await pool.query('UPDATE appointments SET status = ? WHERE id = ?', ['cancelled', m.id]);
    if (m.promoted_queue_id) {
      await pool.query("UPDATE queue SET status = 'cancelled' WHERE id = ? AND status IN ('waiting','in_progress')", [m.promoted_queue_id]);
    }
    if (m.gift_card_id) await releaseGiftAfterCancellation(m.salon_id, m.gift_card_id, m.id);
    cancelled++;
  }
  if (!cancelled) return res.status(403).json({ error: "Trop tard pour annuler ces rendez-vous en ligne, contactez directement le salon." });
  res.json({ ok: true, cancelled, kept });
})));

/**
 * Création manuelle d'un RDV par l'admin (ex: client au téléphone) -
 * email optionnel (pas de confirmation envoyée si absent, contrairement
 * à une réservation en ligne où il est obligatoire), mais le coiffeur
 * est TOUJOURS requis explicitement (pas de "premier disponible"
 * automatique comme pour le grand public).
 */
async function isSalonClosedOnDate(salonId, dateStr) {
  const [[closed]] = await pool.query(
    'SELECT id FROM salon_closures WHERE salon_id = ? AND start_date <= ? AND end_date >= ? LIMIT 1',
    [salonId, dateStr, dateStr]
  );
  return !!closed;
}

router.post('/admin-create', requireAdminOrBarber, wrap(withBookingLock(async (req, res) => {
  const { client_name, email, phone, service_id, extras, date, time } = req.body;
  // Un coiffeur connecté (PIN) ne peut créer un RDV que pour le coiffeur
  // actif (lui-même par défaut, ou celui désigné par bulle depuis la
  // caisse partagée) - le coiffeur envoyé dans le corps de la requête
  // est ignoré dans ce cas. L'admin garde le choix libre du coiffeur.
  // Pas de coiffeur (admin) = « Premier disponible » : le systeme choisit (voir chooseAnyBarber).
  let barber_id = req.actingBarberId || req.body.barber_id || null;
  const clientNote = req.body.client_note ? String(req.body.client_note).slice(0, 500) : null;
  if (!client_name) return res.status(400).json({ error: 'Le nom est requis' });
  if (!date || !time) return res.status(400).json({ error: 'Prestation, date et créneau requis' });
  if (!validBookingDate(date) || !validBookingTime(time)) return res.status(400).json({ error: 'Date ou heure invalide' });
  if (String(client_name).length > 255 || (email && String(email).length > 255)) return res.status(400).json({ error: 'Nom ou email trop long' });
  // Equipe : email et telephone facultatifs, mais valides s'ils sont saisis.
  const contactErr = contactError({ name: client_name, email, phone }, { nameRequired: false });
  if (contactErr) return res.status(400).json({ error: contactErr });

  if (await isSalonClosedOnDate(req.salon.id, date)) return res.status(409).json({ error: 'Salon fermé ce jour : prise de rendez-vous impossible.' });

  const rawProducts = Array.isArray(req.body.products) ? req.body.products : [];
  let productSelections = [];
  if (rawProducts.length) {
    const productIds = rawProducts.map((p) => p && p.id).filter(Boolean);
    const [prodRows] = productIds.length
      ? await pool.query('SELECT id FROM products WHERE id IN (?) AND salon_id = ? AND online_bookable = 1', [productIds, req.salon.id])
      : [[]];
    const validIds = new Set(prodRows.map((r) => r.id));
    productSelections = rawProducts
      .filter((p) => p && validIds.has(p.id))
      .map((p) => ({ id: p.id, quantity: Math.min(99, Math.max(1, Number(p.quantity) || 1)) }));
  }

  const rdvSettings = await getSettings(req.salon.id);

  if (`${date} ${time}:00` < nowParisDatetimeString(rdvSettings.timezone)) {
    return res.status(400).json({ error: 'Ce créneau est déjà passé, choisissez une date/heure à venir.' });
  }

  const cat = await loadCatalog(req.salon.id, service_id, Array.isArray(extras) ? extras : []);
  if (!cat.ok) return res.status(cat.status).json({ error: cat.error });
  const service = cat.service;
  const extraIds = cat.extras.map((e) => e.id), extraNames = cat.extras.map((e) => e.name);

  // Le coiffeur demandé doit appartenir à CE salon - protection
  // identique à la route publique (voir plus haut), même si côté
  // coiffeur connecté req.barberId est déjà garanti sûr par
  // barberAuth.js (le PIN est vérifié avec salon_id) - reste utile
  // pour le choix libre de l'admin.
  let durationMin;
  if (!barber_id) {
    const pick = chooseAnyBarber(await anyBarberCandidates(req.salon.id, cat, date, rdvSettings, () => ({ skipLead: true })), time);
    if (!pick) return res.status(409).json({ error: "Aucun coiffeur n'est libre à ce créneau" });
    barber_id = pick.id; durationMin = pick.offer.durationMin;
  } else {
    const [[ownedBarber]] = await pool.query(
      'SELECT id FROM barbers WHERE id = ? AND salon_id = ? AND active = 1', [barber_id, req.salon.id]
    );
    if (!ownedBarber) return res.status(404).json({ error: 'Coiffeur introuvable' });
    const offer = await offerFor(barber_id, cat);
    if (!offer.ok) return res.status(offer.status).json({ error: offer.error });
    durationMin = offer.durationMin;

    // Admin exempté du délai minimum de réservation (rdv_min_lead_min) et
    // de la fenêtre max à l'avance (pas vérifiée ici du tout) - ce sont
    // des garde-fous pour le grand public, pas pour un ajout manuel gu
    // idé par le staff. Le pas des créneaux et la marge tampon restent
    // appliqués (évite un vrai conflit d'agenda).
    const slots = await computeSlotsForBarber(barber_id, date, durationMin, rdvSettings, { skipLead: true });
    if (!slots.includes(time)) return res.status(409).json({ error: (await walkinRefusal(barber_id, date)) || "Ce créneau n'est plus disponible" });
  }

  const id = crypto.randomUUID();
  const cancelToken = crypto.randomBytes(24).toString('hex');
  const scheduledAt = date + ' ' + time + ':00';

  await pool.query(
    `INSERT INTO appointments (id, salon_id, barber_id, client_name, email, phone, service_id, scheduled_at, status, cancel_token, client_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)`,
    [id, req.salon.id, barber_id, client_name, email || null, phone || null, service.id, scheduledAt, cancelToken, clientNote]
  );
  if (extraIds.length) {
    await pool.query('INSERT INTO appointment_extras (appointment_id, extra_id) VALUES ?', [extraIds.map((eid) => [id, eid])]);
  }
  if (productSelections.length) {
    await pool.query('INSERT INTO appointment_products (appointment_id, product_id, quantity) VALUES ?', [productSelections.map((p) => [id, p.id, p.quantity])]);
  }

  if (email) {
    const [[barber]] = await pool.query('SELECT name FROM barbers WHERE id = ?', [barber_id]);
    const when = new Date(scheduledAt.replace(' ', 'T')).toLocaleString('fr-FR', {
      weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'
    });
    const baseUrl = safeBaseUrl(req, req.body.base_url);
    const cancelUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'cancel=' + cancelToken;
    try {
      await sendAppointmentConfirmation(req.salon.id, email, {
        clientName: client_name, when,
        serviceName: serviceLabel(service.name, extraNames, service.extras_only),
        barberName: barber ? barber.name : null,
        cancelUrl
      });
    } catch (err) {
      console.error('[admin-create] envoi email échoué:', err.message);
    }
  }

  const today = nowInParis(rdvSettings.timezone).dateStr;
  if (date === today) {
    await promoteAppointment(
      { id, salon_id: req.salon.id, barber_id, client_name, email: email || null, phone, service_id: service.id, scheduled_at: scheduledAt },
      extraIds, productSelections
    );
  }

  const [[assigned]] = await pool.query('SELECT name FROM barbers WHERE id = ?', [barber_id]);
  res.json({ ok: true, id, barber_id, barber_name: assigned ? assigned.name : null });
})));

/**
 * Import de rendez-vous en lot (depuis un export CSV, ex. Bookly) - admin
 * uniquement. Le rapprochement coiffeur/prestation est fait côté
 * dashboard : chaque ligne arrive avec un barber_id et un service_id de CE
 * salon. Volontairement plus souple que admin-create : pas de contrôle de
 * disponibilité ni de créneau passé (reprise d'un agenda existant, déjà
 * validé par l'ancien outil) ; un chevauchement avec un autre RDV du
 * même coiffeur est importé mais compté dans `overlaps`. Aucun email n'est
 * envoyé. Les doublons (même coiffeur, même heure, même nom) sont ignorés,
 * donc relancer un fichier déjà importé en partie est sans danger.
 */
router.post('/import', requireAdmin, wrap(async (req, res) => {
  const list = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!list.length) return res.status(400).json({ error: 'Aucun rendez-vous à importer' });
  if (list.length > 200) return res.status(400).json({ error: 'Maximum 200 rendez-vous par lot' });

  const [barberRows] = await pool.query('SELECT id FROM barbers WHERE salon_id = ?', [req.salon.id]);
  const [serviceRows] = await pool.query('SELECT id, duration_min FROM services WHERE salon_id = ?', [req.salon.id]);
  const barberIds = new Set(barberRows.map((b) => b.id));
  const serviceDur = new Map(serviceRows.map((x) => [x.id, x.duration_min]));

  const errors = [];
  const valid = [];
  list.forEach((r, i) => {
    const line = Number(r && r.line) || i + 1;
    const date = String((r && r.date) || '');
    const time = String((r && r.time) || '');
    const name = String((r && r.client_name) || '').trim().slice(0, 255);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || isNaN(Date.parse(date + 'T' + time + ':00Z'))) {
      return errors.push({ line, error: 'Date ou heure illisible' });
    }
    if (!name) return errors.push({ line, error: 'Nom du client manquant' });
    if (!barberIds.has(r.barber_id)) return errors.push({ line, error: 'Coiffeur inconnu' });
    if (!serviceDur.has(r.service_id)) return errors.push({ line, error: 'Prestation inconnue' });
    valid.push({
      line, name, date, time, barber_id: r.barber_id, service_id: r.service_id,
      email: String(r.email || '').trim().slice(0, 255) || null,
      phone: String(r.phone || '').trim().slice(0, 50) || null,
      note: String(r.note || '').trim().slice(0, 500) || null,
      scheduledAt: date + ' ' + time + ':00',
      start: Date.parse(date + 'T' + time + ':00Z') / 60000
    });
  });

  let skipped = 0, overlaps = 0;
  const toInsert = [];
  if (valid.length) {
    const dates = valid.map((v) => v.date).sort();
    const [existing] = await pool.query(
      `SELECT a.barber_id, a.scheduled_at, a.client_name,
              COALESCE(s.duration_min, 0) + COALESCE((SELECT SUM(e.duration_min) FROM appointment_extras ae JOIN extras e ON e.id = ae.extra_id WHERE ae.appointment_id = a.id), 0) AS dur
       FROM appointments a LEFT JOIN services s ON s.id = a.service_id
       WHERE a.salon_id = ? AND a.status = 'confirmed' AND DATE(a.scheduled_at) BETWEEN ? AND ?`,
      [req.salon.id, dates[0], dates[dates.length - 1]]
    );
    const occupied = existing.map((a) => {
      const at = String(a.scheduled_at).replace('T', ' ').slice(0, 19);
      return { barber: a.barber_id, at, name: String(a.client_name || '').trim().toLowerCase(),
               start: Date.parse(at.replace(' ', 'T') + 'Z') / 60000, dur: Number(a.dur) || 0 };
    });
    for (const v of valid) {
      const lname = v.name.toLowerCase();
      if (occupied.some((o) => o.barber === v.barber_id && o.at === v.scheduledAt && o.name === lname)) { skipped++; continue; }
      const dur = serviceDur.get(v.service_id) || 0;
      if (occupied.some((o) => o.barber === v.barber_id && v.start < o.start + o.dur && o.start < v.start + dur)) overlaps++;
      occupied.push({ barber: v.barber_id, at: v.scheduledAt, name: lname, start: v.start, dur });
      toInsert.push(v);
    }
  }

  if (toInsert.length) {
    await pool.query(
      'INSERT INTO appointments (id, salon_id, barber_id, client_name, email, phone, service_id, scheduled_at, status, cancel_token, client_note, source) VALUES ' +
      toInsert.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, 'import')").join(', '),
      toInsert.flatMap((v) => [crypto.randomUUID(), req.salon.id, v.barber_id, v.name, v.email, v.phone, v.service_id, v.scheduledAt, crypto.randomBytes(24).toString('hex'), v.note])
    );
  }
  if (toInsert.length) logActivity(req.salon.id, 'appointments_import', toInsert.length + ' rendez-vous importé' + (toInsert.length > 1 ? 's' : '') + ' depuis un fichier CSV');
  res.json({ ok: true, inserted: toInsert.length, skipped, overlaps, errors });
}));

/**
 * Annulation publique via le lien envoyé par email — retrouvé
 * uniquement par le token (le lien ne contient que ça, pas l'id).
 */
router.post('/cancel', resolveCancellationSalon, wrap(withBookingLock(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token requis' });

  const [[appt]] = await pool.query(
    'SELECT id, salon_id, status, scheduled_at, promoted_queue_id, gift_card_id FROM appointments WHERE cancel_token = ?', [token]
  );
  if (!appt) return res.status(404).json({ error: 'Rendez-vous introuvable' });
  if (appt.status !== 'confirmed') return res.status(409).json({ error: 'Ce rendez-vous ne peut plus être annulé en ligne. Contactez le salon.' });
  if (appt.promoted_queue_id) {
    const paid = await saleForPassage(pool, appt.salon_id, appt.promoted_queue_id);
    if (paid) return res.status(409).json({ error: 'Ce rendez-vous a déjà été encaissé. Contactez le salon pour gérer son annulation et un éventuel remboursement.' });
  }

  // Délai limite d'annulation : recherché via le salon RÉEL du RDV
  // (appt.salon_id), pas req.salon - cette route est publique, le
  // salon envoyé par le client ne fait pas forcément foi.
  const rdvSettings = await getSettings(appt.salon_id);
  const scheduledLocal = appt.scheduled_at instanceof Date ? appt.scheduled_at.toISOString().slice(0, 19).replace('T', ' ') : String(appt.scheduled_at).replace('T', ' ').slice(0, 19);
  if (scheduledLocal <= nowParisDatetimeString(rdvSettings.timezone)) {
    return res.status(403).json({ error: 'Un rendez-vous passé ne peut plus être annulé en ligne.' });
  }
  const deadlineMin = Number(rdvSettings.rdv_cancel_deadline_min) || 0;
  if (deadlineMin > 0) {
    const minutesUntil = (new Date(scheduledLocal.replace(' ', 'T') + 'Z') - new Date(nowParisDatetimeString(rdvSettings.timezone).replace(' ', 'T') + 'Z')) / 60000;
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
  if (appt.gift_card_id) await releaseGiftAfterCancellation(appt.salon_id, appt.gift_card_id, appt.id);

  res.json({ ok: true });
})));

/**
 * Annulation à l'initiative de l'ADMIN (bouton dans le tiroir client de
 * l'agenda) - distincte de POST /cancel ci-dessus (self-service client
 * via token, aucun email envoyé puisqu'il vient d'annuler lui-même).
 * Ici un email d'excuses est envoyé au client s'il a une adresse.
 */
router.post('/:id/admin-cancel', requireAdminOrBarber, wrap(withBookingLock(async (req, res) => {
  const [[appt]] = await pool.query(
    `SELECT a.id, a.status, a.scheduled_at, a.barber_id, a.promoted_queue_id, a.client_name, a.email, a.gift_card_id, a.salon_id, s.name AS service_name
     FROM appointments a JOIN services s ON s.id = a.service_id
     WHERE a.id = ? AND a.salon_id = ?`,
    [req.params.id, req.salon.id]
  );
  if (!appt) return res.status(404).json({ error: 'Rendez-vous introuvable' });
  if (appt.status !== 'confirmed') return res.status(409).json({ error: 'Ce rendez-vous ne peut plus être annulé' });

  // Tout coiffeur authentifié peut gérer les RDV des collègues du même salon.

  if (appt.promoted_queue_id) {
    const paid = await saleForPassage(pool, req.salon.id, appt.promoted_queue_id);
    if (paid) return res.status(409).json({ error: 'Rendez-vous encaissé : une annulation nécessite une procédure de remboursement.' });
  }

  await pool.query('UPDATE appointments SET status = ? WHERE id = ?', ['cancelled', appt.id]);
  if (appt.promoted_queue_id) {
    await pool.query(
      "UPDATE queue SET status = 'cancelled' WHERE id = ? AND status IN ('waiting','in_progress')",
      [appt.promoted_queue_id]
    );
  }
  if (appt.gift_card_id) await releaseGiftAfterCancellation(appt.salon_id, appt.gift_card_id, appt.id);

  if (appt.email) {
    try {
      const when = new Date(String(appt.scheduled_at).replace(' ', 'T')).toLocaleString('fr-FR', {
        weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'
      });
      await sendAppointmentCancelledByAdmin(req.salon.id, appt.email, {
        clientName: appt.client_name, when, serviceName: appt.service_name,
        customMessage: req.body.custom_message
      });
    } catch (err) {
      console.error('[admin-cancel] envoi email échoué:', err.message);
    }
  }
  res.json({ ok: true });
})));

/**
 * Change l'horaire (et éventuellement le coiffeur) d'un RDV déjà vérifié libre, et garde la file du jour cohérente :
 * même jour -> sa ligne de file suit ; autre jour -> retirée de la file (re-promue le bon jour) ; déplacé à
 * aujourd'hui -> mis dans la file tout de suite. Partagé par « Déplacer » et « Modifier la prestation ».
 */
async function applyMove(appt, date, time, finalBarberId, rdvSettings, extraIds, productSelections) {
  const newScheduledAt = date + ' ' + time + ':00';
  const today = nowInParis(rdvSettings.timezone).dateStr;
  let stillPromotedId = appt.promoted_queue_id;

  if (appt.promoted_queue_id) {
    const [[q]] = await pool.query('SELECT status FROM queue WHERE id = ?', [appt.promoted_queue_id]);
    if (q && q.status === 'waiting') {
      if (date === today) {
        // Même jour : on met juste à jour l'horaire/coiffeur de la ligne de file existante.
        const checkinUtc = toMysqlDatetime(parisLocalToUtcDate(date, time + ':00', rdvSettings.timezone));
        await pool.query('UPDATE queue SET checkin_at = ?, barber_id = ? WHERE id = ?', [checkinUtc, finalBarberId, appt.promoted_queue_id]);
      } else {
        // Déplacé à un autre jour : retiré de la file d'aujourd'hui,
        // sera re-promu automatiquement le bon jour (promoteTodayAppointments).
        await pool.query("UPDATE queue SET status = 'cancelled' WHERE id = ?", [appt.promoted_queue_id]);
        stillPromotedId = null;
      }
    }
    // Si déjà 'done'/'in_progress' (coupe déjà en cours ou finie) : on
    // ne touche pas à la file, cas limite très rare pour un déplacement.
  }

  await pool.query(
    'UPDATE appointments SET scheduled_at = ?, barber_id = ?, promoted_queue_id = ? WHERE id = ?',
    [newScheduledAt, finalBarberId, stillPromotedId, appt.id]
  );

  if (date === today && !stillPromotedId) {
    const [[fresh]] = await pool.query('SELECT * FROM appointments WHERE id = ?', [appt.id]);
    await promoteAppointment(fresh, extraIds, productSelections);
  }
}

/**
 * Corriger les coordonnées d'un RDV futur, avant son entrée dans la file.
 * Accessible à tous les coiffeurs authentifiés du salon, sans accès
 * supplémentaire aux opérations de caisse.
 */
router.put('/:id/contact', requireAdminOrBarber, wrap(async (req, res) => {
  const fields = ['client_name', 'email', 'phone'];
  if (!req.body || !fields.some((key) => Object.prototype.hasOwnProperty.call(req.body, key)) ||
      Object.keys(req.body).some((key) => !fields.includes(key))) {
    return res.status(400).json({ error: 'Coordonnées invalides' });
  }
  const [[appt]] = await pool.query(
    'SELECT id, status, promoted_queue_id FROM appointments WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!appt) return res.status(404).json({ error: 'Rendez-vous introuvable' });
  if (appt.status !== 'confirmed') return res.status(409).json({ error: 'Ce rendez-vous ne peut plus être modifié' });
  if (appt.promoted_queue_id) return res.status(409).json({ error: 'Ce rendez-vous est déjà dans la file : utilisez la fiche client' });
  const name = req.body.client_name;
  if (name !== undefined && !String(name || '').trim()) return res.status(400).json({ error: 'Le nom est requis' });
  const err = contactError({ name, email: req.body.email, phone: req.body.phone }, { nameRequired: false });
  if (err) return res.status(400).json({ error: err });
  const sets = [], params = [];
  for (const field of fields) {
    if (req.body[field] === undefined) continue;
    sets.push(field + ' = ?');
    params.push(String(req.body[field] || '').trim() || (field === 'client_name' ? '' : null));
  }
  params.push(appt.id, req.salon.id);
  const [result] = await pool.query(
    'UPDATE appointments SET ' + sets.join(', ') + " WHERE id = ? AND salon_id = ? AND status = 'confirmed' AND promoted_queue_id IS NULL",
    params
  );
  if (!result.affectedRows) return res.status(409).json({ error: 'Rendez-vous modifié entre-temps : actualisez l’agenda' });
  res.json({ ok: true });
}));

/**
 * Modification/déplacement d'un RDV par l'admin (nouvelle date/heure,
 * et éventuellement nouveau coiffeur) - le client reçoit un email de
 * confirmation avec le nouvel horaire.
 */
router.put('/:id/reschedule', requireAdminOrBarber, wrap(withBookingLock(async (req, res) => {
  const { date, time, barber_id } = req.body;
  if (!date || !time) return res.status(400).json({ error: 'Date et créneau requis' });
  if (!validBookingDate(date) || !validBookingTime(time)) return res.status(400).json({ error: 'Date ou heure invalide' });

  if (await isSalonClosedOnDate(req.salon.id, date)) return res.status(409).json({ error: 'Salon fermé ce jour : déplacement impossible.' });

  const [[appt]] = await pool.query(
    `SELECT a.*, s.name AS service_name, s.duration_min FROM appointments a
     JOIN services s ON s.id = a.service_id
     WHERE a.id = ? AND a.salon_id = ?`,
    [req.params.id, req.salon.id]
  );
  if (!appt) return res.status(404).json({ error: 'Rendez-vous introuvable' });
  if (appt.status !== 'confirmed') return res.status(409).json({ error: 'Seuls les rendez-vous confirmés peuvent être déplacés.' });

  // Un coiffeur authentifié peut déplacer un RDV d'un collègue du même salon.

  if (appt.promoted_queue_id) {
    const paid = await saleForPassage(pool, req.salon.id, appt.promoted_queue_id);
    if (paid) return res.status(409).json({ error: 'Rendez-vous encaissé : déplacement interdit.' });
  }

  const finalBarberId = barber_id || appt.barber_id;
  if (!finalBarberId) return res.status(400).json({ error: 'Le coiffeur est requis' });

  // Même protection que pour la création : le coiffeur choisi doit
  // appartenir à CE salon.
  const [[ownedBarber]] = await pool.query(
    'SELECT id FROM barbers WHERE id = ? AND salon_id = ? AND active = 1', [finalBarberId, req.salon.id]
  );
  if (!ownedBarber) return res.status(404).json({ error: 'Coiffeur introuvable' });

  const rdvSettings = await getSettings(req.salon.id);

  if (`${date} ${time}:00` < nowParisDatetimeString(rdvSettings.timezone)) {
    return res.status(400).json({ error: 'Ce créneau est déjà passé.' });
  }

  const [extraLinks] = await pool.query(
    `SELECT e.id, e.name, e.duration_min FROM appointment_extras ae JOIN extras e ON e.id = ae.extra_id WHERE ae.appointment_id = ?`,
    [appt.id]
  );
  const extraIds = extraLinks.map((e) => e.id);
  // Durée chez le coiffeur d'arrivée (son tarif personnalisé), et refus s'il ne fait pas cette prestation.
  const offer = await offerFor(finalBarberId, {
    service: { id: appt.service_id, duration_min: appt.duration_min, price_cents: 0 },
    extras: extraLinks.map((e) => ({ id: e.id, name: e.name, duration_min: e.duration_min, price_cents: 0 }))
  });
  if (!offer.ok) return res.status(offer.status).json({ error: offer.error });
  const durationMin = offer.durationMin;
  const [productLinks] = await pool.query('SELECT product_id, quantity FROM appointment_products WHERE appointment_id = ?', [appt.id]);
  const productSelections = productLinks.map((p) => ({ id: p.product_id, quantity: p.quantity }));

  const slots = await computeSlotsForBarber(finalBarberId, date, durationMin, rdvSettings, { skipLead: true, excludeAppointmentId: appt.id });
  if (!slots.includes(time)) return res.status(409).json({ error: (await walkinRefusal(finalBarberId, date)) || "Ce créneau n'est plus disponible" });

  const newScheduledAt = date + ' ' + time + ':00';
  await applyMove(appt, date, time, finalBarberId, rdvSettings, extraIds, productSelections);

  if (appt.email) {
    try {
      const when = new Date(newScheduledAt.replace(' ', 'T')).toLocaleString('fr-FR', {
        weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'
      });
      const [[barber]] = await pool.query('SELECT name FROM barbers WHERE id = ?', [finalBarberId]);
      const baseUrl = safeBaseUrl(req, req.body.base_url);
      const cancelUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'cancel=' + appt.cancel_token;
      await sendAppointmentRescheduled(req.salon.id, appt.email, {
        clientName: appt.client_name, when,
        serviceName: serviceLabel(appt.service_name, extraLinks.map((e) => e.name)),
        barberName: barber ? barber.name : null,
        cancelUrl
      });
    } catch (err) {
      console.error('[reschedule] envoi email échoué:', err.message);
    }
  }

  res.json({ ok: true });
})));

/**
 * « Modifier la prestation » d'un RDV à venir (Mon poste, Caisse, admin) : prestation, suppléments, produits.
 * La nouvelle durée est celle du coiffeur (tarif personnalisé). On garde l'heure de début et on regarde ce qui suit
 * ce RDV chez ce coiffeur (RDV suivant + marge tampon, pause, fin de journée) :
 *  - ça tient (ou la durée ne s'allonge pas) -> enregistré ;
 *  - ça dépasse de 10 min au plus -> refusé avec code « overlap_confirm » tant que l'équipe n'a pas confirmé (force) ;
 *  - ça dépasse de plus de 10 min -> refusé (« no_room ») : il faut déplacer le RDV ou choisir autre chose.
 * Avec date + time (+ barber_id) : prestation ET nouvel horaire enregistrés ensemble, créneau vérifié libre (strict).
 * Interdit si le RDV est encaissé (sauf payé d'avance, la différence se règle en caisse), commencé ou terminé.
 * Le client reçoit un email avec la nouvelle prestation, l'horaire et le prix.
 */
const SERVICE_EDIT_OVERLAP_MAX_MIN = 10;

/** Ce qui vient juste après `startMin` chez ce coiffeur ce jour-là : { limit, label } (fin de journée par défaut). */
async function nextBusyAfter(barberId, dateStr, startMin, rdvSettings, excludeId) {
  const weekday = new Date(dateStr + 'T00:00:00Z').getUTCDay();
  const [[schedule]] = await pool.query(
    'SELECT start_time, end_time FROM barber_schedules WHERE barber_id = ? AND weekday = ? AND active = 1', [barberId, weekday]
  );
  const bufferMin = Number(rdvSettings.rdv_buffer_min) || 0;
  let best = schedule ? { limit: timeToMinutes(schedule.end_time), label: 'la fin de journée (' + String(schedule.end_time).slice(0, 5) + ')' } : null;
  // Strictement après le début : un RDV déjà posé à la même heure chevauchait déjà avant la modification.
  const consider = (start, label) => { if (start > startMin && (!best || start < best.limit)) best = { limit: start, label }; };
  const [others] = await pool.query(
    `SELECT a.scheduled_at, a.client_name, q.status AS queue_status FROM appointments a
     LEFT JOIN queue q ON q.id = a.promoted_queue_id
     WHERE a.barber_id = ? AND a.status = 'confirmed' AND DATE(a.scheduled_at) = ? AND a.id != ?`,
    [barberId, dateStr, excludeId]
  );
  others.filter((a) => a.queue_status !== 'done' && a.queue_status !== 'cancelled').forEach((a) => {
    const hhmm = String(a.scheduled_at).split(' ')[1].slice(0, 5);
    consider(timeToMinutes(hhmm), 'le RDV de ' + a.client_name + ' (' + hhmm + ')');
  });
  const [breaks] = await pool.query(
    'SELECT start_time, end_time FROM barber_breaks WHERE barber_id = ? AND weekday = ? AND active = 1', [barberId, weekday]
  );
  breaks.forEach((b) => consider(timeToMinutes(b.start_time), 'la pause (' + String(b.start_time).slice(0, 5) + ')'));
  // La marge tampon reste due APRES ce RDV-ci avant le suivant (comme pour une prise de RDV), pas avant une pause / la fin.
  if (best && /^le RDV/.test(best.label) && bufferMin) best = { limit: best.limit - bufferMin, label: best.label + ', avec la marge de ' + bufferMin + ' min' };
  return best;
}

function moneyLabel(cents, currency) {
  return (Number(cents || 0) / 100).toFixed(2).replace('.', ',') + (currency === 'CHF' ? ' CHF' : ' €');
}

router.put('/:id/services', requireAdminOrBarber, wrap(withBookingLock(async (req, res) => {
  const { service_id, date, time } = req.body;
  const extrasIn = Array.isArray(req.body.extras) ? req.body.extras.map(String) : [];
  const force = req.body.force === true;
  const moving = Boolean(date || time);
  if (moving && (!validBookingDate(date) || !validBookingTime(time))) return res.status(400).json({ error: 'Date ou heure invalide' });

  const [[appt]] = await pool.query('SELECT * FROM appointments WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!appt) return res.status(404).json({ error: 'Rendez-vous introuvable' });
  if (appt.status !== 'confirmed') return res.status(409).json({ error: 'Seuls les rendez-vous à venir peuvent être modifiés.' });

  let queueRow = null;
  if (appt.promoted_queue_id) {
    [[queueRow]] = await pool.query('SELECT id, status, prepaid_at, balance_paid_at FROM queue WHERE id = ?', [appt.promoted_queue_id]);
    if (queueRow && queueRow.status === 'in_progress') return res.status(409).json({ error: 'Prestation déjà commencée : ajoutez un supplément depuis la caisse.' });
    if (queueRow && (queueRow.status === 'done' || queueRow.status === 'cancelled')) return res.status(409).json({ error: 'Ce rendez-vous est déjà terminé ou marqué absent.' });
    const paid = await saleForPassage(pool, req.salon.id, appt.promoted_queue_id);
    const prepaidOpen = queueRow && queueRow.prepaid_at && !queueRow.balance_paid_at;
    if (paid && !prepaidOpen) return res.status(409).json({ error: 'Rendez-vous encaissé : modification interdite.' });
  }

  const rdvSettings = await getSettings(req.salon.id);
  const cat = await loadCatalog(req.salon.id, service_id, extrasIn);
  if (!cat.ok) return res.status(cat.status).json({ error: cat.error });
  const finalBarberId = (moving && req.body.barber_id) || appt.barber_id;
  if (!finalBarberId) return res.status(400).json({ error: 'Le coiffeur est requis' });
  const [[ownedBarber]] = await pool.query('SELECT id, name FROM barbers WHERE id = ? AND salon_id = ? AND active = 1', [finalBarberId, req.salon.id]);
  if (!ownedBarber) return res.status(404).json({ error: 'Coiffeur introuvable' });
  const offer = await offerFor(finalBarberId, cat);
  if (!offer.ok) return res.status(offer.status).json({ error: offer.error });
  const durationMin = offer.durationMin;

  // Produits (facultatif : absent = inchangés) - comme à la prise de RDV, seulement ceux proposés en RDV.
  let productSelections = null;
  if (Array.isArray(req.body.products)) {
    const ids = req.body.products.map((p) => p && p.id).filter(Boolean);
    const [prodRows] = ids.length ? await pool.query('SELECT id FROM products WHERE id IN (?) AND salon_id = ? AND online_bookable = 1', [ids, req.salon.id]) : [[]];
    const valid = new Set(prodRows.map((r) => r.id));
    productSelections = req.body.products.filter((p) => p && valid.has(p.id))
      .map((p) => ({ id: p.id, quantity: Math.min(99, Math.max(1, Number(p.quantity) || 1)) }));
  } else {
    const [rows] = await pool.query('SELECT product_id, quantity FROM appointment_products WHERE appointment_id = ?', [appt.id]);
    productSelections = rows.map((r) => ({ id: r.product_id, quantity: r.quantity }));
  }

  const oldDate = String(appt.scheduled_at).slice(0, 10), oldTime = String(appt.scheduled_at).slice(11, 16);
  let overMin = 0;
  if (moving) {
    if (await isSalonClosedOnDate(req.salon.id, date)) return res.status(409).json({ error: 'Salon fermé ce jour : déplacement impossible.' });
    if (`${date} ${time}:00` < nowParisDatetimeString(rdvSettings.timezone)) return res.status(400).json({ error: 'Ce créneau est déjà passé.' });
    const slots = await computeSlotsForBarber(finalBarberId, date, durationMin, rdvSettings, { skipLead: true, excludeAppointmentId: appt.id });
    if (!slots.includes(time)) return res.status(409).json({ error: (await walkinRefusal(finalBarberId, date)) || "Ce créneau n'est plus disponible pour la nouvelle durée" });
  } else {
    // Durée actuelle chez ce coiffeur : si la nouvelle n'est pas plus longue, rien à vérifier.
    const [oldExtras] = await pool.query('SELECT extra_id FROM appointment_extras WHERE appointment_id = ?', [appt.id]);
    const oldCat = await loadCatalog(req.salon.id, appt.service_id, oldExtras.map((x) => x.extra_id));
    const oldOffer = oldCat.ok ? await offerFor(finalBarberId, oldCat) : null;
    const oldDuration = oldOffer && oldOffer.ok ? oldOffer.durationMin : 0;
    if (durationMin > oldDuration) {
      const startMin = timeToMinutes(oldTime);
      const next = await nextBusyAfter(finalBarberId, oldDate, startMin, rdvSettings, appt.id);
      overMin = next ? startMin + durationMin - next.limit : 0;
      if (overMin > SERVICE_EDIT_OVERLAP_MAX_MIN) {
        return res.status(409).json({
          code: 'no_room', over_min: overMin, duration_min: durationMin, conflict: next.label,
          error: 'Pas assez de place : la nouvelle prestation dépasse de ' + overMin + ' min sur ' + next.label + '. Déplacez le RDV ou choisissez une autre prestation.'
        });
      }
      if (overMin > 0 && !force) {
        return res.status(409).json({
          code: 'overlap_confirm', over_min: overMin, duration_min: durationMin, conflict: next.label,
          error: 'La nouvelle prestation dépasse de ' + overMin + ' min sur ' + next.label + '.'
        });
      }
    }
  }

  const extraIds = cat.extras.map((e) => e.id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE appointments SET service_id = ? WHERE id = ?', [cat.service.id, appt.id]);
    await conn.query('DELETE FROM appointment_extras WHERE appointment_id = ?', [appt.id]);
    if (extraIds.length) await conn.query('INSERT INTO appointment_extras (appointment_id, extra_id) VALUES ?', [extraIds.map((e) => [appt.id, e])]);
    await conn.query('DELETE FROM appointment_products WHERE appointment_id = ?', [appt.id]);
    if (productSelections.length) await conn.query('INSERT INTO appointment_products (appointment_id, product_id, quantity) VALUES ?', [productSelections.map((p) => [appt.id, p.id, p.quantity])]);
    // RDV du jour déjà dans la file : sa ligne suit (c'est elle que la caisse encaisse).
    if (queueRow && queueRow.status === 'waiting') {
      await conn.query('UPDATE queue SET service_id = ? WHERE id = ?', [cat.service.id, queueRow.id]);
      await conn.query('DELETE FROM queue_extras WHERE queue_id = ?', [queueRow.id]);
      if (extraIds.length) await conn.query('INSERT INTO queue_extras (queue_id, extra_id) VALUES ?', [extraIds.map((e) => [queueRow.id, e])]);
      await conn.query('DELETE FROM queue_products WHERE queue_id = ?', [queueRow.id]);
      if (productSelections.length) await conn.query('INSERT INTO queue_products (queue_id, product_id, quantity) VALUES ?', [productSelections.map((p) => [queueRow.id, p.id, p.quantity])]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  if (moving) await applyMove(appt, date, time, finalBarberId, rdvSettings, extraIds, productSelections);
  await recompute(req.salon.id).catch(() => {});

  const newAt = moving ? (date + ' ' + time + ':00') : String(appt.scheduled_at);
  const serviceName = serviceLabel(cat.service.name, cat.extras.map((e) => e.name), cat.service.extras_only);
  if (appt.email) {
    try {
      const when = new Date(newAt.replace(' ', 'T')).toLocaleString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });
      const baseUrl = safeBaseUrl(req, req.body.base_url);
      const cancelUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'cancel=' + appt.cancel_token;
      await sendAppointmentServicesChanged(req.salon.id, appt.email, {
        clientName: appt.client_name, when, serviceName, barberName: ownedBarber.name,
        durationMin, price: moneyLabel(offer.priceCents, rdvSettings.currency), cancelUrl
      });
    } catch (err) {
      console.error('[services-edit] envoi email échoué:', err.message);
    }
  }
  const startM = timeToMinutes(newAt.slice(11, 16));
  res.json({ ok: true, duration_min: durationMin, price_cents: offer.priceCents, end_time: minutesToTime(startM + durationMin), over_min: overMin > 0 ? overMin : 0, moved: moving, emailed: Boolean(appt.email) });
})));

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
async function promoteAppointment(appt, extraIds, productSelections) {
  const queueId = crypto.randomUUID();

  const [claimResult] = await pool.query(
    'UPDATE appointments SET promoted_queue_id = ? WHERE id = ? AND promoted_queue_id IS NULL',
    [queueId, appt.id]
  );
  if (claimResult.affectedRows === 0) {
    // Deja promu (ou en cours de promotion) par un autre appel concurrent.
    return null;
  }

  // appt.scheduled_at est en heure de salon (réglable, Europe/Paris par
  // défaut) ; checkin_at est un vrai timestamp UTC comme le reste de la
  // file — conversion obligatoire ici, sinon le verrouillage "pas encore
  // commencé" et l'ordre d'arrivée dérivent selon le fuseau et la saison.
  const settings = await getSettings(appt.salon_id);
  const checkinUtc = toMysqlDatetime(
    parisLocalToUtcDate(appt.scheduled_at.slice(0, 10), appt.scheduled_at.slice(11, 19), settings.timezone)
  );

  await pool.query(
    `INSERT INTO queue (id, salon_id, client_name, email, phone, service_id, barber_id, status, checkin_at, is_appointment, gift_card_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting', ?, 1, ?)`,
    [queueId, appt.salon_id, appt.client_name, appt.email, appt.phone || null, appt.service_id, appt.barber_id, checkinUtc, appt.gift_card_id || null]
  );
  if (extraIds && extraIds.length) {
    await pool.query(
      'INSERT INTO queue_extras (queue_id, extra_id) VALUES ?',
      [extraIds.map((eid) => [queueId, eid])]
    );
  }
  if (productSelections && productSelections.length) {
    await pool.query(
      'INSERT INTO queue_products (queue_id, product_id, quantity) VALUES ?',
      [productSelections.map((p) => [queueId, p.id, p.quantity])]
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
  const settings = await getSettings(salonId);
  const today = nowInParis(settings.timezone).dateStr;
  const [rows] = await pool.query(
    `SELECT * FROM appointments
     WHERE salon_id = ? AND status = 'confirmed' AND promoted_queue_id IS NULL AND DATE(scheduled_at) = ?`,
    [salonId, today]
  );
  for (const appt of rows) {
    const [extraRows] = await pool.query('SELECT extra_id FROM appointment_extras WHERE appointment_id = ?', [appt.id]);
    const [productRows] = await pool.query('SELECT product_id, quantity FROM appointment_products WHERE appointment_id = ?', [appt.id]);
    await promoteAppointment(appt, extraRows.map((r) => r.extra_id), productRows.map((r) => ({ id: r.product_id, quantity: r.quantity })));
  }
}

/**
 * Suppression PERMANENTE et définitive d'un rendez-vous - fonctionne
 * quel que soit son statut ou sa date (passé, terminé, déjà annulé...)
 * contrairement à /admin-cancel qui ne fait que marquer "annulé" et
 * n'agit que sur les RDV encore à venir. Aucun email envoyé - une
 * suppression, ce n'est pas une annulation communiquée au client.
 */
router.delete('/:id', requireAdmin, wrap(async (req, res) => {
  const [[appt]] = await pool.query(
    'SELECT id, gift_card_id FROM appointments WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!appt) return res.status(404).json({ error: 'Rendez-vous introuvable' });

  await pool.query('DELETE FROM appointments WHERE id = ?', [req.params.id]);
  // Sans ça, un cadeau resterait verrouillé indéfiniment (plus aucun
  // rendez-vous pour le libérer un jour) puisque la ligne qui le
  // bloquait vient de disparaître.
  if (appt.gift_card_id) await releaseGiftAfterCancellation(req.salon.id, appt.gift_card_id, appt.id);
  res.json({ ok: true });
}));

module.exports = { router, promoteTodayAppointments, nowParisDatetimeString, nowInParis, computeSlotsForBarber, parisLocalToUtcDate };
