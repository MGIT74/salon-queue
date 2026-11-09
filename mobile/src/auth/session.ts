// PHASE 2 (préparation, rien de branché) — persistance sécurisée des
// sessions TBO. Ce module ne fait qu'enregistrer/lire des sessions DÉJÀ
// validées par le serveur, via expo-secure-store (Keychain iOS / Keystore
// Android). Règles du projet :
// - JAMAIS de secret serveur, de clé Nepting ou de mot de passe
//   super-admin dans l'application ;
// - le salon actif est conservé à part, pour préremplir l'en-tête
//   X-Salon-Slug avant l'authentification ;
// - trois univers de session strictement séparés (admin / coiffeur /
//   client), conformes à l'audit docs/API_AUDIT.md §2 — un univers ne
//   lit jamais la session d'un autre.
import * as SecureStore from 'expo-secure-store';

export type SalonRef = { slug: string; name?: string };

/** Session admin = propriétaire : session résolue par EMAIL (parcours web). */
export type AdminSession = {
  kind: 'admin';
  salonSlug: string;
  adminPassword: string;
  email: string;
  /** Salons de l'enseigne (POST /api/signup/login-lookup) — sélecteur du menu. */
  salons: { slug: string; name: string }[];
};
export type BarberSession = { kind: 'barber'; salonSlug: string; barberId: string; barberPin: string; barberName: string };
export type ClientSession = { kind: 'client'; salonSlug: string; clientToken: string };

export type SessionKind = 'admin' | 'barber' | 'client';
export type TboSession = AdminSession | BarberSession | ClientSession;

const SALON_KEY = 'tbo.salon';
const SESSION_KEYS: Record<SessionKind, string> = {
  admin: 'tbo.session.admin',
  barber: 'tbo.session.barber',
  client: 'tbo.session.client',
};

/* ---------- Salon actif (préremplissage de X-Salon-Slug) ---------- */

export async function saveSalonRef(salon: SalonRef): Promise<void> {
  await SecureStore.setItemAsync(SALON_KEY, JSON.stringify(salon));
}

export async function readSalonRef(): Promise<SalonRef | null> {
  try {
    const raw = await SecureStore.getItemAsync(SALON_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof (parsed as SalonRef).slug === 'string') {
      return parsed as SalonRef;
    }
    return null;
  } catch {
    return null;
  }
}

/* ---------- Sessions par univers ---------- */

export async function saveSession<T extends TboSession>(session: T): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEYS[session.kind], JSON.stringify(session));
}

export async function readSession<K extends SessionKind>(kind: K): Promise<Extract<TboSession, { kind: K }> | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEYS[kind]);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && (parsed as TboSession).kind === kind) {
      return parsed as Extract<TboSession, { kind: K }>;
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearSession(kind: SessionKind): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEYS[kind]);
}

export async function clearAllSessions(): Promise<void> {
  for (const kind of Object.keys(SESSION_KEYS) as SessionKind[]) {
    await SecureStore.deleteItemAsync(SESSION_KEYS[kind]);
  }
}
