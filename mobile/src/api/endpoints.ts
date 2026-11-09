// Endpoints d'authentification et de salon — formes de réponses lues
// directement dans le code serveur (docs/API_AUDIT.md). Aucune invention :
// chaque type est vérifié dans la route correspondante.
import { ApiRequest, apiRequest } from './transport';
import { ApiOkResponse, ClientLoginResponse, ClientMeResponse } from '../types/api';

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
