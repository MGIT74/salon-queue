// Espace Administration (propriétaire de l'enseigne) : tableau de bord,
// catalogue, coiffeurs et réglages. Préparé pour l'authentification par
// X-Admin-Password côté transport (src/api/transport.ts).
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { tabBarScreenOptions } from './screenOptions';
import { AdminTabsParamList } from './types';
import { CatalogueScreen } from '../screens/admin/CatalogueScreen';
import { CoiffeursScreen } from '../screens/admin/CoiffeursScreen';
import { DashboardScreen } from '../screens/admin/DashboardScreen';
import { ReglagesScreen } from '../screens/admin/ReglagesScreen';

const AdminTabs = createBottomTabNavigator<AdminTabsParamList>();

export function AdminNavigator() {
  return (
    <AdminTabs.Navigator screenOptions={tabBarScreenOptions}>
      <AdminTabs.Screen
        name="AdminDashboard"
        component={DashboardScreen}
        options={{
          title: 'Tableau de bord',
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse-outline" size={size} color={color} />,
        }}
      />
      <AdminTabs.Screen
        name="AdminCatalogue"
        component={CatalogueScreen}
        options={{
          title: 'Catalogue',
          tabBarLabel: 'Catalogue',
          tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" size={size} color={color} />,
        }}
      />
      <AdminTabs.Screen
        name="AdminCoiffeurs"
        component={CoiffeursScreen}
        options={{
          title: 'Coiffeurs',
          tabBarLabel: 'Coiffeurs',
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
        }}
      />
      <AdminTabs.Screen
        name="AdminReglages"
        component={ReglagesScreen}
        options={{
          title: 'Réglages',
          tabBarLabel: 'Réglages',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </AdminTabs.Navigator>
  );
}
