// Composants d'interface partagés — docs/DESIGN.md §4, référence visuelle
// mobile/maquette/design-dashboard.html. À utiliser dans TOUTES les sections
// (pas de styles dupliqués écran par écran).
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Palette, cardShadow, radius, spacing } from '../theme/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type Tone = 'blue' | 'green' | 'orange' | 'red' | 'grey';

function toneColors(t: Palette, tone: Tone): { fg: string; bg: string } {
  switch (tone) {
    case 'green': return { fg: t.green, bg: t.greenSoft };
    case 'orange': return { fg: t.orange, bg: t.orangeSoft };
    case 'red': return { fg: t.red, bg: t.redSoft };
    case 'grey': return { fg: t.grey, bg: t.fill };
    default: return { fg: t.blue, bg: t.blueSoft };
  }
}

/* ---------- Titres ---------- */

/** Titre de page 28/700 + sous-titre gris. `accent` = partie en bleu. */
export function PageTitle({ t, title, accent, subtitle }: { t: Palette; title: string; accent?: string; subtitle?: string }) {
  return (
    <View style={{ marginTop: 6, marginBottom: spacing.block - 4 }}>
      <Text style={{ color: t.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.6 }} numberOfLines={2}>
        {title}
        {accent ? <Text style={{ color: t.blue }}>{accent}</Text> : null}
      </Text>
      {subtitle ? <Text style={{ color: t.grey, fontSize: 15, marginTop: 2 }}>{subtitle}</Text> : null}
    </View>
  );
}

