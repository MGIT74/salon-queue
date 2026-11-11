// MAQUETTE — Dashboard, partie gestion (dashboard.html) : file d'attente (transférer, annuler, terminer un oublié,
// ajouter à la main, réglages du timer), catalogue (formulaire, catégories et couleurs, modification en masse, stock,
// archiver / restaurer / supprimer), rendez-vous en liste (filtres, pages, sélection multiple, exports / import,
// paramètres et modèles d'emails), clients (pages, filtres, sélection, ajout, fiche modifiable, messages, exports /
// import), marketing (fidélité, cartes cadeaux, designs, messages et SMS), salons, compte, réglages, assistant IA,
// bandeau « super admin ». Tout est fictif : rien n'est envoyé.
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { APPTS, CATALOG, CATEGORIES, CLIENTS_LIST, CatalogItem, GIFT_CARDS, HOURS, QUEUE_ITEMS, SALONS, SERVICES, STAFF, eur, hm } from './data';
import { Avatar, Bubbles, Card, Chips, Field, Go, Pill, RowLink, Segmented, Sheet, SoftButton, Stepper, ToggleRow, useT, useToast } from './ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function Page({ title, right, children, toast }: { title?: string; right?: React.ReactNode; children: React.ReactNode; toast?: React.ReactNode }) {
  const { t } = useT();
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {title ? (
          <View style={[st.row, { justifyContent: 'space-between', marginBottom: 14 }]}>
            <Text style={{ color: t.ink, fontSize: 26, fontWeight: '700', flexShrink: 1 }}>{title}</Text>{right}
          </View>
        ) : null}
        {children}
      </ScrollView>
      {toast}
    </View>
  );
}
function H3({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  return <Text style={{ color: t.ink, fontSize: 17, fontWeight: '700', marginTop: 20, marginBottom: 10 }}>{children}</Text>;
}
function AddBtn({ label = '+ Ajouter', onPress }: { label?: string; onPress: () => void }) {
  const { t } = useT();
  return <Pressable onPress={onPress} style={[st.addBtn, { backgroundColor: t.blue }]}><Text style={{ color: '#fff', fontWeight: '700' }}>{label}</Text></Pressable>;
}
function Danger({ label, onPress }: { label: string; onPress: () => void }) {
  const { t } = useT();
  return <Pressable onPress={onPress} style={[st.danger, { backgroundColor: t.red }]}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{label}</Text></Pressable>;
}

/* =============================================================== File d'attente */

type QItem = (typeof QUEUE_ITEMS)[number];
export function FileSec() {
  const { t } = useT();
  const [toastNode, toast] = useToast();
  const [items, setItems] = useState<QItem[]>(QUEUE_ITEMS);
  const [me, setMe] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<QItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [nw, setNw] = useState({ client: '', svc: SERVICES[0].id, barber: STAFF[0].id });
  const [timer, setTimer] = useState<Record<string, { on: boolean; early: number; auto: boolean }>>(Object.fromEntries(STAFF.map((s) => [s.id, { on: true, early: 10, auto: true }])));
  const waiting = items.filter((q) => q.status === 'waiting' && (!me || q.barberId === me));
  const chair = items.filter((q) => q.status === 'in_progress');
  const upd = (id: string, p: Partial<QItem>) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  return (
    <Page toast={toastNode} title="File d'attente" right={<Pressable onPress={() => setCfgOpen(true)} style={[st.iconBtn, { backgroundColor: t.fill }]}><Ionicons name="settings-outline" size={20} color={t.ink} /></Pressable>}>
      <View style={[st.wrap, { gap: 10 }]}>
        {[[String(items.filter((q) => q.status === 'waiting').length), 'en attente'], ['50 min', 'de file'], ['124,90 €', "encaissé aujourd'hui"], [String(STAFF.length), 'coiffeurs en poste']].map(([v, k]) => (
          <Card key={k} style={{ width: '48%', flexGrow: 1 }}><Text style={{ color: t.ink, fontSize: 22, fontWeight: '700' }}>{v}</Text><Text style={{ color: t.grey, fontSize: 13 }}>{k}</Text></Card>
        ))}
      </View>
      <View style={[st.row, { marginTop: 18, justifyContent: 'space-between' }]}>
        <View style={st.row}><Text style={{ color: t.grey }}>Je suis</Text><Bubbles people={STAFF} value={me} onChange={(id) => setMe(me === id ? null : id)} size={36} /></View>
        <AddBtn label="+ Client" onPress={() => setAddOpen(true)} />
      </View>
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
                <Text style={{ color: t.orange, fontSize: 13 }}>dans ~{q.waitMin ?? 10} min</Text>
              </View>
            </View>
            <View style={[st.row, { marginTop: 12 }]}>
              <View style={{ flex: 1 }}><SoftButton label="Démarrer" onPress={() => { upd(q.id, { status: 'in_progress' }); toast(`${q.client} démarré avec ${b.name}`); }} /></View>
              <View style={{ flex: 1 }}><SoftButton label="Transférer" onPress={() => setTransfer(q)} /></View>
              <Pressable onPress={() => { setItems((l) => l.filter((x) => x.id !== q.id)); toast(`${q.client} marqué absent`); }}><Text style={{ color: t.grey, fontWeight: '600' }}>Absent</Text></Pressable>
            </View>
          </Card>
        );
      })}
      <Text style={[st.section, { color: t.grey }]}>AU FAUTEUIL</Text>
      {chair.map((q) => {
        const b = STAFF.find((s) => s.id === q.barberId)!;
        return (
          <Card key={q.id} style={{ marginBottom: 10 }}>
            <View style={st.row}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.green }} />
              <Text style={{ color: t.ink, fontWeight: '600', flex: 1 }}>{b.name} — {q.client}</Text>
              <Text style={{ color: t.grey }}>{q.service}</Text>
            </View>
            <View style={[st.row, { marginTop: 10 }]}>
              <View style={{ flex: 1 }}><SoftButton label="Terminer (oublié)" onPress={() => { upd(q.id, { status: 'done' }); toast(`${q.client} terminé · à encaisser`); }} /></View>
              <View style={{ flex: 1 }}><SoftButton label="Annuler la coupe" danger onPress={() => { upd(q.id, { status: 'waiting' }); toast(`Coupe de ${q.client} annulée · remis en attente`); }} /></View>
            </View>
          </Card>
        );
      })}

      <Sheet visible={!!transfer} onClose={() => setTransfer(null)} title={`Transférer ${transfer?.client ?? ''}`}>
        <Text style={{ color: t.grey, textAlign: 'center', marginBottom: 10 }}>Le client passe chez un autre coiffeur et démarre tout de suite.</Text>
        {STAFF.filter((s) => s.id !== transfer?.barberId).map((s) => (
          <Pressable key={s.id} onPress={() => { if (transfer) { upd(transfer.id, { barberId: s.id, status: 'in_progress' }); toast(`${transfer.client} transféré à ${s.name} et démarré`); } setTransfer(null); }} style={[st.row, st.line, { borderColor: t.sep }]}>
            <Avatar initials={s.initials} color={s.color} size={30} /><Text style={{ color: t.ink, flex: 1, fontSize: 16 }}>Transférer et démarrer avec {s.name}</Text>
          </Pressable>
        ))}
      </Sheet>
      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Ajouter un client à la file">
        <Field label="Nom du client" value={nw.client} onChangeText={(v) => setNw({ ...nw, client: v })} />
        <Text style={st.lbl(t)}>Prestation</Text>
        <Chips items={SERVICES.slice(0, 4).map((s) => ({ key: s.id, label: s.name }))} value={[nw.svc]} onToggle={(k) => setNw({ ...nw, svc: k })} />
        <Text style={st.lbl(t)}>Coiffeur</Text>
        <Chips items={STAFF.map((s) => ({ key: s.id, label: s.name, color: s.color }))} value={[nw.barber]} onToggle={(k) => setNw({ ...nw, barber: k })} />
        <View style={{ height: 16 }} />
        <Go label="Ajouter à la file" disabled={!nw.client} onPress={() => {
          const s = SERVICES.find((x) => x.id === nw.svc)!;
          setItems((l) => [...l, { id: 'm' + Date.now(), client: nw.client, service: s.name, minutes: s.minutes, priceCents: s.priceCents, barberId: nw.barber, status: 'waiting', kind: 'Sans RDV', waitMin: 40 }]);
          setAddOpen(false); setNw({ ...nw, client: '' }); toast(`${nw.client} ajouté à la file`);
        }} />
      </Sheet>
      <Sheet visible={cfgOpen} onClose={() => setCfgOpen(false)} title="Réglages de la file et du timer">
        {STAFF.map((s) => (
          <Card key={s.id} style={{ backgroundColor: t.fill, marginBottom: 10 }}>
            <View style={st.row}><Avatar initials={s.initials} color={s.color} size={26} /><Text style={{ color: t.ink, fontWeight: '700' }}>{s.name}</Text></View>
            <ToggleRow label="Timer activé" value={timer[s.id].on} onChange={(v) => setTimer({ ...timer, [s.id]: { ...timer[s.id], on: v } })} />
            <View style={[st.row, st.line, { borderColor: t.sep, justifyContent: 'space-between' }]}>
              <Text style={{ color: t.ink, flex: 1 }}>Démarrage anticipé possible</Text>
              <Stepper value={timer[s.id].early} step={5} max={30} format={(v) => `${v} min`} onChange={(v) => setTimer({ ...timer, [s.id]: { ...timer[s.id], early: v } })} />
            </View>
            <ToggleRow label="Démarrer seul un RDV oublié" sub="À l'heure prévue, si personne n'a appuyé" value={timer[s.id].auto} onChange={(v) => setTimer({ ...timer, [s.id]: { ...timer[s.id], auto: v } })} last />
          </Card>
        ))}
        <Go label="Enregistrer" onPress={() => { setCfgOpen(false); toast('Réglages enregistrés'); }} />
      </Sheet>
    </Page>
  );
}

