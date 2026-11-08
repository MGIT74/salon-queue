// File d'attente côté client : position en temps réel et rappel de tour.
import React from 'react';
import { ScreenPlaceholder } from '../shared/ScreenPlaceholder';

export function FileScreen() {
  return (
    <ScreenPlaceholder
      description="Ma position dans la file en direct, mon tour qui approche et le rappel par email/SMS du salon."
      checklist={['Rejoindre la file depuis le salon (choix de la prestation)', 'Chronomètre et position en direct', 'Itinéraire vers le salon']}
      authNote="Accès public (salon précisé par l'en-tête X-Salon-Slug) — API : GET /api/queue, POST /api/queue/checkin."
    />
  );
}
