// Racine de la navigation : écran de chargement pendant la reprise des
// sessions persistées (expo-secure-store), puis Accueil et les 4 espaces.
// Les écrans d'espace passent par un navigateur scellé par univers ;
// l'en-tête racine fournit le retour natif vers l'Accueil.
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoadingView } from '../components/AuthForm';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { HomeScreen } from '../screens/HomeScreen';
import { AdminNavigator } from './AdminNavigator';
import { CaisseNavigator } from './CaisseNavigator';
import { ClientNavigator } from './ClientNavigator';
import { CoiffeurNavigator } from './CoiffeurNavigator';
import { rootStackScreenOptions } from './screenOptions';
import { RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const t = useTheme();
  const { ready } = useAuth();

  if (!ready) return <LoadingView t={t} label="Ouverture de l'application…" />;

  return (
    <RootStack.Navigator screenOptions={rootStackScreenOptions(t)}>
      <RootStack.Screen name="Accueil" component={HomeScreen} options={{ headerShown: false }} />
      <RootStack.Screen name="Client" component={ClientNavigator} options={{ title: 'Espace client' }} />
      <RootStack.Screen name="Coiffeur" component={CoiffeurNavigator} options={{ title: 'Espace coiffeur' }} />
      <RootStack.Screen name="Caisse" component={CaisseNavigator} options={{ title: 'Espace caisse' }} />
      <RootStack.Screen name="Admin" component={AdminNavigator} options={{ title: 'Administration' }} />
    </RootStack.Navigator>
  );
}
