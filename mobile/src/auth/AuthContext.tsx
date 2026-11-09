// Contexte d'authentification TBO — PARCOURS WEB ORIGINAL.
// Admin : EMAIL + mot de passe → POST /api/signup/login-lookup → salons de
// l'enseigne (sélecteur du menu latéral) ; chaque appel ensuite avec
// X-Admin-Password. Coiffeur : PIN (X-Barber-Id / X-Barber-Pin). Client :
// jeton opaque X-Client-Token. Persistance expo-secure-store seulement.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import { loginOwnerSalons } from '../api/endpoints';

export type AuthState = {
  /** Lancement effectué (sessions rechargées du SecureStore). */
  ready: boolean;
  salonRef: SalonRef | null;
  admin: AdminSession | null;
  barber: BarberSession | null;
  client: ClientSession | null;
};

export type AuthContextValue = AuthState & {
  loginAdmin(email: string, password: string): Promise<void>;
  loginBarber(salonSlug: string, pin: string): Promise<void>;
  loginClient(salonSlug: string, email: string, password: string): Promise<void>;
  /** Sélecteur d'enseigne du menu latéral (web : salon-switcher). */
  switchAdminSalon(slug: string): Promise<void>;
  logout(kind: SessionKind): Promise<void>;
};

const emptyState: AuthState = { ready: false, salonRef: null, admin: null, barber: null, client: null };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(emptyState);
  const stateRef = useRef(state);
  stateRef.current = state;

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
        // Migration de sessions créées par des versions antérieures :
        // sans la forme attendue (salons[], email), on repart sur une
        // reconnexion propre plutôt que de laisser l'app planter.
        let adminOk = admin;
        if (admin && (!Array.isArray(admin.salons) || typeof admin.email !== 'string')) {
          adminOk = null;
          void clearSession('admin');
        }
        setState({ ready: true, salonRef, admin: adminOk, barber, client });
      } finally {
        if (!cancelled) setState((prev) => ({ ...prev, ready: true }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const commit = useCallback(async (salonSlug: string, sessions: TboSession[]) => {
    if (salonSlug) await saveSalonRef({ slug: salonSlug });
    for (const s of sessions) await saveSession(s);
  }, []);

  const loginAdminImpl = useCallback(
    async (email: string, password: string) => {
      const { salons } = await loginOwnerSalons(email.trim(), password);
      const session: AdminSession = {
        kind: 'admin',
        salonSlug: salons[0]?.slug ?? '',
        adminPassword: password,
        email: email.trim(),
        salons,
      };
      await commit(session.salonSlug, [session]);
      setState((prev) => ({
        ...prev,
        salonRef: session.salonSlug ? { slug: session.salonSlug, name: salons[0]?.name } : prev.salonRef,
        admin: session,
      }));
    },
    [commit]
  );

  const switchAdminSalon = useCallback(async (slug: string) => {
    const current = stateRef.current.admin;
    if (!current || current.salonSlug === slug) return;
    const next: AdminSession = { ...current, salonSlug: slug };
    await saveSession(next);
    await saveSalonRef({ slug });
    setState((prev) => ({ ...prev, admin: next, salonRef: { slug } }));
  }, []);

  const loginBarberImpl = useCallback(
    async (salonSlug: string, pin: string) => {
      // Import différé évité : appel direct (endpoints n'importe pas le contexte).
      const { loginBarber: apiLoginBarber } = await import('../api/endpoints');
      const { barber } = await apiLoginBarber(salonSlug.trim(), pin, 'poste');
      const session: BarberSession = {
        kind: 'barber',
        salonSlug: salonSlug.trim(),
        barberId: String(barber.id),
        barberPin: pin.trim(),
        barberName: barber.name,
      };
      await commit(salonSlug, [session]);
      setState((prev) => ({
        ...prev,
        salonRef: salonSlug.trim() ? { slug: salonSlug.trim() } : prev.salonRef,
        barber: session,
      }));
    },
    [commit]
  );

  const loginClientImpl = useCallback(
    async (salonSlug: string, email: string, password: string) => {
      const { loginClient: apiLoginClient } = await import('../api/endpoints');
      const { token } = await apiLoginClient(salonSlug.trim(), email.trim(), password);
      const session: ClientSession = { kind: 'client', salonSlug: salonSlug.trim(), clientToken: token };
      await commit(salonSlug, [session]);
      setState((prev) => ({
        ...prev,
        salonRef: salonSlug.trim() ? { slug: salonSlug.trim() } : prev.salonRef,
        client: session,
      }));
    },
    [commit]
  );

  const logout = useCallback(async (kind: SessionKind) => {
    await clearSession(kind);
    setState((prev) => ({ ...prev, [kind]: null }));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      loginAdmin: loginAdminImpl,
      switchAdminSalon,
      loginBarber: loginBarberImpl,
      loginClient: loginClientImpl,
      logout,
    }),
    [state, loginAdminImpl, switchAdminSalon, loginBarberImpl, loginClientImpl, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Accès au contexte d'auth — à utiliser dans un écran sous AuthProvider. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth doit être appelé sous <AuthProvider>');
  return value;
}
