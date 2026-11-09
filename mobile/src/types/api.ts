// Types des réponses API utilisés par le mobile — EXTRAITS du code serveur
// audité (docs/API_AUDIT.md et lecture des routes : clientAuth.js,
// appointments.js, catalog.js, barbers.js). Pas de conjecture : les formes
// optionnelles/lâches sont marquées "à affiner à l'écran".

/** { ok: true } générique plus champs additionnels (non consommés pour l'instant). */
export type ApiOkResponse = { ok: boolean } & Record<string, unknown>;

/* ---------- Session client ---------- */

/** POST /api/client-auth/login → jeton de session opaque (90 jours). */
export type ClientLoginResponse = { ok: true; token: string };

/** GET /api/client-auth/me → profil, fidélité, RDV, passages, cartes cadeaux. */
export type ClientProfile = { name: string; email: string; phone: string };

export type ClientRelative = { id: string; name: string };

// thresholds/rewards : forme non fixée côté mobile pour l'instant — définie
// par la fidélité du salon (paliers/récompenses), consommée à l'écran.
export type LoyaltyState = {
  points: number;
  rewards_available: number;
  thresholds: unknown;
  rewards: unknown;
};

export type ClientUpcomingAppointment = {
  id: number;
  scheduled_at: string;
  service_name: string;
  barber_name: string | null;
  extras: string[];
  price_cents: number;
  client_note: string;
  cancel_token: string;
  /** RDV pris pour un proche : prénom affiché, sinon null (moi-même). */
  person_name: string | null;
  group_id: string | null;
};

/** Dernier passage TERMINÉ et PAYÉ (tableau d'au plus 1 élément). */
export type ClientRecentVisit = {
  id: number;
  checkin_at: string;
  status: string;
  service_name: string | null;
  barber_name: string | null;
  salon_slug: string;
  salon_name: string;
};

export type GiftCardItem = { name: string; quantity: number; type: string };

export type ClientGiftCard = {
  id: string;
  code: string;
  amount_cents: number;
  /** Nom/quantité seulement : jamais le prix unitaire des articles offerts. */
  items: GiftCardItem[];
  used: boolean;
  pending: boolean;
  created_at: string;
};

export type ClientMeResponse = {
  ok: true;
  profile: ClientProfile;
  relatives: ClientRelative[];
  loyalty_activated: boolean;
  loyalty: LoyaltyState | null;
  upcoming_appointments: ClientUpcomingAppointment[];
  recent_visits: ClientRecentVisit[];
  gift_cards: ClientGiftCard[];
};

/* ---------- Catalogue public (borne/réservation) ---------- */

/** GET /api/catalog/services|extras — colonnes de base annotées (vat etc.). */
export type CatalogItem = {
  id: string;
  name: string;
  duration_min: number;
  price_cents: number;
  active: number;
  sort_order: number;
  photo_url?: string | null;
  // Champs ajoutés par annotateItems (TVA, catégorie...) : ouverts, à
  // affiner à l'écran — jamais utilisés sans être relus dans le serveur.
  [key: string]: unknown;
};

export type CatalogListResponse = { ok: true; items: CatalogItem[] };

/* ---------- Coiffeurs publics (GET /api/barbers) ---------- */

export type BarberSchedule = { weekday: number; start_time: string; end_time: string; active: number };

/** Item public de la liste des coiffeurs (secrets retirés côté serveur). */
export type BarberPublic = {
  id: string;
  name: string;
  active: number;
  photo_url?: string | null;
  accepts_appointments?: number;
  walkin_today?: number | boolean;
  on_leave_today?: number | boolean;
  on_break_now?: number | boolean;
  outside_hours_now?: number | boolean;
  leaves?: { start_date: string; end_date: string }[];
  schedules?: BarberSchedule[];
  disabled_service_ids?: string[];
  disabled_extra_ids?: string[];
  service_overrides?: Record<string, { price_cents?: number; duration_min?: number }>;
  extra_overrides?: Record<string, { price_cents?: number; duration_min?: number }>;
  [key: string]: unknown;
};

export type BarbersListResponse = { ok: true; items: BarberPublic[]; on_duty: number };

/* ---------- Créneaux / réservation ---------- */

/** GET /api/appointments/availability — un créneau retenu avec son coiffeur/prix/durée. */
export type AvailabilitySlot = {
  time: string; // "HH:MM" (heure DU SALON, jamais reconvertie)
  barber_id: string;
  price_cents: number;
  duration_min: number;
};

export type AvailabilityResponse = {
  ok: true;
  slots: AvailabilitySlot[];
  all_count: number;
  packed?: boolean | number | unknown;
  reason?: string;
};

/** GET /api/appointments/availability-days → jours avec au moins un créneau. */
export type AvailabilityDaysResponse = { ok: true; days: string[] };

/** POST /api/appointments (client connecté : email vérifié, pas de code). */
export type BookingResponse = { ok: true; id: string; barber_id: string | null; barber_name: string | null };

/** POST /api/appointments/cancel (via cancel_token du RDV). */
export type CancelResponse = { ok: true };

/* ---------- File d'attente (GET /api/queue, actions opérateur) ---------- */

export type QueueStatus = 'waiting' | 'in_progress' | 'done' | 'cancelled';

/** Ligne de file (GET /public → sans email/téléphone ; avec session admin, plus de champs). */
export type QueueEntry = {
  id: number;
  status: QueueStatus;
  position: number | null;
  client_name: string | null;
  barber_id: string | null;
  checkin_at: string;
  start_at: string | null;
  is_appointment: number | boolean | null;
  service: { id: string; name: string; price_cents: number; duration_min: number } | null;
  extras: { id: string; name: string; price_cents: number }[];
  [key: string]: unknown;
};

export type QueueResponse = { ok: true; queue: QueueEntry[] };
