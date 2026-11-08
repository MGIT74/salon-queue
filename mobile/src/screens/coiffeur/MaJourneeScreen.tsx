// Ma journée (coiffeur) : file à traiter, actions de coupe, RDV à venir.
import React from 'react';
import { ScreenPlaceholder } from '../shared/ScreenPlaceholder';

export function MaJourneeScreen() {
  return (
    <ScreenPlaceholder
      description="Ma journée : les coupes à traiter dans l'ordre, démarrer / terminer / marquer absent, mes rendez-vous en attente et mes statistiques du jour."
      checklist={['File d\'attente en direct avec chronos', 'Actions : commencer, terminer, annuler, note client', 'Mes RDV à venir et congés du salon']}
      authNote="Connexion par code PIN (X-Barber-Id + X-Barber-Pin, PIN stocké dans expo-secure-store) — API : POST /api/barbers/login puis /api/queue/*, /api/appointments (lecture)."
    />
  );
}