/* =============================================================== Catalogue */

type CItem = CatalogItem & { cat?: string; vat?: number; online?: boolean; archived?: boolean; barcode?: string };
export function CatalogSec({ kind }: { kind: 'svc' | 'extra' | 'product' }) {
  const { t } = useT();
  const [toastNode, toast] = useToast();
  const [list, setList] = useState<CItem[]>(() => CATALOG.filter((c) => c.kind === kind).map((c) => ({ ...c, cat: SERVICES.find((s) => s.name === c.name)?.cat ?? 'coupes', vat: 20, online: true })));
  const [cats, setCats] = useState(CATEGORIES);
  const [archived, setArchived] = useState(false);
  const [select, setSelect] = useState<string[] | null>(null);
  const [form, setForm] = useState<CItem | null>(null);
  const [catMgr, setCatMgr] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [bulkPatch, setBulkPatch] = useState<{ cat?: string; vat?: number; online?: boolean; price?: string }>({});
  const title = kind === 'svc' ? 'Prestations' : kind === 'extra' ? 'Suppléments' : 'Produits';
  const shown = list.filter((c) => !!c.archived === archived);
  const save = (c: CItem) => { setList((l) => (l.some((x) => x.id === c.id) ? l.map((x) => (x.id === c.id ? c : x)) : [...l, c])); setForm(null); toast(`${c.name} enregistré`); };
  const swatches = ['#0a84ff', '#ff9f0a', '#30a46c', '#bf5af2', '#e5484d', '#64d2ff', '#ffd60a', '#8e8e93'];
  return (
    <Page toast={toastNode} title={title} right={<AddBtn onPress={() => setForm({ id: 'n' + Date.now(), name: '', priceCents: 2000, minutes: kind === 'svc' ? 30 : undefined, emoji: kind === 'product' ? '🧴' : '✂️', kind, cat: 'coupes', vat: 20, online: true, stock: kind === 'product' ? 10 : undefined })} />}>
      <View style={[st.row, { flexWrap: 'wrap', gap: 8 }]}>
        <Segmented style={{ flex: 1, minWidth: 200 }} value={archived ? 'arch' : 'act'} onChange={(v) => setArchived(v === 'arch')} items={[{ key: 'act', label: 'Actifs' }, { key: 'arch', label: 'Archivés' }]} />
        {kind === 'svc' ? <Pressable onPress={() => setCatMgr(true)} style={[st.iconBtn, { backgroundColor: t.fill, width: undefined, paddingHorizontal: 12 }]}><Text style={{ color: t.ink, fontWeight: '600' }}>Catégories</Text></Pressable> : null}
        <Pressable onPress={() => setSelect(select ? null : [])} style={[st.iconBtn, { backgroundColor: select ? t.blue : t.fill, width: undefined, paddingHorizontal: 12 }]}><Text style={{ color: select ? '#fff' : t.ink, fontWeight: '600' }}>{select ? 'Terminé' : 'Sélection'}</Text></Pressable>
      </View>
      {select ? (
        <View style={[st.row, { marginTop: 10 }]}>
          <Text style={{ color: t.grey, flex: 1 }}>{select.length} sélectionné{select.length > 1 ? 's' : ''}</Text>
          <Pressable onPress={() => setSelect(select.length === shown.length ? [] : shown.map((c) => c.id))}><Text style={{ color: t.blue, fontWeight: '600' }}>Tout</Text></Pressable>
          <Pressable disabled={!select.length} onPress={() => setBulk(true)} style={{ opacity: select.length ? 1 : 0.4 }}><Text style={{ color: t.blue, fontWeight: '700' }}>Modifier la sélection</Text></Pressable>
        </View>
      ) : null}
      <Card style={{ paddingVertical: 4, marginTop: 12 }}>
        {shown.length === 0 ? <Text style={{ color: t.grey, padding: 14, textAlign: 'center' }}>{archived ? 'Aucun élément archivé' : 'Aucun élément'}</Text> : null}
        {shown.map((c, i) => {
          const sel = select?.includes(c.id);
          const color = cats.find((x) => x.id === c.cat)?.color;
          return (
            <Pressable key={c.id} onPress={() => (select ? setSelect(sel ? select.filter((x) => x !== c.id) : [...select, c.id]) : setForm(c))} style={[st.row, { paddingVertical: 12, borderBottomWidth: i < shown.length - 1 ? StyleSheet.hairlineWidth : 0, borderColor: t.sep }]}>
              {select ? <Ionicons name={sel ? 'checkbox' : 'square-outline'} size={22} color={t.blue} /> : null}
              <View style={[st.emoji, { backgroundColor: t.blueSoft }]}><Text style={{ fontSize: 22 }}>{c.emoji}</Text></View>
              <View style={{ flex: 1 }}>
                <View style={[st.row, { gap: 6 }]}>{color && kind === 'svc' ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}<Text style={{ color: t.ink, fontWeight: '600', fontSize: 15.5 }}>{c.name}</Text></View>
                <Text style={{ color: t.grey, fontSize: 13 }}>{c.minutes ? `${c.minutes} min · ` : ''}TVA {c.vat} %{c.online ? ' · en ligne' : ' · caisse seulement'}{c.stock !== undefined ? ` · stock ${c.stock}` : ''}</Text>
              </View>
              <Text style={{ color: t.ink, fontWeight: '700' }}>{eur(c.priceCents)}</Text>
            </Pressable>
          );
        })}
      </Card>

      <Sheet visible={!!form} onClose={() => setForm(null)} title={form && list.some((x) => x.id === form.id) ? 'Modifier' : `Nouveau · ${title.toLowerCase()}`}>
        {form ? (
          <View>
            <Pressable style={[st.photo, { backgroundColor: t.fill }]}><Text style={{ fontSize: 40 }}>{form.emoji}</Text><Text style={{ color: t.blue, fontWeight: '600' }}>Changer la photo</Text></Pressable>
            <Field label="Nom" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
            <View style={[st.row, st.line, { borderColor: t.sep, justifyContent: 'space-between' }]}><Text style={{ color: t.ink }}>Prix</Text><Stepper value={form.priceCents} step={50} format={eur} onChange={(v) => setForm({ ...form, priceCents: v })} /></View>
            {kind === 'svc' ? <View style={[st.row, st.line, { borderColor: t.sep, justifyContent: 'space-between' }]}><Text style={{ color: t.ink }}>Durée</Text><Stepper value={form.minutes ?? 30} step={5} min={5} format={(v) => `${v} min`} onChange={(v) => setForm({ ...form, minutes: v })} /></View> : null}
            {kind === 'product' ? (
              <>
                <View style={[st.row, st.line, { borderColor: t.sep, justifyContent: 'space-between' }]}><Text style={{ color: t.ink }}>Stock</Text><Stepper value={form.stock ?? 0} onChange={(v) => setForm({ ...form, stock: v })} /></View>
                <Field label="Code-barres" style={{ marginTop: 12 }} value={form.barcode ?? ''} onChangeText={(v) => setForm({ ...form, barcode: v })} keyboardType="number-pad" placeholder="Scannez ou tapez le code" />
              </>
            ) : null}
            {kind === 'svc' ? (<><Text style={st.lbl(t)}>Catégorie</Text><Chips items={cats.map((c) => ({ key: c.id, label: c.name, color: c.color }))} value={[form.cat ?? '']} onToggle={(k) => setForm({ ...form, cat: k })} /></>) : null}
            <Text style={st.lbl(t)}>TVA</Text>
            <Chips items={[{ key: '20', label: '20 %' }, { key: '10', label: '10 %' }, { key: '5.5', label: '5,5 %' }]} value={[String(form.vat)]} onToggle={(k) => setForm({ ...form, vat: Number(k) })} />
            <ToggleRow label="Proposé en ligne" sub="Sinon : caisse seulement" value={!!form.online} onChange={(v) => setForm({ ...form, online: v })} last />
            <View style={{ height: 14 }} />
            <Go label="Enregistrer" disabled={!form.name.trim()} onPress={() => save(form)} />
            {list.some((x) => x.id === form.id) ? (
              <View style={[st.row, { marginTop: 10 }]}>
                <View style={{ flex: 1 }}><SoftButton label={form.archived ? 'Restaurer' : 'Archiver'} onPress={() => { save({ ...form, archived: !form.archived }); }} /></View>
                <View style={{ flex: 1 }}><SoftButton label="Supprimer" danger onPress={() => { setList((l) => l.filter((x) => x.id !== form.id)); setForm(null); toast(`${form.name} supprimé`); }} /></View>
              </View>
            ) : null}
          </View>
        ) : null}
      </Sheet>
      <Sheet visible={catMgr} onClose={() => setCatMgr(false)} title="Catégories">
        {cats.map((c, i) => (
          <View key={c.id} style={[st.line, { borderColor: t.sep }]}>
            <TextInput value={c.name} onChangeText={(v) => setCats(cats.map((x, j) => (j === i ? { ...x, name: v } : x)))} style={{ color: t.ink, fontSize: 16, fontWeight: '600', marginBottom: 8 }} />
            <View style={[st.row, { gap: 8 }]}>
              {swatches.map((sw) => <Pressable key={sw} onPress={() => setCats(cats.map((x, j) => (j === i ? { ...x, color: sw } : x)))} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: sw, borderWidth: c.color === sw ? 3 : 0, borderColor: t.ink }} />)}
              <Pressable onPress={() => setCats(cats.filter((_, j) => j !== i))} style={{ marginLeft: 'auto' }}><Ionicons name="trash-outline" size={19} color={t.red} /></Pressable>
            </View>
          </View>
        ))}
        <Pressable onPress={() => setCats([...cats, { id: 'c' + Date.now(), name: 'Nouvelle catégorie', color: '#8e8e93' }])} style={{ marginVertical: 12 }}><Text style={{ color: t.blue, fontWeight: '600' }}>+ Ajouter une catégorie</Text></Pressable>
        <Go label="Enregistrer" onPress={() => { setCatMgr(false); toast('Catégories enregistrées'); }} />
      </Sheet>
      <Sheet visible={bulk} onClose={() => setBulk(false)} title="Modifier la sélection">
        {kind === 'svc' ? (<><Text style={st.lbl(t)}>Catégorie</Text><Chips items={[{ key: '', label: '— Ne pas changer —' }, ...cats.map((c) => ({ key: c.id, label: c.name, color: c.color }))]} value={[bulkPatch.cat ?? '']} onToggle={(k) => setBulkPatch({ ...bulkPatch, cat: k || undefined })} /></>) : null}
        <Text style={st.lbl(t)}>TVA</Text>
        <Chips items={[{ key: '', label: '— Ne pas changer —' }, { key: '20', label: '20 %' }, { key: '10', label: '10 %' }]} value={[bulkPatch.vat ? String(bulkPatch.vat) : '']} onToggle={(k) => setBulkPatch({ ...bulkPatch, vat: k ? Number(k) : undefined })} />
        <Text style={st.lbl(t)}>Réservation en ligne</Text>
        <Chips items={[{ key: '', label: '— Ne pas changer —' }, { key: 'on', label: 'Proposé en ligne' }, { key: 'off', label: 'Caisse seulement' }]} value={[bulkPatch.online === undefined ? '' : bulkPatch.online ? 'on' : 'off']} onToggle={(k) => setBulkPatch({ ...bulkPatch, online: k === '' ? undefined : k === 'on' })} />
        <Field label="Nouveau prix" style={{ marginTop: 14 }} value={bulkPatch.price ?? ''} onChangeText={(v) => setBulkPatch({ ...bulkPatch, price: v })} keyboardType="decimal-pad" placeholder="Laisser vide pour ne pas changer" />
        <Text style={{ color: t.grey, fontSize: 12.5, marginBottom: 12 }}>S'applique à tous les éléments cochés.</Text>
        <Go label="Appliquer" onPress={() => {
          const price = bulkPatch.price ? Math.round(parseFloat(bulkPatch.price.replace(',', '.')) * 100) : undefined;
          setList((l) => l.map((c) => (select?.includes(c.id) ? { ...c, cat: bulkPatch.cat ?? c.cat, vat: bulkPatch.vat ?? c.vat, online: bulkPatch.online ?? c.online, priceCents: price ?? c.priceCents } : c)));
          setBulk(false); setSelect(null); setBulkPatch({}); toast('Sélection modifiée');
        }} />
      </Sheet>
    </Page>
  );
}

