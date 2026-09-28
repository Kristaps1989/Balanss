import { useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { colors } from '@/theme';

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  color?: string;
  label: string;
  testID?: string;
}

/** Lightweight slider (works on native and web, no native dependency). */
export function Slider({ value, min, max, step = 1, onChange, color = colors.accent, label, testID }: Props) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);

  const fromEvent = (e: GestureResponderEvent) => {
    const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / Math.max(1, widthRef.current)));
    onChange(Math.round((min + ratio * (max - min)) / step) * step);
  };

  const ratio = max > min ? (Math.min(max, Math.max(min, value)) - min) / (max - min) : 0;
  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };

  return (
    <View
      testID={testID}
      style={styles.hit}
      onLayout={onLayout}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) =>
        onChange(Math.max(min, Math.min(max, value + (e.nativeEvent.actionName === 'increment' ? step * 5 : -step * 5))))
      }
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={fromEvent}
      onResponderMove={fromEvent}>
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: width * ratio, backgroundColor: color }]} />
      </View>
      <View pointerEvents="none" style={[styles.thumb, { left: Math.max(0, width * ratio - 12), borderColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 44, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 3,
    top: 10,
  },
});
