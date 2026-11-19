// Endpoints d'authentification, de salon et de réservation — formes de
// réponses lues directement dans le code serveur (docs/API_AUDIT.md).
// Aucune invention : chaque type est vérifié dans la route correspondante.
import { ApiRequest, apiBaseUrl, apiRequest } from './transport';
import {
  AdminAppointmentsResponse,
  ApiOkResponse,
  AvailabilityDaysResponse,
  AvailabilityResponse,
  BarbersListResponse,
  BookingResponse,
  CancelResponse,
  CatalogListResponse,
  ClientLoginResponse,
  ClientMeResponse,
  ClientStatsResponse,
  OwnerProfileResponse,
  QueueHistoryTotalResponse,
  SalonStatsResponse,
} from '../types/api';

/* ---------- Salon (résolution/validation X-Salon-Slug) ---------- */

/** Réponse auditée de GET /api/settings/public (public, sans mot de passe). */
export type SalonPublicResponse = {
  ok: true;
  salon_name: string;
  logo_url: string | null;
  currency: string;
  /** Ajouté par le serveur sans être consommé jusqu'ici (fuseau du salon). */
  timezone?: string;
};

export async function fetchSalonPublic(salonSlug: string): Promise<SalonPublicResponse> {
  const request: ApiRequest = { path: 'api/settings/public', salonSlug };
  return apiRequest<SalonPublicResponse>(request);
}

/* ---------- Client (X-Client-Token, session 90 jours) ---------- */

export async function loginClient(salonSlug: string, email: string, password: string): Promise<ClientLoginResponse> {
  return apiRequest<ClientLoginResponse>({
    path: 'api/client-auth/login',
    method: 'POST',
    salonSlug,
    body: { email, password },
  });
}

/**
 * Page web vers laquelle pointent les liens envoyés par email (confirmation,
 * réinitialisation) : compte.html du salon, comme le web (baseUrl()). Le
 * serveur la contrôle (safeBaseUrl : domaines autorisés uniquement).
 */
export function clientEmailBaseUrl(salonSlug: string): string {
  const base = apiBaseUrl().replace(/\/+$/, '') + '/compte.html';
  return salonSlug.trim() ? `${base}?salon=${encodeURIComponent(salonSlug.trim())}` : base;
}

/** POST /api/client-auth/signup — réponse auditée (clientAuth.js). */
export type ClientSignupResponse = { ok: true; needs_email_verification: true; email_sent: boolean };

/**
 * Inscription client : un compte appartient au salon de X-Salon-Slug.
 * accept_terms DOIT valoir true (sinon 400 needs_terms) ; téléphone requis.
 */
export async function signupClient(
  salonSlug: string,
  input: { name: string; email: string; phone: string; password: string; accept_terms: boolean }
): Promise<ClientSignupResponse> {
  return apiRequest<ClientSignupResponse>({
    path: 'api/client-auth/signup',
    method: 'POST',
    salonSlug,
    body: { ...input, base_url: clientEmailBaseUrl(salonSlug) },
  });
}

/** Renvoi du lien de vérification email (rate limité côté serveur). */
export async function resendClientVerification(salonSlug: string, email: string): Promise<ApiOkResponse> {
  return apiRequest<ApiOkResponse>({
    path: 'api/client-auth/resend-verification',
    method: 'POST',
    salonSlug,
    body: { email, base_url: clientEmailBaseUrl(salonSlug) },
  });
}

export async function fetchClientMe(salonSlug: string, clientToken: string): Promise<ClientMeResponse> {
  return apiRequest<ClientMeResponse>({
    path: 'api/client-auth/me',
    salonSlug,
    auth: { kind: 'client', clientToken },
  });
}

/** GET /api/client-auth/salons — salons de l'enseigne où ce client a un compte confirmé (même email). */
export type ClientSalonsResponse = { ok: true; current: string; items: { slug: string; name: string }[] };

export async function fetchClientSalons(salonSlug: string, clientToken: string): Promise<ClientSalonsResponse> {
  return apiRequest<ClientSalonsResponse>({
    path: 'api/client-auth/salons',
    salonSlug,
    auth: { kind: 'client', clientToken },
  });
}

