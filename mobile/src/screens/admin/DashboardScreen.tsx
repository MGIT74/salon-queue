// Tableau de bord (administration) : statistiques du salon.
import React from 'react';
import { ScreenPlaceholder } from '../shared/ScreenPlaceholder';

export function DashboardScreen() {
  return (
    <ScreenPlaceholder
      description="Tableau de bord du salon : coupes du jour, encaissements, RDV à venir, courbe de chiffre d'affaires et file en direct."
      checklist={['File d\'attente en temps réel + actions rapides', 'Statistiques jour / semaine (par coiffeur)', 'Courbe de chiffre d\'affaires du salon']}
      authNote="Admin : en-tête X-Admin-Password (scrypt côté serveur, compteur d'échecs persistant) — API : GET /api/queue (stats), GET /api/owner/*, GET /api/appointments."
    />
  );
}
