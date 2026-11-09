// Connexion administration/magasin (propriétaire) — API réelle
// POST /api/login avec l'en-tête X-Admin-Password. Le serveur revalide ce
// mot de passe à chaque appel d'API admin : il est conservé dans le
// SecureStore (Keychain/Keystore) après la connexion réussie. Aucun secret
// packagé, aucune clé Nepting n'entre jamais dans l'application.
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { FormErrorView, LabeledField, SubmitButton } from '../../components/AuthForm';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../hooks/useTheme';
import { Palette, brand, spacing } from '../../theme/theme';

export function AdminLoginScreen() {
  const { salonRef, loginAdmin } = useAuth();
  const [salonSlug, setSalonSlug] = useState(salonRef?.slug ?? '');
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
      await loginAdmin(salonSlug, password);
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
        <Text style={styles.title}>Administration</Text>
        <Text style={styles.subtitle}>
          Il s'agit du mot de passe du propriétaire de l'enseigne (déjà utilisé sur le tableau de
          bord web). Il revalide chaque appel d'API côté serveur.
        </Text>
        <LabeledField
          label="Salon (identifiant, ex. le-salon)"
          t={t}
          value={salonSlug}
          onChangeText={setSalonSlug}
          placeholder="Laisser vide si un seul salon"
        />
        <LabeledField
          label="Mot de passe propriétaire"
          t={t}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
        />
        <FormErrorView error={error} t={t} />
        <SubmitButton label="Ouvrir l'administration" t={t} busy={busy} disabled={!password} onPress={submit} />
        <Text style={styles.hint}>
          8 échecs consécutifs bloquent 15 min ; email non vérifié = 403 du serveur.
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
