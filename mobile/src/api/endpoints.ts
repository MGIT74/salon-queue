// Endpoints d'authentification, de salon et de réservation — formes de
// réponses lues directement dans le code serveur (docs/API_AUDIT.md).
// Aucune invention : chaque type est vérifié dans la route correspondante.
import { ApiRequest, apiRequest } from './transport';
import {
  ApiOkResponse,
  AvailabilityDaysResponse,
  AvailabilityResponse,
  BarbersListResponse,
  BookingResponse,
  CancelResponse,
  CatalogListResponse,
  ClientLoginResponse,
  ClientMeResponse,
} from '../types/api';

/* ---------- Salon (résolution/validation X-Salon-Slug) ---------- */

/** Réponse auditée de GET /api/settings/public (public, sans mot de passe). */
export type SalonPublicResponse = {
  ok: true;
  salon_name: string;
  logo_url: string | null;
  currency: string;
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

/** Renvoi du lien de vérification email (rate limité côté serveur). */
export async function resendClientVerification(salonSlug: string, email: string): Promise<ApiOkResponse> {
  return apiRequest<ApiOkResponse>({
    path: 'api/client-auth/resend-verification',
    method: 'POST',
    salonSlug,
    body: { email },
  });
}

export async function fetchClientMe(salonSlug: string, clientToken: string): Promise<ClientMeResponse> {
  return apiRequest<ClientMeResponse>({
    path: 'api/client-auth/me',
    salonSlug,
    auth: { kind: 'client', clientToken },
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

/* ---------- Admin / propriétaire (X-Admin-Password à chaque appel) ---------- */

/** POST /api/login : vérifie le mot de passe propriétaire (rate limité). */
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

/** GET /api/catalog/extras (public) : suppléments actifs du salon. */
export async function fetchExtras(salonSlug: string): Promise<CatalogListResponse> {
  return apiRequest<CatalogListResponse>({ path: 'api/catalog/extras', salonSlug });
}

/** GET /api/barbers (public) : équipe du salon + état du jour (congés, pauses, horaires). */
export async function fetchBarbers(salonSlug: string): Promise<BarbersListResponse> {
  return apiRequest<BarbersListResponse>({ path: 'api/barbers', salonSlug });
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
