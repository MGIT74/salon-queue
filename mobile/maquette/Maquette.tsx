// MAQUETTE THE BARBER ONE — à ouvrir dans Expo Go. Données fictives, AUCUN appel serveur.
// Parcours : choix du salon (SaaS : une seule app pour toutes les enseignes) → espace client
// (Accueil / Réserver / Compte / Déconnexion, comme compte.html) ; aperçu « Mon poste » coiffeur.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { themeFor } from '../src/theme/theme';
import { AccountTab, BookTab, ClientLogin, HomeTab, Prefill } from './ClientScreens';
import { AdminApp, AdminLogin } from './Admin';
import { CaisseApp } from './Caisse';
import { PinScreen, PosteApp } from './Poste';
import { SALONS, Salon } from './data';
import { Card, Eyebrow, PageHeader, TabBar, ThemeButton, ThemeCtx, useT } from './ui';

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

type Screen =
  | { name: 'salons' }
  | { name: 'clientLogin'; salon: Salon }
  | { name: 'client'; salon: Salon }
  | { name: 'guest'; salon: Salon }
  | { name: 'pro' }
  | { name: 'adminLogin' }
  | { name: 'admin' }
  | { name: 'postePin' }
  | { name: 'poste'; staffId: string }
  | { name: 'caissePin' }
  | { name: 'caisse'; staffId: string };

function Root() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>({ name: 'salons' });
  const home = () => setScreen({ name: 'salons' });
  const salon = SALONS[0];
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      {screen.name === 'salons' && <SalonPicker onPick={(s) => setScreen({ name: 'clientLogin', salon: s })} onPoste={() => setScreen({ name: 'pro' })} />}
      {screen.name === 'clientLogin' && <ClientLogin salon={screen.salon} onBack={home} onGuest={() => setScreen({ name: 'guest', salon: screen.salon })} onLogged={() => setScreen({ name: 'client', salon: screen.salon })} />}
      {screen.name === 'guest' && (
        <View style={{ flex: 1 }}>
          <PageHeader salon={`${screen.salon.name} ${screen.salon.city}`} title="Prendre rendez-vous" />
          <BookTab salon={screen.salon} guest onFinished={home} onExitGuest={() => setScreen({ name: 'clientLogin', salon: screen.salon })} />
        </View>
      )}
      {screen.name === 'client' && <ClientApp salon={screen.salon} onExit={home} />}
      {screen.name === 'pro' && <ProHub onBack={home} go={(n) => setScreen({ name: n } as Screen)} />}
      {screen.name === 'adminLogin' && <AdminLogin onBack={() => setScreen({ name: 'pro' })} onLogged={() => setScreen({ name: 'admin' })} />}
      {screen.name === 'admin' && <AdminApp onExit={() => setScreen({ name: 'pro' })} />}
      {screen.name === 'postePin' && <PinScreen salon={salon} title="Mon poste" onBack={() => setScreen({ name: 'pro' })} onOk={(id) => setScreen({ name: 'poste', staffId: id })} />}
      {screen.name === 'poste' && <PosteApp salon={salon} staffId={screen.staffId} onExit={() => setScreen({ name: 'pro' })} />}
      {screen.name === 'caissePin' && <PinScreen salon={salon} title="Caisse" onBack={() => setScreen({ name: 'pro' })} onOk={(id) => setScreen({ name: 'caisse', staffId: id })} />}
      {screen.name === 'caisse' && <CaisseApp salon={salon} staffId={screen.staffId} onExit={() => setScreen({ name: 'pro' })} />}
    </View>
  );
}

/* ------------------------------------------ Espace professionnel (3 portes du web) */

function ProHub({ onBack, go }: { onBack: () => void; go: (n: 'adminLogin' | 'postePin' | 'caissePin') => void }) {
  const { t } = useT();
  const doors: { n: 'adminLogin' | 'postePin' | 'caissePin'; icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string }[] = [
    { n: 'adminLogin', icon: 'grid-outline', title: 'Dashboard', sub: 'Gestion du salon · email et mot de passe' },
    { n: 'postePin', icon: 'cut-outline', title: 'Mon poste', sub: 'Coiffeur · code PIN' },
    { n: 'caissePin', icon: 'card-outline', title: 'Caisse', sub: 'Tablette du salon · code PIN' },
  ];
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30 }}>
      <View style={[st.rowB, { justifyContent: 'space-between' }]}>
        <Pressable onPress={onBack} hitSlop={10} style={st.rowB}><Ionicons name="chevron-back" size={18} color={t.blue} /><Text style={{ color: t.blue, fontSize: 15 }}>Salons</Text></Pressable>
        <ThemeButton />
      </View>
      <Text style={{ color: t.ink, fontSize: 28, fontWeight: '800', marginTop: 12 }}>Espace professionnel</Text>
      <Text style={{ color: t.grey, fontSize: 15, marginTop: 4, marginBottom: 20 }}>La session ouvre directement le bon écran, comme les adresses du web.</Text>
      {doors.map((d) => (
        <Card key={d.n} onPress={() => go(d.n)} style={{ marginBottom: 12 }}>
          <View style={st.rowB}>
            <View style={[st.salonIcon, { backgroundColor: t.blueSoft }]}><Ionicons name={d.icon} size={22} color={t.blue} /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 17, fontWeight: '700' }}>{d.title}</Text>
              <Text style={{ color: t.grey, fontSize: 13.5 }}>{d.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.grey} />
          </View>
        </Card>
      ))}
    </ScrollView>
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
        <Text style={{ color: t.blue, fontWeight: '600', fontSize: 15 }}>Espace professionnel</Text>
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
  const [prefill, setPrefill] = useState<Prefill>(null);
  const [bookKey, setBookKey] = useState(0);
  const book = (p?: Prefill) => { setPrefill(p ?? null); setBookKey((k) => k + 1); setTab('book'); };
  const title = tab === 'book' ? 'Prendre rendez-vous' : tab === 'account' ? 'Mon profil' : 'Mon compte';
  return (
    <View style={{ flex: 1 }}>
      <PageHeader salon={`${salon.name} ${salon.city}`} title={title} />
      <View style={{ flex: 1 }}>
        {tab === 'home' && <HomeTab onBook={book} onRebook={book} />}
        {tab === 'book' && <BookTab key={bookKey} salon={salon} prefill={prefill} onFinished={() => { setPrefill(null); setTab('home'); }} />}
        {tab === 'account' && <AccountTab salon={salon} onChangeSalon={onExit} />}
      </View>
      <TabBar<ClientTab>
        bottomInset={insets.bottom}
        active={tab}
        onChange={(k) => (k === 'logout' ? onExit() : k === 'book' ? book() : setTab(k))}
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

const st = StyleSheet.create({
  rowB: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
