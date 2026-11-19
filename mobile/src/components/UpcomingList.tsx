// Liste « À venir » affichée SOUS l'agenda, comme le web (dashboard.html) :
// recherche, statut, coiffeur, Du / Au, 5 à 50 par page (25 par défaut),
// cases à cocher + « Tout sélectionner » → CSV, PDF, Annuler, Supprimer ;
// « Importer des RDV ». Un jour choisi dans l'agenda → « Le … » + « Voir tous les à venir ».
// Données : GET /api/appointments?all=1 (comme le web : 500 plus récents).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ApiAuth, ApiError } from '../api/transport';
import { adminCancelAppointment, deleteAppointment, fetchAllAppointments, fetchAllServices, importAppointments } from '../api/endpoints';
import { AdminAppointment, BarberPublic, CatalogItem } from '../types/api';
import { Palette, cardShadow, spacing } from '../theme/theme';
import { barberColorFor } from '../utils/barberColor';
import { exportRdvCsv, exportRdvPdf } from '../utils/exportRdv';
import { ImportGroup, ParsedCsv, ParsedRow, barberKey, groupRows, parseRdvCsv, plainKey } from '../utils/rdvImport';
import { Card } from './Card';
import { DateRangeSheet } from './DateRangeSheet';
import { Chip, EmptyText, ErrorText, InlineLoading, ListRow, RowText } from './ui';

type Status = 'all' | 'confirmed' | 'completed' | 'no_show' | 'cancelled';
const STATUS: { key: Status; label: string }[] = [
  { key: 'all', label: 'Tous' }, { key: 'confirmed', label: 'Confirmés' }, { key: 'completed', label: 'Terminés' },
  { key: 'no_show', label: 'Absents' }, { key: 'cancelled', label: 'Annulés' },
];
const STATUS_LABEL: Record<string, string> = { confirmed: 'Confirmé', completed: 'Terminé', no_show: 'Absent', cancelled: 'Annulé' };
const PER_PAGE = [5, 10, 15, 20, 25, 50];
const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Une erreur est survenue.');
const fmtDay = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

