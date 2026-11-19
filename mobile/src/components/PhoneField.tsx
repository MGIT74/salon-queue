// Champ Téléphone avec sélecteur d'indicatif (drapeaux) — reprise du
// « phone-cc-picker » du web (compte.html, inscription) : bouton drapeau +
// indicatif, liste des pays, puis le numéro local.
import React, { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PHONE_COUNTRIES, PhoneCountry } from '../utils/phone';
import { Palette, radius, spacing } from '../theme/theme';

export function PhoneField({ label, t, country, onCountryChange, value, onChangeText }: {
  label: string;
  t: Palette;
  country: PhoneCountry;
  onCountryChange: (c: PhoneCountry) => void;
  value: string;
  onChangeText: (v: string) => void;
}) {
  const styles = stylesFor(t);
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TouchableOpacity style={styles.ccBtn} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Indicatif ${country[0]}`}>
          <Text style={styles.flag}>{country[1]}</Text>
          <Text style={styles.code}>{country[0]}</Text>
          <Ionicons name="chevron-down" size={12} color={t.grey} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder="6 12 34 56 78"
          placeholderTextColor={t.grey}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoCorrect={false}
        />
      </View>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Indicatif</Text>
            <Pressable onPress={() => setOpen(false)} accessibilityRole="button">
              <Text style={styles.close}>Fermer</Text>
            </Pressable>
          </View>
          <FlatList
            data={PHONE_COUNTRIES}
            keyExtractor={(p) => p[3]}
            renderItem={({ item }) => {
              const on = item[3] === country[3];
              return (
                <TouchableOpacity
                  style={[styles.opt, on && { backgroundColor: t.blueSoft }]}
                  onPress={() => {
                    onCountryChange(item);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.flag}>{item[1]}</Text>
                  <Text style={styles.optCode}>{item[0]}</Text>
                  <Text style={styles.optName}>{item[2]}</Text>
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    field: { gap: 6 },
    label: { color: t.grey, fontSize: 13, fontWeight: '600' },
    row: { flexDirection: 'row', gap: 8 },
    ccBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: t.card,
      borderColor: t.sep,
      borderWidth: 1,
      borderRadius: radius.button,
      paddingHorizontal: 12,
    },
    flag: { fontSize: 18 },
    code: { color: t.ink, fontSize: 15, fontWeight: '600' },
    input: {
      flex: 1,
      minWidth: 0,
      backgroundColor: t.card,
      borderColor: t.sep,
      borderWidth: 1,
      borderRadius: radius.button,
      color: t.ink,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
    },
    sheet: { flex: 1, backgroundColor: t.bg },
    sheetHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.lg,
      borderBottomColor: t.sep,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    sheetTitle: { color: t.ink, fontSize: 17, fontWeight: '700' },
    close: { color: t.blue, fontSize: 16, fontWeight: '600' },
    opt: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.lg, paddingVertical: 12 },
    optCode: { color: t.ink, fontSize: 15, fontWeight: '600', width: 52 },
    optName: { color: t.grey, fontSize: 15, flex: 1 },
  });
