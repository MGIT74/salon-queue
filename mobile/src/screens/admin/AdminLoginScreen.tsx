// Connexion Dashboard — reproduction du carton de connexion web
// (dashboard.html #login) : Email + Mot de passe, bouton « Entrer »,
// « Mot de passe oublié ? » et « Créer mon salon » (si inscriptions ouvertes).
// Flux API = celui du web : POST /api/signup/login-lookup → salons.
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormErrorView, LabeledField, SubmitButton } from '../../components/AuthForm';
import { fetchSignupStatus } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../hooks/useTheme';
import { Palette, radius, spacing } from '../../theme/theme';

export function AdminLoginScreen({ onBack }: { onBack: () => void }) {
  const { loginAdmin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [signupEnabled, setSignupEnabled] = useState(false);

  const t = useTheme();
  const styles = stylesFor(t);

  useEffect(() => {
    void (async () => {
      try {
        const status = await fetchSignupStatus();
        setSignupEnabled(status.enabled === true);
      } catch {
        setSignupEnabled(false);
      }
    })();
  }, []);

  const submit = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await loginAdmin(email, password);
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

        <View style={styles.visual}>
          <Text style={styles.visualTitle}>The Barber One</Text>
          <Text style={styles.visualSub}>Espace de gestion du salon</Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.glowIcon}>
            <Ionicons name="id-card-outline" size={24} color={t.blue} />
          </View>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.sub}>Connectez-vous avec votre email — retrouve votre salon automatiquement</Text>
          <LabeledField
            label="Email"
            t={tAdapt(t)}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <LabeledField
            label="Mot de passe"
            t={tAdapt(t)}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
          />
          <FormErrorView error={error} t={t} />
          <TouchableOpacity style={styles.enterBtn} disabled={busy} onPress={() => void submit()} accessibilityRole="button">
            <Text style={styles.enterLabel}>{busy ? 'Connexion…' : 'Entrer'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.forgot} onPress={() => void Linking.openURL('https://app.thebarberone.com/forgot-password.html')}>
            <Text style={styles.forgotLabel}>Mot de passe oublié ?</Text>
          </TouchableOpacity>
          {signupEnabled ? (
            <TouchableOpacity style={styles.forgot} onPress={() => void Linking.openURL('https://app.thebarberone.com/signup.html')}>
              <Text style={styles.forgotLabel}>Pas encore de salon ? Créer mon salon</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Les champs web utilisent les cartes claires même en thème sombre (cards
// iOS) ; on passe la palette telle quelle (card = fond de champ).
function tAdapt(p: Palette): Palette {
  return p;
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.bg },
    content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.md },
    backLabel: { color: t.blue, fontSize: 15, fontWeight: '600' },
    visual: {
      backgroundColor: t.blueSoft,
      borderRadius: radius.card,
      padding: spacing.lg,
      gap: 6,
    },
    visualTitle: { color: t.blue, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
    visualSub: { color: t.ink, fontSize: 14, opacity: 0.8 },
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
    enterBtn: { backgroundColor: t.blue, borderRadius: radius.button, paddingVertical: 15, alignItems: 'center' },
    enterLabel: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
    forgot: { alignItems: 'center', paddingVertical: 4 },
    forgotLabel: { color: t.blue, fontSize: 14.5, fontWeight: '500' },
  });
