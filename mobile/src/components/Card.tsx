// Carte de contenu partagée — style de docs/DESIGN.md §4 (maquette
// design-dashboard.html) : fond `card`, rayon 16, AUCUNE bordure, ombre
// douce en clair seulement. Titre optionnel = étiquette 13 MAJUSCULES grise.
// `flush` : pas de marge horizontale, pour les listes iOS (ListRow).
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Palette, cardShadow, radius, spacing } from '../theme/theme';

export function Card({ title, children, t, tone, flush, style }: {
  title?: string;
  children: React.ReactNode;
  t: Palette;
  tone?: 'normal' | 'warn';
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = stylesFor(t);
  return (
    <View style={[styles.card, flush && styles.flush, tone === 'warn' && { borderWidth: 1, borderColor: t.red }, style]}>
      {title ? (
        <Text style={[styles.cardTitle, flush && styles.flushTitle, tone === 'warn' && { color: t.red }]}>{title}</Text>
      ) : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.card,
      borderRadius: radius.card,
      padding: spacing.md,
      gap: 10,
      ...cardShadow(t),
    },
    flush: { paddingHorizontal: 0, paddingVertical: 4, gap: 0 },
    cardTitle: {
      color: t.grey,
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    flushTitle: { paddingHorizontal: spacing.md, paddingTop: 12, paddingBottom: 4 },
    cardBody: { gap: 6 },
  });
