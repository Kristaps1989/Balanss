import Svg, { Path, Polygon } from 'react-native-svg';

import { colors } from '@/theme';

/** Tapered glass that fills with the day's water (prototype: Home). */
export function WaterGlass({ progress }: { progress: number }) {
  const ratio = Math.max(0, Math.min(1, progress));
  const top = 101 - 94 * ratio;
  const inset = (y: number) => (8 * (y - 6)) / 98;
  const xl = 11 + inset(top);
  const xr = 69 - inset(top);
  const pts = `${xl.toFixed(1)},${top.toFixed(1)} ${xr.toFixed(1)},${top.toFixed(1)} 62,101 18,101`;
  return (
    <Svg width={80} height={110} viewBox="0 0 80 110">
      <Polygon points={pts} fill={colors.waterFill} />
      <Path d="M8 6 L72 6 L64 104 L16 104 Z" fill="none" stroke={colors.water} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M14 30 L66 30" stroke={colors.white} strokeWidth={1} opacity={0.6} />
    </Svg>
  );
}
