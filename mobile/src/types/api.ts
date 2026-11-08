// Types des réponses API utilisés par le mobile — EXTRAITS du code serveur
// audité (docs/API_AUDIT.md, src/routes/clientAuth.js), pas de conjecture.
// Les formes restantes (queue/appointments/sales…) seront ajoutées au fil
// des branchements Phase 3+, en relisant le code serveur correspondant.

/** { ok: true } générique plus champs additionnels (non consommés pour l'instant). */
export type ApiOkResponse = { ok: boolean } & Record<string, unknown>;

/** POST /api/client-auth/login → jeton de session opaque (90 jours). */
export type ClientLoginResponse = { ok: true; token: string };

/** GET /api/client-auth/me → profil, fidélité, RDV, passages, cartes cadeaux. */
export type ClientProfile = { name: string; email: string; phone: string };

export type ClientRelative = { id: string; name: string };

// thresholds/rewards : forme non fixée côté mobile pour l'instant — définie
// par la fidélité du salon (paliers/recompenses), consommée à l'écran.
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
