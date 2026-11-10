// MAQUETTE — Dashboard (admin) : connexion email + mot de passe, en-tête avec sélecteur de salon,
// barre du bas mobile du web (File d'attente, Caisse, Rendez-vous, Clients, Plus) et les 13 sections du menu.
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Agenda } from './Agenda';
import { CATALOG, CLIENTS_LIST, QUEUE_ITEMS, SALONS, STAFF, Salon, TODAY_SALES, WEEK, eur } from './data';
import { Avatar, BackLink, Bubbles, Card, Go, Pill, Segmented, Sheet, SoftButton, TabBar, useT } from './ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Sec = 'dashboard' | 'file' | 'prestations' | 'supplements' | 'produits' | 'marketing' | 'caisse' | 'rdv' | 'coiffeurs' | 'clients' | 'salons' | 'compte' | 'reglages';

/** Les 13 sections, dans l'ordre exact du menu latéral du web. */
const SECTIONS: { key: Sec; label: string; icon: IconName }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid-outline' },
  { key: 'file', label: "File d'attente", icon: 'list-outline' },
  { key: 'prestations', label: 'Prestations', icon: 'cut-outline' },
  { key: 'supplements', label: 'Suppléments', icon: 'add-circle-outline' },
  { key: 'produits', label: 'Produits', icon: 'cube-outline' },
  { key: 'marketing', label: 'Marketing', icon: 'megaphone-outline' },
  { key: 'caisse', label: 'Caisse', icon: 'card-outline' },
  { key: 'rdv', label: 'Rendez-vous', icon: 'calendar-outline' },
  { key: 'coiffeurs', label: 'Coiffeurs', icon: 'person-outline' },
  { key: 'clients', label: 'Clients', icon: 'people-outline' },
  { key: 'salons', label: 'Mes salons', icon: 'storefront-outline' },
  { key: 'compte', label: 'Compte', icon: 'person-circle-outline' },
  { key: 'reglages', label: 'Réglages', icon: 'settings-outline' },
];

export function AdminLogin({ onLogged, onBack }: { onLogged: () => void; onBack: () => void }) {
  const { t } = useT();
  return (
    <ScrollView contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
      <BackLink onPress={onBack} />
      <Card style={{ padding: 22, borderRadius: 24 }}>
        <Text style={{ color: t.ink, fontSize: 26, fontWeight: '700', textAlign: 'center' }}>Connexion</Text>
        <Text style={{ color: t.grey, textAlign: 'center', marginTop: 4, marginBottom: 20 }}>Espace de gestion de votre enseigne</Text>
        <Text style={{ color: t.grey, marginBottom: 6 }}>Email</Text>
        <TextInput defaultValue="contact@thebarberone.fr" autoCapitalize="none" style={[st.input, { backgroundColor: t.fill, color: t.ink }]} />
        <Text style={{ color: t.grey, marginBottom: 6, marginTop: 12 }}>Mot de passe</Text>
        <TextInput defaultValue="••••••••" secureTextEntry style={[st.input, { backgroundColor: t.fill, color: t.ink }]} />
        <View style={{ height: 18 }} />
        <Go label="Entrer" onPress={onLogged} />
        <Pressable style={{ marginTop: 14, alignItems: 'center' }}><Text style={{ color: t.blue, fontWeight: '500' }}>Mot de passe oublié ?</Text></Pressable>
      </Card>
      <Text style={{ color: t.grey, textAlign: 'center', marginTop: 14, fontSize: 13 }}>Maquette : n'importe quel identifiant fonctionne.</Text>
    </ScrollView>
  );
}

