import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';

import { api } from '@/api';

/**
 * Push reminders are scheduled by the backend (sleep window, water, meals)
 * and delivered through the Expo push service (FCM on Android, APNs on iOS).
 * Requires an Expo project ID (free, no EAS builds needed) with the FCM
 * credentials uploaded — see docs/NATIVE_SETUP.md.
 */
const PROJECT_ID =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;

export const pushAvailable = Platform.OS !== 'web' && !!PROJECT_ID;

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Ask for permission (Android 13+ / iOS) and send the token to the backend. Safe to call repeatedly. */
export async function registerForPush(): Promise<boolean> {
  if (!pushAvailable || !Device.isDevice) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Atgādinājumi',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return false;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
  await api.registerPushToken({
    token,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Europe/Riga',
  });
  return true;
}

/** Tapping a reminder opens the screen named in its data (e.g. { url: "/sleep" }). */
export function listenForTaps(): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const open = (n: Notifications.Notification) => {
    const url = (n.request.content.data as { url?: string } | undefined)?.url;
    if (url && url.startsWith('/')) router.push(url as Href);
  };
  const last = Notifications.getLastNotificationResponse();
  if (last) open(last.notification);
  const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification));
  return () => sub.remove();
}
