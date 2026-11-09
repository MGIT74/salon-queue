// Couche de transport vers les API TBO — SQUELETTE (aucun écran branché).
// Décisions tenues ici :
// - l'URL de base vient d'EXPO_PUBLIC_API_BASE_URL (fichier .env, JAMAIS
//   committé) et retombe sur l'URL de production d'app.json ;
// - le salon est TOUJOURS précisé par l'en-tête X-Salon-Slug (cf.
//   docs/API_AUDIT.md §1) : sans salon, la plateforme multi-salons refuse
//   l'appel (400 needs_salon) ;
// - AUCUN secret TPE/Nepting dans l'application : les routes /api/tpe
//   (paiement carte) sont exclues de cette couche tant que la décision
//   n'est pas prise — aucun appel, aucune clé, aucun flag.

export type ApiAuth =
  | { kind: 'public' }
  | { kind: 'client'; clientToken: string }
  | { kind: 'barber'; barberId: string; barberPin: string; actingAsBarberId?: string }
  | { kind: 'admin'; adminPassword: string; impersonationToken?: string };

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ApiRequest = {
  method?: ApiMethod;
  path: string;
  salonSlug: string;
  auth?: ApiAuth;
  body?: unknown;
};

export type ApiErrorExtras = {
  retryAfterSeconds?: number;
  needsSalon?: boolean;
  needsEmailVerification?: boolean;
};

export class ApiError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;
  readonly needsSalon?: boolean;
  readonly needsEmailVerification?: boolean;

  constructor(status: number, message: string, extras: ApiErrorExtras = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterSeconds = extras.retryAfterSeconds;
    this.needsSalon = extras.needsSalon;
    this.needsEmailVerification = extras.needsEmailVerification;
  }
}

const DEFAULT_BASE_URL = 'https://app.thebarberone.com';

export function apiBaseUrl(): string {
  const fromEnv = (process.env.EXPO_PUBLIC_API_BASE_URL || '').trim();
  return fromEnv.length > 0 ? fromEnv : DEFAULT_BASE_URL;
}

function authHeaders(auth?: ApiAuth): Record<string, string> {
  switch (auth?.kind) {
    case 'admin': {
      const headers: Record<string, string> = { 'X-Admin-Password': auth.adminPassword };
      if (auth.impersonationToken) headers['X-Impersonate-Token'] = auth.impersonationToken;
      return headers;
    }
    case 'barber': {
      const headers: Record<string, string> = {
        'X-Barber-Id': auth.barberId,
        'X-Barber-Pin': auth.barberPin,
      };
      if (auth.actingAsBarberId) headers['X-Acting-As-Barber-Id'] = auth.actingAsBarberId;
      return headers;
    }
    case 'client':
      return { 'X-Client-Token': auth.clientToken };
    default:
      return {};
  }
}

function joinUrl(baseUrl: string, path: string): string {
  const left = baseUrl.replace(/\/+$/, '');
  const right = path.replace(/^\/+/, '');
  return `${left}/${right}`;
}

/** Erreur d'API normalisée : 429 (Retry-After), 400 (needs_salon), 403 (needs_email_verification). */
async function toApiError(response: Response): Promise<never> {
  const retryAfterRaw = Number(response.headers.get('Retry-After'));
  let message = `Erreur HTTP ${response.status}`;
  let payload: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>;
  } catch {
    // Pas de JSON dans l'erreur : on garde le message générique.
  }
  if (typeof payload?.error === 'string') message = payload.error;
  const retryAfterSeconds = Number.isFinite(retryAfterRaw) && retryAfterRaw > 0 ? retryAfterRaw : undefined;
  const needsSalon = payload?.needs_salon === true ? true : undefined;
  const needsEmailVerification = payload?.needs_email_verification === true ? true : undefined;
  throw new ApiError(response.status, message, { retryAfterSeconds, needsSalon, needsEmailVerification });
}

/** Appel JSON typé vers l'API TBO. Utilisé par les futurs hooks d'écrans. */
export async function apiRequest<TResponse>(request: ApiRequest, signal?: AbortSignal): Promise<TResponse> {
  const method = request.method ?? 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(request.salonSlug.trim() ? { 'X-Salon-Slug': request.salonSlug.trim() } : {}),
    ...authHeaders(request.auth),
  };
  if (request.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(joinUrl(apiBaseUrl(), request.path), {
    method,
    headers,
    body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
    signal,
  });

  if (!response.ok) {
    await toApiError(response);
  }

  const text = await response.text();
  if (!text) return undefined as TResponse;
  try {
    return JSON.parse(text) as TResponse;
  } catch {
    throw new ApiError(502, 'Réponse inattendue du serveur (JSON attendu)');
  }
}
