// Espace Administration : garde par session propriétaire (X-Admin-Pass-
// word revalidé par le serveur à chaque appel). Sans session : connexion
// réelle ; avec session : onglets Dashboard / Catalogue / Coiffeurs /
// Réglages (leurs données réelles arrivent en Phase 5).
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { tabBarScreenOptions } from './screenOptions';
import { AdminTabsParamList } from './types';
import { AdminLoginScreen } from '../screens/admin/AdminLoginScreen';
import { CatalogueScreen } from '../screens/admin/CatalogueScreen';
import { CoiffeursScreen } from '../screens/admin/CoiffeursScreen';
import { DashboardScreen } from '../screens/admin/DashboardScreen';
import { ReglagesScreen } from '../screens/admin/ReglagesScreen';

const AdminTabs = createBottomTabNavigator<AdminTabsParamList>();

export function AdminNavigator() {
  const t = useTheme();
  const { admin } = useAuth();

  if (!admin) return <AdminLoginScreen />;

  return (
    <AdminTabs.Navigator screenOptions={tabBarScreenOptions(t)}>
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
