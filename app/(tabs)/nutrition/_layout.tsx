import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function NutritionLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="camera" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="analyzing" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="result" />
      <Stack.Screen name="trends" />
    </Stack>
  );
}
