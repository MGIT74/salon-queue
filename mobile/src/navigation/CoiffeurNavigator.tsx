// Espace Coiffeur ("Mon poste" mobile) : garde par session coiffeur.
// Sans session : connexion par code PIN (POST /api/barbers/login, réel).
// Avec session : la pile « Ma journée » (+ écrans Phase 4 ensuite).
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { MaJourneeScreen } from '../screens/coiffeur/MaJourneeScreen';
import { PinLoginScreen } from '../screens/coiffeur/PinLoginScreen';
import { stackScreenOptions } from './screenOptions';
import { CoiffeurStackParamList } from './types';

const CoiffeurStack = createNativeStackNavigator<CoiffeurStackParamList>();

export function CoiffeurNavigator() {
  const t = useTheme();
  const { barber } = useAuth();

  if (!barber) return <PinLoginScreen />;

  return (
    <CoiffeurStack.Navigator screenOptions={stackScreenOptions(t)}>
      <CoiffeurStack.Screen name="CoiffeurMaJournee" component={MaJourneeScreen} />
    </CoiffeurStack.Navigator>
  );
}
