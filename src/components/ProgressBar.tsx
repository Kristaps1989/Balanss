import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

interface Props {
  progress: number;
  color: string;
  trackColor?: string;
  height?: number;
}

/** Horizontal bar; clamps at 100% (over target is never shown as red). */
export function ProgressBar({ progress, color, trackColor = colors.track, height = 8 }: Props) {
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <View style={[styles.track, { backgroundColor: trackColor, height, borderRadius: height / 2 }]}>
      <View style={{ width: `${pct}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden' },
});
