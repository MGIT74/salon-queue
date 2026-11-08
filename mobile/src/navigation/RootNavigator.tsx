// Racine de la navigation : l'écran d'accueil (choix d'espace) puis un
// navigateur scellé par espace. headerShown ici : chaque espace gère
// son propre en-tête/barre d'onglets.
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/HomeScreen';
import { AdminNavigator } from './AdminNavigator';
import { CaisseNavigator } from './CaisseNavigator';
import { ClientNavigator } from './ClientNavigator';
import { CoiffeurNavigator } from './CoiffeurNavigator';
import { RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Accueil" component={HomeScreen} />
      <RootStack.Screen name="Client" component={ClientNavigator} />
      <RootStack.Screen name="Coiffeur" component={CoiffeurNavigator} />
      <RootStack.Screen name="Caisse" component={CaisseNavigator} />
      <RootStack.Screen name="Admin" component={AdminNavigator} />
    </RootStack.Navigator>
  );
}
