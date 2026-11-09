// Connexion professionnelle du coiffeur — API réelle POST /api/barbers/login.
// Le PIN (4-8 chiffres) + l'identifiant du coiffeur servent d'en-têtes
// X-Barber-Id / X-Barber-Pin sur chaque appel d'espace coiffeur. Le PIN est
// conservé dans le SecureStore UNIQUEMENT sur ce téléphone (aucun secret
// serveur, aucune clé TPE). Rate limiting serveur : 5 essais/heure/IP.
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { FormErrorView, LabeledField, SubmitButton } from '../../components/AuthForm';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../hooks/useTheme';
import { Palette, brand, spacing } from '../../theme/theme';

export function PinLoginScreen() {
  const { salonRef, loginBarber } = useAuth();
  const [salonSlug, setSalonSlug] = useState(salonRef?.slug ?? '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const t = useTheme();
  const styles = stylesFor(t);

  const submit = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await loginBarber(salonSlug, pin);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>THE BARBER ONE</Text>
        <Text style={styles.title}>Mon poste</Text>
        <Text style={styles.subtitle}>
          Saisissez votre code PIN professionnel pour ouvrir votre journée (le PIN est défini par
          l'administration du salon).
        </Text>
        <LabeledField
          label="Salon (identifiant, ex. le-salon)"
          t={t}
          value={salonSlug}
          onChangeText={setSalonSlug}
          placeholder="Laisser vide si un seul salon"
        />
        <LabeledField
          label="Code PIN (4-8 chiffres)"
          t={t}
          value={pin}
          onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 8))}
          keyboardType="number-pad"
          secureTextEntry
        />
        <FormErrorView error={error} t={t} />
        <SubmitButton label="Ouvrir ma journée" t={t} busy={busy} disabled={pin.length < 4} onPress={submit} />
        <Text style={styles.hint}>
          Attention : 5 PIN incorrects consécutifs bloquent l'essai 1 heure (règle serveur).
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.background },
    content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md, paddingTop: spacing.lg },
    brand: { color: t.accent, fontWeight: '700', letterSpacing: brand.letterSpacing, fontSize: 13 },
    title: { color: t.textPrimary, fontSize: 28, fontWeight: '700', marginTop: spacing.sm },
    subtitle: { color: t.textMuted, fontSize: 15, lineHeight: 22, marginBottom: spacing.md },
    hint: { color: t.textMuted, fontSize: 13, fontStyle: 'italic', marginTop: spacing.md, textAlign: 'center' },
  });
