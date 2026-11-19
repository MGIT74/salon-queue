// Connexion Espace client — mêmes panneaux que le web (compte.html) :
// p-login (Email + Mot de passe, POST /api/client-auth/login, session 90 j),
// p-signup (Créer un compte, case CGU + confidentialité OBLIGATOIRE →
// accept_terms: true, sinon 400 needs_terms) et p-check-email.
// Un compte appartient au salon saisi (X-Salon-Slug).
import React, { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormErrorView, LabeledField, SubmitButton } from '../../components/AuthForm';
import { PhoneField } from '../../components/PhoneField';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/transport';
import { resendClientVerification, signupClient } from '../../api/endpoints';
import { useTheme } from '../../hooks/useTheme';
import { PHONE_COUNTRIES, PhoneCountry, composePhone, contactProblem } from '../../utils/phone';
import { Palette, radius, spacing } from '../../theme/theme';

type Panel = 'login' | 'signup' | 'check';

// Mêmes liens que la case du web (compte.html #su-terms).
const CGU_URL = 'https://thebarberone.com/cgu';
const PRIVACY_URL = 'https://thebarberone.com/politique-de-confidentialite';
const TERMS_MSG = "Merci d'accepter les conditions d'utilisation et la politique de confidentialité";

export function ClientLoginScreen({ onBack }: { onBack: () => void }) {
  const { salonRef, loginClient } = useAuth();
  const [salonSlug, setSalonSlug] = useState(salonRef?.slug ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>('login');
  const [notice, setNotice] = useState('');

  // Inscription
  const [suName, setSuName] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suCountry, setSuCountry] = useState<PhoneCountry>(PHONE_COUNTRIES[0]);
  const [suPhone, setSuPhone] = useState('');
  const [suPass, setSuPass] = useState('');
  const [suTerms, setSuTerms] = useState(false);
  const [emailSent, setEmailSent] = useState(true);

  const t = useTheme();
  const styles = stylesFor(t);

  const go = (next: Panel) => {
    setError(null);
    setNotice('');
    setPanel(next);
  };

  const submit = async () => {
    if (busy) return;
    setError(null);
    setNotice('');
    setBusy(true);
    try {
      await loginClient(salonSlug, email, password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await resendClientVerification(salonSlug.trim(), email.trim());
      setError(null);
      setNotice(typeof r.message === 'string' ? r.message : 'Un nouveau lien vient d\'être envoyé.');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const signup = async () => {
    if (busy) return;
    setError(null);
    // Mêmes contrôles que doSignup() du web, dans le même ordre.
    if (!suPhone.trim()) return setError(new ApiError(400, 'Le téléphone est requis'));
    const phone = composePhone(suCountry[0], suPhone);
    const problem = contactProblem({ name: suName, email: suEmail, phone }, { emailRequired: true, phoneRequired: true });
    if (problem) return setError(new ApiError(400, problem));
    if (!suTerms) return setError(new ApiError(400, TERMS_MSG, { needsTerms: true }));
    setBusy(true);
    try {
      const r = await signupClient(salonSlug.trim(), {
        name: suName.trim(),
        email: suEmail.trim(),
        phone,
        password: suPass,
        accept_terms: suTerms === true,
      });
      setEmailSent(r.email_sent !== false);
      setEmail(suEmail.trim());
      setPanel('check');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const needsVerification = error instanceof ApiError && error.needsEmailVerification === true;

  const salonField = (
    <LabeledField
      label="Salon (identifiant, ex. le-salon)"
      t={t}
      value={salonSlug}
      onChangeText={setSalonSlug}
      placeholder="Laisser vide si un seul salon"
    />
  );

  return (
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.back} onPress={onBack} accessibilityRole="button">
          <Ionicons name="chevron-back" size={20} color={t.blue} />
          <Text style={styles.backLabel}>Retour</Text>
        </TouchableOpacity>

        {panel === 'login' ? (
          <View style={styles.formCard}>
            <View style={styles.glowIcon}>
              <Ionicons name="person-outline" size={24} color={t.blue} />
            </View>
            <Text style={styles.title}>Espace client</Text>
            <Text style={styles.sub}>Email et mot de passe de votre compte chez le salon.</Text>
            {salonField}
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
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            <SubmitButton label="Se connecter" t={t} busy={busy} disabled={!email.trim() || !password} onPress={submit} />
            <View style={styles.links}>
              <TouchableOpacity onPress={() => go('signup')} accessibilityRole="button">
                <Text style={styles.link}>Créer un compte</Text>
              </TouchableOpacity>
              {needsVerification ? (
                <TouchableOpacity onPress={() => void resend()} accessibilityRole="button">
                  <Text style={styles.link}>Renvoyer le lien de confirmation</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : panel === 'signup' ? (
          <View style={styles.formCard}>
            <Text style={styles.title}>Créer un compte</Text>
            <Text style={styles.sub}>Pour gérer vos rendez-vous, votre fidélité et vos cadeaux</Text>
            {salonField}
            <LabeledField label="Nom" t={t} value={suName} onChangeText={setSuName} placeholder="Votre nom" autoCapitalize="words" textContentType="name" />
            <LabeledField
              label="Email"
              t={t}
              value={suEmail}
              onChangeText={setSuEmail}
              placeholder="vous@exemple.fr"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <PhoneField label="Téléphone" t={t} country={suCountry} onCountryChange={setSuCountry} value={suPhone} onChangeText={setSuPhone} />
            <LabeledField
              label="Mot de passe"
              t={t}
              value={suPass}
              onChangeText={setSuPass}
              placeholder="6 caractères minimum"
              secureTextEntry
              textContentType="newPassword"
            />
            <View style={styles.terms}>
              <TouchableOpacity
                onPress={() => setSuTerms((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: suTerms }}
                hitSlop={8}
              >
                <Ionicons name={suTerms ? 'checkbox' : 'square-outline'} size={22} color={suTerms ? t.blue : t.grey} />
              </TouchableOpacity>
              <Text style={styles.termsText} onPress={() => setSuTerms((v) => !v)}>
                J'accepte les{' '}
                <Text style={styles.termsLink} onPress={() => void Linking.openURL(CGU_URL)}>conditions d'utilisation</Text>
                {' '}et j'ai lu la{' '}
                <Text style={styles.termsLink} onPress={() => void Linking.openURL(PRIVACY_URL)}>politique de confidentialité</Text>.
              </Text>
            </View>
            <SubmitButton label="Créer mon compte" t={t} busy={busy} disabled={false} onPress={() => void signup()} />
            <FormErrorView error={error} t={t} />
            <TouchableOpacity style={styles.center} onPress={() => go('login')} accessibilityRole="button">
              <Text style={styles.link}>‹ J'ai déjà un compte</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.formCard}>
            <Text style={[styles.title, styles.centerText]}>{emailSent ? 'Vérifiez vos emails' : 'Compte créé'}</Text>
            <Text style={[styles.sub, styles.centerText]}>
              {emailSent
                ? "Un email de confirmation vient de vous être envoyé. Cliquez sur le lien qu'il contient pour activer votre compte, puis revenez vous connecter ici."
                : "Votre compte est créé, mais l'email de confirmation n'a pas pu être envoyé : l'envoi d'emails n'est pas encore activé pour ce salon. Dès que ce sera fait, revenez ici, connectez-vous et demandez un nouveau lien de confirmation."}
            </Text>
            <SubmitButton label="Retour à la connexion" t={t} busy={false} disabled={false} onPress={() => go('login')} />
          </View>
        )}
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
    notice: { color: t.ink, fontSize: 14.5, fontWeight: '500', lineHeight: 20 },
    links: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
    link: { color: t.blue, fontSize: 14.5, fontWeight: '600' },
    center: { alignItems: 'center', marginTop: spacing.xs },
    centerText: { textAlign: 'center' },
    terms: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 4 },
    termsText: { flex: 1, color: t.grey, fontSize: 13.5, lineHeight: 19.5 },
    termsLink: { color: t.blue },
  });
