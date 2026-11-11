// MAQUETTE — briques d'interface reprises de public/app.css, compte.html et rdv.html :
// fond gris clair, cartes blanches arrondies, nom du salon en petites capitales, gros titre,
// barre du bas avec l'onglet actif souligné en bleu, bouton bleu « .go » pleine largeur.
import React, { createContext, useContext } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Palette } from '../src/theme/theme';

export const ThemeCtx = createContext<{ t: Palette; toggle: () => void } | null>(null);
export function useT() {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error('ThemeCtx manquant');
  return v;
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Bouton rond du thème (en haut à droite sur toutes les pages du web). */
export function ThemeButton() {
  const { t, toggle } = useT();
  return (
    <Pressable onPress={toggle} hitSlop={8} style={({ pressed }) => [s.themeBtn, { backgroundColor: t.fill, borderColor: t.sep, opacity: pressed ? 0.7 : 1 }]}>
      <Ionicons name={t.scheme === 'dark' ? 'moon-outline' : 'sunny-outline'} size={20} color={t.ink} />
    </Pressable>
  );
}

/** En-tête de page : NOM DU SALON en capitales grises + titre (compte.html « Mon compte »). */
export function PageHeader({ salon, title, left, center = true }: { salon: string; title: string; left?: React.ReactNode; center?: boolean }) {
  const { t } = useT();
  return (
    <View style={s.header}>
      <View style={{ width: 44 }}>{left}</View>
      <View style={{ flex: 1, alignItems: center ? 'center' : 'flex-start' }}>
        <Text style={[s.salonTag, { color: t.grey }]} numberOfLines={1}>{salon.toUpperCase()}</Text>
        <Text style={[s.h1, { color: t.ink }]} numberOfLines={1}>{title}</Text>
      </View>
      <ThemeButton />
    </View>
  );
}

export function BackLink({ onPress, label = 'Retour' }: { onPress: () => void; label?: string }) {
  const { t } = useT();
  return (
    <Pressable onPress={onPress} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
      <Ionicons name="chevron-back" size={18} color={t.blue} />
      <Text style={{ color: t.blue, fontSize: 15, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}

/** Petit titre de section (.eyebrow du web). */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  return <Text style={[s.eyebrow, { color: t.grey }]}>{children}</Text>;
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const { t } = useT();
  const base = [s.card, { backgroundColor: t.card }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [...base, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      {children}
    </Pressable>
  );
}

/** Bouton principal bleu pleine largeur (.go). */
export function Go({ label, onPress, disabled, icon }: { label: string; onPress: () => void; disabled?: boolean; icon?: IconName }) {
  const { t } = useT();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [s.go, { backgroundColor: t.blue, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      {icon ? <Ionicons name={icon} size={18} color="#fff" style={{ marginRight: 8 }} /> : null}
      <Text style={s.goText}>{label}</Text>
    </Pressable>
  );
}

export function SoftButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  const { t } = useT();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.soft, { backgroundColor: t.fill, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={{ color: danger ? t.red : t.ink, fontWeight: '600', fontSize: 14.5 }}>{label}</Text>
    </Pressable>
  );
}

/** Barre du bas (compte.html / poste.html) : icône + libellé, trait bleu au-dessus de l'onglet actif. */
export function TabBar<K extends string>({ tabs, active, onChange, bottomInset }: {
  tabs: { key: K; label: string; icon: IconName }[]; active: K; onChange: (k: K) => void; bottomInset: number;
}) {
  const { t } = useT();
  return (
    <View style={[s.tabbar, { backgroundColor: t.card, borderColor: t.sep, paddingBottom: Math.max(bottomInset, 10) }]}>
      {tabs.map((tab) => {
        const on = tab.key === active;
        const color = on ? t.blue : t.grey;
        return (
          <Pressable key={tab.key} onPress={() => onChange(tab.key)} style={s.tab} hitSlop={4}>
            <View style={[s.tabMark, { backgroundColor: on ? t.blue : 'transparent' }]} />
            <Ionicons name={tab.icon} size={22} color={color} />
            <Text style={[s.tabLabel, { color, fontWeight: on ? '600' : '500' }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Pastille ronde avec initiale (coiffeurs). */
export function Avatar({ initials, color, size = 44 }: { initials: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.4 }}>{initials}</Text>
    </View>
  );
}

/** Sélecteur segmenté (Jour / Semaine / Mois, Prestations / Suppléments / Produits). */
export function Segmented<K extends string>({ items, value, onChange, style }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void; style?: ViewStyle }) {
  const { t } = useT();
  return (
    <View style={[{ flexDirection: 'row', backgroundColor: t.fill, borderRadius: 14, padding: 4 }, style]}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable key={it.key} onPress={() => onChange(it.key)} style={[{ flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center' }, on && { backgroundColor: t.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }]}>
            <Text style={{ color: t.ink, fontWeight: on ? '700' : '500', fontSize: 14 }}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Bulles des coiffeurs (caisse, agenda, rendez-vous du web) : la bulle choisie a un anneau bleu. */
export function Bubbles({ people, value, onChange, size = 46 }: { people: { id: string; initials: string; color: string }[]; value: string | null; onChange?: (id: string) => void; size?: number }) {
  const { t } = useT();
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      {people.map((p) => {
        const on = p.id === value;
        return (
          <Pressable key={p.id} onPress={() => onChange?.(p.id)} style={{ padding: 3, borderRadius: 99, borderWidth: 3, borderColor: on ? t.blue : 'transparent' }}>
            <Avatar initials={p.initials} color={p.color} size={size} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Pastille de texte (RDV, Payé d'avance, Sans RDV...). */
export function Pill({ label, tone = 'blue', icon }: { label: string; tone?: 'blue' | 'grey' | 'green' | 'orange' | 'red'; icon?: IconName }) {
  const { t } = useT();
  const fg = tone === 'blue' ? t.blue : tone === 'green' ? t.green : tone === 'orange' ? t.orange : tone === 'red' ? t.red : t.ink;
  const bg = tone === 'blue' ? t.blueSoft : tone === 'grey' ? t.fill : fg + '22';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: bg, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' }}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

/** Feuille qui monte du bas (fenêtres du web : confirmer, encaisser, ticket Z...). */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const { t } = useT();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.35)' }} onPress={onClose} />
      <View style={{ backgroundColor: t.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', paddingBottom: 30 }}>
        <View style={{ alignItems: 'center', paddingTop: 8 }}><View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: t.fill2 }} /></View>
        {title ? <Text style={{ color: t.ink, fontSize: 19, fontWeight: '700', textAlign: 'center', marginTop: 12, marginBottom: 4 }}>{title}</Text> : null}
        <ScrollView contentContainerStyle={{ padding: 18 }}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

/** Pavé du code PIN (poste.html / caisse.html) : 4 pastilles + clavier. */
export function PinPad({ title, sub, onDone, error }: { title: string; sub: string; onDone: (pin: string) => void; error?: string }) {
  const { t } = useT();
  const [pin, setPin] = React.useState('');
  const press = (k: string) => {
    if (k === 'del') return setPin((p) => p.slice(0, -1));
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) setTimeout(() => { onDone(next); setPin(''); }, 150);
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 30 }}>
      <Text style={{ color: t.ink, fontSize: 24, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: t.grey, fontSize: 15, marginTop: 6, textAlign: 'center' }}>{sub}</Text>
      <View style={{ flexDirection: 'row', gap: 16, marginVertical: 26 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: i < pin.length ? t.ink : 'transparent', borderWidth: 2, borderColor: i < pin.length ? t.ink : t.sep }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 282, gap: 14, justifyContent: 'center' }}>
        {keys.map((k, i) => k === '' ? <View key={i} style={{ width: 84, height: 70 }} /> : (
          <Pressable key={i} onPress={() => press(k)} style={({ pressed }) => ({ width: 84, height: 70, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: k === 'del' ? 'transparent' : pressed ? t.fill2 : t.card })}>
            {k === 'del' ? <Ionicons name="backspace-outline" size={26} color={t.ink} /> : <Text style={{ color: t.ink, fontSize: 28, fontWeight: '500' }}>{k}</Text>}
          </Pressable>
        ))}
      </View>
      <Text style={{ color: t.red, marginTop: 16, minHeight: 20 }}>{error ?? ''}</Text>
    </View>
  );
}

/** Champ de formulaire (libellé + saisie), comme les .fld du web. */
export function Field({ label, style, ...props }: { label: string; style?: ViewStyle } & TextInputProps) {
  const { t } = useT();
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      <Text style={{ color: t.grey, marginBottom: 6, fontWeight: '600' }}>{label}</Text>
      <TextInput placeholderTextColor={t.grey} {...props}
        style={[{ backgroundColor: t.fill, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: t.ink }, props.multiline ? { minHeight: 80, textAlignVertical: 'top' } : null]} />
    </View>
  );
}

/** Ligne avec interrupteur (réglages). */
export function ToggleRow({ label, sub, value, onChange, last }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  const { t } = useT();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderColor: t.sep }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.ink, fontSize: 15.5 }}>{label}</Text>
        {sub ? <Text style={{ color: t.grey, fontSize: 12.5, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.green, false: t.fill2 }} />
    </View>
  );
}

/** Ligne cliquable (libellé · valeur ›). */
export function RowLink({ label, value, onPress, last, danger, icon }: { label: string; value?: string; onPress?: () => void; last?: boolean; danger?: boolean; icon?: IconName }) {
  const { t } = useT();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderColor: t.sep, opacity: pressed ? 0.6 : 1 })}>
      {icon ? <Ionicons name={icon} size={19} color={danger ? t.red : t.blue} /> : null}
      <Text style={{ color: danger ? t.red : t.ink, fontSize: 15.5, flex: 1 }}>{label}</Text>
      {value ? <Text style={{ color: t.grey, fontSize: 14, maxWidth: '50%' }} numberOfLines={1}>{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={17} color={t.grey} /> : null}
    </Pressable>
  );
}

/** Pas à pas (−  valeur  +). */
export function Stepper({ value, onChange, step = 1, min = 0, max = 9999, format }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; format?: (v: number) => string }) {
  const { t } = useT();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Pressable onPress={() => onChange(Math.max(min, value - step))} hitSlop={6} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.fill, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: t.ink, fontSize: 18 }}>−</Text></Pressable>
      <Text style={{ color: t.ink, fontWeight: '700', minWidth: 54, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{format ? format(value) : value}</Text>
      <Pressable onPress={() => onChange(Math.min(max, value + step))} hitSlop={6} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.fill, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: t.ink, fontSize: 18 }}>+</Text></Pressable>
    </View>
  );
}

/** Petit message en bas d'écran (toast du web), avec action facultative. */
export function useToast(): [React.ReactNode, (text: string, action?: { label: string; run: () => void }) => void] {
  const { t } = useT();
  const [msg, setMsg] = React.useState<{ text: string; action?: { label: string; run: () => void } } | null>(null);
  React.useEffect(() => { if (!msg) return; const id = setTimeout(() => setMsg(null), 3200); return () => clearTimeout(id); }, [msg]);
  const node = msg ? (
    <View style={{ position: 'absolute', left: 14, right: 14, bottom: 12, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.ink, zIndex: 50 }}>
      <Text style={{ color: t.bg, fontWeight: '600', flex: 1 }}>{msg.text}</Text>
      {msg.action ? <Pressable onPress={() => { msg.action!.run(); setMsg(null); }}><Text style={{ color: '#ffd60a', fontWeight: '800' }}>{msg.action.label}</Text></Pressable> : null}
    </View>
  ) : null;
  return [node, (text, action) => setMsg({ text, action })];
}

/** Puces de choix (une ou plusieurs). */
export function Chips<K extends string>({ items, value, onToggle }: { items: { key: K; label: string; color?: string }[]; value: K[]; onToggle: (k: K) => void }) {
  const { t } = useT();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((it) => {
        const on = value.includes(it.key);
        return (
          <Pressable key={it.key} onPress={() => onToggle(it.key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: on ? t.blue : t.fill }}>
            {it.color ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: it.color }} /> : null}
            <Text style={{ color: on ? '#fff' : t.ink, fontWeight: '600', fontSize: 13.5 }}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const s = StyleSheet.create({
  themeBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 6, paddingBottom: 14 },
  salonTag: { fontSize: 13, fontWeight: '600', letterSpacing: 0.6 },
  h1: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5, marginTop: 2 },
  eyebrow: { fontSize: 15, fontWeight: '600', marginTop: 22, marginBottom: 10 },
  card: { borderRadius: 18, padding: 16 },
  go: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingVertical: 16 },
  goText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  soft: { borderRadius: 12, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center' },
  tabbar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: -2 }, elevation: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  tabMark: { width: 30, height: 3, borderRadius: 2, marginBottom: 4 },
  tabLabel: { fontSize: 12 },
});
