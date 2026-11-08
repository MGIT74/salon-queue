import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

type Area = 'client' | 'coiffeur' | 'caisse' | 'admin';
const areas: { id: Area; label: string; description: string }[] = [
  { id: 'client', label: 'Client', description: 'Réservations et compte client' },
  { id: 'coiffeur', label: 'Coiffeur', description: 'Planning et prestations' },
  { id: 'caisse', label: 'Caisse', description: 'Encaissements et tickets' },
  { id: 'admin', label: 'Administration', description: 'Gestion du salon' },
];

export default function App() {
  const [area, setArea] = useState<Area | null>(null);
  const selected = areas.find((item) => item.id === area);
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>THE BARBER ONE</Text>
        <Text style={styles.title}>{selected ? selected.label : 'Bienvenue'}</Text>
        <Text style={styles.subtitle}>{selected ? selected.description : 'Choisissez un espace pour découvrir la future application.'}</Text>
        {selected ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Espace en préparation</Text>
            <Text style={styles.panelText}>Les écrans et l’authentification seront reliés aux API TBO après validation de leur fonctionnement et de leurs permissions.</Text>
            <TouchableOpacity style={styles.button} onPress={() => setArea(null)} accessibilityRole="button"><Text style={styles.buttonText}>Retour aux espaces</Text></TouchableOpacity>
          </View>
        ) : areas.map((item) => (
          <TouchableOpacity key={item.id} style={styles.panel} onPress={() => setArea(item.id)} accessibilityRole="button">
            <Text style={styles.panelTitle}>{item.label}</Text><Text style={styles.panelText}>{item.description}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#101010' },
  content: { paddingHorizontal: 24, paddingTop: 64, paddingBottom: 40, gap: 16 },
  brand: { color: '#c7a77a', fontWeight: '700', letterSpacing: 3, fontSize: 13 },
  title: { color: '#ffffff', fontSize: 34, fontWeight: '700', marginTop: 16 },
  subtitle: { color: '#b7b7b7', fontSize: 16, lineHeight: 24, marginBottom: 12 },
  panel: { backgroundColor: '#202020', borderColor: '#383838', borderWidth: 1, borderRadius: 16, padding: 22, gap: 10 },
  panelTitle: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  panelText: { color: '#bbbbbb', fontSize: 15, lineHeight: 22 },
  button: { marginTop: 14, backgroundColor: '#c7a77a', padding: 14, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#101010', fontWeight: '700' },
});