export function AdminApp({ onExit }: { onExit: () => void }) {
  const { t, toggle } = useT();
  const insets = useSafeAreaInsets();
  const [sec, setSec] = useState<Sec>('dashboard');
  const [more, setMore] = useState(false);
  const [salon, setSalon] = useState<Salon>(SALONS[0]);
  const [pick, setPick] = useState(false);
  type Bar = 'file' | 'caisse' | 'rdv' | 'clients' | 'more';
  const barActive: Bar = (['file', 'caisse', 'rdv', 'clients'] as Sec[]).includes(sec) ? (sec as Bar) : 'more';

  return (
    <View style={{ flex: 1 }}>
      <View style={[st.top, { backgroundColor: t.card }]}>
        <Text style={{ color: t.ink, fontWeight: '700', fontSize: 16, flex: 1 }}>{salon.name} {salon.city}</Text>
        <Pressable onPress={() => setPick(true)} style={[st.switcher, { backgroundColor: t.fill }]}>
          <Text style={{ color: t.ink, fontWeight: '600' }}>{salon.city}</Text><Ionicons name="chevron-down" size={16} color={t.ink} />
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        {sec === 'dashboard' && <DashboardSec />}
        {sec === 'file' && <FileSec />}
        {sec === 'rdv' && <RdvSec />}
        {sec === 'clients' && <ClientsSec />}
        {sec === 'caisse' && <CaisseSec />}
        {sec === 'coiffeurs' && <CoiffeursSec />}
        {(sec === 'prestations' || sec === 'supplements' || sec === 'produits') && <CatalogSec kind={sec === 'prestations' ? 'svc' : sec === 'supplements' ? 'extra' : 'product'} />}
        {(sec === 'marketing' || sec === 'salons' || sec === 'compte' || sec === 'reglages') && <SettingsLike sec={sec} />}
      </View>

      <TabBar<Bar> bottomInset={insets.bottom} active={barActive} onChange={(k) => (k === 'more' ? setMore(true) : setSec(k))}
        tabs={[
          { key: 'file', label: "File d'attente", icon: 'list-outline' },
          { key: 'caisse', label: 'Caisse', icon: 'card-outline' },
          { key: 'rdv', label: 'Rendez-vous', icon: 'calendar-outline' },
          { key: 'clients', label: 'Clients', icon: 'people-outline' },
          { key: 'more', label: 'Plus', icon: 'ellipsis-horizontal' },
        ]} />

      <Sheet visible={more} onClose={() => setMore(false)}>
        <View style={st.moreGrid}>
          {SECTIONS.map((s) => {
            const on = s.key === sec;
            return (
              <Pressable key={s.key} onPress={() => { setSec(s.key); setMore(false); }} style={st.moreItem}>
                <View style={[st.moreIcon, { backgroundColor: on ? t.blue : t.fill }]}><Ionicons name={s.icon} size={22} color={on ? '#fff' : t.ink} /></View>
                <Text style={{ color: on ? t.blue : t.ink, fontSize: 12, textAlign: 'center' }} numberOfLines={1}>{s.label}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={toggle} style={st.moreItem}>
            <View style={[st.moreIcon, { backgroundColor: t.fill }]}><Ionicons name={t.scheme === 'dark' ? 'moon-outline' : 'sunny-outline'} size={22} color={t.ink} /></View>
            <Text style={{ color: t.ink, fontSize: 12 }}>Thème</Text>
          </Pressable>
          <Pressable onPress={() => { setMore(false); onExit(); }} style={st.moreItem}>
            <View style={[st.moreIcon, { backgroundColor: t.fill }]}><Ionicons name="log-out-outline" size={22} color={t.red} /></View>
            <Text style={{ color: t.red, fontSize: 12 }}>Déconnexion</Text>
          </Pressable>
        </View>
        <Text style={{ color: t.grey, textAlign: 'center', fontSize: 12, marginTop: 8 }}>v0.0.1</Text>
      </Sheet>
      <Sheet visible={pick} onClose={() => setPick(false)} title="Mes salons">
        {SALONS.map((s) => (
          <Pressable key={s.slug} onPress={() => { setSalon(s); setPick(false); }} style={[st.row, { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.sep }]}>
            <Ionicons name="storefront-outline" size={20} color={t.blue} />
            <Text style={{ color: t.ink, fontSize: 16, flex: 1 }}>{s.name} · {s.city}</Text>
            {s.slug === salon.slug ? <Ionicons name="checkmark" size={20} color={t.blue} /> : null}
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

/* --------------------------------------------------------------- Sections */

function Page({ title, right, children }: { title?: string; right?: React.ReactNode; children: React.ReactNode }) {
  const { t } = useT();
  return (
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 30 }}>
      {title ? (
        <View style={[st.row, { justifyContent: 'space-between', marginBottom: 14 }]}>
          <Text style={{ color: t.ink, fontSize: 26, fontWeight: '700' }}>{title}</Text>{right}
        </View>
      ) : null}
      {children}
    </ScrollView>
  );
}

function Stat({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  const { t } = useT();
  return (
    <View style={[st.row, { width: '48%', flexGrow: 1, gap: 10 }]}>
      <View style={[st.statIcon, { borderColor: t.sep }]}><Ionicons name={icon} size={18} color={t.grey} /></View>
      <View><Text style={{ color: t.ink, fontSize: 22, fontWeight: '700' }}>{value}</Text><Text style={{ color: t.grey, fontSize: 12.5 }}>{label}</Text></View>
    </View>
  );
}

function DashboardSec() {
  const { t } = useT();
  const [range, setRange] = useState<'day' | 'week' | 'month' | 'span'>('week');
  const [rank, setRank] = useState<'ca' | 'speed' | 'products'>('ca');
  const max = Math.max(...WEEK.revenueCents);
  const total = WEEK.revenueCents.reduce((a, b) => a + b, 0);
  return (
    <Page>
      <Text style={{ color: t.ink, fontSize: 28, fontWeight: '800' }}>Bienvenue, <Text style={{ color: t.blue }}>Valleiry</Text></Text>
      <Text style={{ color: t.grey, marginTop: 2, textTransform: 'capitalize' }}>{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
      <View style={[st.wrap, { marginTop: 18, rowGap: 16 }]}>
        <Stat icon="umbrella-outline" value="0" label="En congé" />
        <Stat icon="people-outline" value="3" label="Coiffeurs actifs" />
        <Stat icon="person-outline" value="412" label="Clients" />
        <Stat icon="calendar-outline" value="11" label="RDV à venir" />
      </View>
      <View style={[st.wrap, { marginTop: 18, gap: 8 }]}>
        {[['Comptes clients', '186', t.blue], ['Cartes fidélité actives', '143', t.green], ['Cartes cadeaux en cours', '9', t.orange], ['Clients sans compte', '226', t.grey]].map(([k, v, c]) => (
          <View key={k} style={[st.chipStat, { backgroundColor: t.card }]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
            <Text style={{ color: t.ink, fontSize: 13.5 }}>{k}  <Text style={{ fontWeight: '700' }}>{v}</Text></Text>
          </View>
        ))}
      </View>
      <Segmented style={{ marginTop: 18 }} value={range} onChange={setRange} items={[{ key: 'day', label: 'Jour' }, { key: 'week', label: 'Semaine' }, { key: 'month', label: 'Mois' }, { key: 'span', label: 'Plage' }]} />
      <Card style={{ marginTop: 14 }}>
        <Text style={{ color: t.grey, fontWeight: '600' }}>Chiffre d'affaires · {WEEK.label}</Text>
        <Text style={{ color: t.ink, fontSize: 30, fontWeight: '800', marginTop: 2 }}>{eur(total)}</Text>
        <View style={[st.row, { alignItems: 'flex-end', height: 120, marginTop: 14, gap: 8 }]}>
          {WEEK.revenueCents.map((v, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              <View style={{ width: '100%', height: Math.max(4, (v / max) * 96), borderRadius: 6, backgroundColor: i === 5 ? t.blue : t.blueSoft }} />
              <Text style={{ color: t.grey, fontSize: 11 }}>{WEEK.days[i]}</Text>
            </View>
          ))}
        </View>
      </Card>
      <Card style={{ marginTop: 14 }}>
        <Text style={{ color: t.ink, fontSize: 17, fontWeight: '700', marginBottom: 10 }}>Classement</Text>
        <Segmented value={rank} onChange={setRank} items={[{ key: 'ca', label: 'CA' }, { key: 'speed', label: 'Rapidité' }, { key: 'products', label: 'Produits' }]} />
        {WEEK.ranking.map((r, i) => {
          const b = STAFF.find((s) => s.id === r.barberId)!;
          const val = rank === 'ca' ? eur(r.revenueCents) : rank === 'speed' ? `${[27, 29, 31][i]} min / client` : `${[14, 9, 6][i]} vendus`;
          return (
            <View key={b.id} style={[st.row, { paddingVertical: 10 }]}>
              <Text style={{ width: 22 }}>{['🏆', '🥈', '🥉'][i]}</Text>
              <Avatar initials={b.initials} color={b.color} size={30} />
              <Text style={{ color: t.ink, flex: 1, fontWeight: '600' }}>{b.name}</Text>
              <Text style={{ color: t.ink, fontWeight: '700' }}>{val}</Text>
            </View>
          );
        })}
      </Card>
    </Page>
  );
}

function FileSec() {
  const { t } = useT();
  const [me, setMe] = useState<string | null>(null);
  const waiting = QUEUE_ITEMS.filter((q) => q.status === 'waiting');
  const chair = QUEUE_ITEMS.filter((q) => q.status === 'in_progress');
  return (
    <Page>
      <View style={[st.wrap, { gap: 10 }]}>
        {[[String(waiting.length), 'en attente'], ['50 min', 'de file'], [eur(TODAY_SALES.reduce((a, s) => a + s.priceCents, 0)), "encaissé aujourd'hui"], [String(STAFF.length), 'coiffeurs en poste']].map(([v, k]) => (
          <Card key={k} style={{ width: '48%', flexGrow: 1 }}>
            <Text style={{ color: t.ink, fontSize: 22, fontWeight: '700' }}>{v}</Text><Text style={{ color: t.grey, fontSize: 13 }}>{k}</Text>
          </Card>
        ))}
      </View>
      <View style={[st.row, { marginTop: 18 }]}><Text style={{ color: t.grey }}>Je suis</Text><Bubbles people={STAFF} value={me} onChange={setMe} size={38} /></View>
      <Text style={[st.section, { color: t.grey }]}>EN ATTENTE</Text>
      {waiting.map((q, i) => {
        const b = STAFF.find((s) => s.id === q.barberId)!;
        return (
          <Card key={q.id} style={{ marginBottom: 10 }}>
            <View style={st.row}>
              <View style={[st.pos, { backgroundColor: t.fill }]}><Text style={{ color: t.ink, fontWeight: '700' }}>{i + 1}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 17, fontWeight: '700' }}>{q.client}</Text>
                <Text style={{ color: t.grey }}>{b.name}</Text>
                <View style={{ marginTop: 6 }}><Pill label={q.service} /></View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: t.ink, fontWeight: '700' }}>{q.minutes} min</Text>
                <Text style={{ color: t.grey }}>{eur(q.priceCents)}</Text>
                <Text style={{ color: t.orange, fontSize: 13 }}>dans ~{q.waitMin} min</Text>
              </View>
            </View>
            <View style={[st.row, { marginTop: 12 }]}>
              <View style={{ flex: 1 }}><SoftButton label="Démarrer" onPress={() => {}} /></View>
              <Pressable><Text style={{ color: t.grey, fontWeight: '600' }}>Absent</Text></Pressable>
            </View>
          </Card>
        );
      })}
      <Text style={[st.section, { color: t.grey }]}>AU FAUTEUIL</Text>
      <Card style={{ paddingVertical: 4 }}>
        {chair.map((q, i) => (
          <View key={q.id} style={[st.row, { paddingVertical: 12, borderBottomWidth: i < chair.length - 1 ? StyleSheet.hairlineWidth : 0, borderColor: t.sep }]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.green }} />
            <Text style={{ color: t.ink, fontWeight: '600', flex: 1 }}>{STAFF.find((s) => s.id === q.barberId)!.name} — {q.client}</Text>
            <Text style={{ color: t.grey }}>{q.service}</Text>
          </View>
        ))}
      </Card>
    </Page>
  );
}

function RdvSec() {
  const { t } = useT();
  return (
    <View style={{ flex: 1 }}>
      <View style={[st.row, { justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6 }]}>
        <Text style={{ color: t.ink, fontSize: 26, fontWeight: '700' }}>Rendez-vous</Text>
        <Pressable style={[st.row, st.outline, { borderColor: t.sep, gap: 6 }]}><Ionicons name="settings-outline" size={16} color={t.ink} /><Text style={{ color: t.ink, fontWeight: '600' }}>Paramètres</Text></Pressable>
      </View>
      <Text style={{ color: t.ink, paddingHorizontal: 18, marginBottom: 12, lineHeight: 20 }}>Réservés en ligne — ceux du jour apparaissent aussi automatiquement dans la file d'attente au moment prévu.</Text>
      <View style={{ flex: 1 }}><Agenda showAll /></View>
    </View>
  );
}

function ClientsSec() {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<(typeof CLIENTS_LIST)[number] | null>(null);
  const list = CLIENTS_LIST.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Page title="Clients">
      <View style={[st.row, st.search, { backgroundColor: t.card }]}>
        <Ionicons name="search" size={18} color={t.grey} />
        <TextInput value={q} onChangeText={setQ} placeholder="Rechercher un client…" placeholderTextColor={t.grey} style={{ flex: 1, color: t.ink, fontSize: 16, paddingVertical: 12 }} />
      </View>
      <Card style={{ paddingVertical: 4, marginTop: 14 }}>
        {list.map((c, i) => (
          <Pressable key={c.name} onPress={() => setOpen(c)} style={[st.row, { paddingVertical: 12, borderBottomWidth: i < list.length - 1 ? StyleSheet.hairlineWidth : 0, borderColor: t.sep }]}>
            <Avatar initials={c.name[0]} color={['#0a84ff', '#e5484d', '#30a46c', '#ff9f0a', '#5e5ce6'][i % 5]} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontWeight: '600', fontSize: 15.5 }}>{c.name}</Text>
              <Text style={{ color: t.grey, fontSize: 13 }}>{c.visits} passages · dernier {c.last}</Text>
            </View>
            {c.account ? <Pill label={`${c.loyalty} pts`} tone="green" /> : <Pill label="Sans compte" tone="grey" />}
          </Pressable>
        ))}
      </Card>
      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.name}>
        {open ? (
          <View>
            {[['Téléphone', open.phone], ['Passages', String(open.visits)], ['Dernier passage', open.last], ['Fidélité', open.account ? `${open.loyalty} points` : 'Pas de compte']].map(([k, v]) => (
              <View key={k} style={[st.row, { justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.sep }]}>
                <Text style={{ color: t.grey }}>{k}</Text><Text style={{ color: t.ink, fontWeight: '600' }}>{v}</Text>
              </View>
            ))}
            <Text style={{ color: t.grey, fontWeight: '600', marginTop: 16, marginBottom: 6 }}>Note interne</Text>
            <TextInput placeholder="Visible par toute l'équipe" placeholderTextColor={t.grey} style={[st.input, { backgroundColor: t.fill, color: t.ink, minHeight: 70 }]} multiline />
            <View style={{ height: 14 }} /><Go label="Prendre un RDV pour ce client" onPress={() => setOpen(null)} />
          </View>
        ) : null}
      </Sheet>
    </Page>
  );
}

function CaisseSec() {
  const { t } = useT();
  const total = TODAY_SALES.reduce((a, s) => a + s.priceCents, 0);
  return (
    <Page title="Caisse">
      <Card style={{ backgroundColor: t.fill }}>
        <Text style={{ color: t.grey, fontWeight: '600' }}>Période en cours</Text>
        <Text style={{ color: t.ink, fontSize: 30, fontWeight: '800' }}>{eur(total)}</Text>
        <Text style={{ color: t.grey }}>{TODAY_SALES.length} ventes depuis 09:00</Text>
        <View style={{ height: 12 }} /><Go label="Clôturer la caisse (ticket Z)" icon="lock-closed-outline" onPress={() => {}} />
      </Card>
      <Text style={[st.section, { color: t.grey }]}>VENTES DU JOUR</Text>
      <Card style={{ paddingVertical: 4 }}>
        {TODAY_SALES.map((v, i) => (
          <View key={v.id} style={[st.row, { paddingVertical: 11, borderBottomWidth: i < TODAY_SALES.length - 1 ? StyleSheet.hairlineWidth : 0, borderColor: t.sep }]}>
            <Text style={{ color: t.grey, width: 44 }}>{v.time}</Text>
            <View style={{ flex: 1 }}><Text style={{ color: t.ink, fontWeight: '600' }}>#{v.ticket} · {v.client}</Text><Text style={{ color: t.grey, fontSize: 13 }}>{v.items}</Text></View>
            <Text style={{ color: t.ink, fontWeight: '700' }}>{eur(v.priceCents)}</Text>
          </View>
        ))}
      </Card>
      <Text style={[st.section, { color: t.grey }]}>CLÔTURES (TICKETS Z)</Text>
      <Card style={{ paddingVertical: 4 }}>
        {[['Z041', 'Hier · 19:12', 98400], ['Z040', 'Samedi · 19:31', 132100], ['Z039', 'Vendredi · 19:05', 101300]].map(([z, d, v], i) => (
          <View key={z as string} style={[st.row, { paddingVertical: 12, borderBottomWidth: i < 2 ? StyleSheet.hairlineWidth : 0, borderColor: t.sep }]}>
            <Ionicons name="receipt-outline" size={20} color={t.blue} />
            <View style={{ flex: 1 }}><Text style={{ color: t.ink, fontWeight: '600' }}>{z}</Text><Text style={{ color: t.grey, fontSize: 13 }}>{d}</Text></View>
            <Text style={{ color: t.ink, fontWeight: '700' }}>{eur(v as number)}</Text>
            <Ionicons name="print-outline" size={20} color={t.grey} />
          </View>
        ))}
      </Card>
    </Page>
  );
}

function CoiffeursSec() {
  const { t } = useT();
  const [on, setOn] = useState<Record<string, boolean>>({ marco: true, tom: true, yanis: true });
  return (
    <Page title="Coiffeurs et horaires" right={<Pressable style={[st.addBtn, { backgroundColor: t.blue }]}><Text style={{ color: '#fff', fontWeight: '700' }}>+ Ajouter</Text></Pressable>}>
      {STAFF.map((s) => (
        <Card key={s.id} style={{ marginBottom: 10 }}>
          <View style={st.row}>
            <Avatar initials={s.initials} color={s.color} size={46} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 17, fontWeight: '700' }}>{s.name}</Text>
              <Text style={{ color: t.grey, fontSize: 13 }}>Mar → Sam · 09:00 – 19:00</Text>
              <View style={[st.row, { gap: 6, marginTop: 6 }]}><Pill label="RDV en ligne" /><Pill label="Timer" tone="grey" /></View>
            </View>
            <Switch value={on[s.id]} onValueChange={(v) => setOn({ ...on, [s.id]: v })} trackColor={{ true: t.green, false: t.fill2 }} />
          </View>
        </Card>
      ))}
    </Page>
  );
}

