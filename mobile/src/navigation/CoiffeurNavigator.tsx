// Espace Coiffeur ("Mon poste" mobile) : session par code PIN
// (en-têtes X-Barber-Id / X-Barber-Pin), un navigateur propre à chaque
// coiffeur connecté. La liste d'écrans grandira en étapes suivantes
// (détail d'une coupe, historique client…).
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/theme';
import { MaJourneeScreen } from '../screens/coiffeur/MaJourneeScreen';
import { stackScreenOptions } from './screenOptions';
import { CoiffeurStackParamList } from './types';

const CoiffeurStack = createNativeStackNavigator<CoiffeurStackParamList>();

export function CoiffeurNavigator() {
  return (
    <CoiffeurStack.Navigator screenOptions={stackScreenOptions}>
      <CoiffeurStack.Screen
        name="CoiffeurMaJournee"
        component={MaJourneeScreen}
        options={{
          title: 'Ma journée',
          headerRight: () => (
            <View style={styles.badge}>
              <Ionicons name="lock-closed-outline" size={13} color={colors.accent} />
              <Text style={styles.badgeText}>PIN coiffeur</Text>
            </View>
          ),
        }}
      />
    </CoiffeurStack.Navigator>
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
  badgeText: { color: colors.accent, fontSize: 11, fontWeight: '600' },
});
