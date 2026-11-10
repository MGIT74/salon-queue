// MAQUETTE — dégradé des cartes (fidélité, cadeau) sans dépendance native supplémentaire :
// couleur de départ + grand disque de la couleur d'arrivée en biais (rendu proche de linear-gradient 135deg).
import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

export function LinearGradientFallback({ colors, style, children }: { colors: [string, string]; style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  return (
    <View style={[{ backgroundColor: colors[0], overflow: 'hidden' }, style]}>
      <View style={{ position: 'absolute', right: '-35%', bottom: '-120%', width: '120%', height: '260%', borderRadius: 9999, backgroundColor: colors[1], opacity: 0.85, transform: [{ rotate: '-20deg' }] }} />
      {children}
    </View>
  );
}
