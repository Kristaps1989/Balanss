import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';

import { TabBar } from '@/components/TabBar';
import { useThemeStore } from '@/lib/theme';
import { colors } from '@/theme';

export default function TabsLayout() {
  // A theme switch remounts the app on Šodiena; go back to the screen it was made on.
  // Done here, once the navigator exists, so the push is not dropped.
  const returnTo = useThemeStore((s) => s.returnTo);
  useEffect(() => {
    if (!returnTo) return;
    // After the commit, so the parent stack navigator has registered too. The flag is cleared
    // only once we navigate: clearing it first would re-run this effect and cancel the timer.
    const t = setTimeout(() => {
      useThemeStore.getState().clearReturn();
      router.push(returnTo as never);
    }, 0);
    return () => clearTimeout(t);
  }, [returnTo]);

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="nutrition" />
      <Tabs.Screen name="movement" />
      <Tabs.Screen name="sleep" />
    </Tabs>
  );
}
