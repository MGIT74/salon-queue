// Ma journée (coiffeur CONNECTÉ via POST /api/barbers/login) : la file à
// traiter et les actions de coupe viendront à la Phase 4 (API réelles
// /api/queue). Ici : confirmation de la session professionnelle.
import React from 'react';
import { View } from 'react-native';
import { ScreenPlaceholder } from '../../components/ScreenPlaceholder';
import { SessionBanner } from '../../components/SessionBanner';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../hooks/useTheme';

export function MaJourneeScreen() {
  const { barber, logout } = useAuth();
  const t = useTheme();

  if (!barber) return null; // garou : l'écran n'est monté qu'avec session

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <SessionBanner
        label={`Connecté : ${barber.barberName}`}
        sublabel="Session coiffeur (PIN coiffeur, ce téléphone)"
        onLogout={() => void logout('barber')}
        t={t}
      />
      <ScreenPlaceholder
        description="Phase 4 : ma file à traiter dans l'ordre (chronos en direct), mes RDV attendus, et mes actions commence / terminer / marquer absent, conformes au mode timer activé ou non de la journée."
        checklist={['File du jour en direct (GET /api/queue)', 'Démarrer / terminer une coupe (timer serveur)', 'Gestion des passages sans rendez-vous']}
      />
    </View>
  );
}
