import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function MeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="pro" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