/* =============================================================== Rendez-vous en liste */

export function RdvList() {
  const { t } = useT();
  const [toastNode, toast] = useToast();
  const [rows, setRows] = useState(() => [...APPTS, ...APPTS.map((a) => ({ ...a, id: a.id + 'b', start: a.start + 30 }))].map((a, i) => ({ ...a, day: i % 4, status: a.noShow ? 'absent' : i % 9 === 0 ? 'annulé' : 'confirmé' })));
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming');
  const [barber, setBarber] = useState('all');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<null | 'cancel' | 'delete'>(null);
  const [settings, setSettings] = useState(false);
  const [tpl, setTpl] = useState<string | null>(null);
  const [cfg, setCfg] = useState({ minDelay: 60, cancelUntil: 12, step: 15, reminder: true, sms: false, online: true });
  const list = rows.filter((r) => (filter === 'cancelled' ? r.status === 'annulé' : filter === 'past' ? r.day === 0 && r.start < 11 * 60 + 20 : r.status !== 'annulé'))
    .filter((r) => barber === 'all' || r.barberId === barber).sort((a, b) => a.day - b.day || a.start - b.start);
  const shown = list.slice(0, page * 8);
  const dayLbl = (d: number) => (d === 0 ? "Aujourd'hui" : d === 1 ? 'Demain' : new Date(Date.now() + d * 86400000).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }));
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 40 }}>
        <View style={[st.row, { flexWrap: 'wrap', gap: 8 }]}>
          <Pressable onPress={() => setSettings(true)} style={[st.outline, { borderColor: t.sep }]}><Ionicons name="settings-outline" size={16} color={t.ink} /><Text style={{ color: t.ink, fontWeight: '600' }}>Paramètres</Text></Pressable>
          <Pressable onPress={() => toast('Export CSV prêt : rendez-vous.csv')} style={[st.outline, { borderColor: t.sep }]}><Ionicons name="download-outline" size={16} color={t.ink} /><Text style={{ color: t.ink, fontWeight: '600' }}>CSV</Text></Pressable>
          <Pressable onPress={() => toast('Export PDF prêt : rendez-vous.pdf')} style={[st.outline, { borderColor: t.sep }]}><Ionicons name="document-outline" size={16} color={t.ink} /><Text style={{ color: t.ink, fontWeight: '600' }}>PDF</Text></Pressable>
          <Pressable onPress={() => toast('Import : choisissez un fichier CSV (date, heure, client, prestation, coiffeur)')} style={[st.outline, { borderColor: t.sep }]}><Ionicons name="cloud-upload-outline" size={16} color={t.ink} /><Text style={{ color: t.ink, fontWeight: '600' }}>Importer</Text></Pressable>
        </View>
        <Segmented style={{ marginTop: 12 }} value={filter} onChange={(v) => { setFilter(v); setPage(1); setSel([]); }} items={[{ key: 'upcoming', label: 'À venir' }, { key: 'past', label: 'Passés' }, { key: 'cancelled', label: 'Annulés' }]} />
        <View style={{ marginTop: 10 }}><Chips items={[{ key: 'all', label: 'Tous' }, ...STAFF.map((s) => ({ key: s.id, label: s.name, color: s.color }))]} value={[barber]} onToggle={(k) => { setBarber(k); setPage(1); }} /></View>
        {sel.length ? (
          <View style={[st.row, { marginTop: 12, backgroundColor: t.blueSoft, borderRadius: 12, padding: 10 }]}>
            <Text style={{ color: t.blue, fontWeight: '700', flex: 1 }}>{sel.length} sélectionné{sel.length > 1 ? 's' : ''}</Text>
            <Pressable onPress={() => setConfirm('cancel')}><Text style={{ color: t.ink, fontWeight: '700' }}>Annuler</Text></Pressable>
            <Pressable onPress={() => setConfirm('delete')}><Text style={{ color: t.red, fontWeight: '700' }}>Supprimer</Text></Pressable>
          </View>
        ) : null}
        <Card style={{ paddingVertical: 4, marginTop: 12 }}>
          <Pressable onPress={() => setSel(sel.length === shown.length ? [] : shown.map((r) => r.id))} style={[st.row, { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.sep }]}>
            <Ionicons name={sel.length && sel.length === shown.length ? 'checkbox' : 'square-outline'} size={20} color={t.blue} /><Text style={{ color: t.grey }}>Tout sélectionner · {list.length} RDV</Text>
          </Pressable>
          {shown.map((r, i) => {
            const b = STAFF.find((s) => s.id === r.barberId)!;
            const on = sel.includes(r.id);
            return (
              <Pressable key={r.id} onPress={() => setSel(on ? sel.filter((x) => x !== r.id) : [...sel, r.id])} style={[st.row, { paddingVertical: 11, borderBottomWidth: i < shown.length - 1 ? StyleSheet.hairlineWidth : 0, borderColor: t.sep }]}>
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={t.blue} />
                <View style={{ width: 70 }}><Text style={{ color: t.ink, fontWeight: '700' }}>{hm(r.start)}</Text><Text style={{ color: t.grey, fontSize: 12 }}>{dayLbl(r.day)}</Text></View>
                <View style={{ flex: 1 }}><Text style={{ color: t.ink, fontWeight: '600' }} numberOfLines={1}>{r.client}</Text><Text style={{ color: t.grey, fontSize: 12.5 }} numberOfLines={1}>{r.service} · {r.online ? 'en ligne' : 'au salon'}</Text></View>
                <Avatar initials={b.initials} color={b.color} size={24} />
                <Pill label={r.status} tone={r.status === 'annulé' ? 'red' : r.status === 'absent' ? 'orange' : 'green'} />
              </Pressable>
            );
          })}
        </Card>
        {shown.length < list.length ? <Pressable onPress={() => setPage(page + 1)} style={{ alignItems: 'center', marginTop: 12 }}><Text style={{ color: t.blue, fontWeight: '700' }}>Voir plus ({list.length - shown.length})</Text></Pressable> : null}
        {filter !== 'upcoming' ? <Pressable onPress={() => setFilter('upcoming')} style={{ alignItems: 'center', marginTop: 12 }}><Text style={{ color: t.blue, fontWeight: '600' }}>Revenir aux RDV à venir</Text></Pressable> : null}
      </ScrollView>
      {toastNode}
      <Sheet visible={!!confirm} onClose={() => setConfirm(null)} title={confirm === 'delete' ? `Supprimer ${sel.length} RDV ?` : `Annuler ${sel.length} RDV ?`}>
        <Text style={{ color: t.grey, textAlign: 'center', marginBottom: 16 }}>{confirm === 'delete' ? 'Ils disparaissent sans prévenir les clients (pour nettoyer un import, par exemple).' : 'Chaque client reçoit un email d\'annulation et le créneau est libéré.'}</Text>
        <Danger label={confirm === 'delete' ? 'Supprimer' : 'Annuler les RDV'} onPress={() => {
          setRows((l) => (confirm === 'delete' ? l.filter((r) => !sel.includes(r.id)) : l.map((r) => (sel.includes(r.id) ? { ...r, status: 'annulé' } : r))));
          toast(`${sel.length} RDV ${confirm === 'delete' ? 'supprimés' : 'annulés'}`); setSel([]); setConfirm(null);
        }} />
      </Sheet>
      <Sheet visible={settings} onClose={() => setSettings(false)} title="Paramètres des RDV">
        <ToggleRow label="Réservation en ligne ouverte" value={cfg.online} onChange={(v) => setCfg({ ...cfg, online: v })} />
        <View style={[st.row, st.line, { borderColor: t.sep, justifyContent: 'space-between' }]}><Text style={{ color: t.ink, flex: 1 }}>Délai minimum avant un RDV</Text><Stepper value={cfg.minDelay} step={15} format={(v) => `${v} min`} onChange={(v) => setCfg({ ...cfg, minDelay: v })} /></View>
        <View style={[st.row, st.line, { borderColor: t.sep, justifyContent: 'space-between' }]}><Text style={{ color: t.ink, flex: 1 }}>Annulation possible jusqu'à</Text><Stepper value={cfg.cancelUntil} step={1} format={(v) => `${v} h avant`} onChange={(v) => setCfg({ ...cfg, cancelUntil: v })} /></View>
        <Text style={st.lbl(t)}>Pas des créneaux</Text>
        <Chips items={[{ key: '5', label: '5 minutes' }, { key: '10', label: '10 minutes' }, { key: '15', label: '15 minutes' }]} value={[String(cfg.step)]} onToggle={(k) => setCfg({ ...cfg, step: Number(k) })} />
        <ToggleRow label="Rappel par email la veille" value={cfg.reminder} onChange={(v) => setCfg({ ...cfg, reminder: v })} />
        <ToggleRow label="Rappel par SMS" value={cfg.sms} onChange={(v) => setCfg({ ...cfg, sms: v })} last />
        <H3>Modèles d'emails</H3>
        {['Confirmation', 'Rappel', 'Annulation', 'Déplacement d\'un RDV', 'Votre tour approche', 'Création de compte', 'Fermeture du salon'].map((x, i, a) => <RowLink key={x} label={x} onPress={() => setTpl(x)} last={i === a.length - 1} />)}
        <View style={{ height: 14 }} />
        <Go label="Enregistrer" onPress={() => { setSettings(false); toast('Paramètres enregistrés'); }} />
      </Sheet>
      <Sheet visible={!!tpl} onClose={() => setTpl(null)} title={tpl ?? ''}>
        <Field label="Sujet" defaultValue={`${tpl} — {{salon}}`} />
        <Field label="Message" multiline defaultValue={'Bonjour {{client_name}},\n\nVotre rendez-vous du {{when}} avec {{barber}}.\n\nÀ bientôt,\n{{salon}}'} />
        <Text style={{ color: t.grey, fontSize: 12.5, marginBottom: 12 }}>Variables : {'{{client_name}} {{when}} {{barber}} {{salon}} {{cancel_link}}'}</Text>
        <SoftButton label="M'envoyer un email de test" onPress={() => { setTpl(null); toast('Email de test envoyé à contact@thebarberone.fr'); }} />
        <View style={{ height: 10 }} />
        <Go label="Enregistrer le modèle" onPress={() => setTpl(null)} />
      </Sheet>
    </View>
  );
}