/** POST /api/client-auth/switch — nouveau jeton pour le compte du client dans l'autre salon (403 sinon). */
export type ClientSwitchResponse = { ok: true; token: string; slug: string };

export async function switchClientSalon(salonSlug: string, clientToken: string, targetSlug: string): Promise<ClientSwitchResponse> {
  return apiRequest<ClientSwitchResponse>({
    path: 'api/client-auth/switch',
    method: 'POST',
    salonSlug,
    auth: { kind: 'client', clientToken },
    body: { slug: targetSlug },
  });
}

export async function logoutClient(salonSlug: string, clientToken: string): Promise<ApiOkResponse> {
  return apiRequest<ApiOkResponse>({
    path: 'api/client-auth/logout',
    method: 'POST',
    salonSlug,
    auth: { kind: 'client', clientToken },
  });
}

/* ---------- Coiffeur (PIN, en-têtes X-Barber-Id / X-Barber-Pin) ---------- */

/** Réponse auditée de POST /api/barbers/login (source 'poste'). */
export type BarberIdentity = {
  id: number;
  name: string;
  accepts_appointments: number;
  timer_enabled: number;
};

export type BarberLoginResponse = {
  ok: true;
  barber: BarberIdentity;
  pending_recount: unknown;
};

export async function loginBarber(salonSlug: string, pin: string, source: 'poste' | 'caisse' | 'cloture'): Promise<BarberLoginResponse> {
  return apiRequest<BarberLoginResponse>({
    path: 'api/barbers/login',
    method: 'POST',
    salonSlug,
    body: { pin, source },
  });
}

/* ---------- Admin / propriétaire — PARCOURS WEB ORIGINAL ---------- */

/**
 * POST /api/signup/login-lookup : connexion par EMAIL + mot de passe
 * (formulaire "Dashboard" du web). Renvoie les salons actifs de
 * l'enseigne : c'est le "sélecteur d'enseigne" du menu latéral.
 */
export type OwnerSalonsResponse = { ok: true; salons: { slug: string; name: string }[] };

export async function loginOwnerSalons(email: string, password: string): Promise<OwnerSalonsResponse> {
  return apiRequest<OwnerSalonsResponse>({
    path: 'api/signup/login-lookup',
    method: 'POST',
    salonSlug: '',
    body: { email, password },
  });
}

/** GET /api/signup/status : le web n'affiche "Créer mon salon" que si l'inscription est ouverte. */
export type SignupStatusResponse = { ok: boolean; enabled?: boolean };

export async function fetchSignupStatus(): Promise<SignupStatusResponse> {
  const request: ApiRequest = { path: 'api/signup/status', salonSlug: '' };
  return apiRequest<SignupStatusResponse>(request);
}

/** POST /api/login : vérification X-Admin-Password pour un salon précis. */
export async function loginAdmin(salonSlug: string, adminPassword: string): Promise<ApiOkResponse> {
  return apiRequest<ApiOkResponse>({
    path: 'api/login',
    method: 'POST',
    salonSlug,
    auth: { kind: 'admin', adminPassword },
  });
}

/* ---------- Réservation (Phase 3) — routes publiques / client ---------- */

/** GET /api/catalog/services (public) : prestations actives du salon. */
export async function fetchServices(salonSlug: string): Promise<CatalogListResponse> {
  return apiRequest<CatalogListResponse>({ path: 'api/catalog/services', salonSlug });
}

/** GET /api/catalog/products (public) : produits de vente du salon. */
export async function fetchProductsList(salonSlug: string): Promise<CatalogListResponse> {
  const request: ApiRequest = { path: 'api/catalog/products', salonSlug };
  return apiRequest<CatalogListResponse>(request);
}

/** GET /api/catalog/extras (public) : suppléments actifs du salon. */
export async function fetchExtras(salonSlug: string): Promise<CatalogListResponse> {
  return apiRequest<CatalogListResponse>({ path: 'api/catalog/extras', salonSlug });
}

