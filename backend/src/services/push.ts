import { Expo, type ExpoPushMessage } from 'expo-server-sdk';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushSendResult {
  token: string;
  ok: boolean;
  /** True when the token is no longer valid and should be removed. */
  invalidToken?: boolean;
}

export interface PushSender {
  send(messages: PushMessage[]): Promise<PushSendResult[]>;
}

/** Sends through the Expo push service (FCM/APNs). */
export function expoPushSender(accessToken?: string): PushSender {
  const expo = new Expo(accessToken ? { accessToken } : {});
  return {
    async send(messages) {
      const results: PushSendResult[] = [];
      const valid: ExpoPushMessage[] = [];
      for (const m of messages) {
        if (!Expo.isExpoPushToken(m.to)) results.push({ token: m.to, ok: false, invalidToken: true });
        else valid.push({ to: m.to, title: m.title, body: m.body, data: m.data, sound: 'default', priority: 'high' });
      }
      for (const chunk of expo.chunkPushNotifications(valid)) {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        tickets.forEach((t, i) => {
          const token = chunk[i]!.to as string;
          if (t.status === 'ok') results.push({ token, ok: true });
          else results.push({ token, ok: false, invalidToken: t.details?.error === 'DeviceNotRegistered' });
        });
      }
      return results;
    },
  };
}
