// Compte client : profil, fidélité, proches, cartes cadeaux.
import React from 'react';
import { ScreenPlaceholder } from '../shared/ScreenPlaceholder';

export function CompteScreen() {
  return (
    <ScreenPlaceholder
      description="Mon profil, ma carte de fidélité (points, paliers, récompenses), mes proches pour réserver et mes cartes cadeaux reçues."
      checklist={['Inscription / connexion ( vérification email obligatoire )', 'Fidélité : points, paliers, récompenses disponibles', 'Proches : réserver pour quelqu\'un d\'autre']}
      authNote="Session client : jeton opaque X-Client-Token valable 90 jours (stockage sécurisé expo-secure-store) — API : /api/client-auth/*."
    />
  );
}
