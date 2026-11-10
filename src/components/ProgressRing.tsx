import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, themed } from '@/theme';

interface Props {
  size: number;
  stroke: number;
  /** 0..1; values above 1 are drawn as a full ring (never red). */
  progress: number;
  color: string;
  trackColor?: string;
  /** Fill from the last value on change (700 ms ease-out); off when the phone asks for reduced motion. */
  animate?: boolean;
  children?: ReactNode;
}

const clamp = (p: number) => (Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0);

/** Eases from the previously shown value to `target`; jumps straight there with reduced motion. */
function useEased(target: number, enabled: boolean) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          from.current = target;
          setShown(target);
          return;
        }
        const start = Date.now();
        const a = from.current;
        const tick = () => {
          const t = Math.min(1, (Date.now() - start) / 700);
          const v = a + (target - a) * (1 - (1 - t) ** 3);
          from.current = v;
          setShown(v);
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [target, enabled]);
  return enabled ? shown : target;
}

/** Thin rounded ring (one per screen: kcal on Šodiena). */
export function ProgressRing({ size, stroke, progress, color, trackColor = colors.track, animate = false, children }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = useEased(clamp(progress), animate);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        {p > 0.001 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - p)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    center: { alignItems: 'center', justifyContent: 'center' },
  }),
);