/* =============================================================== Coiffeurs : éditeurs */

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const SWATCHES = ['#e5484d', '#0a84ff', '#30a46c', '#ff9f0a', '#bf5af2', '#64d2ff', '#ff375f', '#8e8e93'];

export function AddBarberSheet({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: (name: string) => void }) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [color, setColor] = useState(SWATCHES[3]);
  return (
    <Sheet visible={visible} onClose={onClose} title="Ajouter un coiffeur">
      <Field label="Prénom" value={name} onChangeText={setName} />
      <Field label="Code PIN (4 chiffres)" value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" />
      <Text style={st.lbl(t)}>Couleur</Text>
      <View style={[st.row, { gap: 10, flexWrap: 'wrap' }]}>{SWATCHES.map((c) => <Pressable key={c} onPress={() => setColor(c)} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: t.ink }} />)}</View>
      <View style={{ height: 16 }} />
      <Go label="Ajouter" disabled={!name || pin.length !== 4} onPress={() => { onDone(name); setName(''); setPin(''); }} />
    </Sheet>
  );
}

export function BarberEditors({ id, toast }: { id: string; toast: (m: string) => void }) {
  const { t } = useT();
  const b = STAFF.find((s) => s.id === id)!;
  const [open, setOpen] = useState<null | 'profile' | 'leave' | 'hours' | 'caps'>(null);
  const [color, setColor] = useState(b.color);
  const [hours, setHours] = useState(DAYS.map((_, i) => ({ on: i > 0 && i < 6, start: HOURS[id][0], end: HOURS[id][1], breaks: [[12 * 60 + 30, 13 * 60 + 30]] as [number, number][] })));
  const [leaves, setLeaves] = useState([{ from: 'jeu. 12 nov.', to: 'ven. 13 nov.', type: 'Congé' }]);
  const [lv, setLv] = useState({ days: 2, type: 'Congé' });
  const [caps, setCaps] = useState(Object.fromEntries(CATALOG.filter((c) => c.kind !== 'product').map((c) => [c.id, { on: true, price: c.priceCents }])));
  return (
    <>
      <View style={[st.row, { gap: 10, marginTop: 16, alignSelf: 'stretch', flexWrap: 'wrap' }]}>
        <View style={{ flex: 1, minWidth: 130 }}><SoftButton label="Modifier le profil" onPress={() => setOpen('profile')} /></View>
        <View style={{ flex: 1, minWidth: 130 }}><SoftButton label="Congés · sans RDV" onPress={() => setOpen('leave')} /></View>
        <View style={{ flex: 1, minWidth: 130 }}><SoftButton label="Horaires" onPress={() => setOpen('hours')} /></View>
        <View style={{ flex: 1, minWidth: 130 }}><SoftButton label="Prestations et tarifs" onPress={() => setOpen('caps')} /></View>
      </View>
      <Sheet visible={open === 'profile'} onClose={() => setOpen(null)} title={`Profil de ${b.name}`}>
        <View style={{ alignItems: 'center', marginBottom: 12 }}><Avatar initials={b.initials} color={color} size={70} /><Text style={{ color: t.blue, fontWeight: '600', marginTop: 8 }}>Changer la photo</Text></View>
        <Field label="Prénom" defaultValue={b.name} />
        <Field label="Nouveau code PIN" placeholder="4 chiffres (laisser vide pour garder)" keyboardType="number-pad" />
        <Text style={st.lbl(t)}>Couleur dans l'agenda</Text>
        <View style={[st.row, { gap: 10, flexWrap: 'wrap' }]}>{SWATCHES.map((c) => <Pressable key={c} onPress={() => setColor(c)} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: t.ink }} />)}</View>
        <ToggleRow label="Prend des RDV en ligne" value onChange={() => {}} />
        <ToggleRow label="Prend les clients sans RDV" value={id === 'yanis'} onChange={() => {}} last />
        <View style={{ height: 14 }} /><Go label="Enregistrer" onPress={() => { setOpen(null); toast('Profil enregistré'); }} />
      </Sheet>
      <Sheet visible={open === 'leave'} onClose={() => setOpen(null)} title="Congés et jours sans RDV">
        {leaves.map((l, i) => (
          <View key={i} style={[st.row, st.line, { borderColor: t.sep }]}>
            <Pill label={l.type} tone={l.type === 'Congé' ? 'orange' : 'grey'} />
            <Text style={{ color: t.ink, flex: 1 }}>{l.from} → {l.to}</Text>
            <Pressable onPress={() => setLeaves(leaves.filter((_, j) => j !== i))}><Ionicons name="trash-outline" size={19} color={t.red} /></Pressable>
          </View>
        ))}
        <H3>Ajouter</H3>
        <Segmented value={lv.type === 'Congé' ? 'leave' : 'walk'} onChange={(v) => setLv({ ...lv, type: v === 'leave' ? 'Congé' : 'Sans RDV' })} items={[{ key: 'leave', label: 'Congé' }, { key: 'walk', label: 'Jours « sans RDV »' }]} />
        <View style={[st.row, st.line, { borderColor: t.sep, justifyContent: 'space-between' }]}><Text style={{ color: t.ink }}>À partir de lundi prochain, pendant</Text><Stepper value={lv.days} min={1} max={30} format={(v) => `${v} j`} onChange={(v) => setLv({ ...lv, days: v })} /></View>
        <Text style={{ color: t.grey, fontSize: 12.5, marginVertical: 10 }}>{lv.type === 'Congé' ? 'Les RDV de ces jours devront être déplacés ; la réservation en ligne est fermée pour ce coiffeur.' : 'Ces jours-là le coiffeur ne prend que les clients sans RDV (borne, file).'}</Text>
        <Go label="Ajouter" onPress={() => { setLeaves([...leaves, { from: 'lun. 16 nov.', to: `${lv.days} jour${lv.days > 1 ? 's' : ''}`, type: lv.type }]); toast(`${lv.type} ajouté`); }} />
      </Sheet>
      <Sheet visible={open === 'hours'} onClose={() => setOpen(null)} title={`Horaires de ${b.name}`}>
        {DAYS.map((d, i) => {
          const h = hours[i];
          const set = (p: Partial<typeof h>) => setHours(hours.map((x, j) => (j === i ? { ...x, ...p } : x)));
          return (
            <View key={d} style={[st.line, { borderColor: t.sep }]}>
              <ToggleRow label={d} sub={h.on ? `${hm(h.start)} – ${hm(h.end)}` : 'Repos'} value={h.on} onChange={(v) => set({ on: v })} last />
              {h.on ? (
                <>
                  <View style={[st.row, { justifyContent: 'space-between', marginTop: 4 }]}><Text style={{ color: t.grey }}>Début</Text><Stepper value={h.start} step={15} format={hm} onChange={(v) => set({ start: v })} /></View>
                  <View style={[st.row, { justifyContent: 'space-between', marginTop: 8 }]}><Text style={{ color: t.grey }}>Fin</Text><Stepper value={h.end} step={15} format={hm} onChange={(v) => set({ end: v })} /></View>
                  {h.breaks.map((bk, k) => (
                    <View key={k} style={[st.row, { marginTop: 8 }]}>
                      <Text style={{ color: t.grey, flex: 1 }}>Pause {hm(bk[0])} – {hm(bk[1])}</Text>
                      <Pressable onPress={() => set({ breaks: h.breaks.filter((_, z) => z !== k) })}><Ionicons name="close-circle" size={20} color={t.grey} /></Pressable>
                    </View>
                  ))}
                  <Pressable onPress={() => set({ breaks: [...h.breaks, [16 * 60, 16 * 60 + 15]] })} style={{ marginTop: 8 }}><Text style={{ color: t.blue, fontWeight: '600' }}>+ Ajouter une pause</Text></Pressable>
                </>
              ) : null}
            </View>
          );
        })}
        <View style={{ height: 14 }} /><Go label="Enregistrer" onPress={() => { setOpen(null); toast('Horaires enregistrés'); }} />
      </Sheet>
      <Sheet visible={open === 'caps'} onClose={() => setOpen(null)} title="Prestations réalisées">
        <Text style={{ color: t.grey, textAlign: 'center', marginBottom: 10 }}>Décochez ce que {b.name} ne réalise pas. Le tarif peut être propre au coiffeur (sinon celui du salon).</Text>
        {CATALOG.filter((c) => c.kind !== 'product').map((c) => {
          const cp = caps[c.id];
          return (
            <View key={c.id} style={[st.row, st.line, { borderColor: t.sep }]}>
              <Pressable onPress={() => setCaps({ ...caps, [c.id]: { ...cp, on: !cp.on } })}><Ionicons name={cp.on ? 'checkbox' : 'square-outline'} size={22} color={t.blue} /></Pressable>
              <View style={{ flex: 1 }}><Text style={{ color: t.ink, opacity: cp.on ? 1 : 0.4 }}>{c.name}</Text>{cp.price === c.priceCents ? <Text style={{ color: t.grey, fontSize: 12 }}>(défaut)</Text> : <Text style={{ color: t.blue, fontSize: 12 }}>tarif propre</Text>}</View>
              {cp.on ? <Stepper value={cp.price} step={100} format={eur} onChange={(v) => setCaps({ ...caps, [c.id]: { ...cp, price: v } })} /> : null}
            </View>
          );
        })}
        <View style={{ height: 14 }} /><Go label="Enregistrer" onPress={() => { setOpen(null); toast('Prestations enregistrées'); }} />
      </Sheet>
    </>
  );
}

