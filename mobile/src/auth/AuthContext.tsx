// Contexte d'authentification TBO (Phase 2). Trois univers strictement
// séparés, conformes à l'audit : mot de passe admin, PIN coiffeur, session
// client opaque. Persistance expo-secure-store (src/auth/session.ts).
// Le mot de passe admin est conservé dans le SecureStore car le serveur le
// revalide à CHAQUE appel (en-tête X-Admin-Password, aucun jeton émis) —
// il s'agit d'un identifiant saisi par l'utilisateur à la connexion, pas
// d'un secret packagé dans le bundle. Aucune clé Nepting jamais stockée.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AdminSession,
  BarberSession,
  ClientSession,
  SalonRef,
  SessionKind,
  TboSession,
  clearSession,
  readSalonRef,
  readSession,
  saveSalonRef,
  saveSession,
} from './session';
import { loginAdmin as apiLoginAdmin, loginBarber as apiLoginBarber, loginClient as apiLoginClient } from '../api/endpoints';

export type AuthState = {
  /** Lancement effectué (sessions rechargées du SecureStore). */
  ready: boolean;
  salonRef: SalonRef | null;
  admin: AdminSession | null;
  barber: BarberSession | null;
  client: ClientSession | null;
};

export type AuthContextValue = AuthState & {
  loginAdmin(salonSlug: string, adminPassword: string): Promise<void>;
  loginBarber(salonSlug: string, pin: string): Promise<void>;
  loginClient(salonSlug: string, email: string, password: string): Promise<void>;
  logout(kind: SessionKind): Promise<void>;
};

const emptyState: AuthState = { ready: false, salonRef: null, admin: null, barber: null, client: null };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(emptyState);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [salonRef, admin, barber, client] = await Promise.all([
          readSalonRef(),
          readSession('admin'),
          readSession('barber'),
          readSession('client'),
        ]);
        if (cancelled) return;
        setState({ ready: true, salonRef, admin, barber, client });
      } finally {
        if (!cancelled) setState((prev) => ({ ...prev, ready: true }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const commit = useCallback(async (salonSlug: string, sessions: TboSession[]) => {
    const slug = salonSlug.trim();
    if (slug) await saveSalonRef({ slug });
    for (const s of sessions) await saveSession(s);
  }, []);

  const loginAdminImpl = useCallback(async (salonSlug: string, adminPassword: string) => {
    await apiLoginAdmin(salonSlug.trim(), adminPassword);
    const session: AdminSession = { kind: 'admin', salonSlug: salonSlug.trim(), adminPassword };
    await commit(salonSlug, [session]);
    setState((prev) => ({ ...prev, salonRef: salonSlug.trim() ? { slug: salonSlug.trim() } : prev.salonRef, admin: session }));
  }, [commit]);

  const loginBarberImpl = useCallback(async (salonSlug: string, pin: string) => {
    const { barber } = await apiLoginBarber(salonSlug.trim(), pin, 'poste');
    const session: BarberSession = {
      kind: 'barber',
      salonSlug: salonSlug.trim(),
      barberId: String(barber.id),
      barberPin: pin.trim(),
      barberName: barber.name,
    };
    await commit(salonSlug, [session]);
    setState((prev) => ({ ...prev, salonRef: salonSlug.trim() ? { slug: salonSlug.trim() } : prev.salonRef, barber: session }));
  }, [commit]);

  const loginClientImpl = useCallback(async (salonSlug: string, email: string, password: string) => {
    const { token } = await apiLoginClient(salonSlug.trim(), email.trim(), password);
    const session: ClientSession = { kind: 'client', salonSlug: salonSlug.trim(), clientToken: token };
    await commit(salonSlug, [session]);
    setState((prev) => ({ ...prev, salonRef: salonSlug.trim() ? { slug: salonSlug.trim() } : prev.salonRef, client: session }));
  }, [commit]);

  const logout = useCallback(async (kind: SessionKind) => {
    await clearSession(kind);
    setState((prev) => ({ ...prev, [kind]: null } as AuthState & Record<SessionKind, TboSession | null>));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      loginAdmin: loginAdminImpl,
      loginBarber: loginBarberImpl,
      loginClient: loginClientImpl,
      logout,
    }),
    [state, loginAdminImpl, loginBarberImpl, logout, loginClientImpl]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Accès au contexte d'auth — à utiliser dans un écran sous AuthProvider. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth doit être appelé sous <AuthProvider>');
  return value;
}
