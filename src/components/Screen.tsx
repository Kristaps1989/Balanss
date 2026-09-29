import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, space } from '@/theme';

/** Scrollable screen body with the prototype's paddings (56 top incl. status bar, 20 sides, gap 14). */
export function Screen({
  children,
  footer,
  refreshing,
  onRefresh,
  gap = space.stack,
  contentStyle,
  testID,
}: {
  children: ReactNode;
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  gap?: number;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={['top']} testID={testID}>
      <ScrollView
        contentContainerStyle={[styles.content, { gap }, contentStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.accent} /> : undefined}>
        {children}
      </ScrollView>
      {footer ? <View>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.screen, paddingTop: space.lg, paddingBottom: 28 },
});
