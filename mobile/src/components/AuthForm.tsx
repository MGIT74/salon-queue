// Briques réutilisables des écrans de connexion : champ étiqueté,
// bouton d'envoi, affichage d'erreur API (dont 429 + Retry-After).
import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { ApiError } from '../api/transport';
import { Palette, radius, spacing } from '../theme/theme';

export function LabeledField({ label, t, ...inputProps }: { label: string; t: Palette } & TextInputProps) {
  const styles = stylesFor(t);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={t.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        {...inputProps}
      />
    </View>
  );
}

/** Message d'erreur normalisé : texte serveur + délai Retry-After éventuel. */
export function FormErrorView({ error, t }: { error: unknown; t: Palette }) {
  const styles = stylesFor(t);
  if (!error) return null;
  let text = 'Une erreur est survenue. Réessayez.';
  if (error instanceof ApiError) {
    text = error.message;
    if (error.status === 429 && error.retryAfterSeconds) {
      text += ` (nouvelle tentative dans ${Math.ceil(error.retryAfterSeconds / 60)} min)`;
    }
  }
  return <Text style={styles.error}>{text}</Text>;
}

export function SubmitButton({ label, t, busy, disabled, onPress }: {
  label: string;
  t: Palette;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = stylesFor(t);
  return (
    <TouchableOpacity
      style={[styles.submit, (disabled || busy) && styles.submitDisabled]}
      disabled={disabled || busy}
      onPress={onPress}
      accessibilityRole="button"
    >
      {busy ? (
        <ActivityIndicator color={t.accentText} />
      ) : (
        <Text style={styles.submitLabel}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

/** Écran de chargement interstitiel (démarrage, rechargement de données). */
export function LoadingView({ t, label }: { t: Palette; label?: string }) {
  const styles = stylesFor(t);
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={t.accent} />
      {label ? <Text style={styles.loadingLabel}>{label}</Text> : null}
    </View>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    field: { gap: 6 },
    label: { color: t.textSecondary, fontSize: 13, fontWeight: '600' },
    input: {
      backgroundColor: t.surface,
      borderColor: t.surfaceBorder,
      borderWidth: 1,
      borderRadius: radius.button,
      color: t.textPrimary,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
    },
    error: { color: t.danger, fontSize: 14, lineHeight: 20 },
    submit: {
      backgroundColor: t.accent,
      borderRadius: radius.button,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    submitDisabled: { opacity: 0.5 },
    submitLabel: { color: t.accentText, fontWeight: '700', fontSize: 16 },
    loading: { flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingLabel: { color: t.textMuted, fontSize: 14 },
  });
