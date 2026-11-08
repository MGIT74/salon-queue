// Espace Caisse : tickets et journées de caisse (périodes/pont/rotation).
// Volontairement SANS paiement Nepting : /api/tpe n'est pas branché
// (voir docs/API_AUDIT.md — section 2.5) et cette interdiction se verra
// directement dans les écrans tant que la décision n'est pas prise à part.
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/theme';
import { EncaissementScreen } from '../screens/caisse/EncaissementScreen';
import { JourneesScreen } from '../screens/caisse/JourneesScreen';
import { stackScreenOptions } from './screenOptions';
import { CaisseStackParamList } from './types';

const CaisseStack = createNativeStackNavigator<CaisseStackParamList>();

function NeptingVerrou() {
  return (
    <View style={styles.badge}>
      <Ionicons name="card-outline" size={13} color={colors.textMuted} />
      <Text style={styles.badgeText}>Nepting débranché</Text>
    </View>
  );
}

export function CaisseNavigator() {
  return (
    <CaisseStack.Navigator screenOptions={stackScreenOptions}>
      <CaisseStack.Screen
        name="CaisseEncaissement"
        component={EncaissementScreen}
        options={{ title: 'Encaissement', headerRight: NeptingVerrou }}
      />
      <CaisseStack.Screen
        name="CaisseJournees"
        component={JourneesScreen}
        options={{ title: 'Journées de caisse', headerRight: NeptingVerrou }}
      />
    </CaisseStack.Navigator>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.surface,
  },
  badgeText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
});