/* =============================================================== Clients */

type Cl = (typeof CLIENTS_LIST)[number] & { id: string; email?: string; note?: string; createdDaysAgo: number };
export function ClientsSec() {
  const { t } = useT();
  const [toastNode, toast] = useToast();
  const base: Cl[] = [...CLIENTS_LIST, ...['Bilal', 'Hugo', 'Mehdi', 'Ahmed', 'Kevin', 'Rayan', 'Sofiane', 'Thomas', 'Julien', 'Antoine', 'Yohan', 'Lina'].map((n, i) => ({ name: n, phone: `06 •• •• •• ${10 + i}`, visits: 1 + (i % 7), last: `${1 + i} nov.`, loyalty: i * 20, account: i % 3 === 0 }))]
    .map((c, i) => ({ ...c, id: 'cl' + i, email: c.account ? `${c.name.split(' ')[0].toLowerCase()}@exemple.fr` : undefined, createdDaysAgo: (i * 17) % 200 }));
  const [list, setList] = useState<Cl[]>(base);
  const [q, setQ] = useState('');
  const [when, setWhen] = useState<'all' | '30' | '90' | 'inactive'>('all');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string[] | null>(null);
  const [open, setOpen] = useState<Cl | null>(null);
  const [edit, setEdit] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [del, setDel] = useState(false);
  const [nw, setNw] = useState({ name: '', phone: '', email: '' });
  const filtered = list.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
    .filter((c) => when === 'all' || (when === '30' ? c.createdDaysAgo <= 30 : when === '90' ? c.createdDaysAgo <= 90 : c.createdDaysAgo > 120));
  const shown = filtered.slice(0, page * 10);
  return (
    <Page toast={toastNode} title="Clients" right={<AddBtn onPress={() => setAddOpen(true)} />}>
      <View style={[st.row, { flexWrap: 'wrap', gap: 8, marginBottom: 12 }]}>
        <Pressable onPress={() => toast('Export CSV prêt : clients.csv')} style={[st.outline, { borderColor: t.sep }]}><Ionicons name="download-outline" size={16} color={t.ink} /><Text style={{ color: t.ink, fontWeight: '600' }}>CSV</Text></Pressable>
        <Pressable onPress={() => toast('Export PDF prêt : clients.pdf')} style={[st.outline, { borderColor: t.sep }]}><Ionicons name="document-outline" size={16} color={t.ink} /><Text style={{ color: t.ink, fontWeight: '600' }}>PDF</Text></Pressable>
        <Pressable onPress={() => toast('Import : choisissez un fichier CSV (nom, téléphone, email)')} style={[st.outline, { borderColor: t.sep }]}><Ionicons name="cloud-upload-outline" size={16} color={t.ink} /><Text style={{ color: t.ink, fontWeight: '600' }}>Importer</Text></Pressable>
        <Pressable onPress={() => setSel(sel ? null : [])} style={[st.outline, { borderColor: sel ? t.blue : t.sep, backgroundColor: sel ? t.blueSoft : 'transparent' }]}><Text style={{ color: sel ? t.blue : t.ink, fontWeight: '600' }}>{sel ? 'Terminé' : 'Sélection'}</Text></Pressable>
      </View>
      <View style={[st.row, st.search, { backgroundColor: t.card }]}>
        <Ionicons name="search" size={18} color={t.grey} />
        <TextInput value={q} onChangeText={(v) => { setQ(v); setPage(1); }} placeholder="Rechercher un client…" placeholderTextColor={t.grey} style={{ flex: 1, color: t.ink, fontSize: 16, paddingVertical: 12 }} />
      </View>
      <View style={{ marginTop: 10 }}><Chips items={[{ key: 'all', label: 'Tous' }, { key: '30', label: 'Nouveaux (30 j)' }, { key: '90', label: '3 derniers mois' }, { key: 'inactive', label: 'Inactifs' }]} value={[when]} onToggle={(k) => { setWhen(k); setPage(1); }} /></View>
      {sel ? (
        <View style={[st.row, { marginTop: 10 }]}>
          <Text style={{ color: t.grey, flex: 1 }}>{sel.length} sélectionné{sel.length > 1 ? 's' : ''}</Text>
          <Pressable onPress={() => setSel(sel.length === shown.length ? [] : shown.map((c) => c.id))}><Text style={{ color: t.blue, fontWeight: '600' }}>Tout</Text></Pressable>
          <Pressable disabled={!sel.length} onPress={() => setDel(true)} style={{ opacity: sel.length ? 1 : 0.4 }}><Text style={{ color: t.red, fontWeight: '700' }}>Supprimer</Text></Pressable>
        </View>
      ) : null}
      <Card style={{ paddingVertical: 4, marginTop: 12 }}>
        {shown.map((c, i) => {
          const on = sel?.includes(c.id);
          return (
            <Pressable key={c.id} onPress={() => (sel ? setSel(on ? sel.filter((x) => x !== c.id) : [...sel, c.id]) : (setOpen(c), setEdit(false)))} style={[st.row, { paddingVertical: 12, borderBottomWidth: i < shown.length - 1 ? StyleSheet.hairlineWidth : 0, borderColor: t.sep }]}>
              {sel ? <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={t.blue} /> : null}
              <Avatar initials={c.name[0]} color={['#0a84ff', '#e5484d', '#30a46c', '#ff9f0a', '#5e5ce6'][i % 5]} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontWeight: '600', fontSize: 15.5 }}>{c.name}</Text>
                <Text style={{ color: t.grey, fontSize: 13 }}>{c.visits} passages · dernier {c.last}</Text>
              </View>
              {c.account ? <Pill label={`${c.loyalty} pts`} tone="green" /> : <Pill label="Sans compte" tone="grey" />}
            </Pressable>
          );
        })}
      </Card>
      <Text style={{ color: t.grey, textAlign: 'center', marginTop: 10 }}>{shown.length} sur {filtered.length}</Text>
      {shown.length < filtered.length ? <Pressable onPress={() => setPage(page + 1)} style={{ alignItems: 'center', marginTop: 8 }}><Text style={{ color: t.blue, fontWeight: '700' }}>Page suivante</Text></Pressable> : null}

      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.name}>
        {open ? (edit ? (
          <View>
            <Field label="Nom" value={open.name} onChangeText={(v) => setOpen({ ...open, name: v })} />
            <Field label="Téléphone" value={open.phone} onChangeText={(v) => setOpen({ ...open, phone: v })} />
            <Field label="Email" value={open.email ?? ''} onChangeText={(v) => setOpen({ ...open, email: v })} autoCapitalize="none" />
            <Go label="Enregistrer" onPress={() => { setList((l) => l.map((x) => (x.id === open.id ? open : x))); setEdit(false); toast('Fiche enregistrée'); }} />
          </View>
        ) : (
          <View>
            <Pressable onPress={() => setEdit(true)} style={[st.row, { alignSelf: 'center', gap: 6, marginBottom: 8 }]}><Ionicons name="create-outline" size={16} color={t.blue} /><Text style={{ color: t.blue, fontWeight: '600' }}>Modifier</Text></Pressable>
            {[['Téléphone', open.phone], ['Email', open.email ?? '—'], ['Passages', String(open.visits)], ['Dernier passage', open.last], ['Fidélité', open.account ? `${open.loyalty} points` : 'Pas de compte']].map(([k, v]) => <RowLink key={k} label={k} value={v} />)}
            <Text style={st.lbl(t)}>Note interne</Text>
            <TextInput defaultValue={open.note} placeholder="Visible par toute l'équipe" placeholderTextColor={t.grey} multiline style={[st.input, { backgroundColor: t.fill, color: t.ink, minHeight: 70 }]} />
            <Text style={st.lbl(t)}>Messages envoyés</Text>
            {[['Confirmation de RDV', 'Email · 12 oct.'], ['Rappel de RDV', 'SMS · 16 oct.'], ['Votre tour approche', 'SMS · 17 oct.']].map(([k, v]) => <RowLink key={k} label={k} value={v} />)}
            <View style={{ height: 14 }} /><Go label="Prendre un RDV pour ce client" onPress={() => setOpen(null)} />
          </View>
        )) : null}
      </Sheet>
      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Ajouter un client">
        <Field label="Nom" value={nw.name} onChangeText={(v) => setNw({ ...nw, name: v })} />
        <Field label="Téléphone" value={nw.phone} onChangeText={(v) => setNw({ ...nw, phone: v })} keyboardType="phone-pad" />
        <Field label="Email (facultatif)" value={nw.email} onChangeText={(v) => setNw({ ...nw, email: v })} autoCapitalize="none" />
        <Go label="Ajouter" disabled={!nw.name} onPress={() => { setList([{ name: nw.name, phone: nw.phone, email: nw.email, visits: 0, last: '—', loyalty: 0, account: false, id: 'n' + Date.now(), createdDaysAgo: 0 }, ...list]); setNw({ name: '', phone: '', email: '' }); setAddOpen(false); toast('Client ajouté'); }} />
      </Sheet>
      <Sheet visible={del} onClose={() => setDel(false)} title={`Supprimer ${sel?.length ?? 0} client(s) ?`}>
        <Text style={{ color: t.grey, textAlign: 'center', marginBottom: 16 }}>Leur fiche, leur fidélité et leur historique sont effacés. Les ventes restent dans la caisse.</Text>
        <Danger label="Supprimer" onPress={() => { setList((l) => l.filter((c) => !sel?.includes(c.id))); toast(`${sel?.length} client(s) supprimé(s)`); setSel(null); setDel(false); }} />
      </Sheet>
    </Page>
  );
}

