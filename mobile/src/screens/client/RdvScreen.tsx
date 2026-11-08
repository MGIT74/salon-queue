// Rendez-vous du client : liste des RDV à venir + réservation en ligne.
import React from 'react';
import { ScreenPlaceholder } from '../shared/ScreenPlaceholder';

export function RdvScreen() {
  return (
    <ScreenPlaceholder
      description="Mes rendez-vous à venir (annulables, note possible) et la réservation en ligne pour moi ou un proche."
      checklist={['Choix prestation, suppléments, coiffeur et créneau', 'Réservation de groupe (plusieurs personnes)', 'Annulation via cancel_token, sans compte si besoin']}
      authNote="Public pour réserver ; « mes rendez-vous » passe par la session client (X-Client-Token) — API : POST /api/appointments, GET /api/client-auth/me."
    />
  );
}
