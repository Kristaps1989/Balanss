import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient, useMe } from '@/api/hooks';
import { ConfirmHost } from '@/components/Confirm';
import { ErrorState } from '@/components/States';
import { ToastHost } from '@/components/Toast';
import { useAppServices } from '@/lib/services';
import { useSession } from '@/lib/session';
import { useActiveTheme } from '@/lib/theme';
import { appFonts, colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const theme = useActiveTheme();
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        {/* A theme switch remounts the tree so every screen re-reads the palette. */}
        {theme && (
          <View key={theme} style={{ flex: 1, backgroundColor: colors.bg }}>
            <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
            {fontsLoaded || fontError ? <Gate /> : null}
            <ConfirmHost />
            <ToastHost />
          </View>
        )}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const sheet = {
  presentation: 'transparentModal',
  animation: 'fade',
  contentStyle: { backgroundColor: 'transparent' },
} as const;

/** Signed out → onboarding (welcome/login); signed in but not onboarded → rest of onboarding; else the app. */
function Gate() {
  const session = useSession();
  const signedIn = session === 'signedIn';
  const me = useMe(signedIn);
  const ready = session !== 'loading' && (!signedIn || !me.isPending);
  const onboarded = signedIn && !!me.data?.onboardingDone;
  useAppServices(onboarded);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;
  if (signedIn && me.isError && !me.data) return <ErrorState onRetry={() => me.refetch()} />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!onboarded}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add" options={sheet} />
        <Stack.Screen name="food-add" options={sheet} />
        <Stack.Screen name="weight" options={sheet} />
        <Stack.Screen name="activity" options={sheet} />
        <Stack.Screen name="meal/[id]" options={sheet} />
        <Stack.Screen name="tip-report" options={sheet} />
        <Stack.Screen name="pantry" options={sheet} />
        <Stack.Screen name="leisure" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="summary" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="me" options={{ animation: 'slide_from_right' }} />
      </Stack.Protected>
      <Stack.Screen name="auth" />
    </Stack>
  );
}
