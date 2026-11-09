// Onglet « Compte » de l'espace client (compte.html) : infos du compte
// (nom/email déjà réels via GET /me) et édition de profil — réels à la
// Phase 3+ (PUT /api/client-auth/me : nom, email, téléphone, mot de passe).
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ScreenPlaceholder } from '../../components/ScreenPlaceholder';
import { useTheme } from '../../hooks/useTheme';
import { spacing } from '../../theme/theme';

export function ClientAccountScreen() {
  const t = useTheme();
  const styles = stylesFor(t);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenPlaceholder
        phase="Phase 3+"
        description="Profil client : nom, téléphone, changement d'email (avec confirmation par lien), changement de mot de passe et session active. Les mêmes champs que la page « Mon compte » du web."
        checklist={['Nom et téléphone (validation serveur)', "Changement d'email vérifié par lien", 'Mot de passe : déconnexion des autres appareils']}
        authNote="API : GET/PUT /api/client-auth/me (session X-Client-Token)."
      />
    </ScrollView>
  );
}

const stylesFor = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: { padding: spacing.lg, paddingBottom: spacing.xl },
  });
