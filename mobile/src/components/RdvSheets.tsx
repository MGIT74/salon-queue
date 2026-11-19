// Feuilles de l'agenda (maquette maquette-agenda.html, validée) :
// - ColumnOrderSheet : ordre des colonnes (web : glisser le nom d'un coiffeur),
//   gardé sur l'appareil ;
// - MovedSheet : RDV décalés de 5 min d'un coiffeur + « Remettre à l'heure du client » ;
// - RdvSettingsSheet : « Paramètres des rendez-vous » (6 réglages du web).
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiAuth, ApiError } from '../api/transport';
import { RdvSettings, fetchSettings, saveRdvSettings } from '../api/endpoints';
import { AdminAppointment, BarberPublic } from '../types/api';
import { Palette, cardShadow, spacing } from '../theme/theme';
import { barberColorFor } from '../utils/barberColor';
import { Card } from './Card';
import { Avatar, ErrorText, InlineLoading, ListRow, RowText } from './ui';

function SheetHead({ t, left, title, right, onLeft, onRight, rightBusy }: {
  t: Palette; left?: string; title: string; right?: string; onLeft?: () => void; onRight?: () => void; rightBusy?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.page, paddingTop: 18, paddingBottom: 10 }}>
      <TouchableOpacity onPress={onLeft} disabled={!onLeft} hitSlop={8} style={{ width: 90 }} accessibilityRole="button">
        <Text style={{ color: t.blue, fontSize: 16 }}>{left ?? ''}</Text>
      </TouchableOpacity>
      <Text style={{ color: t.ink, fontSize: 17, fontWeight: '700', flexShrink: 1, textAlign: 'center' }} numberOfLines={1}>{title}</Text>
      <TouchableOpacity onPress={onRight} disabled={!onRight || rightBusy} hitSlop={8} style={{ width: 90, alignItems: 'flex-end' }} accessibilityRole="button">
        {rightBusy ? <ActivityIndicator color={t.blue} /> : <Text style={{ color: t.blue, fontSize: 16, fontWeight: '700' }}>{right ?? ''}</Text>}
      </TouchableOpacity>
    </View>
  );
}

/* ============================ Ordre des colonnes ============================ */

export function ColumnOrderSheet({ t, visible, barbers, allBarbers, onClose, onSave }: {
  t: Palette; visible: boolean; barbers: BarberPublic[]; allBarbers: BarberPublic[]; onClose: () => void; onSave: (ids: string[]) => void;
}) {
  const [list, setList] = useState<BarberPublic[]>(barbers);
  useEffect(() => { if (visible) setList(barbers); }, [visible, barbers]);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = list.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <SheetHead t={t} left="Annuler" onLeft={onClose} title="Ordre des colonnes" right="OK" onRight={() => onSave(list.map((b) => String(b.id)))} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.page, paddingBottom: 40 }}>
          <Text style={{ color: t.grey, fontSize: 13.5, marginHorizontal: 4, marginBottom: 12 }}>
            Montez ou descendez les coiffeurs : le premier est la colonne de gauche. Ordre gardé sur cet appareil, comme sur le web.
          </Text>
          <Card t={t} flush>
            {list.map((b, i) => (
              <ListRow key={b.id} t={t} first={i === 0} inset={62}
                left={<Avatar t={t} name={b.name} color={barberColorFor(allBarbers, b.id)} />}
                right={
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity onPress={() => move(i, -1)} disabled={i === 0} style={[styles(t).arrow, i === 0 && { opacity: 0.3 }]} accessibilityRole="button" accessibilityLabel={`Monter ${b.name}`}>
                      <Ionicons name="chevron-up" size={18} color={t.blue} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => move(i, 1)} disabled={i === list.length - 1} style={[styles(t).arrow, i === list.length - 1 && { opacity: 0.3 }]} accessibilityRole="button" accessibilityLabel={`Descendre ${b.name}`}>
                      <Ionicons name="chevron-down" size={18} color={t.blue} />
                    </TouchableOpacity>
                  </View>
                }>
                <RowText t={t} title={b.name} meta={`Colonne ${i + 1}`} />
              </ListRow>
            ))}
          </Card>
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ============================ RDV décalés ============================ */

