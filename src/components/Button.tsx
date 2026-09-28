import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, space } from '@/theme';

import { Icon, type IconName } from './Icon';

type Variant = 'dark' | 'light' | 'accent' | 'soft' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  size?: 'lg' | 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

const BG: Record<Variant, string> = {
  dark: colors.ink,
  light: colors.white,
  accent: colors.commit,
  soft: colors.chip,
  ghost: 'transparent',
  danger: colors.white,
};
const FG: Record<Variant, string> = {
  dark: colors.white,
  light: colors.ink,
  accent: colors.white,
  soft: colors.ink,
  ghost: colors.text2,
  danger: colors.accentDeep,
};
const H = { lg: 56, md: 48, sm: 40 };

/** Pill button (prototype: "Tālāk", "Saglabāt", "Foto"). */
export function Button({ label, onPress, variant = 'dark', icon, disabled, loading, size = 'lg', style, accessibilityLabel, testID }: Props) {
  const h = H[size];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        styles.btn,
        {
          height: h,
          minHeight: 44,
          borderRadius: h / 2,
          backgroundColor: BG[variant],
          borderWidth: variant === 'light' || variant === 'danger' ? 1 : 0,
        },
        inactive && styles.disabled,
        pressed && !inactive && { opacity: 0.85 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={FG[variant]} />
      ) : (
        <>
          {icon && <Icon name={icon} color={FG[variant]} size={size === 'sm' ? 18 : 22} />}
          <Text style={[styles.label, { color: FG[variant], fontSize: size === 'lg' ? 17 : size === 'md' ? 16 : 14 }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Fixed bottom area for the primary action (prototype: padding 16 20 40). */
export function BottomBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>{children}</View>;
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    borderColor: colors.inputBorder,
  },
  label: { fontFamily: fonts.bodySemi },
  disabled: { opacity: 0.4 },
  bar: { paddingHorizontal: space.screen, paddingTop: 16, backgroundColor: colors.bg, gap: 10 },
});
