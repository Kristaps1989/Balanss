import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, hit, space, type } from '@/theme';

import { Icon } from './Icon';

/** Temporary screen for routes that are built in later milestones. */
export function Placeholder({ title, note, back }: { title: string; note: string; back?: boolean }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {back && (
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Atpakaļ"
          style={styles.back}>
          <View style={{ transform: [{ scaleX: -1 }] }}>
            <Icon name="chevron" color={colors.ink} />
          </View>
        </Pressable>
      )}
      <Text style={type.h1}>{title}</Text>
      <Text style={[type.secondary, { marginTop: space.sm }]}>{note}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.screen, paddingTop: space.lg },
  back: { width: hit, height: hit, justifyContent: 'center', marginLeft: -10, marginBottom: space.sm },
});