/** GET /api/barbers (public) : équipe du salon + état du jour (congés, pauses, horaires). */
export async function fetchBarbers(salonSlug: string, opts?: { all?: boolean }): Promise<BarbersListResponse> {
  const request: ApiRequest = { path: 'api/barbers', salonSlug, ...(opts?.all ? { query: { all: '1' } } : {}) };
  return apiRequest<BarbersListResponse>(request);
}

/**
 * GET /api/appointments/availability : créneaux d'une date. `barber_id`
 * absent = « Premier disponible » (renvoie le coiffeur choisi par le
 * serveur pour chaque heure). Heures renvoyées en heure DU SALON.
 */
export async function fetchAvailability(
  salonSlug: string,
  params: { date: string; service_id: string | null; extras?: string[]; barber_id?: string | null }
): Promise<AvailabilityResponse> {
  const query: Record<string, string> = { date: params.date };
  if (params.service_id) query.service_id = params.service_id;
  if (params.extras && params.extras.length) query.extras = params.extras.join(',');
  if (params.barber_id) query.barber_id = params.barber_id;
  const request: ApiRequest = { path: 'api/appointments/availability', salonSlug, query };
  return apiRequest<AvailabilityResponse>(request);
}

/**
 * GET /api/appointments/availability-days : jours (YYYY-MM-DD) ayant au
 * moins un créneau sur la période — pour griser le calendrier.
 */
export async function fetchAvailabilityDays(
  salonSlug: string,
  params: { from: string; to: string; service_id: string | null; extras?: string[]; barber_id?: string | null }
): Promise<AvailabilityDaysResponse> {
  const query: Record<string, string> = { from: params.from, to: params.to, all: '1' };
  if (params.service_id) query.service_id = params.service_id;
  if (params.extras && params.extras.length) query.extras = params.extras.join(',');
  if (params.barber_id) query.barber_id = params.barber_id;
  const request: ApiRequest = { path: 'api/appointments/availability-days', salonSlug, query };
  return apiRequest<AvailabilityDaysResponse>(request);
}

/**
 * POST /api/appointments : CONFIRME la réservation. Avec la session client
 * (X-Client-Token, email vérifié) le serveur n'exige pas de code de
 * vérification (cf. guestEmailVerified). Le corps correspond 1:1 à
 * bookSingle() : { client_name, email, phone, service_id, barber_id?,
 * extras?, date, time, client_note? }.
 */
export async function bookAppointment(
  salonSlug: string,
  input: {
    client_name: string;
    email: string;
    phone?: string;
    service_id: string | null;
    extras?: string[];
    barber_id?: string | null;
    date: string;
    time: string;
    client_note?: string;
  },
  clientToken: string
): Promise<BookingResponse> {
  return apiRequest<BookingResponse>({
    path: 'api/appointments',
    method: 'POST',
    salonSlug,
    auth: { kind: 'client', clientToken },
    body: {
      client_name: input.client_name,
      email: input.email,
      phone: input.phone,
      service_id: input.service_id,
      ...(input.extras && input.extras.length ? { extras: input.extras } : {}),
      ...(input.barber_id ? { barber_id: input.barber_id } : {}),
      date: input.date,
      time: input.time,
      ...(input.client_note ? { client_note: input.client_note } : {}),
    },
  });
}

/** POST /api/appointments/cancel — les règles (délai, RDV honoré…) sont côté serveur. */
export async function cancelAppointment(salonSlug: string, token: string): Promise<CancelResponse> {
  return apiRequest<CancelResponse>({ path: 'api/appointments/cancel', method: 'POST', salonSlug, body: { token } });
}

/* ---------- Dashboard admin (routes auditées sur main) ---------- */

/** GET /api/owner/profile — nom de l'enseigne pour « Bienvenue, … ». */
export async function fetchOwnerProfile(salonSlug: string, auth: ApiAuth): Promise<OwnerProfileResponse> {
  return apiRequest<OwnerProfileResponse>({ path: 'api/owner/profile', salonSlug, auth });
}

/** GET /api/owner/client-stats — comptes, fidélité, cadeaux, sans compte. */
export async function fetchClientStats(salonSlug: string, auth: ApiAuth): Promise<ClientStatsResponse> {
  return apiRequest<ClientStatsResponse>({ path: 'api/owner/client-stats', salonSlug, auth });
}