export function MovedSheet({ t, visible, barber, items, busyId, onClose, onRestore }: {
  t: Palette; visible: boolean; barber: BarberPublic | null; items: AdminAppointment[]; busyId: number | null;
  onClose: () => void; onRestore: (a: AdminAppointment, minutes: number) => void;
}) {
  const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <SheetHead t={t} title={`RDV décalés — ${barber?.name ?? ''}`} right="Fermer" onRight={onClose} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.page, paddingBottom: 40 }}>
          <Text style={{ color: t.grey, fontSize: 13.5, marginHorizontal: 4, marginBottom: 12 }}>
            Décalés de 5 min dans l'agenda (clients non prévenus). « Remettre » les replace à l'heure réservée par le client.
          </Text>
          {items.length === 0 ? <Text style={{ color: t.grey, fontSize: 15, textAlign: 'center' }}>Plus aucun RDV décalé.</Text> : (
            <Card t={t} flush>
              {items.map((a, i) => {
                const ct = String(a.client_time).slice(11, 16);
                const now = String(a.scheduled_at).slice(11, 16);
                const d = toMin(now) - toMin(ct);
                return (
                  <ListRow key={a.id} t={t} first={i === 0}
                    right={
                      <TouchableOpacity style={styles(t).restore} disabled={busyId === a.id} onPress={() => onRestore(a, -d)} accessibilityRole="button">
                        {busyId === a.id ? <ActivityIndicator color={t.blue} /> : <Text style={styles(t).restoreTxt}>↩ {ct}</Text>}
                      </TouchableOpacity>
                    }>
                    <RowText t={t} title={a.client_name || 'Client'} meta={`Heure du client ${ct} → maintenant ${now} · ${d > 0 ? '+' : ''}${d} min`} />
                  </ListRow>
                );
              })}
            </Card>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ============================ Paramètres des RDV ============================ */

const SETTINGS: { key: keyof RdvSettings; label: string; hint?: string; options: [string, string][]; def: string }[] = [
  { key: 'rdv_slot_step_min', label: 'Pas des créneaux proposés', def: '15', options: [['5', '5 min'], ['10', '10 min'], ['15', '15 min'], ['20', '20 min'], ['30', '30 min']] },
  { key: 'rdv_min_lead_min', label: 'Délai minimum avant réservation', def: '0', hint: 'Empêche un client de réserver un créneau trop proche de maintenant.',
    options: [['0', 'Aucun'], ['5', '5 min'], ['10', '10 min'], ['15', '15 min'], ['30', '30 min'], ['60', '1 h']] },
  { key: 'rdv_max_advance_days', label: 'Réservable jusqu\'à', def: '0', options: [['0', 'Sans limite'], ['30', '30 jours'], ['60', '60 jours'], ['90', '90 jours']] },
  { key: 'rdv_buffer_min', label: 'Marge tampon entre 2 RDV', def: '0', hint: 'Temps de battement automatique après chaque prestation avant de proposer le créneau suivant.',
    options: [['0', 'Aucune'], ['5', '5 min'], ['10', '10 min'], ['15', '15 min']] },
  { key: 'rdv_cancel_deadline_min', label: 'Délai limite pour annuler en ligne', def: '0', hint: 'Passé ce délai, le client doit contacter directement le salon pour annuler.',
    options: [['0', 'Toujours'], ['60', '1 h avant'], ['120', '2 h avant'], ['1440', '24 h avant']] },
  { key: 'rdv_prep_alert_min', label: 'Alerte de préparation avant un RDV', def: '0', hint: 'Met en évidence le RDV à venir dans Mon poste pour que le coiffeur se prépare à temps.',
    options: [['0', 'Désactivée'], ['5', '5 min'], ['10', '10 min'], ['15', '15 min']] },
];

export function RdvSettingsSheet({ t, visible, salonSlug, auth, onClose, onSaved }: {
  t: Palette; visible: boolean; salonSlug: string; auth: ApiAuth; onClose: () => void; onSaved: () => void;
}) {
  const st = styles(t);
  const [vals, setVals] = useState<RdvSettings | null>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setVals(null);
    setErr('');
    fetchSettings(salonSlug, auth)
      .then((r) => {
        const s = r.settings ?? {};
        const v = {} as RdvSettings;
        SETTINGS.forEach((f) => { v[f.key] = String(s[f.key] ?? '') || f.def; });
        setVals(v);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Chargement impossible.'));
  }, [visible, salonSlug, auth]);

  const save = async () => {
    if (!vals || saving) return;
    setSaving(true);
    setErr('');
    try {
      await saveRdvSettings(salonSlug, auth, vals);
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <SheetHead t={t} left="Fermer" onLeft={onClose} title="Paramètres des RDV" right="Enregistrer" onRight={() => void save()} rightBusy={saving} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.page, paddingBottom: 40 }}>
          {!vals ? (err ? <ErrorText t={t} text={err} /> : <InlineLoading t={t} />) : SETTINGS.map((f) => (
            <View key={f.key} style={{ marginBottom: spacing.block - 4 }}>
              <Text style={st.label}>{f.label}</Text>
              <View style={st.opts}>
                {f.options.map(([v, l]) => {
                  const on = vals[f.key] === v;
                  return (
                    <TouchableOpacity key={v} style={[st.opt, on && { backgroundColor: t.blue }]} onPress={() => setVals({ ...vals, [f.key]: v })} accessibilityRole="button" accessibilityState={{ selected: on }}>
                      <Text style={[st.optTxt, on && { color: '#fff' }]}>{l}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {f.hint ? <Text style={st.hint}>{f.hint}</Text> : null}
            </View>
          ))}
          {vals && err ? <ErrorText t={t} text={err} /> : null}
          {vals ? <Text style={st.hint}>Le pas des créneaux règle aussi la graduation de l'agenda (Jour et Semaine).</Text> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = (t: Palette) =>
  StyleSheet.create({
    arrow: { width: 34, height: 34, borderRadius: 10, backgroundColor: t.blueSoft, alignItems: 'center', justifyContent: 'center' },
    restore: { backgroundColor: t.blueSoft, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, minWidth: 74, alignItems: 'center' },
    restoreTxt: { color: t.blue, fontSize: 14.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
    label: { color: t.ink, fontSize: 15.5, fontWeight: '600', marginHorizontal: 4, marginBottom: 8 },
    opts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    opt: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 99, backgroundColor: t.card, ...cardShadow(t) },
    optTxt: { color: t.ink, fontSize: 14, fontWeight: '600' },
    hint: { color: t.grey, fontSize: 12.5, marginTop: 6, marginHorizontal: 4, lineHeight: 17 },
  });
