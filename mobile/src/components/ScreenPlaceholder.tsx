// Bloc commun aux écrans en préparation : description, liste des
// fonctionnalités prévues et rappel de l'authentification requise.
// Chaque écran réel remplacera progressivement ce contenu.
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Palette, radius, spacing } from '../theme/theme';
import { useTheme } from '../hooks/useTheme';

export type ScreenPlaceholderProps = {
  description: string;
  checklist?: string[];
  authNote?: string;
};

export function ScreenPlaceholder({ description, checklist = [], authNote }: ScreenPlaceholderProps) {
  const t = useTheme();
  const styles = stylesFor(t);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.panel}>
        <Text style={styles.status}>Écran en préparation</Text>
        <Text style={styles.description}>{description}</Text>
        {checklist.length > 0 && (
          <View style={styles.checklist}>
            {checklist.map((item) => (
              <Text key={item} style={styles.checklistItem}>• {item}</Text>
            ))}
          </View>
        )}
        {authNote ? <Text style={styles.authNote}>{authNote}</Text> : null}
      </View>
    </ScrollView>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xl,
      gap: spacing.md,
    },
    panel: {
      backgroundColor: t.surface,
      borderColor: t.surfaceBorder,
      borderWidth: 1,
      borderRadius: radius.card,
      padding: spacing.lg,
      gap: spacing.sm + 2,
    },
    status: {
      color: t.accent,
      fontWeight: '700',
      textTransform: 'uppercase',
      fontSize: 11,
      letterSpacing: 2,
    },
    description: {
      color: t.textSecondary,
      fontSize: 15,
      lineHeight: 22,
    },
    checklist: { gap: 6, marginTop: 4 },
    checklistItem: { color: t.textMuted, fontSize: 14, lineHeight: 20 },
    authNote: { color: t.textMuted, fontSize: 13, fontStyle: 'italic', marginTop: 4 },
  });
