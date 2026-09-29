import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { colors, fonts } from '@/theme';

/** Latvian weekday initials, Monday first (prototype: P O T C Pk S Sv). */
export const WEEKDAY_SHORT = ['Sv', 'P', 'O', 'T', 'C', 'Pk', 'S'];

export function weekdayShort(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAY_SHORT[new Date(y, m - 1, d).getDay()];
}

interface BarProps {
  values: number[];
  labels: string[];
  max: number;
  height?: number;
  /** Target line value and caption, e.g. "mērķis 1 750". */
  target?: { value: number; label: string };
  color: string;
  mutedColor?: string;
  /** Index to highlight (today); the rest use mutedColor. */
  highlight?: number;
  accessibilityLabel: string;
}

/** Vertical bar chart with an optional dashed target line (prototype: Food-Trends, Move). */
export function BarChart({ values, labels, max, height = 150, target, color, mutedColor = colors.barMuted, highlight, accessibilityLabel }: BarProps) {
  const h = (v: number) => Math.max(2, Math.min(1, v / max) * height);
  return (
    <View accessible accessibilityLabel={accessibilityLabel}>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        {target && (
          <View pointerEvents="none" style={[styles.targetLine, { bottom: h(target.value) }]}>
            {target.label ? <Text style={styles.targetLabel}>{target.label}</Text> : null}
          </View>
        )}
        {values.map((v, i) => (
          <View key={i} style={{ flex: 1, height: h(v), borderRadius: 8, backgroundColor: i === highlight ? color : mutedColor }} />
        ))}
      </View>
      <View style={styles.labels}>
        {labels.map((l, i) => (
          <Text key={i} style={[styles.label, i === highlight && { color: colors.ink, fontFamily: fonts.bodyBold }]}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Tiny line chart for 7-day trends (prototype: Move resting HR / HRV). */
export function Sparkline({ values, color, width = 130, height = 40 }: { values: (number | null)[]; color: string; width?: number; height?: number }) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return <View style={{ width, height }} />;
  const lo = Math.min(...nums) - 2;
  const hi = Math.max(...nums) + 2;
  const step = (width - 8) / Math.max(1, values.length - 1);
  const pts = values
    .map((v, i) => (v === null ? null : `${(4 + i * step).toFixed(1)},${(height - 4 - ((v - lo) / (hi - lo)) * (height - 8)).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');
  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  targetLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.caption,
    zIndex: 1,
  },
  targetLabel: {
    position: 'absolute',
    right: 0,
    top: -18,
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    color: colors.caption,
    backgroundColor: colors.card,
    paddingHorizontal: 4,
  },
  labels: { flexDirection: 'row', gap: 8, marginTop: 8 },
  label: { flex: 1, textAlign: 'center', fontFamily: fonts.bodySemi, fontSize: 12, color: colors.caption },
});
