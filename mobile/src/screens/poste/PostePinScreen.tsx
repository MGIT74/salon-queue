// Mon poste — reproduction du login PIN web (poste.html) : pastilles +
// pavé numérique, envoi à 4+ chiffres (PIN coiffeur 4-8).
import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { FormErrorView, LabeledField } from '../../components/AuthForm';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../hooks/useTheme';
import { Palette, radius, spacing } from '../../theme/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export function PostePinScreen({ onBack }: { onBack: () => void }) {
  const { salonRef, loginBarber } = useAuth();
  const [salonSlug, setSalonSlug] = useState(salonRef?.slug ?? '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const t = useTheme();
  const styles = stylesFor(t);

  const press = async (k: string) => {
    if (busy) return;
    setError(null);
    if (k === 'del') return setPin((p) => p.slice(0, -1));
    if (!k) return;
    const next = (pin + k).slice(0, 8);
    setPin(next);
  };

  const submit = async (candidate?: string) => {
    const value = candidate ?? pin;
    if (value.length < 4 || busy) return;
    setBusy(true);
    try {
      await loginBarber(salonSlug, value);
    } catch (err) {
      setError(err);
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.back} onPress={onBack} accessibilityRole="button">
          <Ionicons name="chevron-back" size={20} color={t.blue} />
          <Text style={styles.backLabel}>Retour</Text>
        </TouchableOpacity>

        <View style={styles.mark}>
          <Ionicons name="cut-outline" size={24} color={t.blue} />
        </View>
        <Text style={styles.title}>Mon poste</Text>

        <LabeledField
          label="Salon (identifiant, ex. le-salon)"
          t={t}
          value={salonSlug}
          onChangeText={setSalonSlug}
          placeholder="Laisser vide si un seul salon"
        />

        <View style={styles.dots}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <View key={i} style={[styles.dot, i < pin.length && styles.dotOn]} />
          ))}
        </View>

        <View style={styles.keypad}>
          {KEYS.map((k, i) =>
            k === '' ? (
              <View key={i} style={styles.keyEmpty} />
            ) : (
              <TouchableOpacity
                key={i}
                style={[styles.key, k === 'del' && styles.keyDel]}
                onPress={() => void press(k)}
                accessibilityRole="button"
              >
                <Text style={styles.keyLabel}>{k === 'del' ? '⌫' : k}</Text>
              </TouchableOpacity>
            )
          )}
        </View>

        <FormErrorView error={error} t={t} />
        <TouchableOpacity
          style={[styles.enter, pin.length < 4 && { opacity: 0.4 }]}
          disabled={pin.length < 4}
          onPress={() => void submit()}
          accessibilityRole="button"
        >
          <Text style={styles.enterLabel}>Entrer</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>5 PIN incorrects consécutifs bloquent l'essai 1 heure (règle serveur).</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.bg },
    content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md, alignItems: 'center' },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: spacing.md },
    backLabel: { color: t.blue, fontSize: 15, fontWeight: '600' },
    mark: {
      width: 56, height: 56, borderRadius: 14, backgroundColor: t.blueSoft,
      alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg,
    },
    title: { color: t.ink, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
    dots: { flexDirection: 'row', gap: 10, marginTop: spacing.xs },
    dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: t.sep, backgroundColor: t.card },
    dotOn: { backgroundColor: t.blue, borderColor: t.blue },
    keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: spacing.md },
    key: {
      width: 88, height: 60, borderRadius: radius.button, backgroundColor: t.card,
      borderColor: t.sep, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center',
    },
    keyEmpty: { width: 88, height: 60 },
    keyDel: { backgroundColor: t.fill },
    keyLabel: { color: t.ink, fontSize: 22, fontWeight: '600' },
    enter: { backgroundColor: t.blue, borderRadius: radius.button, paddingVertical: 15, alignItems: 'center', alignSelf: 'stretch', marginTop: spacing.sm },
    enterLabel: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
    hint: { color: t.grey, fontSize: 12.5, fontStyle: 'italic', textAlign: 'center',marginTop: spacing.sm },
  });
