// Espace client : garde d'accès en deux temps — sans session, l'écran de
// connexion réel (POST /api/client-auth/login) ; avec session, les onglets
// File / Rendez-vous / Compte. La sécurité reste 100 % côté serveur.
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { tabBarScreenOptions } from './screenOptions';
import { ClientTabsParamList } from './types';
import { ClientLoginScreen } from '../screens/client/ClientLoginScreen';
import { CompteScreen } from '../screens/client/CompteScreen';
import { FileScreen } from '../screens/client/FileScreen';
import { RdvScreen } from '../screens/client/RdvScreen';

const ClientTabs = createBottomTabNavigator<ClientTabsParamList>();

export function ClientNavigator() {
  const t = useTheme();
  const { client } = useAuth();

  if (!client) return <ClientLoginScreen />;

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
