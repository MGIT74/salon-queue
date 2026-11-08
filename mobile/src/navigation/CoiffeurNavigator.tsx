// Espace Coiffeur ("Mon poste" mobile) : session par code PIN
// (en-têtes X-Barber-Id / X-Barber-Pin). La liste d'écrans grandira en
// étapes suivantes (détail d'une coupe, historique client…).
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Palette, radius } from '../theme/theme';
import { MaJourneeScreen } from '../screens/coiffeur/MaJourneeScreen';
import { stackScreenOptions } from './screenOptions';
import { CoiffeurStackParamList } from './types';

const CoiffeurStack = createNativeStackNavigator<CoiffeurStackParamList>();

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
    badgeText: { color: t.accent, fontSize: 11, fontWeight: '600' },
  });

export function CoiffeurNavigator() {
  const t = useTheme();
  const styles = stylesFor(t);
  return (
    <CoiffeurStack.Navigator screenOptions={stackScreenOptions(t)}>
      <CoiffeurStack.Screen
        name="CoiffeurMaJournee"
        component={MaJourneeScreen}
        options={{
          title: 'Ma journée',
          headerRight: () => (
            <View style={styles.badge}>
              <Ionicons name="lock-closed-outline" size={13} color={t.accent} />
              <Text style={styles.badgeText}>PIN coiffeur</Text>
            </View>
          ),
        }}
      />
    </CoiffeurStack.Navigator>
  );
}
