// Espace client : file d'attente (borne), rendez-vous en ligne, compte.
// Préparé pour les API publiques/client sans auth admin ou coiffeur.
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { tabBarScreenOptions } from './screenOptions';
import { ClientTabsParamList } from './types';
import { CompteScreen } from '../screens/client/CompteScreen';
import { FileScreen } from '../screens/client/FileScreen';
import { RdvScreen } from '../screens/client/RdvScreen';

const ClientTabs = createBottomTabNavigator<ClientTabsParamList>();

export function ClientNavigator() {
  const t = useTheme();
  return (
    <ClientTabs.Navigator screenOptions={tabBarScreenOptions(t)}>
      <ClientTabs.Screen
        name="ClientFile"
        component={FileScreen}
        options={{
          title: 'Ma file',
          tabBarLabel: 'File',
          tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} />,
        }}
      />
      <ClientTabs.Screen
        name="ClientRdv"
        component={RdvScreen}
        options={{
          title: 'Mes rendez-vous',
          tabBarLabel: 'Rendez-vous',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
        }}
      />
      <ClientTabs.Screen
        name="ClientCompte"
        component={CompteScreen}
        options={{
          title: 'Mon compte',
          tabBarLabel: 'Compte',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </ClientTabs.Navigator>
  );
}