/* =============================================================== Marketing */

export function MarketingSec() {
  const { t } = useT();
  const [toastNode, toast] = useToast();
  const [tab, setTab] = useState<'loyalty' | 'gifts' | 'design' | 'msg'>('loyalty');
  const [tiers, setTiers] = useState([{ label: 'Barbe offerte', need: 300 }, { label: 'Coupe offerte', need: 500 }]);
  const [ptsPerEuro, setPts] = useState(10);
  const [accounts, setAccounts] = useState(CLIENTS_LIST.filter((c) => c.account).map((c) => ({ ...c, active: true })));
  const [gifts, setGifts] = useState(Object.entries(GIFT_CARDS).map(([code, g]) => ({ code, ...g, voided: false })));
  const [design, setDesign] = useState({ loyalty: 0, gift: 0 });
  const [msgType, setMsgType] = useState<'promo' | 'closure' | 'news'>('promo');
  const [blocked, setBlocked] = useState(['06 •• •• •• 99']);
  const grads: [string, string][] = [['#0a84ff', '#5e5ce6'], ['#7c3aed', '#db2777'], ['#111111', '#555555'], ['#b8860b', '#8a5a00'], ['#30a46c', '#0a84ff']];
  return (
    <Page toast={toastNode} title="Marketing">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><Segmented style={{ minWidth: 420 }} value={tab} onChange={setTab} items={[{ key: 'loyalty', label: 'Fidélité' }, { key: 'gifts', label: 'Cadeaux' }, { key: 'design', label: 'Cartes' }, { key: 'msg', label: 'Messages' }]} /></ScrollView>
      {tab === 'loyalty' ? (
        <>
          <H3>Programme de fidélité</H3>
          <Card>
            <View style={[st.row, { justifyContent: 'space-between' }]}><Text style={{ color: t.ink }}>Points gagnés par euro</Text><Stepper value={ptsPerEuro} onChange={setPts} /></View>
            {tiers.map((tr, i) => (
              <View key={i} style={[st.row, st.line, { borderColor: t.sep }]}>
                <TextInput value={tr.label} onChangeText={(v) => setTiers(tiers.map((x, j) => (j === i ? { ...x, label: v } : x)))} style={{ color: t.ink, flex: 1, fontSize: 15 }} />
                <Stepper value={tr.need} step={50} format={(v) => `${v} pts`} onChange={(v) => setTiers(tiers.map((x, j) => (j === i ? { ...x, need: v } : x)))} />
                <Pressable onPress={() => setTiers(tiers.filter((_, j) => j !== i))}><Ionicons name="trash-outline" size={18} color={t.red} /></Pressable>
              </View>
            ))}
            <Pressable onPress={() => setTiers([...tiers, { label: 'Nouvelle récompense', need: 800 }])} style={{ marginTop: 10 }}><Text style={{ color: t.blue, fontWeight: '600' }}>+ Ajouter un palier</Text></Pressable>
          </Card>
          <H3>Clients fidèles</H3>
          <Card style={{ paddingVertical: 4 }}>
            {accounts.map((c, i) => (
              <View key={c.name} style={[st.row, { paddingVertical: 11, borderBottomWidth: i < accounts.length - 1 ? StyleSheet.hairlineWidth : 0, borderColor: t.sep, opacity: c.active ? 1 : 0.5 }]}>
                <Text style={{ color: t.ink, flex: 1, fontWeight: '600' }}>{c.name}</Text><Text style={{ color: t.ink }}>{c.loyalty} pts</Text>
                <Pressable onPress={() => setAccounts(accounts.map((x) => (x.name === c.name ? { ...x, active: !x.active } : x)))}><Text style={{ color: t.blue, fontWeight: '600' }}>{c.active ? 'Désactiver' : 'Activer'}</Text></Pressable>
                <Pressable onPress={() => { setAccounts(accounts.filter((x) => x.name !== c.name)); toast(`Carte de ${c.name} supprimée`); }}><Ionicons name="trash-outline" size={18} color={t.red} /></Pressable>
              </View>
            ))}
          </Card>
          <View style={{ height: 14 }} /><Go label="Enregistrer" onPress={() => toast('Programme enregistré')} />
        </>
      ) : null}
      {tab === 'gifts' ? (
        <>
          <H3>Cadeaux vendus</H3>
          <Card style={{ paddingVertical: 4 }}>
            {gifts.map((g, i) => (
              <View key={g.code} style={[st.line, { borderColor: t.sep, borderBottomWidth: i < gifts.length - 1 ? StyleSheet.hairlineWidth : 0 }]}>
                <View style={st.row}>
                  <View style={{ flex: 1 }}><Text style={{ color: t.ink, fontWeight: '700', textDecorationLine: g.voided ? 'line-through' : 'none' }}>{g.code} · {eur(g.balanceCents)}</Text><Text style={{ color: t.grey, fontSize: 13 }}>De {g.from} pour {g.to}</Text></View>
                  {g.voided ? <Pill label="Annulée" tone="red" /> : <Pill label="En cours" tone="green" />}
                </View>
                {!g.voided ? (
                  <View style={[st.row, { marginTop: 8 }]}>
                    <Pressable onPress={() => toast(`Code ${g.code} renvoyé à ${g.to}`)}><Text style={{ color: t.blue, fontWeight: '600' }}>Renvoyer le code</Text></Pressable>
                    <Pressable onPress={() => { setGifts(gifts.map((x) => (x.code === g.code ? { ...x, voided: true } : x))); toast(`Carte ${g.code} annulée`); }}><Text style={{ color: t.red, fontWeight: '600' }}>Annuler la carte</Text></Pressable>
                  </View>
                ) : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}
      {tab === 'design' ? (
        <>
          {(['loyalty', 'gift'] as const).map((k) => (
            <View key={k}>
              <H3>{k === 'loyalty' ? 'Design de la carte fidélité (compte client)' : 'Design de la carte cadeau (compte client)'}</H3>
              <View style={[st.cardArt, { backgroundColor: grads[design[k]][0] }]}>
                <View style={{ position: 'absolute', right: '-35%', bottom: '-120%', width: '120%', height: '260%', borderRadius: 9999, backgroundColor: grads[design[k]][1], opacity: 0.85 }} />
              </View>
              <View style={[st.row, { gap: 10, marginTop: 10 }]}>
                {grads.map((g, i) => <Pressable key={i} onPress={() => setDesign({ ...design, [k]: i })} style={{ width: 40, height: 28, borderRadius: 8, backgroundColor: g[0], borderWidth: design[k] === i ? 3 : 0, borderColor: t.ink }} />)}
                <Pressable onPress={() => toast('Choisissez une image (photo du salon…)')}><Text style={{ color: t.blue, fontWeight: '600' }}>Image…</Text></Pressable>
              </View>
            </View>
          ))}
          <H3>Image « Utiliser un cadeau » (borne)</H3>
          <SoftButton label="Choisir une image" onPress={() => toast('Image enregistrée')} />
        </>
      ) : null}
      {tab === 'msg' ? (
        <>
          <H3>Message aux clients</H3>
          <Chips items={[{ key: 'promo', label: 'Promotion' }, { key: 'closure', label: 'Fermeture' }, { key: 'news', label: 'Nouveauté' }]} value={[msgType]} onToggle={setMsgType} />
          <Field label="Message" style={{ marginTop: 12 }} multiline defaultValue={msgType === 'closure' ? 'Le salon sera fermé du 24 au 26 décembre. Joyeuses fêtes !' : msgType === 'promo' ? '-20 % sur les soins du visage tout le mois de novembre !' : 'Nouveau : la coloration de barbe arrive au salon.'} />
          <ToggleRow label="Envoyer aussi par email" value onChange={() => {}} last />
          <View style={{ height: 10 }} /><Go label="Envoyer à 186 clients" onPress={() => toast('Message envoyé à 186 clients')} />
          <H3>SMS</H3>
          <Card>
            <RowLink label="Crédits SMS" value="1 240 restants" />
            <RowLink label="Modèle « Votre tour approche »" onPress={() => toast('Modèle ouvert')} />
            <RowLink label="Modèle « Rappel de RDV »" onPress={() => toast('Modèle ouvert')} last />
            <View style={{ height: 10 }} />
            <SoftButton label="M'envoyer un SMS de test" onPress={() => toast('SMS de test envoyé')} />
          </Card>
          <H3>Numéros bloqués</H3>
          <Card>
            {blocked.map((n) => <View key={n} style={[st.row, { paddingVertical: 8 }]}><Text style={{ color: t.ink, flex: 1 }}>{n}</Text><Pressable onPress={() => setBlocked(blocked.filter((x) => x !== n))}><Text style={{ color: t.blue, fontWeight: '600' }}>Débloquer</Text></Pressable></View>)}
            <Pressable onPress={() => setBlocked([...blocked, '07 •• •• •• 12'])} style={{ marginTop: 6 }}><Text style={{ color: t.blue, fontWeight: '600' }}>+ Bloquer un numéro</Text></Pressable>
          </Card>
        </>
      ) : null}
    </Page>
  );
}

/* =============================================================== Mes salons / Compte / Réglages */

export function SalonsSec() {
  const { t } = useT();
  const [toastNode, toast] = useToast();
  const [list, setList] = useState(SALONS);
  const [add, setAdd] = useState(false);
  const [del, setDel] = useState<string | null>(null);
  const [nw, setNw] = useState('');
  return (
    <Page toast={toastNode} title="Mes salons" right={<AddBtn onPress={() => setAdd(true)} />}>
      <Card style={{ paddingVertical: 4 }}>
        {list.map((s, i) => (
          <View key={s.slug} style={[st.row, { paddingVertical: 13, borderBottomWidth: i < list.length - 1 ? StyleSheet.hairlineWidth : 0, borderColor: t.sep }]}>
            <Ionicons name="storefront-outline" size={20} color={t.blue} />
            <View style={{ flex: 1 }}><Text style={{ color: t.ink, fontWeight: '600' }}>{s.name} · {s.city}</Text><Text style={{ color: t.grey, fontSize: 12.5 }}>app.thebarberone.com/?salon={s.slug}</Text></View>
            {i > 0 ? <Pressable onPress={() => setDel(s.slug)}><Ionicons name="trash-outline" size={19} color={t.red} /></Pressable> : <Pill label="Principal" tone="grey" />}
          </View>
        ))}
      </Card>
      <Sheet visible={add} onClose={() => setAdd(false)} title="Ajouter un salon à l'enseigne">
        <Field label="Nom ou ville du salon" value={nw} onChangeText={setNw} />
        <Text style={{ color: t.grey, fontSize: 12.5, marginBottom: 12 }}>Il reprend les prestations et réglages du salon principal ; ses coiffeurs, sa caisse et ses clients sont séparés.</Text>
        <Go label="Créer le salon" disabled={!nw} onPress={() => { setList([...list, { slug: nw.toLowerCase().replace(/\W+/g, '-'), name: 'The Barber One', city: nw, address: '' }]); setNw(''); setAdd(false); toast('Salon créé'); }} />
      </Sheet>
      <Sheet visible={!!del} onClose={() => setDel(null)} title="Supprimer ce salon ?">
        <Text style={{ color: t.grey, textAlign: 'center', marginBottom: 16 }}>Ses rendez-vous, sa caisse et ses clients ne seront plus accessibles.</Text>
        <Danger label="Supprimer le salon" onPress={() => { setList(list.filter((s) => s.slug !== del)); setDel(null); toast('Salon supprimé'); }} />
      </Sheet>
    </Page>
  );
}

export function CompteSec({ impersonating, setImpersonating }: { impersonating: boolean; setImpersonating: (v: boolean) => void }) {
  const { t } = useT();
  const [toastNode, toast] = useToast();
  return (
    <Page toast={toastNode} title="Compte">
      <H3>Mon profil</H3>
      <Card>
        <Field label="Nom" defaultValue="Eric Haja" />
        <Field label="Email" defaultValue="contact@thebarberone.fr" autoCapitalize="none" />
        <Field label="Nom affiché (« Bienvenue, … »)" defaultValue="Valleiry" />
        <Go label="Enregistrer" onPress={() => toast('Profil enregistré')} />
      </Card>
      <H3>Mot de passe</H3>
      <Card>
        <Field label="Mot de passe actuel" secureTextEntry />
        <Field label="Nouveau mot de passe" secureTextEntry />
        <Go label="Changer le mot de passe" onPress={() => toast('Mot de passe modifié')} />
      </Card>
      <H3>Démonstration</H3>
      <Card><ToggleRow label="Connexion par le super admin" sub="Affiche le bandeau « emprunt d'identité » du web" value={impersonating} onChange={setImpersonating} last /></Card>
    </Page>
  );
}

export function ReglagesSec() {
  const { t } = useT();
  const [toastNode, toast] = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [days, setDays] = useState(DAYS.map((_, i) => ({ on: i > 0 && i < 6, start: 9 * 60, end: 19 * 60 })));
  const [closures, setClosures] = useState([{ from: '24 déc.', to: '26 déc.', why: 'Fêtes de fin d\'année' }]);
  const [vat, setVat] = useState([20, 10, 5.5]);
  const [accent, setAccent] = useState('#0062c4');
  const [tz, setTz] = useState('Europe/Paris');
  const [key, setKey] = useState('tbo_live_8f2c…a91d');
  const [idle, setIdle] = useState(0);
  const rows: [string, IconName][] = [['Général', 'options-outline'], ['Horaires du salon', 'time-outline'], ['Fermetures exceptionnelles', 'calendar-clear-outline'], ['Fuseau horaire', 'globe-outline'], ['Taux de TVA', 'calculator-outline'], ['Informations légales', 'document-text-outline'], ['Logo du salon', 'image-outline'], ['Page de connexion', 'log-in-outline'], ['Couleur d\'accent', 'color-palette-outline'], ['Email (SMTP)', 'mail-outline'], ['SMS', 'chatbubble-outline'], ['Pont local (impression + paiement CB, recommandé)', 'print-outline'], ['Caisse : inactivité', 'hourglass-outline'], ['Réglages de l\'appareil', 'phone-portrait-outline'], ['Journal d\'activité', 'list-outline'], ['Importer des rendez-vous', 'cloud-upload-outline']];
  return (
    <Page toast={toastNode} title="Réglages">
      <Card style={{ paddingVertical: 4 }}>{rows.map(([r, ic], i) => <RowLink key={r} label={r} icon={ic} onPress={() => setOpen(r)} last={i === rows.length - 1} />)}</Card>
      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open ?? ''}>
        {open === 'Général' ? (<><Field label="Nom du salon" defaultValue="The Barber One Valleiry" /><Field label="Téléphone" defaultValue="04 50 •• •• ••" /><Field label="Site du salon" defaultValue="https://thebarberone.fr" autoCapitalize="none" /><ToggleRow label="Borne (kiosque) activée" value onChange={() => {}} last /></>) : null}
        {open === 'Horaires du salon' ? DAYS.map((d, i) => (
          <View key={d} style={[st.line, { borderColor: t.sep }]}>
            <ToggleRow label={d} sub={days[i].on ? `${hm(days[i].start)} – ${hm(days[i].end)}` : 'Fermé'} value={days[i].on} onChange={(v) => setDays(days.map((x, j) => (j === i ? { ...x, on: v } : x)))} last />
            {days[i].on ? <View style={[st.row, { justifyContent: 'space-between' }]}><Stepper value={days[i].start} step={30} format={hm} onChange={(v) => setDays(days.map((x, j) => (j === i ? { ...x, start: v } : x)))} /><Stepper value={days[i].end} step={30} format={hm} onChange={(v) => setDays(days.map((x, j) => (j === i ? { ...x, end: v } : x)))} /></View> : null}
          </View>
        )) : null}
        {open === 'Fermetures exceptionnelles' ? (<>
          {closures.map((c, i) => <View key={i} style={[st.row, st.line, { borderColor: t.sep }]}><Text style={{ color: t.ink, flex: 1 }}>{c.from} → {c.to} · {c.why}</Text><Pressable onPress={() => setClosures(closures.filter((_, j) => j !== i))}><Ionicons name="trash-outline" size={19} color={t.red} /></Pressable></View>)}
          <Field label="Motif" style={{ marginTop: 12 }} placeholder="Ex : travaux" />
          <SoftButton label="+ Ajouter une fermeture (1 jour)" onPress={() => setClosures([...closures, { from: '1 déc.', to: '1 déc.', why: 'Fermeture' }])} />
          <Text style={{ color: t.grey, fontSize: 12.5, marginTop: 10 }}>Les clients ayant un RDV ces jours-là sont prévenus par email.</Text>
        </>) : null}
        {open === 'Fuseau horaire' ? <Chips items={['Europe/Paris', 'Europe/Zurich', 'Europe/Brussels', 'Indian/Reunion', 'America/Martinique'].map((z) => ({ key: z, label: z }))} value={[tz]} onToggle={setTz} /> : null}
        {open === 'Taux de TVA' ? (<>
          {vat.map((v, i) => <View key={i} style={[st.row, st.line, { borderColor: t.sep, justifyContent: 'space-between' }]}><Stepper value={v} step={0.5} format={(x) => `${x} %`} onChange={(x) => setVat(vat.map((y, j) => (j === i ? x : y)))} /><Pressable onPress={() => setVat(vat.filter((_, j) => j !== i))}><Ionicons name="trash-outline" size={19} color={t.red} /></Pressable></View>)}
          <Pressable onPress={() => setVat([...vat, 2.1])} style={{ marginTop: 10 }}><Text style={{ color: t.blue, fontWeight: '600' }}>+ Ajouter un taux</Text></Pressable>
        </>) : null}
        {open === 'Informations légales' ? (<><Field label="Raison sociale" defaultValue="TBO SAS" /><Field label="SIRET" defaultValue="912 345 678 00011" /><Field label="N° TVA" defaultValue="FR12 912345678" /><Field label="Adresse (tickets)" multiline defaultValue="Valleiry" /></>) : null}
        {open === 'Logo du salon' || open === 'Page de connexion' ? (<><View style={[st.photo, { backgroundColor: t.fill }]}><Ionicons name="image-outline" size={40} color={t.grey} /></View><SoftButton label="Choisir une image" onPress={() => toast('Image enregistrée')} /><View style={{ height: 8 }} /><SoftButton label="Retirer l'image" danger onPress={() => toast('Image retirée')} /></>) : null}
        {open === 'Couleur d\'accent' ? (<>
          <View style={[st.row, { gap: 10, flexWrap: 'wrap' }]}>{['#0062c4', '#e5484d', '#30a46c', '#ff9f0a', '#bf5af2', '#111111'].map((c) => <Pressable key={c} onPress={() => setAccent(c)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c, borderWidth: accent === c ? 3 : 0, borderColor: t.ink }} />)}</View>
          <View style={{ backgroundColor: accent, borderRadius: 16, padding: 15, alignItems: 'center', marginTop: 16 }}><Text style={{ color: '#fff', fontWeight: '700' }}>Aperçu du bouton</Text></View>
          <View style={{ height: 8 }} /><SoftButton label="Couleur par défaut" onPress={() => setAccent('#0062c4')} />
        </>) : null}
        {open === 'Email (SMTP)' ? (<><Field label="Serveur" defaultValue="smtp.ionos.fr" autoCapitalize="none" /><Field label="Port" defaultValue="587" keyboardType="number-pad" /><Field label="Utilisateur" defaultValue="rdv@thebarberone.fr" autoCapitalize="none" /><Field label="Mot de passe" secureTextEntry defaultValue="••••••••" /><SoftButton label="Envoyer un email de test" onPress={() => toast('Email de test envoyé ✓')} /></>) : null}
        {open === 'SMS' ? (<><ToggleRow label="SMS activés" value onChange={() => {}} /><Field label="Nom d'expéditeur" defaultValue="BARBERONE" style={{ marginTop: 12 }} /><SoftButton label="Envoyer un SMS de test" onPress={() => toast('SMS de test envoyé ✓')} /></>) : null}
        {open === 'Pont local (impression + paiement CB, recommandé)' ? (<>
          <Text style={{ color: t.grey, marginBottom: 12 }}>Le pont tourne sur le PC de la caisse : il relie le TPE Nepting et l'imprimante au site. Il ne passe jamais par le téléphone.</Text>
          <RowLink label="État" value="Connecté · il y a 3 s" />
          <RowLink label="Clé du pont" value={key} />
          <View style={{ height: 10 }} />
          <SoftButton label="Générer une nouvelle clé" onPress={() => { setKey('tbo_live_' + Math.random().toString(16).slice(2, 6) + '…' + Math.random().toString(16).slice(2, 6)); toast('Nouvelle clé générée : l\'ancienne ne marche plus'); }} />
          <View style={{ height: 8 }} /><SoftButton label="Copier les instructions d'installation" onPress={() => toast('Instructions copiées')} />
          <View style={{ height: 8 }} /><SoftButton label="Démarrer le pont sur cet ordinateur" onPress={() => toast('Démarrage demandé (tpebridge://start)')} />
        </>) : null}
        {open === 'Caisse : inactivité' ? (<View style={[st.row, { justifyContent: 'space-between' }]}><Text style={{ color: t.ink, flex: 1 }}>Déconnexion après inactivité</Text><Stepper value={idle} step={5} format={(v) => (v ? `${v} min` : 'Jamais')} onChange={setIdle} /></View>) : null}
        {open === 'Réglages de l\'appareil' ? (<><ToggleRow label="Garder l'écran allumé" value onChange={() => {}} /><ToggleRow label="Son à l'arrivée d'un client" value onChange={() => {}} /><ToggleRow label="Mode sombre automatique" value onChange={() => {}} last /></>) : null}
        {open === 'Journal d\'activité' ? [['11:12', 'Tom', 'Vente #44 · 15,00 €'], ['10:58', 'Marco', 'RDV de Nathan décalé de 5 min'], ['10:31', 'Marco', 'Vente #43 · 35,00 €'], ['09:47', 'Admin', 'Prix de « Coupe » modifié'], ['09:02', 'Système', 'Ouverture de la caisse']].map(([h, w, x]) => <RowLink key={h + x} label={`${h} · ${w}`} value={x} />) : null}
        {open === 'Importer des rendez-vous' ? (<><Text style={{ color: t.grey, marginBottom: 12 }}>Fichier CSV : date, heure, client, téléphone, prestation, coiffeur. Les doublons sont ignorés.</Text><SoftButton label="Choisir un fichier CSV" onPress={() => toast('Import : 24 RDV ajoutés, 2 doublons ignorés')} /></>) : null}
        <View style={{ height: 14 }} />
        <Go label="Enregistrer" onPress={() => { setOpen(null); toast('Réglages enregistrés'); }} />
      </Sheet>
    </Page>
  );
}

/* =============================================================== Assistant IA + bandeau super admin */

export function AiChat() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<{ me: boolean; text: string }[]>([{ me: false, text: 'Bonjour ! Je peux répondre sur vos chiffres, vos RDV ou vous aider à rédiger un message pour vos clients.' }]);
  const [q, setQ] = useState('');
  const send = () => {
    if (!q.trim()) return;
    const ans = /chiffre|ca|vente/i.test(q) ? 'Cette semaine : 1 478 € encaissés (+5 % vs la semaine dernière). Tom est en tête avec 574 €.'
      : /rdv|rendez/i.test(q) ? "Il reste 9 RDV aujourd'hui. Le prochain est Nathan à 11:30 avec Marco." : 'Je regarde… (maquette : réponse fictive)';
    setMsgs([...msgs, { me: true, text: q }, { me: false, text: ans }]); setQ('');
  };
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={st.aiBtn}><Ionicons name="sparkles" size={24} color="#fff" /></Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Assistant">
        {msgs.map((m, i) => (
          <View key={i} style={{ alignSelf: m.me ? 'flex-end' : 'flex-start', maxWidth: '85%', backgroundColor: m.me ? t.blue : t.fill, borderRadius: 16, padding: 11, marginBottom: 8 }}>
            <Text style={{ color: m.me ? '#fff' : t.ink }}>{m.text}</Text>
          </View>
        ))}
        <View style={[st.row, { marginTop: 8 }]}>
          <TextInput value={q} onChangeText={setQ} onSubmitEditing={send} placeholder="Posez une question…" placeholderTextColor={t.grey} style={[st.input, { flex: 1, backgroundColor: t.fill, color: t.ink }]} />
          <Pressable onPress={send} style={[st.iconBtn, { backgroundColor: t.blue }]}><Ionicons name="arrow-up" size={20} color="#fff" /></Pressable>
        </View>
        <Text style={{ color: t.grey, fontSize: 12, textAlign: 'center', marginTop: 10 }}>Crédits IA : 42 messages restants</Text>
      </Sheet>
    </>
  );
}

export function ImpersonationBanner({ onExit }: { onExit: () => void }) {
  return (
    <View style={{ backgroundColor: '#b35a00', paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Ionicons name="shield-half-outline" size={16} color="#fff" />
      <Text style={{ color: '#fff', flex: 1, fontSize: 13, fontWeight: '600' }}>Super admin connecté en tant que The Barber One</Text>
      <Pressable onPress={onExit}><Text style={{ color: '#fff', fontWeight: '800' }}>Quitter</Text></Pressable>
    </View>
  );
}

const base = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  line: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  section: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginTop: 20, marginBottom: 8, marginLeft: 2 },
  pos: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  addBtn: { borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 },
  outline: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8 },
  emoji: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  photo: { height: 120, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 14 },
  search: { borderRadius: 14, paddingHorizontal: 14 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  danger: { borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  cardArt: { borderRadius: 18, aspectRatio: 9 / 4, overflow: 'hidden' },
  aiBtn: { position: 'absolute', right: 16, bottom: 96, width: 56, height: 56, borderRadius: 28, backgroundColor: '#d63384', alignItems: 'center', justifyContent: 'center', shadowColor: '#d63384', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
});
const st = { ...base, lbl: (t: { grey: string }) => ({ color: t.grey, marginTop: 14, marginBottom: 6, fontWeight: '600' as const }) };
