// Tableau de bord (administration CONNECTÉE via POST /api/login).
// Les statistiques réelles arrivent à la Phase 5 (API /api/queue/stats,
// /api/owner/*). Ici : confirmation de la session propriétaire.
import React from 'react';
import { View } from 'react-native';
import { ScreenPlaceholder } from '../../components/ScreenPlaceholder';
import { SessionBanner } from '../../components/SessionBanner';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../hooks/useTheme';

export function DashboardScreen() {
  const { admin, logout } = useAuth();
  const t = useTheme();

  if (!admin) return null; // garou : l'écran n'est monté qu'avec session

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <SessionBanner
        label="Connecté (administration)"
        sublabel={admin.salonSlug ? `Salon : ${admin.salonSlug} — mot de passe propriétaire` : 'Salon par défaut — mot de passe propriétaire'}
        onLogout={() => void logout('admin')}
        t={t}
      />
      <ScreenPlaceholder
        description="Phase 5 : tableaux de bord du salon (coupes et encaissements du jour, RDV à venir, courbe de chiffre d'affaires) et de l'équipe."
        checklist={['File d\'attente en temps réel + actions rapides', 'Statistiques jour / semaine par coiffeur', 'Journal d\'activité et erreurs du salon']}
      />
    </View>
  );
}