export function UpcomingList({ t, salonSlug, auth, barbers, todayYmd, nowHm, day, reloadKey, onOpen, onChanged }: {
  t: Palette; salonSlug: string; auth: ApiAuth; barbers: BarberPublic[]; todayYmd: string;
  /** Heure actuelle du salon « HH:MM » (RDV passés non annulables). */
  nowHm: string;
  /** Jour choisi dans l'agenda (web : la liste suit ce jour → « Le … » + « Voir tous les à venir »). */
  day: string | null;
  /** Change à chaque modification ailleurs dans l'écran → relire la liste. */
  reloadKey: number;
  onOpen: (a: AdminAppointment) => void; onChanged: () => void;
}) {
  const st = stylesFor(t);
  const [items, setItems] = useState<AdminAppointment[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [barber, setBarber] = useState('all');
  const [from, setFrom] = useState(todayYmd);
  const [to, setTo] = useState('');
  const [rangeOpen, setRangeOpen] = useState(false);
  const [perPage, setPerPage] = useState(25);
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Record<number, true>>({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  // Jour suivi : celui de l'agenda, jusqu'à « Voir tous les à venir ».
  const [followDay, setFollowDay] = useState<string | null>(day);

  const load = useCallback(() => {
    setErr('');
    fetchAllAppointments(salonSlug, auth).then((r) => setItems(r.items)).catch((e) => setErr(errText(e)));
  }, [salonSlug, auth]);

  useEffect(() => { load(); }, [load, reloadKey]);
  useEffect(() => { setFollowDay(day); setPage(1); setSel({}); }, [day]);
  useEffect(() => { setFrom(todayYmd); }, [todayYmd]);
  useEffect(() => { if (!msg) return; const id = setTimeout(() => setMsg(''), 5000); return () => clearTimeout(id); }, [msg]);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    const digits = k.replace(/\D/g, '');
    const f = followDay ?? from, tt = followDay ?? to;
    return (items ?? [])
      .filter((a) => status === 'all' || (a.display_status ?? 'confirmed') === status)
      .filter((a) => barber === 'all' || String(a.barber_id) === barber)
      .filter((a) => { const d = String(a.scheduled_at).slice(0, 10); return (!f || d >= f) && (!tt || d <= tt); })
      .filter((a) => !k || String(a.client_name ?? '').toLowerCase().includes(k) || String(a.email ?? '').toLowerCase().includes(k) ||
        String(a.service_name ?? '').toLowerCase().includes(k) || (digits.length >= 3 && String(a.phone ?? '').replace(/\D/g, '').includes(digits)))
      .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
  }, [items, q, status, barber, from, to, followDay]);

  const pages = Math.max(1, Math.ceil(list.length / perPage));
  const shown = list.slice((page - 1) * perPage, page * perPage);
  const selected = list.filter((a) => sel[a.id]);
  const nowStr = `${todayYmd} ${nowHm}:00`;
  const cancelable = selected.filter((a) => a.status !== 'cancelled' && (a.display_status ?? 'confirmed') === 'confirmed' && String(a.scheduled_at) > nowStr);
  const allOn = shown.length > 0 && list.every((a) => sel[a.id]);

  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);

  const toggle = (id: number) => setSel((s) => { const n = { ...s }; if (n[id]) delete n[id]; else n[id] = true; return n; });
  const toggleAll = () => { if (allOn) { setSel({}); return; } const n: Record<number, true> = {}; list.forEach((a) => { n[a.id] = true; }); setSel(n); };

  const bulk = async (kind: 'cancel' | 'delete') => {
    const ids = (kind === 'cancel' ? cancelable : selected).map((a) => a.id);
    if (!ids.length) return;
    setBusy(kind);
    let failed = 0;
    for (const id of ids) {
      try {
        if (kind === 'cancel') await adminCancelAppointment(salonSlug, auth, id, '');
        else await deleteAppointment(salonSlug, auth, id);
      } catch { failed++; }
    }
    setBusy('');
    setSel({});
    setMsg(`${ids.length - failed} RDV ${kind === 'cancel' ? 'annulé' : 'supprimé'}${ids.length - failed > 1 ? 's' : ''}${failed ? ` · ${failed} en échec` : ''}`);
    load();
    onChanged();
  };

  const confirmBulk = (kind: 'cancel' | 'delete') => {
    const n = kind === 'cancel' ? cancelable.length : selected.length;
    if (!n) return;
    Alert.alert(
      kind === 'cancel' ? `Annuler ${n} rendez-vous ?` : `Supprimer ${n} rendez-vous ?`,
      kind === 'cancel'
        ? `Chaque client concerné recevra un email d'annulation (message par défaut).${selected.length - n ? ` ${selected.length - n} RDV ignoré(s) : déjà annulés, terminés ou passés.` : ''}`
        : 'Suppression définitive, sans prévenir les clients.',
      [{ text: 'Retour', style: 'cancel' }, { text: kind === 'cancel' ? 'Annuler les RDV' : 'Supprimer', style: 'destructive', onPress: () => void bulk(kind) }]
    );
  };

  const doExport = async (kind: 'csv' | 'pdf') => {
    if (!selected.length) return;
    setBusy(kind);
    try {
      if (kind === 'csv') await exportRdvCsv(selected, todayYmd);
      else await exportRdvPdf(selected, `Rendez-vous — ${new Date().toLocaleDateString('fr-FR')}`);
    } catch (e) { setMsg(errText(e)); } finally { setBusy(''); }
  };

  const title = followDay
    ? `Le ${new Date(`${followDay}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}`
    : 'À venir';

  return (
    <View style={{ marginBottom: spacing.block }}>
      <View style={st.listHead}>
        <Text style={st.listTitle} numberOfLines={1}>{title}</Text>
        <TouchableOpacity onPress={() => setImportOpen(true)} hitSlop={6} accessibilityRole="button" style={st.importBtn}>
          <Ionicons name="cloud-upload-outline" size={15} color={t.blue} />
          <Text style={st.importTxt}>Importer des RDV</Text>
        </TouchableOpacity>
      </View>
      {followDay ? (
        <TouchableOpacity onPress={() => { setFollowDay(null); setPage(1); setSel({}); }} accessibilityRole="button" style={{ marginHorizontal: 4, marginBottom: 10 }}>
          <Text style={{ color: t.blue, fontSize: 15, fontWeight: '600' }}>Voir tous les à venir</Text>
        </TouchableOpacity>
      ) : null}

      <View style={st.search}>
        <Ionicons name="search" size={16} color={t.grey} />
        <TextInput style={st.searchInput} value={q} onChangeText={(v) => { setQ(v); setPage(1); }} placeholder="Rechercher un nom…" placeholderTextColor={t.grey} autoCorrect={false} autoCapitalize="none" clearButtonMode="while-editing" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
        {STATUS.map((o) => <FChip key={o.key} t={t} label={o.label} on={status === o.key} onPress={() => { setStatus(o.key); setPage(1); }} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
        <FChip t={t} label="Tous les coiffeurs" on={barber === 'all'} onPress={() => { setBarber('all'); setPage(1); }} />
        {barbers.filter((b) => b.active).map((b) => (
          <FChip key={b.id} t={t} label={b.name} dot={barberColorFor(barbers, b.id)} on={barber === String(b.id)} onPress={() => { setBarber(String(b.id)); setPage(1); }} />
        ))}
      </ScrollView>
      {!followDay ? (
        <TouchableOpacity style={st.range} onPress={() => setRangeOpen(true)} accessibilityRole="button">
          <Ionicons name="calendar-outline" size={17} color={t.blue} />
          <Text style={st.rangeTxt}>{from ? `Du ${fmtDay(from)}` : 'Depuis toujours'}{to ? ` au ${fmtDay(to)}` : ''}</Text>
          {from !== todayYmd || to ? (
            <TouchableOpacity onPress={() => { setFrom(todayYmd); setTo(''); setPage(1); }} hitSlop={8} accessibilityRole="button">
              <Text style={{ color: t.blue, fontSize: 14, fontWeight: '600' }}>Réinitialiser</Text>
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
      ) : null}

      {msg ? <Text style={st.msg}>{msg}</Text> : null}

      {selected.length ? (
        <View style={st.selbar}>
          <Text style={st.selTxt}>{selected.length} sélectionné{selected.length > 1 ? 's' : ''}</Text>
          <SelBtn t={t} label="CSV" busy={busy === 'csv'} onPress={() => void doExport('csv')} />
          <SelBtn t={t} label="PDF" busy={busy === 'pdf'} onPress={() => void doExport('pdf')} />
          {cancelable.length ? <SelBtn t={t} label="Annuler" red busy={busy === 'cancel'} onPress={() => confirmBulk('cancel')} /> : null}
          <SelBtn t={t} label="Suppr." red busy={busy === 'delete'} onPress={() => confirmBulk('delete')} />
        </View>
      ) : null}

      {err ? <ErrorText t={t} text={err} onRetry={load} /> : !items ? <InlineLoading t={t} /> : (
        <>
          <Card t={t} flush style={{ marginBottom: 12 }}>
            <ListRow t={t} first inset={50} onPress={toggleAll}
              left={<Ionicons name={allOn ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={allOn ? t.blue : t.sep} />}
              right={<Text style={{ color: t.grey, fontSize: 13 }}>{list.length} RDV</Text>}>
              <Text style={{ color: t.ink, fontSize: 15, fontWeight: '600' }}>Tout sélectionner</Text>
            </ListRow>
            {shown.length === 0 ? <EmptyText t={t} text="Aucun rendez-vous" /> : shown.map((a) => {
              const d = String(a.scheduled_at);
              const stt = a.display_status ?? 'confirmed';
              return (
                <ListRow key={a.id} t={t} inset={50} chevron onPress={() => onOpen(a)}
                  left={
                    <TouchableOpacity onPress={() => toggle(a.id)} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: !!sel[a.id] }}>
                      <Ionicons name={sel[a.id] ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={sel[a.id] ? t.blue : t.sep} />
                    </TouchableOpacity>
                  }
                  right={<Chip t={t} label={stt === 'confirmed' ? (a.barber_name ?? 'Premier dispo.') : STATUS_LABEL[stt] ?? stt} />}>
                  <RowText t={t} title={a.client_name || 'Client'}
                    meta={`${new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} ${d.slice(11, 16)} · ${a.service_name ?? ''}`} />
                </ListRow>
              );
            })}
          </Card>
          <View style={st.pager}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }} style={{ flexShrink: 1 }}>
              {PER_PAGE.map((n) => (
                <TouchableOpacity key={n} onPress={() => { setPerPage(n); setPage(1); }} style={[st.pp, perPage === n && { backgroundColor: t.blue }]} accessibilityRole="button" accessibilityLabel={`${n} par page`}>
                  <Text style={[st.ppTxt, perPage === n && { color: '#fff' }]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 10 }}>
              <TouchableOpacity onPress={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} hitSlop={8} accessibilityRole="button" accessibilityLabel="Page précédente"><Ionicons name="chevron-back" size={20} color={page <= 1 ? t.sep : t.blue} /></TouchableOpacity>
              <Text style={{ color: t.ink, fontSize: 14, fontVariant: ['tabular-nums'] }}>{page} / {pages}</Text>
              <TouchableOpacity onPress={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages} hitSlop={8} accessibilityRole="button" accessibilityLabel="Page suivante"><Ionicons name="chevron-forward" size={20} color={page >= pages ? t.sep : t.blue} /></TouchableOpacity>
            </View>
          </View>
        </>
      )}

      <DateRangeSheet t={t} visible={rangeOpen} allowFuture title="Période" value={{ from: from || todayYmd, to: to || from || todayYmd }}
        onClose={() => setRangeOpen(false)} onApply={(r) => { setFrom(r.from); setTo(r.to); setPage(1); setRangeOpen(false); }} />
      <ImportSheet t={t} visible={importOpen} salonSlug={salonSlug} auth={auth} barbers={barbers} todayYmd={todayYmd} nowHm={nowHm}
        onClose={() => setImportOpen(false)} onDone={(m) => { setMsg(m); load(); onChanged(); }} />
    </View>
  );
}

function FChip({ t, label, on, onPress, dot }: { t: Palette; label: string; on: boolean; onPress: () => void; dot?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 13, borderRadius: 99, backgroundColor: on ? t.ink : t.card, ...cardShadow(t) }}>
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      <Text style={{ color: on ? t.bg : t.ink, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function SelBtn({ t, label, red, disabled, busy, onPress }: { t: Palette; label: string; red?: boolean; disabled?: boolean; busy?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled || busy} accessibilityRole="button"
      style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(127,127,127,0.25)', opacity: disabled ? 0.4 : 1, minWidth: 44, alignItems: 'center' }}>
      {busy ? <ActivityIndicator color={t.bg} /> : <Text style={{ color: red ? '#ff6b61' : t.bg, fontSize: 13, fontWeight: '700' }}>{label}</Text>}
    </TouchableOpacity>
  );
}

/* ============================ Import CSV ============================ */

function ImportSheet({ t, visible, salonSlug, auth, barbers, todayYmd, nowHm, onClose, onDone }: {
  t: Palette; visible: boolean; salonSlug: string; auth: ApiAuth; barbers: BarberPublic[]; todayYmd: string; nowHm: string;
  onClose: () => void; onDone: (msg: string) => void;
}) {
  const st = stylesFor(t);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [services, setServices] = useState<CatalogItem[]>([]);
  const [statusOn, setStatusOn] = useState<Record<string, boolean>>({});
  const [includePast, setIncludePast] = useState(false);
  const [bGroups, setBGroups] = useState<ImportGroup[]>([]);
  const [sGroups, setSGroups] = useState<ImportGroup[]>([]);
  const [err, setErr] = useState('');
  const [running, setRunning] = useState('');
  const [result, setResult] = useState('');

  useEffect(() => {
    if (!visible) return;
    setParsed(null); setErr(''); setResult(''); setRunning(''); setIncludePast(false);
  }, [visible]);

  const pick = async () => {
    setErr('');
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'public.comma-separated-values-text'], copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const text = await new File(r.assets[0].uri).text();
      const p = parseRdvCsv(text);
      if (p.missing.length) {
        const labels: Record<string, string> = { date: 'date', name: 'nom du client', service: 'prestation', barber: 'coiffeur (équipe)' };
        setErr(`Colonnes introuvables dans ce fichier : ${p.missing.map((f) => labels[f]).join(', ')}`);
        return;
      }
      if (!p.rows.length) { setErr('Aucun rendez-vous lisible dans ce fichier'); return; }
      const sv = await fetchAllServices(salonSlug, auth);
      setServices(sv.items);
      const counts: Record<string, number> = {};
      p.rows.forEach((x) => { counts[x.status] = (counts[x.status] || 0) + 1; });
      const on: Record<string, boolean> = {};
      Object.keys(counts).forEach((s) => { on[s] = /accept|confirm|valid|approuv|approved/i.test(s) || Object.keys(counts).length === 1; });
      setStatusOn(on);
      setBGroups(groupRows(p.rows, 'barber', barbers.map((b) => ({ id: String(b.id), name: b.name }))));
      setSGroups(groupRows(p.rows, 'service', sv.items.map((s) => ({ id: String(s.id), name: s.name }))));
      setParsed(p);
    } catch (e) {
      setErr(`Fichier CSV illisible : ${errText(e)}`);
    }
  };

  const nowStr = `${todayYmd} ${nowHm}:00`;
  const isPast = (r: ParsedRow) => `${r.date} ${r.time}:00` < nowStr;
  const plan = useMemo(() => {
    if (!parsed) return null;
    const active = parsed.rows.filter((r) => statusOn[r.status]);
    const pastCount = active.filter(isPast).length;
    const usable = active.filter((r) => includePast || !isPast(r));
    const bUsed = new Set(usable.map((r) => barberKey(r.barber)));
    const sUsed = new Set(usable.map((r) => plainKey(r.service)));
    const bOf = (r: ParsedRow) => bGroups.find((g) => g.key === barberKey(r.barber))?.choice ?? '';
    const sOf = (r: ParsedRow) => sGroups.find((g) => g.key === plainKey(r.service))?.choice ?? '';
    const unresolved = bGroups.filter((g) => bUsed.has(g.key) && g.choice === '').length + sGroups.filter((g) => sUsed.has(g.key) && g.choice === '').length;
    const toSend = usable.filter((r) => { const b = bOf(r), s = sOf(r); return b && b !== 'ignore' && s && s !== 'ignore'; })
      .map((r) => ({ line: r.line, date: r.date, time: r.time, client_name: r.name, email: r.email, phone: r.phone, note: r.note, barber_id: bOf(r), service_id: sOf(r) }));
    return { pastCount, usable, bUsed, sUsed, unresolved, toSend };
  }, [parsed, statusOn, includePast, bGroups, sGroups]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    if (!plan || plan.unresolved || !plan.toSend.length) return;
    let inserted = 0, skipped = 0, overlaps = 0;
    const errors: string[] = [];
    for (let pos = 0; pos < plan.toSend.length; pos += 100) {
      setRunning(`${Math.min(pos + 100, plan.toSend.length)} / ${plan.toSend.length}`);
      try {
        const r = await importAppointments(salonSlug, auth, plan.toSend.slice(pos, pos + 100));
        inserted += r.inserted || 0; skipped += r.skipped || 0; overlaps += r.overlaps || 0;
        (r.errors || []).forEach((e) => errors.push(`Ligne ${e.line} : ${e.error}`));
      } catch (e) {
        errors.push(`Lignes ${pos + 1} à ${Math.min(pos + 100, plan.toSend.length)} : ${errText(e)}`);
      }
    }
    setRunning('');
    const m = `${inserted} RDV importé${inserted > 1 ? 's' : ''}${skipped ? ` · ${skipped} déjà présent${skipped > 1 ? 's' : ''}` : ''}${overlaps ? ` · ${overlaps} en chevauchement` : ''}${errors.length ? ` · ${errors.length} erreur${errors.length > 1 ? 's' : ''}` : ''}`;
    setResult(errors.length ? `${m}\n${errors.slice(0, 8).join('\n')}` : m);
    onDone(m);
  };

  const mapRows = (groups: ImportGroup[], used: Set<string>, options: { id: string; name: string }[], set: (g: ImportGroup[]) => void) => {
    const shownG = groups.filter((g) => used.has(g.key));
    if (!shownG.length) return <Text style={st.hint}>Aucun.</Text>;
    return shownG.map((g) => (
      <View key={g.key} style={[st.mapRow, g.choice === '' && { borderColor: t.red }]}>
        <Text style={st.mapLbl} numberOfLines={2}>{g.labels.join(' / ')} <Text style={{ color: t.grey, fontWeight: '400' }}>· {g.count} RDV</Text></Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {options.map((o) => (
            <TouchableOpacity key={o.id} onPress={() => set(groups.map((x) => (x.key === g.key ? { ...x, choice: o.id } : x)))}
              style={[st.opt, g.choice === o.id && { backgroundColor: t.blue }]} accessibilityRole="button">
              <Text style={[st.optTxt, g.choice === o.id && { color: '#fff' }]}>{o.name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => set(groups.map((x) => (x.key === g.key ? { ...x, choice: 'ignore' } : x)))}
            style={[st.opt, g.choice === 'ignore' && { backgroundColor: t.grey }]} accessibilityRole="button">
            <Text style={[st.optTxt, g.choice === 'ignore' && { color: '#fff' }]}>Ignorer</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    ));
  };

  const dates = parsed ? parsed.rows.map((r) => r.date).sort() : [];
  const sites = parsed ? Array.from(new Set(parsed.rows.map((r) => r.site).filter(Boolean))) : [];
  const statusCounts: Record<string, number> = {};
  parsed?.rows.forEach((r) => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={st.head}>
          <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" style={{ width: 90 }}><Text style={st.headAct}>Fermer</Text></TouchableOpacity>
          <Text style={st.headTitle}>Importer des RDV</Text>
          <View style={{ width: 90 }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.page, paddingBottom: 50 }}>
          {!parsed ? (
            <>
              <Text style={[st.hint, { fontSize: 14.5, marginBottom: 14 }]}>
                Choisissez un fichier CSV (export d'un autre logiciel ou du web) avec au moins les colonnes date, nom du client, prestation et coiffeur. Aucun email n'est envoyé aux clients.
              </Text>
              <TouchableOpacity style={st.bigBtn} onPress={() => void pick()} accessibilityRole="button">
                <Ionicons name="document-attach-outline" size={19} color="#fff" />
                <Text style={st.bigBtnTxt}>Choisir un fichier CSV</Text>
              </TouchableOpacity>
              {err ? <ErrorText t={t} text={err} /> : null}
            </>
          ) : result ? (
            <>
              <Card t={t}><Text style={{ color: t.ink, fontSize: 15.5, lineHeight: 22 }}>{result}</Text></Card>
              <TouchableOpacity style={[st.bigBtn, { marginTop: 14 }]} onPress={onClose} accessibilityRole="button"><Text style={st.bigBtnTxt}>Terminé</Text></TouchableOpacity>
            </>
          ) : plan ? (
            <>
              <Text style={[st.hint, { fontSize: 14.5, marginBottom: 12 }]}>
                {parsed.rows.length} rendez-vous lus, du {dates[0]} au {dates[dates.length - 1]}.
                {sites.length ? ` Site dans le fichier : ${sites.join(', ')}. Vérifiez que c'est bien ce salon.` : ''}
                {parsed.badDate ? ` ${parsed.badDate} ligne(s) avec une date illisible ignorée(s).` : ''}
              </Text>
              <Text style={st.sec}>Statuts à importer</Text>
              <Card t={t} flush style={{ marginBottom: 12 }}>
                {Object.keys(statusCounts).map((s, i) => (
                  <ListRow key={s} t={t} first={i === 0} onPress={() => setStatusOn({ ...statusOn, [s]: !statusOn[s] })}
                    left={<Ionicons name={statusOn[s] ? 'checkbox' : 'square-outline'} size={22} color={statusOn[s] ? t.blue : t.sep} />}
                    right={<Text style={{ color: t.grey }}>{statusCounts[s]}</Text>}>
                    <Text style={{ color: t.ink, fontSize: 15.5 }}>{s}</Text>
                  </ListRow>
                ))}
                <ListRow t={t} onPress={() => setIncludePast(!includePast)}
                  left={<Ionicons name={includePast ? 'checkbox' : 'square-outline'} size={22} color={includePast ? t.blue : t.sep} />}
                  right={<Text style={{ color: t.grey }}>{plan.pastCount}</Text>}>
                  <Text style={{ color: t.ink, fontSize: 15.5 }}>Importer aussi les RDV déjà passés</Text>
                </ListRow>
              </Card>
              <Text style={st.sec}>Coiffeurs : qui est qui ?</Text>
              {mapRows(bGroups, plan.bUsed, barbers.map((b) => ({ id: String(b.id), name: b.name })), setBGroups)}
              <Text style={[st.sec, { marginTop: 14 }]}>Prestations</Text>
              {mapRows(sGroups, plan.sUsed, services.map((s) => ({ id: String(s.id), name: s.name })), setSGroups)}
              <Text style={[st.plan, plan.unresolved ? { color: t.red } : null]}>
                {plan.unresolved
                  ? `${plan.unresolved} correspondance${plan.unresolved > 1 ? 's' : ''} à choisir avant d'importer.`
                  : `${plan.toSend.length} rendez-vous seront importés${plan.usable.length - plan.toSend.length ? `, ${plan.usable.length - plan.toSend.length} ignorés` : ''}. Aucun email n'est envoyé aux clients.`}
              </Text>
              <TouchableOpacity style={[st.bigBtn, (plan.unresolved > 0 || !plan.toSend.length || !!running) && { opacity: 0.45 }]}
                disabled={!!plan.unresolved || !plan.toSend.length || !!running} onPress={() => void run()} accessibilityRole="button">
                {running ? <><ActivityIndicator color="#fff" /><Text style={st.bigBtnTxt}>{running}</Text></> : <Text style={st.bigBtnTxt}>Importer</Text>}
              </TouchableOpacity>
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.page, paddingTop: 18, paddingBottom: 10 },
    headTitle: { color: t.ink, fontSize: 17, fontWeight: '700' },
    headAct: { color: t.blue, fontSize: 16 },
    search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.fill, borderRadius: 11, paddingHorizontal: 12, marginBottom: 10 },
    searchInput: { flex: 1, color: t.ink, fontSize: 16, paddingVertical: 9 },
    chips: { gap: 8, paddingVertical: 2, paddingHorizontal: 2, marginBottom: 8 },
    range: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.card, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12, marginBottom: 14, ...cardShadow(t) },
    rangeTxt: { flex: 1, color: t.ink, fontSize: 15, fontWeight: '600' },
    msg: { color: t.green, backgroundColor: t.greenSoft, borderRadius: 12, padding: 10, fontSize: 14, fontWeight: '600', marginBottom: 12, overflow: 'hidden' },
    count: { color: t.grey, fontSize: 13, marginHorizontal: 4, marginBottom: 8 },
    pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 4, marginBottom: 16 },
    pp: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 99, backgroundColor: t.fill },
    ppTxt: { color: t.ink, fontSize: 13, fontWeight: '600' },
    ric: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    selbar: { backgroundColor: t.ink, borderRadius: 14, padding: 8, paddingLeft: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
    listHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 4, marginTop: 6, marginBottom: 10 },
    listTitle: { flex: 1, color: t.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
    importBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.blueSoft, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 12 },
    importTxt: { color: t.blue, fontSize: 14, fontWeight: '600' },
    selTxt: { flex: 1, color: t.bg, fontSize: 14, fontWeight: '700' },
    hint: { color: t.grey, fontSize: 13, lineHeight: 19 },
    sec: { color: t.ink, fontSize: 16, fontWeight: '700', marginHorizontal: 4, marginBottom: 8 },
    mapRow: { backgroundColor: t.card, borderRadius: 12, padding: 10, marginBottom: 8, gap: 8, borderWidth: 1, borderColor: 'transparent', ...cardShadow(t) },
    mapLbl: { color: t.ink, fontSize: 15, fontWeight: '700' },
    opt: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 99, backgroundColor: t.fill },
    optTxt: { color: t.ink, fontSize: 13.5, fontWeight: '600' },
    plan: { color: t.ink, fontSize: 14.5, fontWeight: '600', marginVertical: 14, marginHorizontal: 4 },
    bigBtn: { height: 50, borderRadius: 14, backgroundColor: t.blue, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
    bigBtnTxt: { color: '#fff', fontSize: 16.5, fontWeight: '600' },
  });
