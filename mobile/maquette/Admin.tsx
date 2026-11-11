// MAQUETTE — Dashboard (admin) : connexion email + mot de passe, en-tête avec sélecteur de salon,
// barre du bas mobile du web (File d'attente, Caisse, Rendez-vous, Clients, Plus) et les 13 sections du menu.
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Agenda } from './Agenda';
import * as M from './AdminManage';
import { APPTS, BREAKS, CATALOG, CLIENTS_LIST, HOURS, NOW_MIN, QUEUE_ITEMS, SALONS, STAFF, Salon, TODAY_SALES, eur, hm } from './data';
import { Avatar, BackLink, Bubbles, Card, Go, Pill, Segmented, Sheet, SoftButton, TabBar, ToggleRow, useT, useToast } from './ui';

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
  const [imp, setImp] = useState(false);
  type Bar = 'file' | 'caisse' | 'rdv' | 'clients' | 'more';
  const barActive: Bar = (['file', 'caisse', 'rdv', 'clients'] as Sec[]).includes(sec) ? (sec as Bar) : 'more';

  return (
    <View style={{ flex: 1 }}>
      {imp ? <M.ImpersonationBanner onExit={() => setImp(false)} /> : null}
      <View style={[st.top, { backgroundColor: t.card }]}>
        <Text style={{ color: t.ink, fontWeight: '700', fontSize: 16, flex: 1 }}>{salon.name} {salon.city}</Text>
        <Pressable onPress={() => setPick(true)} style={[st.switcher, { backgroundColor: t.fill }]}>
          <Text style={{ color: t.ink, fontWeight: '600' }}>{salon.city}</Text><Ionicons name="chevron-down" size={16} color={t.ink} />
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        {sec === 'dashboard' && <DashboardSec go={setSec} />}
        {sec === 'file' && <M.FileSec />}
        {sec === 'rdv' && <RdvSec />}
        {sec === 'clients' && <M.ClientsSec />}
        {sec === 'caisse' && <CaisseSec />}
        {sec === 'coiffeurs' && <CoiffeursSec />}
        {(sec === 'prestations' || sec === 'supplements' || sec === 'produits') && <M.CatalogSec key={sec} kind={sec === 'prestations' ? 'svc' : sec === 'supplements' ? 'extra' : 'product'} />}
        {sec === 'marketing' && <M.MarketingSec />}
        {sec === 'salons' && <M.SalonsSec />}
        {sec === 'compte' && <M.CompteSec impersonating={imp} setImpersonating={setImp} />}
        {sec === 'reglages' && <M.ReglagesSec />}
        <M.AiChat />
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

/* ------------------------------------------------ Statistiques (données fictives stables) */

type Period = 'day' | 'week' | 'month' | 'range';
const seeded = (n: number) => { const x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); };
function periodInfo(p: Period, idx: number) {
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('fr-FR', o);
  if (p === 'day') { const d = new Date(now); d.setDate(d.getDate() + idx); return { label: idx === 0 ? "Aujourd'hui" : idx === -1 ? 'Hier' : fmt(d, { weekday: 'long', day: 'numeric', month: 'short' }), buckets: ['9h', '10h', '11h', '12h', '13h', '14h', '15h', '16h', '17h', '18h'], scale: 0.16 }; }
  if (p === 'week') { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + idx * 7); const e = new Date(d); e.setDate(e.getDate() + 6);
    return { label: (idx === 0 ? 'Cette semaine · ' : idx === -1 ? 'Semaine dernière · ' : '') + `${fmt(d, { day: 'numeric', month: 'short' })} – ${fmt(e, { day: 'numeric', month: 'short' })}`, buckets: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'], scale: 1 }; }
  if (p === 'month') { const d = new Date(now.getFullYear(), now.getMonth() + idx, 1); const n = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return { label: fmt(d, { month: 'long', year: 'numeric' }), buckets: [...Array(n)].map((_, i) => String(i + 1)), scale: 1 }; }
  return { label: 'Du 1 oct. au 31 oct.', buckets: [...Array(31)].map((_, i) => String(i + 1)), scale: 1 };
}
/** Encaissé par case (heure, jour) pour un coiffeur ou tout le salon ; dimanche/lundi fermés. */
function series(p: Period, idx: number, who: string | null) {
  const info = periodInfo(p, idx);
  const k = (who ? STAFF.findIndex((s) => s.id === who) + 1 : 0) * 1000 + idx * 37 + (p === 'week' ? 7 : p === 'day' ? 3 : 11);
  return info.buckets.map((_, i) => {
    if (p === 'week' && (i === 0 || i === 6)) return 0;
    if ((p === 'month' || p === 'range') && [0, 1].includes(new Date(new Date().getFullYear(), new Date().getMonth() + idx, i + 1).getDay())) return 0;
    if (p === 'day' && (i === 3 || i === 4) && seeded(k + i) < 0.5) return 0;
    const base = (who ? 9000 : 26000) * info.scale * (p === 'day' ? 1 : 1) * (0.55 + seeded(k + i) * 0.9) * (i === 5 && p === 'week' ? 1.5 : 1);
    return Math.round(base / 100) * 100;
  });
}
function stats(p: Period, idx: number, who: string | null) {
  const v = series(p, idx, who); const prev = series(p, idx - 1, who);
  const total = v.reduce((a, b) => a + b, 0), prevT = prev.reduce((a, b) => a + b, 0);
  const cuts = Math.round(total / 2900);
  const k = (who ? STAFF.findIndex((s) => s.id === who) + 1 : 0) * 100 + idx;
  const missedN = Math.round(1 + seeded(k + 5) * (p === 'day' ? 1 : p === 'week' ? 4 : 12));
  return {
    v, total, delta: prevT ? Math.round(((total - prevT) / prevT) * 100) : 0, cuts,
    avg: cuts ? Math.round(total / cuts) : 0, extras: Math.round(cuts * (0.25 + seeded(k + 1) * 0.2)),
    perHour: Math.round((total / Math.max(1, (p === 'day' ? 1 : p === 'week' ? 5 : 21) * 9)) / 10) * 10,
    occupancy: Math.round(62 + seeded(k + 2) * 30), missedN, missedCents: missedN * 2700,
    freeCents: Math.round((p === 'day' ? 4000 : p === 'week' ? 21000 : 86000) * (0.6 + seeded(k + 3) * 0.6) / 100) * 100,
    speed: Math.round(24 + seeded(k + 4) * 9), productsSold: Math.round(2 + seeded(k + 6) * (p === 'day' ? 3 : 14)),
  };
}

function PeriodBar({ p, setP, idx, setIdx }: { p: Period; setP: (v: Period) => void; idx: number; setIdx: (n: number) => void }) {
  const { t } = useT();
  const info = periodInfo(p, idx);
  return (
    <View>
      <Segmented value={p} onChange={(v) => { setP(v); setIdx(0); }} items={[{ key: 'day', label: 'Jour' }, { key: 'week', label: 'Semaine' }, { key: 'month', label: 'Mois' }, { key: 'range', label: 'Plage' }]} />
      {p === 'range' ? (
        <View style={[st.row, { marginTop: 10, gap: 8 }]}>
          {['Du 01/10/2026', 'Au 31/10/2026'].map((x) => <View key={x} style={[st.dateField, { backgroundColor: t.card, borderColor: t.sep }]}><Ionicons name="calendar-outline" size={16} color={t.grey} /><Text style={{ color: t.ink }}>{x}</Text></View>)}
        </View>
      ) : (
        <View style={[st.row, { marginTop: 10 }]}>
          <Pressable onPress={() => setIdx(idx - 1)} style={[st.nav, { backgroundColor: t.card }]}><Ionicons name="chevron-back" size={18} color={t.ink} /></Pressable>
          <Text style={{ flex: 1, textAlign: 'center', color: t.ink, fontWeight: '700', textTransform: p === 'week' ? 'none' : 'capitalize' }}>{info.label}</Text>
          <Pressable disabled={idx >= 0} onPress={() => setIdx(idx + 1)} style={[st.nav, { backgroundColor: t.card, opacity: idx >= 0 ? 0.35 : 1 }]}><Ionicons name="chevron-forward" size={18} color={t.ink} /></Pressable>
        </View>
      )}
    </View>
  );
}

function Delta({ pc }: { pc: number }) {
  const { t } = useT();
  const c = pc > 0 ? t.green : pc < 0 ? t.red : t.grey;
  return <Text style={{ color: c, fontWeight: '700', fontSize: 13, marginTop: 4 }}>{pc > 0 ? `▲ +${pc} % vs période préc.` : pc < 0 ? `▼ −${-pc} % vs période préc.` : '= période préc.'}</Text>;
}

/** Courbe « Encaissé » (barres par heure / jour) ; toucher une barre affiche sa valeur. */
function RevChart({ v, buckets, multi, onMulti }: { v: number[]; buckets: string[]; multi?: number[] | null; onMulti?: (x: number[]) => void }) {
  const { t } = useT();
  const [sel0, setSel0] = useState<number | null>(null);
  const sel = multi ? null : sel0;
  const setSel = (i: number | null) => { if (multi && onMulti && i !== null) onMulti(multi.includes(i) ? multi.filter((x) => x !== i) : [...multi, i]); else setSel0(i); };
  const max = Math.max(1, ...v);
  const dense = v.length > 12;
  return (
    <View>
      <Text style={{ color: t.grey, fontSize: 12.5, minHeight: 18 }}>{sel !== null ? `${buckets[sel]} : ${eur(v[sel])}` : 'Touchez une barre pour le détail'}</Text>
      <View style={[st.row, { alignItems: 'flex-end', height: 130, gap: dense ? 2 : 7, marginTop: 4 }]}>
        {v.map((x, i) => (
          <Pressable key={i} onPress={() => setSel(sel === i ? null : i)} style={{ flex: 1, alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
            <View style={{ width: '100%', height: Math.max(3, (x / max) * 104), borderRadius: dense ? 2 : 6, backgroundColor: multi ? (multi.includes(i) ? t.orange : t.blueSoft) : sel === i ? t.blue : x === max ? t.blue : t.blueSoft }} />
            {!dense || i % 5 === 0 ? <Text style={{ color: t.grey, fontSize: 10.5 }} numberOfLines={1}>{buckets[i]}</Text> : <Text style={{ fontSize: 10.5 }}> </Text>}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function DashboardSec({ go }: { go: (s: Sec) => void }) {
  const { t } = useT();
  const [p, setP] = useState<Period>('week');
  const [idx, setIdx] = useState(0);
  const [rank, setRank] = useState<'ca' | 'speed' | 'products'>('ca');
  const S = stats(p, idx, null);
  const info = periodInfo(p, idx);
  const per = STAFF.map((b) => ({ b, s: stats(p, idx, b.id) }));
  const ranked = [...per].sort((x, y) => (rank === 'ca' ? y.s.total - x.s.total : rank === 'speed' ? x.s.speed - y.s.speed : y.s.productsSold - x.s.productsSold));
  const upcoming = APPTS.filter((a) => a.start > NOW_MIN && !a.noShow).sort((a, b) => a.start - b.start);
  return (
    <Page>
      <Text style={{ color: t.ink, fontSize: 28, fontWeight: '800' }}>Bienvenue, <Text style={{ color: t.blue }}>Valleiry</Text></Text>
      <Text style={{ color: t.grey, marginTop: 2, textTransform: 'capitalize' }}>{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
      <View style={[st.wrap, { marginTop: 18, rowGap: 16 }]}>
        <Stat icon="umbrella-outline" value="0" label="En congé" />
        <Stat icon="people-outline" value={String(STAFF.length)} label="Coiffeurs actifs" />
        <Stat icon="person-outline" value="412" label="Clients" />
        <Stat icon="calendar-outline" value={String(upcoming.length)} label="RDV à venir" />
      </View>
      <View style={[st.wrap, { marginTop: 18, gap: 8 }]}>
        {[['Comptes clients', '186', t.blue], ['Cartes fidélité actives', '143', t.green], ['Cartes cadeaux en cours', '9', t.orange], ['Clients sans compte', '226', t.grey]].map(([k, v, c]) => (
          <View key={k} style={[st.chipStat, { backgroundColor: t.card }]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
            <Text style={{ color: t.ink, fontSize: 13.5 }}>{k}  <Text style={{ fontWeight: '700' }}>{v}</Text></Text>
          </View>
        ))}
      </View>

      <View style={{ marginTop: 18 }}><PeriodBar p={p} setP={setP} idx={idx} setIdx={setIdx} /></View>

      <Card style={{ marginTop: 14 }}>
        <Text style={st.h3(t)}>Classement</Text>
        <Segmented value={rank} onChange={setRank} items={[{ key: 'ca', label: 'CA' }, { key: 'speed', label: 'Rapidité' }, { key: 'products', label: 'Produits' }]} />
        {ranked.map(({ b, s }, i) => (
          <View key={b.id} style={[st.row, { paddingVertical: 10 }]}>
            <Text style={{ width: 22 }}>{['🏆', '🥈', '🥉'][i]}</Text>
            <Avatar initials={b.initials} color={b.color} size={30} />
            <Text style={{ color: t.ink, flex: 1, fontWeight: '600' }}>{b.name}</Text>
            <Text style={{ color: t.ink, fontWeight: '700' }}>{rank === 'ca' ? eur(s.total) : rank === 'speed' ? `${s.speed} min` : `${s.productsSold} vendus`}</Text>
          </View>
        ))}
      </Card>

      <View style={[st.row, { marginTop: 14, alignItems: 'stretch', gap: 10 }]}>
        <Card style={{ flex: 1 }}>
          <Text style={st.h3(t)}>Chiffre d'affaires</Text>
          <Text style={{ color: t.ink, fontSize: 24, fontWeight: '800' }}>{eur(S.total)}</Text>
          <Delta pc={S.delta} />
        </Card>
        <Card style={{ flex: 1 }}>
          <Text style={st.h3(t)}>Manque à gagner</Text>
          <Text style={{ color: t.orange, fontSize: 24, fontWeight: '800' }}>{eur(S.freeCents + S.missedCents)}</Text>
        </Card>
      </View>
      <Card style={{ marginTop: 10 }}>
        <View style={[st.row, { justifyContent: 'space-between' }]}><Text style={{ color: t.grey }}>Créneaux libres</Text><Text style={{ color: t.ink, fontWeight: '600' }}>{eur(S.freeCents)}</Text></View>
        <View style={[st.row, { justifyContent: 'space-between', marginTop: 8 }]}><Text style={{ color: t.grey }}>RDV annulés / absents ({S.missedN} RDV)</Text><Text style={{ color: t.ink, fontWeight: '600' }}>{eur(S.missedCents)}</Text></View>
        <Text style={{ color: t.grey, fontSize: 12, marginTop: 8 }}>Temps déjà passé seulement, au prix moyen des prestations de chaque coiffeur.</Text>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <View style={[st.row, { justifyContent: 'space-between' }]}><Text style={st.h3(t)}>Prochains RDV</Text><Text style={{ color: t.grey }}>{upcoming.length}</Text></View>
        {upcoming.slice(0, 6).map((a) => {
          const b = STAFF.find((s) => s.id === a.barberId)!;
          return (
            <View key={a.id} style={[st.row, { paddingVertical: 8 }]}>
              <Text style={{ color: t.ink, fontWeight: '700', width: 48 }}>{hm(a.start)}</Text>
              <Avatar initials={b.initials} color={b.color} size={24} />
              <Text style={{ color: t.ink, flex: 1 }} numberOfLines={1}>{a.client}</Text>
              <Text style={{ color: t.grey, fontSize: 13 }} numberOfLines={1}>{a.service}</Text>
            </View>
          );
        })}
      </Card>

      <Card style={{ marginTop: 14 }}>
        <Text style={st.h3(t)}>Catalogue</Text>
        {([['Prestations', String(CATALOG.filter((c) => c.kind === 'svc').length), 'prestations'], ['Suppléments', String(CATALOG.filter((c) => c.kind === 'extra').length), 'supplements'],
          ['Produits', `${CATALOG.filter((c) => c.kind === 'product').length} · ${CATALOG.filter((c) => c.kind === 'product').reduce((a, c) => a + (c.stock ?? 0), 0)} en stock`, 'produits']] as [string, string, Sec][]).map(([k, v, sec]) => (
          <Pressable key={k} onPress={() => go(sec)} style={[st.row, { justifyContent: 'space-between', paddingVertical: 10 }]}>
            <Text style={{ color: t.ink }}>{k}</Text><Text style={{ color: t.ink, fontWeight: '700' }}>{v}  <Ionicons name="chevron-forward" size={14} color={t.grey} /></Text>
          </Pressable>
        ))}
      </Card>

      <Card style={{ marginTop: 14 }}>
        <View style={[st.row, { justifyContent: 'space-between' }]}><Text style={st.h3(t)}>Encaissé du salon</Text><Text style={{ color: t.grey, fontSize: 12.5, flexShrink: 1, textAlign: 'right' }}>{info.label}</Text></View>
        <View style={[st.row, { alignItems: 'baseline' }]}><Text style={{ color: t.ink, fontSize: 24, fontWeight: '800' }}>{eur(S.total)}</Text><Delta pc={S.delta} /></View>
        <RevChart v={S.v} buckets={info.buckets} />
      </Card>

      <Card style={{ marginTop: 14 }}>
        <Text style={st.h3(t)}>Planning du jour</Text>
        {STAFF.map((b) => (
          <View key={b.id} style={[st.row, { marginTop: 8 }]}>
            <Avatar initials={b.initials} color={b.color} size={24} />
            <View style={{ flex: 1, height: 22, borderRadius: 7, backgroundColor: t.fill, overflow: 'hidden' }}>
              {APPTS.filter((a) => a.barberId === b.id).map((a) => (
                <View key={a.id} style={{ position: 'absolute', top: 3, bottom: 3, borderRadius: 4, backgroundColor: b.color, opacity: a.noShow ? 0.15 : a.start + a.minutes <= NOW_MIN ? 0.3 : 0.85,
                  left: `${((a.start - 540) / 600) * 100}%`, width: `${(a.minutes / 600) * 100}%` }} />
              ))}
              <View style={{ position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: t.red, left: `${((NOW_MIN - 540) / 600) * 100}%` }} />
            </View>
          </View>
        ))}
        <View style={[st.row, { justifyContent: 'space-between', marginLeft: 34, marginTop: 4 }]}>{['09:00', '12:00', '15:00', '19:00'].map((h) => <Text key={h} style={{ color: t.grey, fontSize: 10.5 }}>{h}</Text>)}</View>
      </Card>
    </Page>
  );
}

function RdvSec() {
  const { t } = useT();
  const [view, setView] = useState<'agenda' | 'list'>('agenda');
  if (view === 'list') return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10 }}>
        <Text style={{ color: t.ink, fontSize: 26, fontWeight: '700', marginBottom: 10 }}>Rendez-vous</Text>
        <Segmented value={view} onChange={setView} items={[{ key: 'agenda', label: 'Agenda' }, { key: 'list', label: 'Liste' }]} />
      </View>
      <M.RdvList />
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
      <View style={[st.row, { justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6 }]}>
        <Text style={{ color: t.ink, fontSize: 26, fontWeight: '700' }}>Rendez-vous</Text>
        <Pressable style={[st.row, st.outline, { borderColor: t.sep, gap: 6 }]}><Ionicons name="settings-outline" size={16} color={t.ink} /><Text style={{ color: t.ink, fontWeight: '600' }}>Paramètres</Text></Pressable>
      </View>
      <View style={{ paddingHorizontal: 18, marginBottom: 10 }}><Segmented value={view} onChange={setView} items={[{ key: 'agenda', label: 'Agenda' }, { key: 'list', label: 'Liste' }]} /></View>
      <Text style={{ color: t.ink, paddingHorizontal: 18, marginBottom: 12, lineHeight: 20 }}>Réservés en ligne — ceux du jour apparaissent aussi automatiquement dans la file d'attente au moment prévu.</Text>
      <View style={{ flex: 1 }}><Agenda showAll /></View>
    </View>
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
  const [open, setOpen] = useState<string | null>(null);
  const [add, setAdd] = useState(false);
  const [extra, setExtra] = useState<string[]>([]);
  const [toastNode, toast] = useToast();
  if (open) return <BarberSheet id={open} onBack={() => setOpen(null)} />;
  return (
    <View style={{ flex: 1 }}>
    <Page title="Coiffeurs et horaires" right={<Pressable onPress={() => setAdd(true)} style={[st.addBtn, { backgroundColor: t.blue }]}><Text style={{ color: '#fff', fontWeight: '700' }}>+ Ajouter</Text></Pressable>}>
      {STAFF.map((s) => (
        <Card key={s.id} style={{ marginBottom: 10 }} onPress={() => setOpen(s.id)}>
          <View style={st.row}>
            <Avatar initials={s.initials} color={s.color} size={46} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 17, fontWeight: '700' }}>{s.name}</Text>
              <Text style={{ color: t.grey, fontSize: 13 }}>Mar → Sam · {hm(HOURS[s.id][0])} – {hm(HOURS[s.id][1])}</Text>
              <View style={[st.row, { gap: 6, marginTop: 6 }]}><Pill label="RDV en ligne" /><Pill label="Timer" tone="grey" /></View>
            </View>
            <Switch value={on[s.id]} onValueChange={(v) => setOn({ ...on, [s.id]: v })} trackColor={{ true: t.green, false: t.fill2 }} />
          </View>
        </Card>
      ))}
      {extra.map((n) => (
        <Card key={n} style={{ marginBottom: 10 }}>
          <View style={st.row}><Avatar initials={n.slice(0, 2).toUpperCase()} color="#ff9f0a" size={46} /><View style={{ flex: 1 }}><Text style={{ color: t.ink, fontSize: 17, fontWeight: '700' }}>{n}</Text><Text style={{ color: t.grey, fontSize: 13 }}>Nouveau · horaires du salon</Text></View></View>
        </Card>
      ))}
      <M.AddBarberSheet visible={add} onClose={() => setAdd(false)} onDone={(n) => { setExtra([...extra, n]); setAdd(false); toast(`${n} ajouté`); }} />
    </Page>
    {toastNode}
    </View>
  );
}

/** Fiche d'un coiffeur : profil en haut, statistiques de la période, historique (prestations / encaissements), horaires. */
function BarberSheet({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useT();
  const b = STAFF.find((s) => s.id === id)!;
  const [p, setP] = useState<Period>('week');
  const [idx, setIdx] = useState(0);
  const [hist, setHist] = useState<'svc' | 'sales'>('svc');
  const S = stats(p, idx, id);
  const info = periodInfo(p, idx);
  const tiles: [string, string, boolean?][] = [
    [String(S.cuts), 'coupes terminées'], [eur(S.total), 'encaissé'], [eur(S.avg), 'panier moyen'], [String(S.extras), 'ventes en plus'],
    [eur(S.perHour), 'encaissé par heure travaillée'], [`${S.occupancy} %`, "taux d'occupation (performance)"],
    [String(S.missedN), 'RDV ratés', true], [eur(S.freeCents), 'créneaux libres (≈)', true], [eur(S.freeCents + S.missedCents), 'manque à gagner estimé', true],
  ];
  const mine = APPTS.filter((a) => a.barberId === id && a.start + a.minutes <= NOW_MIN);
  const sales = TODAY_SALES.filter((x) => x.barberId === id);
  const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const [toastNode, toast] = useToast();
  const [pickDays, setPickDays] = useState<number[] | null>(null);
  const [real, setReal] = useState(false);
  const picked = pickDays && pickDays.length ? pickDays.reduce((a, i) => a + S.v[i], 0) : null;
  return (
    <View style={{ flex: 1 }}>
    <Page>
      <BackLink onPress={onBack} label="Coiffeurs" />
      <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
        <Avatar initials={b.initials} color={b.color} size={76} />
        <Text style={{ color: t.ink, fontSize: 24, fontWeight: '800', marginTop: 10 }}>{b.name}</Text>
        <View style={[st.row, { gap: 6, marginTop: 8 }]}><Pill label="RDV en ligne" /><Pill label="Timer activé" tone="grey" /><Pill label={`PIN ••${b.pin.slice(2)}`} tone="grey" /></View>
        <M.BarberEditors id={id} toast={toast} />
      </Card>

      <Text style={[st.h3(t), { marginTop: 20 }]}>Statistiques</Text>
      <PeriodBar p={p} setP={setP} idx={idx} setIdx={setIdx} />
      <View style={[st.wrap, { gap: 10, marginTop: 12 }]}>
        {tiles.map(([v, k, warn]) => (
          <Card key={k} style={{ width: '31%', flexGrow: 1, padding: 12, backgroundColor: warn ? 'rgba(255,159,10,.10)' : t.card }}>
            <Text style={{ color: warn ? t.orange : t.ink, fontSize: 18, fontWeight: '800' }} numberOfLines={1} adjustsFontSizeToFit>{v}</Text>
            <Text style={{ color: t.grey, fontSize: 11.5, marginTop: 2 }}>{k}</Text>
          </Card>
        ))}
      </View>
      <Card style={{ marginTop: 10 }}>
        <View style={[st.row, { justifyContent: 'space-between' }]}><Text style={{ color: t.ink, fontWeight: '700' }}>Encaissé</Text><Delta pc={S.delta} /></View>
        <RevChart v={S.v} buckets={info.buckets} multi={pickDays} onMulti={setPickDays} />
        <View style={[st.row, { justifyContent: 'space-between', marginTop: 10 }]}>
          <Pressable onPress={() => setPickDays(pickDays ? null : [])}><Text style={{ color: t.blue, fontWeight: '600' }}>{pickDays ? 'Terminer la sélection' : 'Sélectionner des jours'}</Text></Pressable>
          {picked !== null ? <Text style={{ color: t.ink, fontWeight: '700' }}>{pickDays!.length} sélectionné(s) · {eur(picked)}</Text> : null}
        </View>
        <ToggleRow label="Plage réelle" sub={real ? `Première coupe 09:12 · dernière fin 18:47 · ${hm(18 * 60 + 47 - (9 * 60 + 12))} travaillées` : 'Utilise les heures de travail réelles au lieu des horaires prévus'} value={real} onChange={setReal} last />
      </Card>

      <View style={[st.row, { justifyContent: 'space-between', marginTop: 20 }]}>
        <Text style={st.h3(t)}>Historique</Text>
      </View>
      <Segmented value={hist} onChange={setHist} items={[{ key: 'svc', label: 'Prestations' }, { key: 'sales', label: 'Encaissements' }]} />
      <Card style={{ marginTop: 10, paddingVertical: 4 }}>
        {hist === 'svc' ? (mine.length ? mine.map((a, i) => (
          <View key={a.id} style={[st.row, { paddingVertical: 11, borderBottomWidth: i < mine.length - 1 ? StyleSheet.hairlineWidth : 0, borderColor: t.sep }]}>
            <Text style={{ color: t.grey, width: 46 }}>{hm(a.start)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontWeight: '600' }}>{a.client}</Text>
              <Text style={{ color: t.grey, fontSize: 13 }}>{[a.service, ...(a.extras ?? [])].join(' + ')}</Text>
              {a.prepaid ? <View style={{ marginTop: 4 }}><Pill label="✓ Payé d'avance" tone="green" /></View> : null}
            </View>
            <Text style={{ color: a.noShow ? t.red : t.ink, fontWeight: '700' }}>{a.noShow ? 'Absent' : eur(a.priceCents)}</Text>
          </View>
        )) : <Text style={{ color: t.grey, padding: 14, textAlign: 'center' }}>Aucune prestation sur cette période</Text>) : (sales.length ? sales.map((x, i) => (
          <View key={x.id} style={[st.row, { paddingVertical: 11, borderBottomWidth: i < sales.length - 1 ? StyleSheet.hairlineWidth : 0, borderColor: t.sep }]}>
            <Text style={{ color: t.grey, width: 46 }}>{x.time}</Text>
            <View style={{ flex: 1 }}><Text style={{ color: t.ink, fontWeight: '600' }}>#{x.ticket} · {x.client}</Text><Text style={{ color: t.grey, fontSize: 13 }}>{x.items} · avant sa coupe</Text></View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}><Text style={{ color: t.ink, fontWeight: '700' }}>{eur(x.priceCents)}</Text><Pill label={x.method} tone={x.method === 'CB' ? 'blue' : 'grey'} /></View>
          </View>
        )) : <Text style={{ color: t.grey, padding: 14, textAlign: 'center' }}>Aucun encaissement sur cette période</Text>)}
      </Card>

      <Text style={[st.h3(t), { marginTop: 20 }]}>Horaires</Text>
      <Card style={{ paddingVertical: 4 }}>
        {days.map((d, i) => {
          const off = i === 0 || i === 6;
          const br = BREAKS[id]?.[0];
          return (
            <View key={d} style={[st.row, { justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: i < 6 ? StyleSheet.hairlineWidth : 0, borderColor: t.sep }]}>
              <Text style={{ color: t.ink, width: 44, fontWeight: '600' }}>{d}</Text>
              <Text style={{ color: off ? t.grey : t.ink, flex: 1 }}>{off ? 'Repos' : `${hm(HOURS[id][0])} – ${hm(HOURS[id][1])}`}</Text>
              {!off && br ? <Text style={{ color: t.grey, fontSize: 12.5 }}>Pause {hm(br[0])}–{hm(br[1])}</Text> : null}
            </View>
          );
        })}
      </Card>

      <Text style={[st.h3(t), { marginTop: 20 }]}>Prestations réalisées</Text>
      <View style={st.wrap}>
        {CATALOG.filter((c) => c.kind !== 'product').map((c) => <View key={c.id} style={{ marginRight: 6, marginBottom: 6 }}><Pill label={`✓ ${c.name} · ${eur(c.priceCents)}`} tone="blue" /></View>)}
      </View>
    </Page>
    {toastNode}
    </View>
  );
}

const base = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  dateField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  nav: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
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

const st = { ...base, h3: (t: { ink: string }) => ({ color: t.ink, fontSize: 17, fontWeight: '700' as const, marginBottom: 10 }) };