/**
 * GET /api/barbers/salon-stats — KPIs période, courbe, classement,
 * manque à gagner. Bornes envoyées comme le web (start/end ISO +
 * start_date/end_date locales, max 400 jours côté serveur).
 */
export async function fetchSalonStats(
  salonSlug: string,
  auth: ApiAuth,
  params: { startIso: string; endIso: string; startDate: string; endDate: string }
): Promise<SalonStatsResponse> {
  const request: ApiRequest = {
    path: 'api/barbers/salon-stats',
    salonSlug,
    auth,
    query: {
      start: params.startIso,
      end: params.endIso,
      start_date: params.startDate,
      end_date: params.endDate,
    },
  };
  return apiRequest<SalonStatsResponse>(request);
}

/** GET /api/queue/history?per_page=1 — total de passages (KPI Clients). */
export async function fetchQueueHistoryCount(salonSlug: string, auth: ApiAuth): Promise<QueueHistoryTotalResponse> {
  const request: ApiRequest = { path: 'api/queue/history', salonSlug, auth, query: { per_page: '1' } };
  return apiRequest<QueueHistoryTotalResponse>(request);
}

/**
 * GET /api/appointments (admin) — RDV à venir (compteur + liste
 * « Prochains RDV »). Avec { month, caisse_view } : cache du mois pour la
 * journée en un coup d'œil (comme le web).
 */
export async function fetchAdminAppointments(
  salonSlug: string,
  auth: ApiAuth,
  opts?: { month?: string; caisseView?: boolean }
): Promise<AdminAppointmentsResponse> {
  const query: Record<string, string> = {};
  if (opts?.month) {
    query.month = opts.month;
    query.all = '1';
    if (opts.caisseView) query.caisse_view = '1';
  }
  const request: ApiRequest = {
    path: 'api/appointments',
    salonSlug,
    auth,
    ...(Object.keys(query).length ? { query } : {}),
  };
  return apiRequest<AdminAppointmentsResponse>(request);
}

/* ---------- File d'attente (opérateur : admin OU coiffeur) ---------- */

import { ApiAuth } from './transport';
import { QueueResponse } from '../types/api';

/**
 * GET /api/queue : file en direct (le serveur trie et recalcule). Route
 * publique, mais en envoyant la session (admin ou coiffeur) le serveur
 * ajoute email/téléphone/note de chaque client — nécessaire aux actions.
 */
export async function fetchQueue(salonSlug: string, auth: ApiAuth): Promise<QueueResponse> {
  const request: ApiRequest = { path: 'api/queue', salonSlug, auth };
  return apiRequest<QueueResponse>(request);
}

/** POST /api/queue/:id/start — rules serveur : ordre d'arrivée, 1 coupe en cours par coiffeur. */
export async function queueStart(salonSlug: string, id: number, auth: ApiAuth, opts?: { barber_id?: string }): Promise<ApiOkResponse> {
  return apiRequest<ApiOkResponse>({
    path: `api/queue/${id}/start`,
    method: 'POST',
    salonSlug,
    auth,
    ...(opts && opts.barber_id ? { body: { barber_id: opts.barber_id } } : {}),
  });
}

/** POST /api/queue/:id/finish — coupe terminée (rappel : encaissement à part, côté Caisse). */
export async function queueFinish(salonSlug: string, id: number, auth: ApiAuth): Promise<ApiOkResponse> {
  return apiRequest<ApiOkResponse>({ path: `api/queue/${id}/finish`, method: 'POST', salonSlug, auth });
}

/**
 * POST /api/queue/:id/cancel — annulation ; reason 'client_notified' =
 * « client ayant prévenu » (valide uniquement pour un RDV confirmé).
 */
export async function queueCancel(salonSlug: string, id: number, auth: ApiAuth, reason?: 'client_notified'): Promise<ApiOkResponse> {
  return apiRequest<ApiOkResponse>({
    path: `api/queue/${id}/cancel`,
    method: 'POST',
    salonSlug,
    auth,
    ...(reason ? { body: { reason } } : {}),
  });
}

/* ---------- Rendez-vous : actions de l'équipe (appointments.js) ---------- */

