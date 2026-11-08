// Coiffeurs (administration) : équipe, horaires hebdo, congés, PIN.
import React from 'react';
import { ScreenPlaceholder } from '../../components/ScreenPlaceholder';

export function CoiffeursScreen() {
  return (
    <ScreenPlaceholder
      description="L'équipe : coiffeurs actifs, horaires hebdomadaires, congés et jours « sans RDV », PIN de poste, services exclus et tarifs par coiffeur."
      checklist={['Fiche coiffeur : PIN, couleur, photo, capacités', 'Horaires hebdomadaires et congés (calendrier annuel)', 'Statistiques par coiffeur']}
      authNote="Admin : X-Admin-Password — API : /api/barbers (CRUD), /api/barbers/:id/schedule|leaves|walkin-days|capabilities."
    />
  );
}
