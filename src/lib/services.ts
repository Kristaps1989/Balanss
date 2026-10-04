import { focusManager, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type { Profile } from '@/api';
import { useMe } from '@/api/hooks';

import { health, type SyncProfile } from './health';
import { listenForTaps, registerForPush } from './push';

const SYNC_EVERY_MS = 30 * 60_000;
const DEFAULT_PROFILE: SyncProfile = { age: 35, sex: 'x', weightKg: 70, heightCm: 170 };

export const syncProfile = (p?: Profile | null): SyncProfile =>
  p ? { age: p.age, sex: p.sex, weightKg: p.weightKg, heightCm: p.heightCm } : DEFAULT_PROFILE;

let lastSync = 0;
let running: Promise<boolean> | null = null;

/**
 * Reads Health Connect and uploads the last 14 days. Throttled to every 30 min unless `force`
 * (pull-to-refresh); concurrent calls share one run. Refreshes the screens that show health data.
 */
export async function syncHealth(qc: QueryClient, profile: SyncProfile, force = false): Promise<boolean> {
  if (running) return running;
  if (!force && Date.now() - lastSync < SYNC_EVERY_MS) return false;
  lastSync = Date.now();
  running = health
    .sync(14, profile)
    .then(async (ok) => {
      if (ok) await qc.invalidateQueries({ predicate: (q) => ['day', 'movement', 'sleep', 'me'].includes(String(q.queryKey[0])) });
      return ok;
    })
    .catch(() => {
      lastSync = 0; // retry on next foreground
      return false;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

/** Pull-to-refresh for screens with device data: sync Health Connect first, then refetch. */
export function useHealthRefresh(refetch: () => Promise<unknown>) {
  const qc = useQueryClient();
  const me = useMe();
  const [refreshing, setRefreshing] = useState(false);
  const connected = !!me.data?.devices.connected && me.data.devices.source === health.source;
  const profile = me.data?.profile;
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (connected) await syncHealth(qc, syncProfile(profile), true);
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [connected, profile, qc, refetch]);
  return { refreshing, refresh };
}

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
  const connected = !!me.data?.devices.connected && me.data.devices.source === health.source;
  const profile = me.data?.profile;
  const wantsPush = !!me.data && Object.entries(me.data.reminders).some(([k, v]) => k !== 'frequency' && k !== 'sleepLeadMin' && v === true);

  useEffect(() => {
    if (!active || !connected) return;
    const run = () => void syncHealth(qc, syncProfile(profile));
    run();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    return () => sub.remove();
  }, [active, connected, profile, qc]);

  useEffect(() => {
    if (!active || !wantsPush) return;
    registerForPush().catch(() => undefined);
  }, [active, wantsPush]);

  useEffect(() => {
    if (!active) return;
    return listenForTaps();
  }, [active]);
}
