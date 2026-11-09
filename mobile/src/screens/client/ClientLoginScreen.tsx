// Connexion de l'espace client — API réelle POST /api/client-auth/login.
// Le jeton de session (X-Client-Token) est ensuite conservé dans le
// SecureStore par le AuthProvider. La création de compte viendra avec la
// Phase 3 ; rien de fictif ici : seul un compte réel peut se connecter.
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { FormErrorView, LabeledField, SubmitButton } from '../../components/AuthForm';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../hooks/useTheme';
import { Palette, brand, radius, spacing } from '../../theme/theme';

export function ClientLoginScreen() {
  const { salonRef, loginClient } = useAuth();
  const [salonSlug, setSalonSlug] = useState(salonRef?.slug ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const t = useTheme();
  const styles = stylesFor(t);

  const submit = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await loginClient(salonSlug, email, password);
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
        <Text style={styles.title}>Connexion client</Text>
        <Text style={styles.subtitle}>
          Identifiez-vous avec l'email utilisé chez votre salon (le salon doit vous avoir activé
          l'espace client).
        </Text>
        <LabeledField
          label="Salon (identifiant, ex. le-salon)"
          t={t}
          value={salonSlug}
          onChangeText={setSalonSlug}
          placeholder="Laisser vide si un seul salon"
        />
        <LabeledField
          label="Email"
          t={t}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <LabeledField
          label="Mot de passe"
          t={t}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
        />
        <FormErrorView error={error} t={t} />
        <SubmitButton label="Se connecter" t={t} busy={busy} disabled={!email.trim() || !password} onPress={submit} />
        <Text style={styles.hint}>
          Créer un compte client : prévu à la Phase 3 (réservation, historique, fidélité).
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
