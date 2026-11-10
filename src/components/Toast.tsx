import { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { colors, fonts, themed } from '@/theme';

import { Icon } from './Icon';

interface ToastState {
  message: string | null;
  seq: number;
  show: (message: string) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  seq: 0,
  show: (message) => set((s) => ({ message, seq: s.seq + 1 })),
  hide: () => set({ message: null }),
}));

/** Light success haptic; silent where the device or platform has none. */
async function tick() {
  if (Platform.OS === 'web') return;
  try {
    const Haptics = await import('expo-haptics');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // No haptics on this device.
  }
}

/** Acknowledge a logged entry: a short "Pierakstīts" and a haptic. No confetti, no streaks. */
export function confirmLogged(message = 'Pierakstīts') {
  useToast.getState().show(message);
  void tick();
}

export function ToastHost() {
  const { message, seq, hide } = useToast();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, 1800);
    return () => clearTimeout(t);
  }, [message, seq, hide]);
  if (!message) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <View style={styles.toast} accessibilityLiveRegion="polite" accessibilityRole="alert" testID="toast">
        <Icon name="check" color={colors.onAccent} size={16} strokeWidth={2.6} />
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
    toast: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 20,
      backgroundColor: colors.accent,
    },
    text: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.onAccent },
  }),
);
