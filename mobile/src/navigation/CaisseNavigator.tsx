// Espace Caisse : tickets et journées de caisse (périodes/pont/rotation).
// Volontairement SANS paiement Nepting : /api/tpe n'est pas branché
// (voir docs/API_AUDIT.md — section 2.5) et cette interdiction se voit
// directement dans les écrans tant que la décision n'est pas prise à part.
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Palette, radius } from '../theme/theme';
import { EncaissementScreen } from '../screens/caisse/EncaissementScreen';
import { JourneesScreen } from '../screens/caisse/JourneesScreen';
import { stackScreenOptions } from './screenOptions';
import { CaisseStackParamList } from './types';

const CaisseStack = createNativeStackNavigator<CaisseStackParamList>();

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      borderColor: t.surfaceBorder,
      borderRadius: radius.button,
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: t.surface,
    },
    badgeText: { color: t.textMuted, fontSize: 11, fontWeight: '600' },
  });

export function CaisseNavigator() {
  const t = useTheme();
  const styles = stylesFor(t);
  return (
    <CaisseStack.Navigator screenOptions={stackScreenOptions(t)}>
      <CaisseStack.Screen
        name="CaisseEncaissement"
        component={EncaissementScreen}
        options={{
          title: 'Encaissement',
          headerRight: () => (
            <View style={styles.badge}>
              <Ionicons name="card-outline" size={13} color={t.textMuted} />
              <Text style={styles.badgeText}>Nepting débranché</Text>
            </View>
          ),
        }}
      />
      <CaisseStack.Screen
        name="CaisseJournees"
        component={JourneesScreen}
        options={{
          title: 'Journées de caisse',
          headerRight: () => (
            <View style={styles.badge}>
              <Ionicons name="card-outline" size={13} color={t.textMuted} />
              <Text style={styles.badgeText}>Nepting débranché</Text>
            </View>
          ),
        }}
      />
    </CaisseStack.Navigator>
  );
}