/** Titre de bloc 20/700 au-dessus d'une carte, action bleue optionnelle à droite. */
export function SectionHeader({ t, title, action, onAction }: { t: Palette; title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginHorizontal: 4, marginBottom: 8 }}>
      <Text style={{ color: t.ink, fontSize: 20, fontWeight: '700', letterSpacing: -0.4, flexShrink: 1 }} numberOfLines={1}>{title}</Text>
      {action ? (
        <TouchableOpacity onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <Text style={{ color: t.blue, fontSize: 15, fontWeight: '500' }}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/* ---------- Tuiles ---------- */

/** Pastille d'icône 32×32 teintée. */
export function IconBadge({ t, icon, tone = 'blue', size = 32 }: { t: Palette; icon: IconName; tone?: Tone; size?: number }) {
  const c = toneColors(t, tone);
  return (
    <View style={{ width: size, height: size, borderRadius: 10, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={Math.round(size * 0.53)} color={c.fg} />
    </View>
  );
}

/** Tuile KPI : pastille d'icône, chiffre 28/700, libellé 13 gris. */
export function KpiTile({ t, icon, tone, value, label, loading }: {
  t: Palette; icon: IconName; tone?: Tone; value: string; label: string; loading?: boolean;
}) {
  return (
    <View style={[styles.tile(t), { gap: 10 }]}>
      <IconBadge t={t} icon={icon} tone={tone} />
      <View>
        <Text style={[styles.num, { color: t.ink, fontSize: 28 }]} numberOfLines={1} adjustsFontSizeToFit>
          {loading ? '–' : value}
        </Text>
        <Text style={{ color: t.grey, fontSize: 13, marginTop: 3 }} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

/** Petite carte chiffre : libellé, valeur 22/700, détail. */
export function MiniStat({ t, label, value, valueColor, detail, loading }: {
  t: Palette; label: string; value: string; valueColor?: string; detail?: string; loading?: boolean;
}) {
  return (
    <View style={styles.tile(t)}>
      <Text style={{ color: t.grey, fontSize: 13 }} numberOfLines={1}>{label}</Text>
      <Text style={[styles.num, { color: valueColor ?? t.ink, fontSize: 22, marginTop: 4 }]} numberOfLines={1} adjustsFontSizeToFit>
        {loading ? '–' : value}
      </Text>
      {detail ? <Text style={{ color: t.grey, fontSize: 12, marginTop: 4 }} numberOfLines={2}>{detail}</Text> : null}
    </View>
  );
}

/** Grille 2 colonnes, 10 px d'écart. */
export function Grid2({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={{ gap: spacing.grid, marginBottom: spacing.block }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: spacing.grid }}>
          {row.map((child, j) => <View key={j} style={{ flex: 1 }}>{child}</View>)}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

/** Pastille de stat (fond fill) : chiffre 20/700 + point couleur + libellé. */
export function StatPill({ t, value, label, color }: { t: Palette; value: string; label: string; color: string }) {
  return (
    <View style={{ backgroundColor: t.fill, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 12 }}>
      <Text style={[styles.num, { color: t.ink, fontSize: 20 }]}>{value}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 2 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginTop: 5 }} />
        <Text style={{ color: t.grey, fontSize: 12.5, flex: 1 }}>{label}</Text>
      </View>
    </View>
  );
}

/* ---------- Contrôles ---------- */

/** Contrôle segmenté iOS pleine largeur. */
export function Segmented<K extends string>({ t, options, value, onChange }: {
  t: Palette; options: { key: K; label: string }[]; value: K; onChange: (k: K) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.fill, borderRadius: 10, padding: 2, gap: 2 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[
              { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8 },
              on && { backgroundColor: t.segOn, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
            ]}
          >
            <Text style={{ color: t.ink, fontSize: 14, fontWeight: '600', opacity: on ? 1 : 0.75 }} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Navigation de période sur sa propre ligne : ‹ libellé ›. */
export function PeriodNav({ t, label, onPrev, onNext, nextDisabled }: {
  t: Palette; label: string; onPrev: () => void; onNext: () => void; nextDisabled?: boolean;
}) {
  const Btn = ({ icon, onPress, disabled }: { icon: IconName; onPress: () => void; disabled?: boolean }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', ...cardShadow(t) }, disabled && { opacity: 0.35 }]}
    >
      <Ionicons name={icon} size={17} color={t.blue} />
    </TouchableOpacity>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 14, marginHorizontal: 2 }}>
      <Btn icon="chevron-back" onPress={onPrev} />
      <Text style={{ color: t.ink, fontSize: 15, fontWeight: '600', flex: 1, textAlign: 'center', textTransform: 'capitalize' }} numberOfLines={1}>
        {label}
      </Text>
      <Btn icon="chevron-forward" onPress={onNext} disabled={nextDisabled} />
    </View>
  );
}

/* ---------- Listes ---------- */

/** Ligne de liste iOS. `first` = pas de séparateur ; `inset` = indentation du séparateur. */
export function ListRow({ t, first, inset = 16, left, children, right, onPress, chevron }: {
  t: Palette; first?: boolean; inset?: number; left?: React.ReactNode; children: React.ReactNode;
  right?: React.ReactNode; onPress?: () => void; chevron?: boolean;
}) {
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: spacing.md }}>
      {!first ? (
        <View style={{ position: 'absolute', top: 0, left: inset, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: t.hair }} />
      ) : null}
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={16} color={t.sep} /> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button">{body}</Pressable> : body;
}

/** Texte principal / secondaire d'une ligne. */
export function RowText({ t, title, meta }: { t: Palette; title: string; meta?: string }) {
  return (
    <>
      <Text style={{ color: t.ink, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{title}</Text>
      {meta ? <Text style={{ color: t.grey, fontSize: 13, marginTop: 1 }} numberOfLines={1}>{meta}</Text> : null}
    </>
  );
}

/** Avatar rond aux initiales (couleur du coiffeur). */
export function Avatar({ t, name, color, size = 34 }: { t: Palette; name: string | null | undefined; color?: string | null; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color || t.blue, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: Math.round(size * 0.37), fontWeight: '700' }}>{initials(name)}</Text>
    </View>
  );
}

export function initials(name: string | null | undefined): string {
  return (
    (name ?? '')
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '–'
  );
}

/** Étiquette arrondie (fond fill). */
export function Chip({ t, label }: { t: Palette; label: string }) {
  return (
    <View style={{ backgroundColor: t.fill, borderRadius: 99, paddingVertical: 3, paddingHorizontal: 8 }}>
      <Text style={{ color: t.ink, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Variation en % : pastille verte ▲ / rouge ▼ ; rien si inconnue. */
export function Delta({ t, pc }: { t: Palette; pc: number | null }) {
  if (pc === null) return null;
  const up = pc >= 0;
  return (
    <View style={{ backgroundColor: up ? t.greenSoft : t.redSoft, borderRadius: 99, paddingVertical: 3, paddingHorizontal: 8 }}>
      <Text style={{ color: up ? t.green : t.red, fontSize: 13, fontWeight: '600' }}>
        {up ? '▲' : '▼'} {Math.abs(pc)} %
      </Text>
    </View>
  );
}

/* ---------- Graphique ---------- */

/** Barres : blueSoft, la plus haute ou la sélectionnée en blue. */
export function BarChart({ t, values, labels, selected, onSelect, height = 110 }: {
  t: Palette; values: number[]; labels: string[]; selected: number | null; onSelect: (i: number | null) => void; height?: number;
}) {
  const max = Math.max(1, ...values);
  const dense = values.length > 12;
  const every = values.length > 20 ? 5 : values.length > 12 ? 3 : 1;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: dense ? 2 : 8, height: height + 18, marginTop: 14 }}>
      {values.map((v, i) => {
        const hi = selected === i || (selected === null && v === max && v > 0);
        return (
          <Pressable key={i} onPress={() => onSelect(selected === i ? null : i)} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 6 }}>
            <View
              style={{
                width: '100%',
                height: Math.max(3, (v / max) * height),
                borderTopLeftRadius: dense ? 2 : 6,
                borderTopRightRadius: dense ? 2 : 6,
                borderBottomLeftRadius: dense ? 1 : 3,
                borderBottomRightRadius: dense ? 1 : 3,
                backgroundColor: hi ? t.blue : t.blueSoft,
              }}
            />
            <Text style={{ color: t.grey, fontSize: 11, fontWeight: '500' }} numberOfLines={1}>
              {i % every === 0 ? labels[i] ?? '' : ' '}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- États ---------- */

export function InlineLoading({ t }: { t: Palette }) {
  return <ActivityIndicator color={t.blue} style={{ paddingVertical: 12 }} />;
}

export function EmptyText({ t, text }: { t: Palette; text: string }) {
  return <Text style={{ color: t.grey, fontSize: 15, textAlign: 'center', paddingVertical: 12 }}>{text}</Text>;
}

export function ErrorText({ t, text, onRetry }: { t: Palette; text: string; onRetry?: () => void }) {
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
      <Text style={{ color: t.red, fontSize: 14, textAlign: 'center' }}>{text}</Text>
      {onRetry ? (
        <TouchableOpacity onPress={onRetry} accessibilityRole="button">
          <Text style={{ color: t.blue, fontSize: 15, fontWeight: '600' }}>Réessayer</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = {
  tile: (t: Palette) => ({ backgroundColor: t.card, borderRadius: radius.card, padding: 14, ...cardShadow(t) }),
  num: { fontWeight: '700' as const, letterSpacing: -0.6, fontVariant: ['tabular-nums' as const] },
};
