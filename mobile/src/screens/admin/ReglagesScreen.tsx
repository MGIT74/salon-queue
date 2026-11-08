// Réglages (administration) : salon, SMTP, SMS, TVA, calendrier.
import React from 'react';
import { ScreenPlaceholder } from '../../components/ScreenPlaceholder';

export function ReglagesScreen() {
  return (
    <ScreenPlaceholder
      description="Réglages du salon : informations (nom, identifiant, fuseau), email de notification SMTP, SMS et crédits, taux de TVA, fermetures et horaires du salon."
      checklist={['Salon : nom, identifiant (slug), fuseau horaire, image de connexion', 'SMTP (mot de passe chiffré côté serveur) et modèles d\'email', 'SMS : test, crédits mensuels, prévisualisation']}
      authNote="Admin : X-Admin-Password — API : GET/PUT /api/settings, /api/settings/vat-rates, /api/salon-calendar/*, POST /api/settings/smtp|sms/test."
    />
  );
}
