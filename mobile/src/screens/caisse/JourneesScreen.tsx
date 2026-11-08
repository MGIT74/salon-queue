// Journées de caisse : périodes (pont/rotation), recomptages, clôtures Z.
// Paiement Nepting exclu (voir EncaissementScreen).
import React from 'react';
import { ScreenPlaceholder } from '../shared/ScreenPlaceholder';

export function JourneesScreen() {
  return (
    <ScreenPlaceholder
      description="Période de caisse en cours (pont, fond de tiroir suggéré), recomptages demandés et historique des clôtures Z."
      checklist={['Ouvrir / fermer une journée de caisse', 'Recomptage : confirmer le montant manuel', 'Historique des clôtures, ticket Z consultable']}
      authNote="Admin (X-Admin-Password) ou coiffeur selon la route — API : /api/owner/caisse/current-period|close|suggested-float|pending-recount|closings."
    />
  );
}
