import { Stack } from 'expo-router';

import { useSession } from '@/lib/session';
import { colors } from '@/theme';

/** Welcome + login while signed out; the remaining steps once signed in. */
export default function OnboardingLayout() {
  const signedIn = useSession() === 'signedIn';
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="basics" />
        <Stack.Screen name="devices" />
        <Stack.Screen name="goals" />
        <Stack.Screen name="personality/intro" />
        <Stack.Screen name="personality/test" />
        <Stack.Screen name="personality/result" />
      </Stack.Protected>
    </Stack>
  );
}
