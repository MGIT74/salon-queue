// Carte de contenu partagée : titre en petites capitales dorées + bloc
// de contenu. Utilisée par la fidélité, les RDV, les placeholders…
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Palette, radius, spacing } from '../theme/theme';

export function Card({ title, children, t, tone }: {
  title: string;
  children: React.ReactNode;
  t: Palette;
  tone?: 'normal' | 'warn';
}) {
  const styles = stylesFor(t, tone === 'warn');
  return (
    <View style={styles.card}>
      <Text style={[styles.cardTitle, tone === 'warn' && { color: t.danger }]}>{title}</Text>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

const stylesFor = (t: Palette, warn: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.surface,
      borderColor: warn ? t.danger : t.surfaceBorder,
      borderWidth: 1,
      borderRadius: radius.card,
      padding: spacing.md + 2,
      gap: spacing.sm + 2,
    },
    cardTitle: {
      color: t.accent,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.5,
    },
    cardBody: { gap: spacing.xs + 2 },
  });