/** GET /api/appointments/availability?exclude_appointment_id= : créneaux pour DÉPLACER un RDV. */
export async function fetchRescheduleSlots(
  salonSlug: string,
  auth: ApiAuth,
  params: { date: string; service_id: string; barber_id: string; appointment_id: number }
): Promise<AvailabilityResponse> {
  return apiRequest<AvailabilityResponse>({
    path: 'api/appointments/availability',
    salonSlug,
    auth,
    query: {
      date: params.date,
      service_id: params.service_id,
      barber_id: params.barber_id,
      exclude_appointment_id: String(params.appointment_id),
    },
  });
}

/** PUT /api/appointments/:id/reschedule — le client reçoit un email avec le nouvel horaire. */
export async function rescheduleAppointment(
  salonSlug: string,
  auth: ApiAuth,
  id: number,
  body: { date: string; time: string; barber_id: string }
): Promise<ApiOkResponse> {
  return apiRequest<ApiOkResponse>({
    path: `api/appointments/${id}/reschedule`,
    method: 'PUT',
    salonSlug,
    auth,
    body: { ...body, base_url: clientEmailBaseUrl(salonSlug) },
  });
}

/** POST /api/appointments/:id/admin-cancel — email au client (message par défaut ou personnalisé). */
export async function adminCancelAppointment(salonSlug: string, auth: ApiAuth, id: number, customMessage: string): Promise<ApiOkResponse> {
  return apiRequest<ApiOkResponse>({
    path: `api/appointments/${id}/admin-cancel`,
    method: 'POST',
    salonSlug,
    auth,
    body: { custom_message: customMessage },
  });
}

/** PUT /api/appointments/:id/note — note interne rattachée au CLIENT (vide = supprimée). */
export async function saveAppointmentNote(salonSlug: string, auth: ApiAuth, id: number, note: string): Promise<ApiOkResponse> {
  return apiRequest<ApiOkResponse>({ path: `api/appointments/${id}/note`, method: 'PUT', salonSlug, auth, body: { note } });
}

/** PUT /api/appointments/:id/contact — nom, email, téléphone (RDV confirmé, pas encore en file). */
export async function saveAppointmentContact(
  salonSlug: string,
  auth: ApiAuth,
  id: number,
  body: { client_name: string; email: string; phone: string }
): Promise<ApiOkResponse> {
  return apiRequest<ApiOkResponse>({ path: `api/appointments/${id}/contact`, method: 'PUT', salonSlug, auth, body });
}

/** GET /api/appointments/availability (avec la session de l'équipe) — barber_id vide = « Premier disponible ». */
export async function fetchStaffAvailability(
  salonSlug: string,
  auth: ApiAuth,
  params: { date: string; service_id: string; extras: string[]; barber_id: string | null }
): Promise<AvailabilityResponse> {
  const query: Record<string, string> = { date: params.date, service_id: params.service_id };
  if (params.extras.length) query.extras = params.extras.join(',');
  if (params.barber_id) query.barber_id = params.barber_id;
  return apiRequest<AvailabilityResponse>({ path: 'api/appointments/availability', salonSlug, auth, query });
}

/**
 * POST /api/appointments/admin-create — RDV ajouté par l'équipe (web : « Ajouter un RDV »).
 * barber_id null = « Premier disponible » (le serveur choisit). Email / téléphone facultatifs.
 */
export async function adminCreateAppointment(
  salonSlug: string,
  auth: ApiAuth,
  body: {
    client_name: string;
    email: string;
    phone: string;
    service_id: string;
    barber_id: string | null;
    extras: string[];
    date: string;
    time: string;
  }
): Promise<{ ok: true; id: string; barber_name?: string | null }> {
  const rdvPage = apiBaseUrl().replace(/\/+$/, '') + '/rdv.html' + (salonSlug ? `?salon=${encodeURIComponent(salonSlug)}` : '');
  return apiRequest<{ ok: true; id: string; barber_name?: string | null }>({
    path: 'api/appointments/admin-create',
    method: 'POST',
    salonSlug,
    auth,
    body: { ...body, products: [], force: false, force_ack: false, base_url: rdvPage },
  });
}
