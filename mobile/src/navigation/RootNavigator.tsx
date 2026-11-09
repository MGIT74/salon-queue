// ÉCRAN D'ACCUEIL RACINE — remplace l'écran provisoire « 4 espaces ».
// Routeur de session fidèle au web :
//   - session admin (enseigne) → Dashboard (menu latéral du web)
//   - session coiffeur → Mon poste (poste.html)
//   - session client → Espace client (compte.html : barre bas Accueil/Réserver/Compte/Déconnexion)
//   - aucune session → parcours public (connexions, comme les 3 URL web).
// Un utilisateur authentifié ne choisit JAMAIS son rôle manuellement.
import { LoadingView } from '../components/AuthForm';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { AdminShell } from '../screens/admin/AdminShell';
import { PublicEntryScreen } from '../screens/PublicEntryScreen';
import { CompteShell } from '../screens/client/CompteShell';
import { PosteShell } from '../screens/poste/PosteShell';

export function RootNavigator() {
  const t = useTheme();
  const { ready, admin, barber, client } = useAuth();

  if (!ready) return <LoadingView t={t} label="Chargement…" />;
  if (admin) return <AdminShell />;
  if (barber) return <PosteShell />;
  if (client) return <CompteShell />;
  return <PublicEntryScreen />;
}
