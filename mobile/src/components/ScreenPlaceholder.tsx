// Bloc commun aux écrans dont les données arrivent aux phases suivantes :
// descriptif du périmètre, liste des points prévus, rappel d'auth API.
// Restyle v2 : barre dorée à gauche + métriques du design system.
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Palette, radius, spacing } from '../theme/theme';
import { useTheme } from '../hooks/useTheme';

export type ScreenPlaceholderProps = {
  description: string;
  checklist?: string[];
  authNote?: string;
  /** Étiquette de planning affichée en pilule ("Phase 4", "Phase 5"...). */
  phase?: string;
};

export function ScreenPlaceholder({ description, checklist = [], authNote, phase }: ScreenPlaceholderProps) {
  const t = useTheme();
  const styles = stylesFor(t);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.panel}>
        <View style={styles.badgeRow}>
          {phase ? <View style={styles.phasePill}><Text style={styles.phaseText}>{phase}</Text></View> : null}
          <Text style={styles.status}>Bientôt sur TBO</Text>
        </View>
        <Text style={styles.description}>{description}</Text>
        {checklist.length > 0 && (
          <View style={styles.checklist}>
            {checklist.map((item) => (
              <Text key={item} style={styles.checklistItem}>·  {item}</Text>
            ))}
          </View>
        )}
        {authNote ? <Text style={styles.authNote}>{authNote}</Text> : null}
      </View>
    </ScrollView>
  );
}

// (pas de déclaration parasite ici : import en tête de fichier)

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xl,
      gap: spacing.md,
    },
    panel: {
      backgroundColor: t.card,
      borderColor: t.sep,
      borderLeftWidth: 3,
      borderLeftColor: t.blue,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.card,
      padding: spacing.lg,
      gap: spacing.sm + 2,
    },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    phasePill: {
      backgroundColor: t.bg,
      borderColor: t.sep,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 100,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    phaseText: { color: t.grey, fontSize: 11, fontWeight: '700' },
    status: {
      color: t.grey,
      fontWeight: '700',
      textTransform: 'uppercase',
      fontSize: 11,
      letterSpacing: 2,
    },
    description: {
      color: t.grey,
      fontSize: 15,
      lineHeight: 22,
    },
    checklist: { gap: 6, marginTop: 4 },
    checklistItem: { color: t.grey, fontSize: 14, lineHeight: 20 },
    authNote: { color: t.grey, fontSize: 13, fontStyle: 'italic', marginTop: 6 },
  });
