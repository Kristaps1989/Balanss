import { useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { valueAt } from '@/lib/portion';

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
  const viewRef = useRef<View>(null);
  // Track's left edge on screen, measured at touch start. pageX - left is reliable on Android,
  // where locationX can be relative to whatever view is under the finger during a move.
  const leftRef = useRef<number | null>(null);

  const emit = (x: number) => {
    const v = valueAt(x, widthRef.current, min, max, step);
    if (v !== value) onChange(v);
  };
  const onGrant = (e: GestureResponderEvent) => {
    const { pageX, locationX } = e.nativeEvent;
    leftRef.current = pageX - locationX;
    emit(locationX);
    viewRef.current?.measure((_x, _y, _w, _h, px) => {
      if (Number.isFinite(px)) leftRef.current = px;
    });
  };
  const onMove = (e: GestureResponderEvent) => emit(e.nativeEvent.pageX - (leftRef.current ?? 0));

  const ratio = max > min ? (Math.min(max, Math.max(min, value)) - min) / (max - min) : 0;
  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };

  return (
    <View
      ref={viewRef}
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
      onResponderGrant={onGrant}
      onResponderMove={onMove}>
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
