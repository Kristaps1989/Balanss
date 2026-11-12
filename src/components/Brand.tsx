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

/** Welcome: the same thin day ring and light number the user will see on Šodiena. */
export function DayIllustration({ size = 300 }: { size?: number }) {
  const c = 2 * Math.PI * 138;
  return (
    <Svg width={size} height={size} viewBox="0 0 300 300" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={150} cy={150} r={138} fill="none" stroke={colors.kcalTrack} strokeWidth={8} />
      <G rotation={-90} origin="150, 150">
        <Circle cx={150} cy={150} r={138} fill="none" stroke={colors.accent} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${c * 0.846} ${c}`} />
      </G>
      <SvgText x={150} y={168} textAnchor="middle" fontSize={84} fontFamily={fonts.light} letterSpacing={-4} fill={colors.ink}>
        270
      </SvgText>
      <SvgText x={150} y={198} textAnchor="middle" fontSize={16} fontFamily={fonts.bodyMedium} fill={colors.text2}>
        kcal vēl šodien
      </SvgText>
    </Svg>
  );
}

const styles = themed(() => StyleSheet.create({
  word: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordText: { fontFamily: fonts.heading, fontSize: 22, color: colors.ink, letterSpacing: -0.7 },
}));
