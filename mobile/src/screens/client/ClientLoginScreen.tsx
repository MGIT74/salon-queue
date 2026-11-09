// Connexion Espace client — même carton que le web (compte.html #login-screen)
// : Email + Mot de passe, flux API POST /api/client-auth/login (session 90 j).
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormErrorView, LabeledField, SubmitButton } from '../../components/AuthForm';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../hooks/useTheme';
import { Palette, radius, spacing } from '../../theme/theme';

export function ClientLoginScreen({ onBack }: { onBack: () => void }) {
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
        <TouchableOpacity style={styles.back} onPress={onBack} accessibilityRole="button">
          <Ionicons name="chevron-back" size={20} color={t.blue} />
          <Text style={styles.backLabel}>Retour</Text>
        </TouchableOpacity>

        <View style={styles.formCard}>
          <View style={styles.glowIcon}>
            <Ionicons name="person-outline" size={24} color={t.blue} />
          </View>
          <Text style={styles.title}>Espace client</Text>
          <Text style={styles.sub}>Email et mot de passe de votre compte chez le salon.</Text>
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
          <Text style={styles.hint}>Pas encore de compte ? Créez-le depuis la page du salon (compte.html).</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.bg },
    content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md, paddingTop: spacing.md },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    backLabel: { color: t.blue, fontSize: 15, fontWeight: '600' },
    formCard: {
      backgroundColor: t.card,
      borderColor: t.sep,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.card,
      padding: spacing.lg,
      gap: spacing.md,
    },
    glowIcon: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: t.blueSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { color: t.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
    sub: { color: t.grey, fontSize: 14, lineHeight: 20, marginBottom: spacing.xs },
    hint: { color: t.grey, fontSize: 12.5, fontStyle: 'italic', textAlign: 'center' },
  });
