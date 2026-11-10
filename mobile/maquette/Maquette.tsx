// MAQUETTE THE BARBER ONE — à ouvrir dans Expo Go. Données fictives, AUCUN appel serveur.
// Parcours : choix du salon (SaaS : une seule app pour toutes les enseignes) → espace client
// (Accueil / Réserver / Compte / Déconnexion, comme compte.html) ; aperçu « Mon poste » coiffeur.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { themeFor } from '../src/theme/theme';
import { AccountTab, BookTab, HomeTab } from './ClientScreens';
import { QUEUE, SALONS, Salon } from './data';
import { Avatar, Card, Eyebrow, PageHeader, TabBar, ThemeButton, ThemeCtx, useT } from './ui';

export default function Maquette() {
  const system = useColorScheme();
  const [forced, setForced] = useState<'light' | 'dark' | null>(null);
  const t = themeFor(forced ?? system);
  const ctx = useMemo(() => ({ t, toggle: () => setForced(t.scheme === 'dark' ? 'light' : 'dark') }), [t]);
  return (
    <SafeAreaProvider>
      <ThemeCtx.Provider value={ctx}>
        <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
        <Root />
      </ThemeCtx.Provider>
    </SafeAreaProvider>
  );
}

type Screen = { name: 'salons' } | { name: 'client'; salon: Salon } | { name: 'poste'; salon: Salon };

function Root() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>({ name: 'salons' });
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      {screen.name === 'salons' && (
        <SalonPicker onPick={(salon) => setScreen({ name: 'client', salon })} onPoste={() => setScreen({ name: 'poste', salon: SALONS[0] })} />
      )}
      {screen.name === 'client' && <ClientApp salon={screen.salon} onExit={() => setScreen({ name: 'salons' })} />}
      {screen.name === 'poste' && <PosteDemo salon={screen.salon} onExit={() => setScreen({ name: 'salons' })} />}
    </View>
  );
}

/* --------------------------------------------- Choix du salon (nouveau, SaaS) */

function SalonPicker({ onPick, onPoste }: { onPick: (s: Salon) => void; onPoste: () => void }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const list = SALONS.filter((s) => (s.name + ' ' + s.city).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'flex-end' }}><ThemeButton /></View>
      <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 26 }}>
        <View style={[st.brand, { backgroundColor: t.ink }]}>
          <Ionicons name="cut" size={34} color={t.bg} />
        </View>
        <Text style={[st.brandName, { color: t.ink }]}>The Barber One</Text>
        <Text style={{ color: t.grey, fontSize: 15, marginTop: 4, textAlign: 'center' }}>Réservez chez votre coiffeur en quelques secondes</Text>
      </View>

      <View style={[st.search, { backgroundColor: t.card, borderColor: t.sep }]}>
        <Ionicons name="search" size={18} color={t.grey} />
        <TextInput value={q} onChangeText={setQ} placeholder="Nom du salon ou ville" placeholderTextColor={t.grey}
          style={{ flex: 1, color: t.ink, fontSize: 16, paddingVertical: 12 }} />
      </View>

      <Eyebrow>Salons</Eyebrow>
      {list.map((s) => (
        <Card key={s.slug} onPress={() => onPick(s)} style={{ marginBottom: 10 }}>
          <View style={st.row}>
            <View style={[st.salonIcon, { backgroundColor: t.blueSoft }]}><Ionicons name="storefront-outline" size={22} color={t.blue} /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 16, fontWeight: '600' }}>{s.name}</Text>
              <Text style={{ color: t.grey, fontSize: 13.5, marginTop: 2 }}>{s.city}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.grey} />
          </View>
        </Card>
      ))}
      {list.length === 0 ? <Text style={{ color: t.grey, textAlign: 'center', marginTop: 10 }}>Aucun salon trouvé</Text> : null}

      <View style={[st.hint, { backgroundColor: t.fill }]}>
        <Ionicons name="qr-code-outline" size={20} color={t.ink} />
        <Text style={{ color: t.ink, fontSize: 13.5, flex: 1, lineHeight: 19 }}>
          Au salon, scannez le QR code ou ouvrez le lien reçu par SMS : l'app s'ouvre directement sur votre salon.
        </Text>
      </View>

      <Pressable onPress={onPoste} style={{ alignItems: 'center', marginTop: 26 }} hitSlop={8}>
        <Text style={{ color: t.blue, fontWeight: '600', fontSize: 15 }}>Espace professionnel · aperçu « Mon poste »</Text>
      </Pressable>
      <Text style={{ color: t.grey, fontSize: 12, textAlign: 'center', marginTop: 18 }}>Maquette — données fictives, aucune connexion au serveur</Text>
    </ScrollView>
  );
}

/* ------------------------------------------------ Espace client (compte.html) */

type ClientTab = 'home' | 'book' | 'account' | 'logout';

