import { focusManager, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { useMe } from '@/api/hooks';

import { health } from './health';
import { listenForTaps, registerForPush } from './push';

const SYNC_EVERY_MS = 30 * 60_000;

// Refetch stale queries when the app returns to the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
}

/**
 * Background services while signed in and onboarded:
 * - health data sync from Health Connect (on start and when returning to the app, at most every 30 min)
 * - push token registration when any reminder is on
 * - opening the screen a tapped reminder points to
 */
export function useAppServices(active: boolean) {
  const qc = useQueryClient();
  const me = useMe(active);
  const lastSync = useRef(0);
  const connected = !!me.data?.devices.connected && me.data.devices.source === health.source;
  const age = me.data?.profile.age ?? 35;
  const wantsPush = !!me.data && Object.entries(me.data.reminders).some(([k, v]) => k !== 'frequency' && k !== 'sleepLeadMin' && v === true);

  useEffect(() => {
    if (!active || !connected) return;
    const run = async () => {
      if (Date.now() - lastSync.current < SYNC_EVERY_MS) return;
      lastSync.current = Date.now();
      try {
        if (await health.sync(14, age)) {
          qc.invalidateQueries({ predicate: (q) => ['day', 'movement', 'sleep', 'me'].includes(String(q.queryKey[0])) });
        }
      } catch {
        lastSync.current = 0; // retry on next foreground
      }
    };
    run();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    return () => sub.remove();
  }, [active, connected, age, qc]);

  useEffect(() => {
    if (!active || !wantsPush) return;
    registerForPush().catch(() => undefined);
  }, [active, wantsPush]);

  useEffect(() => {
    if (!active) return;
    return listenForTaps();
  }, [active]);
}
