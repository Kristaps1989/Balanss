import { Linking } from 'react-native';
import {
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
  type Permission,
} from 'react-native-health-connect';

import { api } from '@/api';
import { addDays, lastNDates, parseISODate, toISODate } from '@shared/dates';

import { buildSyncPayload, type HcDayAggregate } from './transform';
import type { HealthConnector } from './types';

export * from './types';

const PERMISSIONS: Permission[] = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'Weight' },
];

let ready = false;
async function init() {
  if (!ready) ready = await initialize();
  return ready;
}

async function granted(): Promise<Set<string>> {
  const list = await getGrantedPermissions();
  return new Set(list.filter((p) => p.accessType === 'read').map((p) => (p as Permission).recordType));
}

/** Read all pages of a record type in a time range. */
async function readAll<T extends Parameters<typeof readRecords>[0]>(type: T, startTime: string, endTime: string) {
  const out: Awaited<ReturnType<typeof readRecords<T>>>['records'] = [];
  let pageToken: string | undefined;
  do {
    const res = await readRecords(type, { timeRangeFilter: { operator: 'between', startTime, endTime }, pageToken, pageSize: 1000 });
    out.push(...res.records);
    pageToken = res.pageToken || undefined;
  } while (pageToken);
  return out;
}

export const health: HealthConnector = {
  source: 'health_connect',

  async availability() {
    const status = await getSdkStatus();
    if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return 'available';
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'needs_install';
    return 'unsupported';
  },

  async connect() {
    if (!(await init())) return false;
    await requestPermission(PERMISSIONS);
    const g = await granted();
    return g.has('Steps') || g.has('SleepSession');
  },

  async sync(days, age) {
    if (!(await init())) return false;
    const g = await granted();
    if (g.size === 0) return false;
    const today = toISODate(new Date());
    const dates = lastNDates(today, days);
    const start = parseISODate(dates[0]).toISOString();
    const end = new Date().toISOString();

    const dayAgg: HcDayAggregate[] = [];
    for (const d of dates) {
      const from = parseISODate(d).toISOString();
      const to = d === today ? end : parseISODate(addDays(d, 1)).toISOString();
      const range = { operator: 'between' as const, startTime: from, endTime: to };
      const steps = g.has('Steps') ? (await aggregateRecord({ recordType: 'Steps', timeRangeFilter: range })).COUNT_TOTAL : 0;
      const kcal = g.has('ActiveCaloriesBurned')
        ? (await aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter: range })).ACTIVE_CALORIES_TOTAL.inKilocalories
        : 0;
      dayAgg.push({ date: d, steps, activeKcal: kcal });
    }

    // Sleep that ended within the window may have started the evening before.
    const sleepStart = new Date(new Date(start).getTime() - 18 * 3600_000).toISOString();
    const [rhr, hrv, sleep, exercise, heartRate, weights] = await Promise.all([
      g.has('RestingHeartRate') ? readAll('RestingHeartRate', start, end) : [],
      g.has('HeartRateVariabilityRmssd') ? readAll('HeartRateVariabilityRmssd', start, end) : [],
      g.has('SleepSession') ? readAll('SleepSession', sleepStart, end) : [],
      g.has('ExerciseSession') ? readAll('ExerciseSession', start, end) : [],
      g.has('HeartRate') ? readAll('HeartRate', start, end) : [],
      g.has('Weight') ? readAll('Weight', start, end) : [],
    ]);

    const payload = buildSyncPayload({
      days: dayAgg,
      restingHr: rhr.map((r) => ({ time: r.time, value: r.beatsPerMinute, metadata: r.metadata })),
      hrv: hrv.map((r) => ({ time: r.time, value: r.heartRateVariabilityMillis, metadata: r.metadata })),
      sleep: sleep.filter((s) => s.endTime >= start),
      exercise,
      heartRate,
      weights: weights.map((w) => ({ time: w.time, value: w.weight.inKilograms, metadata: w.metadata })),
      age,
    });
    await api.healthSync(payload);
    return true;
  },

  openSettings() {
    try {
      openHealthConnectSettings();
    } catch {
      Linking.openURL('market://details?id=com.google.android.apps.healthdata').catch(() => undefined);
    }
  },
};