function CatalogSec({ kind }: { kind: 'svc' | 'extra' | 'product' }) {
  const { t } = useT();
  const title = kind === 'svc' ? 'Prestations' : kind === 'extra' ? 'Suppléments' : 'Produits';
  return (
    <Page title={title} right={<Pressable style={[st.addBtn, { backgroundColor: t.blue }]}><Text style={{ color: '#fff', fontWeight: '700' }}>+ Ajouter</Text></Pressable>}>
      <Card style={{ paddingVertical: 4 }}>
        {CATALOG.filter((c) => c.kind === kind).map((c, i, a) => (
          <View key={c.id} style={[st.row, { paddingVertical: 12, borderBottomWidth: i < a.length - 1 ? StyleSheet.hairlineWidth : 0, borderColor: t.sep }]}>
            <View style={[st.emoji, { backgroundColor: t.blueSoft }]}><Text style={{ fontSize: 22 }}>{c.emoji}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontWeight: '600', fontSize: 15.5 }}>{c.name}</Text>
              <Text style={{ color: t.grey, fontSize: 13 }}>{c.minutes ? `${c.minutes} min` : c.stock !== undefined ? `Stock : ${c.stock}` : 'Supplément'}</Text>
            </View>
            <Text style={{ color: t.ink, fontWeight: '700' }}>{eur(c.priceCents)}</Text>
            <Ionicons name="chevron-forward" size={18} color={t.grey} />
          </View>
        ))}
      </Card>
    </Page>
  );
}

