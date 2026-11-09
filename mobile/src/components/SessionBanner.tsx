// Bannière de session partagée : qui est connecté + bouton Déconnexion
// (utilisé dans les espaces coiffeur, administration et client).
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Palette, radius, spacing } from '../theme/theme';

export function SessionBanner({ label, sublabel, onLogout, t }: {
  label: string;
  sublabel?: string;
  onLogout: () => void;
  t: Palette;
}) {
  const styles = stylesFor(t);
  return (
    <View style={styles.banner}>
      <View style={styles.texts}>
        <Text style={styles.label}>{label}</Text>
        {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
      </View>
      <TouchableOpacity onPress={onLogout} accessibilityRole="button">
        <Text style={styles.logout}>Déconnexion</Text>
      </TouchableOpacity>
    </View>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    banner: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.button,
      borderWidth: 1,
      borderColor: t.surfaceBorder,
      backgroundColor: t.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    texts: { flex: 1, gap: 2 },
    label: { color: t.textPrimary, fontWeight: '700', fontSize: 15 },
    sublabel: { color: t.textMuted, fontSize: 13 },
    logout: { color: t.danger, fontWeight: '700', fontSize: 14 },
  });
