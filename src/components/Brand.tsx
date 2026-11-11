import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { brand, colors, fonts, themed } from '@/theme';

/**
 * ZestWell mark: a lime citrus slice with a leaf on forest green. Same geometry
 * as the app icon (scripts/make_logo.py): slice radius R = 12.5, centred so the
 * slice and leaf together sit in the middle of the tile.
 */
const SPOKES = Array.from({ length: 7 }, (_, k) => {
  const a = ((-78 + (k * 360) / 7) * Math.PI) / 180;
  return { x: 22.5 + Math.cos(a) * 10, y: 26.5 + Math.sin(a) * 10 };
});

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityLabel="ZestWell">
      <Rect x={0} y={0} width={48} height={48} rx={11} fill={brand.bg} />
      <Path d="M28.5 18.9Q36.3 17.5 33.1 10.25Q25.3 11.6 28.5 18.9Z" fill={brand.leaf} />
      <Path d="M28.5 18.9L32.1 12.15" stroke={brand.vein} strokeWidth={0.6} />
      <Circle cx={22.5} cy={26.5} r={12.5} fill={brand.rind} />
      <Circle cx={22.5} cy={26.5} r={10.6} fill={brand.pith} />
      <Circle cx={22.5} cy={26.5} r={9.6} fill={brand.flesh} />
      {SPOKES.map((p, i) => (
        <Path key={i} d={`M22.5 26.5L${p.x.toFixed(2)} ${p.y.toFixed(2)}`} stroke={brand.pith} strokeWidth={1.1} />
      ))}
      <Circle cx={22.5} cy={26.5} r={1.6} fill={brand.pith} />
    </Svg>
  );
}

export function Wordmark() {
  return (
    <View style={styles.word}>
      <Logo size={32} />
      <Text style={styles.wordText}>ZestWell</Text>
    </View>
  );
}

/** Welcome: the day ring with water, sleep and movement chips. */
export function DayIllustration({ size = 300 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 300 300" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={150} cy={150} r={138} fill={colors.accentSoft} />
      <Circle cx={150} cy={150} r={78} fill="none" stroke={colors.kcalTrack} strokeWidth={18} />
      <G rotation={-90} origin="150, 150">
        <Circle cx={150} cy={150} r={78} fill="none" stroke={colors.accent} strokeWidth={18} strokeLinecap="round" strokeDasharray="390 490" />
      </G>
      <SvgText x={150} y={146} textAnchor="middle" fontSize={34} fontWeight="700" fontFamily={fonts.number} fill={colors.ink}>
        1 480
      </SvgText>
      <SvgText x={150} y={172} textAnchor="middle" fontSize={14} fontFamily={fonts.bodyMedium} fill={colors.caption}>
        no 1 750 kcal
      </SvgText>
      <Rect x={222} y={48} width={58} height={58} rx={18} fill={colors.card} />
      <Path d="M251 62s12 13 12 22a12 12 0 0 1-24 0c0-9 12-22 12-22z" fill={colors.waterSoft} stroke={colors.water} strokeWidth={2} />
      <Rect x={22} y={196} width={58} height={58} rx={18} fill={colors.card} />
      <Path d="M62 232a14 14 0 1 1-17-18 11 11 0 0 0 17 18z" fill={colors.proteinTrack} stroke={colors.protein} strokeWidth={2} />
      <Rect x={206} y={214} width={66} height={40} rx={14} fill={colors.card} />
      <Path d="M216 236h9l5-10 7 18 5-8h20" fill="none" stroke={colors.steps} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const styles = themed(() => StyleSheet.create({
  word: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordText: { fontFamily: fonts.heading, fontSize: 22, color: colors.ink },
}));