function SettingsLike({ sec }: { sec: 'marketing' | 'salons' | 'compte' | 'reglages' }) {
  const { t } = useT();
  const groups: Record<typeof sec, { title: string; rows: string[] }> = {
    marketing: { title: 'Marketing', rows: ['Programme de fidélité', 'Clients fidèles', 'Cadeaux vendus', 'Design de la carte fidélité (compte client)', 'Design de la carte cadeau (compte client)'] },
    salons: { title: 'Mes salons', rows: [...SALONS.map((s) => `${s.name} · ${s.city}`), "Ajouter un salon à l'enseigne"] },
    compte: { title: 'Compte', rows: ['Mon profil', 'Mot de passe'] },
    reglages: { title: 'Réglages', rows: ['Général', 'Fuseau horaire', 'Logo du salon', 'Page de connexion', 'Pont local (impression + paiement CB, recommandé)', 'Importer des rendez-vous'] },
  };
  const g = groups[sec];
  return (
    <Page title={g.title}>
      <Card style={{ paddingVertical: 4 }}>
        {g.rows.map((r, i) => (
          <View key={r} style={[st.row, { paddingVertical: 15, borderBottomWidth: i < g.rows.length - 1 ? StyleSheet.hairlineWidth : 0, borderColor: t.sep }]}>
            <Text style={{ color: r.startsWith('Ajouter') ? t.blue : t.ink, fontSize: 15.5, flex: 1, fontWeight: r.startsWith('Ajouter') ? '600' : '400' }}>{r}</Text>
            <Ionicons name="chevron-forward" size={18} color={t.grey} />
          </View>
        ))}
      </Card>
      <Text style={{ color: t.grey, fontSize: 12.5, textAlign: 'center', marginTop: 14 }}>Mêmes réglages que le web ; le détail de chaque écran sera repris tel quel.</Text>
    </Page>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  switcher: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  statIcon: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipStat: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 9 },
  section: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginTop: 20, marginBottom: 8, marginLeft: 2 },
  pos: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  outline: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  search: { borderRadius: 14, paddingHorizontal: 14 },
  addBtn: { borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 },
  emoji: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  moreGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 },
  moreItem: { width: '25%', alignItems: 'center', gap: 6 },
  moreIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