function ClientApp({ salon, onExit }: { salon: Salon; onExit: () => void }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<ClientTab>('home');
  const title = tab === 'book' ? 'Prendre rendez-vous' : tab === 'account' ? 'Mon profil' : 'Mon compte';
  return (
    <View style={{ flex: 1 }}>
      <PageHeader salon={`${salon.name} ${salon.city}`} title={title} />
      <View style={{ flex: 1 }}>
        {tab === 'home' && <HomeTab onBook={() => setTab('book')} />}
        {tab === 'book' && <BookTab salon={salon} onFinished={() => setTab('home')} />}
        {tab === 'account' && <AccountTab salon={salon} onChangeSalon={onExit} />}
      </View>
      <TabBar<ClientTab>
        bottomInset={insets.bottom}
        active={tab}
        onChange={(k) => (k === 'logout' ? onExit() : setTab(k))}
        tabs={[
          { key: 'home', label: 'Accueil', icon: 'home-outline' },
          { key: 'book', label: 'Réserver', icon: 'calendar-outline' },
          { key: 'account', label: 'Compte', icon: 'person-outline' },
          { key: 'logout', label: 'Déconnexion', icon: 'log-out-outline' },
        ]}
      />
    </View>
  );
}

/* ---------------------------------------------- Mon poste (poste.html), aperçu */

type PosteTab = 'timer' | 'agenda' | 'logout';

function PosteDemo({ salon, onExit }: { salon: Salon; onExit: () => void }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<PosteTab>('timer');
  // Chrono local : il avance sur le téléphone sans interroger le serveur chaque seconde.
  const startRef = useRef(Date.now() - QUEUE.current.startedMinutesAgo * 60000);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const elapsed = Math.floor((now - startRef.current) / 1000);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const pct = Math.min(1, elapsed / (QUEUE.current.minutes * 60));

  return (
    <View style={{ flex: 1 }}>
      <View style={[st.row, { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 14 }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.grey, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.6 }}>{salon.name.toUpperCase()} {salon.city.toUpperCase()}</Text>
          <View style={[st.row, { gap: 8 }]}>
            <Text style={{ color: t.ink, fontSize: 26, fontWeight: '700' }}>Marco</Text>
            <View style={[st.pill, { backgroundColor: t.blueSoft }]}>
              <Ionicons name="calendar-outline" size={12} color={t.blue} />
              <Text style={{ color: t.blue, fontSize: 12, fontWeight: '700' }}>RDV</Text>
            </View>
          </View>
        </View>
        <ThemeButton />
      </View>

      {tab === 'timer' ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }}>
          <Card>
            <Text style={{ color: t.grey, fontSize: 13, fontWeight: '600' }}>EN COURS</Text>
            <View style={[st.row, { marginTop: 8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 19, fontWeight: '700' }}>{QUEUE.current.client}</Text>
                <Text style={{ color: t.grey, fontSize: 14, marginTop: 2 }}>{QUEUE.current.service} · {QUEUE.current.minutes} min</Text>
              </View>
              <Text style={{ color: pct >= 1 ? t.orange : t.ink, fontSize: 30, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{mm}:{ss}</Text>
            </View>
            <View style={[st.progress, { backgroundColor: t.fill }]}>
              <View style={{ width: `${pct * 100}%`, height: '100%', borderRadius: 99, backgroundColor: pct >= 1 ? t.orange : t.blue }} />
            </View>
            <Pressable style={({ pressed }) => [st.finish, { backgroundColor: t.green, opacity: pressed ? 0.85 : 1 }]}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Terminer</Text>
            </Pressable>
          </Card>

          <Text style={{ color: t.grey, fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginTop: 20, marginBottom: 8, marginLeft: 2 }}>À SUIVRE</Text>
          <Card style={{ paddingVertical: 4 }}>
            {QUEUE.next.map((c, i) => (
              <View key={c.client} style={[st.row, { paddingVertical: 12, borderBottomWidth: i < QUEUE.next.length - 1 ? StyleSheet.hairlineWidth : 0, borderColor: t.sep }]}>
                <Avatar initials={c.client[0]} color={i === 0 ? t.blue : t.fill2} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15.5, fontWeight: '600' }}>{c.client}</Text>
                  <Text style={{ color: t.grey, fontSize: 13 }}>{c.service}</Text>
                </View>
                <View style={[st.pill, { backgroundColor: c.kind === 'RDV' ? t.blueSoft : t.fill }]}>
                  <Text style={{ color: c.kind === 'RDV' ? t.blue : t.ink, fontSize: 12.5, fontWeight: '700' }}>{c.time}</Text>
                </View>
              </View>
            ))}
          </Card>
          <Text style={{ color: t.grey, fontSize: 12.5, textAlign: 'center', marginTop: 16, lineHeight: 18 }}>
            Dans l'app finale, la file se met à jour quand le serveur signale un changement : pas d'interrogation toutes les 4 secondes.
          </Text>
        </ScrollView>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
          <Ionicons name="calendar-outline" size={40} color={t.grey} />
          <Text style={{ color: t.grey, marginTop: 10, textAlign: 'center' }}>Agenda : même vue que « Mon poste » sur le web (à venir dans la maquette).</Text>
        </View>
      )}

      <TabBar<PosteTab>
        bottomInset={insets.bottom}
        active={tab}
        onChange={(k) => (k === 'logout' ? onExit() : setTab(k))}
        tabs={[
          { key: 'timer', label: 'Timer', icon: 'time-outline' },
          { key: 'agenda', label: 'Agenda', icon: 'calendar-outline' },
          { key: 'logout', label: 'Déconnexion', icon: 'log-out-outline' },
        ]}
      />
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brand: { width: 76, height: 76, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  brandName: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14 },
  salonIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hint: { flexDirection: 'row', gap: 12, alignItems: 'center', borderRadius: 14, padding: 14, marginTop: 14 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 },
  progress: { height: 6, borderRadius: 99, marginTop: 14, overflow: 'hidden' },
  finish: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 14, marginTop: 16 },
});
