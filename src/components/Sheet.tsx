import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space, type } from '@/theme';

import { IconButton } from './Header';

/** Bottom sheet used by transparent-modal routes (prototype: Add-Sheet, Food-Add). */
export function Sheet({ title, children, onClose, scroll }: { title: string; children: ReactNode; onClose?: () => void; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const close = onClose ?? (() => router.back());
  const body = <View style={{ gap: space.lg }}>{children}</View>;
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Aizvērt" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]} accessibilityViewIsModal>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={type.h2} accessibilityRole="header">
            {title}
          </Text>
          <IconButton icon="close" label="Aizvērt" onPress={close} bg={colors.chip} size={20} />
        </View>
        {scroll ? (
          <ScrollView style={{ maxHeight: 560 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {body}
          </ScrollView>
        ) : (
          body
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.screen,
    paddingTop: 10,
    gap: space.lg,
    maxHeight: '92%',
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.handle },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
