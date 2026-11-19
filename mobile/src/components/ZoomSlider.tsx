// Curseur de zoom de l'agenda (− ━━●━━ +) : glisser le rond ou toucher la
// barre pour un zoom continu ; − et + avancent par pas.
import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Palette, cardShadow } from '../theme/theme';

const THUMB = 20;

export function ZoomSlider({ t, value, min, max, step, onChange, width = 96 }: {
  t: Palette; value: number; min: number; max: number; step: number; onChange: (v: number) => void; width?: number;
}) {
  const s = styles(t);
  const [w] = useState(width);
  const ref = useRef({ value, min, max, onChange, startX: 0 });
  ref.current.value = value; ref.current.min = min; ref.current.max = max; ref.current.onChange = onChange;
  const clamp = (v: number) => Math.max(ref.current.min, Math.min(ref.current.max, v));
  const fromX = (x: number) => clamp(ref.current.min + (Math.max(0, Math.min(w, x)) / w) * (ref.current.max - ref.current.min));
  const raf = useRef<number | null>(null);
  const emit = (v: number) => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => { raf.current = null; ref.current.onChange(Math.round(v * 100) / 100); });
  };
  const pr = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { ref.current.startX = e.nativeEvent.locationX - THUMB / 2; emit(fromX(ref.current.startX)); },
    onPanResponderMove: (_e, g) => emit(fromX(ref.current.startX + g.dx)),
  })).current;
  const pos = ((value - min) / (max - min)) * w;

  return (
    <View style={s.wrap}>
      <TouchableOpacity onPress={() => onChange(clamp(value - step))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dézoomer">
        <Ionicons name="remove" size={18} color={value <= min ? t.sep : t.ink} />
      </TouchableOpacity>
      <View style={{ width: w + THUMB, height: 28, justifyContent: 'center' }} {...pr.panHandlers}
        accessibilityRole="adjustable" accessibilityLabel="Zoom de l'agenda"
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(clamp(value + (e.nativeEvent.actionName === 'increment' ? step : -step)))}>
        <View pointerEvents="none" style={[s.track, { width: w, marginLeft: THUMB / 2 }]}>
          <View style={[s.fill, { width: pos }]} />
        </View>
        <View pointerEvents="none" style={[s.thumb, { left: pos }]} />
      </View>
      <TouchableOpacity onPress={() => onChange(clamp(value + step))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Zoomer">
        <Ionicons name="add" size={18} color={value >= max ? t.sep : t.ink} />
      </TouchableOpacity>
    </View>
  );
}

const styles = (t: Palette) =>
  StyleSheet.create({
    wrap: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.fill, borderRadius: 99, paddingVertical: 2, paddingHorizontal: 10 },
    track: { height: 4, borderRadius: 2, backgroundColor: t.fill2, overflow: 'hidden' },
    fill: { height: '100%', backgroundColor: t.blue },
    thumb: { position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: '#fff', ...cardShadow(t), shadowOpacity: 0.3, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.12)' },
  });
