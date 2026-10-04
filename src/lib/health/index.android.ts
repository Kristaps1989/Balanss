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

import { bmr } from '@shared/targets';

import { secureStore } from '@/lib/storage';

import { activeFromTotal, buildSyncPayload, dailyMaxByOrigin, type HcDayAggregate } from './transform';
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
  // v2: Samsung Health writes total (not active) energy; BMR lets us derive active kcal.
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'BasalMetabolicRate' },
];
/** Bump when PERMISSIONS grows, so connected users are asked once for the new ones. */
const PERMISSIONS_VERSION = '2';
const ASKED_KEY = 'balanss.hc.permissionsAsked';

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
    await secureStore.set(ASKED_KEY, PERMISSIONS_VERSION);
    const g = await granted();
    return g.has('Steps') || g.has('SleepSession');
  },

  async sync(days, profile) {
    if (!(await init())) return false;
    let g = await granted();
    if (g.size === 0) return false;
    // Ask once for permissions added in an app update (e.g. total energy for Samsung Health).
    if (PERMISSIONS.some((p) => !g.has(p.recordType)) && (await secureStore.get(ASKED_KEY)) !== PERMISSIONS_VERSION) {
      await secureStore.set(ASKED_KEY, PERMISSIONS_VERSION);
      await requestPermission(PERMISSIONS).catch(() => undefined);
      g = await granted();
    }
    const age = profile.age;
    const today = toISODate(new Date());
    const dates = lastNDates(today, days);
    const start = parseISODate(dates[0]).toISOString();
    const end = new Date().toISOString();

    // Per-app daily totals: the largest one wins (see dailyMaxByOrigin).
    const [stepRecs, activeRecs, totalRecs, bmrRecs] = await Promise.all([
      g.has('Steps') ? readAll('Steps', start, end) : [],
      g.has('ActiveCaloriesBurned') ? readAll('ActiveCaloriesBurned', start, end) : [],
      g.has('TotalCaloriesBurned') ? readAll('TotalCaloriesBurned', start, end) : [],
      g.has('BasalMetabolicRate') ? readAll('BasalMetabolicRate', start, end) : [],
    ]);
    const stepsByDay = dailyMaxByOrigin(stepRecs.map((r) => ({ ...r, value: r.count })));
    const activeByDay = dailyMaxByOrigin(activeRecs.map((r) => ({ ...r, value: r.energy.inKilocalories })));
    const totalByDay = dailyMaxByOrigin(totalRecs.map((r) => ({ ...r, value: r.energy.inKilocalories })));
    const lastBmr = bmrRecs.at(-1)?.basalMetabolicRate.inKilocaloriesPerDay;
    const bmrPerDay = lastBmr && lastBmr > 500 ? lastBmr : bmr(profile);

    const dayAgg: HcDayAggregate[] = [];
    for (const d of dates) {
      const from = parseISODate(d);
      const to = d === today ? new Date() : parseISODate(addDays(d, 1));
      const range = { operator: 'between' as const, startTime: from.toISOString(), endTime: to.toISOString() };
      const aggSteps = g.has('Steps') ? (await aggregateRecord({ recordType: 'Steps', timeRangeFilter: range })).COUNT_TOTAL : 0;
      const aggActive = g.has('ActiveCaloriesBurned')
        ? (await aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter: range })).ACTIVE_CALORIES_TOTAL.inKilocalories
        : 0;
      let activeKcal = Math.max(aggActive, activeByDay.get(d) ?? 0);
      if (activeKcal === 0) activeKcal = activeFromTotal(totalByDay.get(d) ?? 0, bmrPerDay, (to.getTime() - from.getTime()) / 86_400_000);
      dayAgg.push({ date: d, steps: Math.max(aggSteps, stepsByDay.get(d) ?? 0), activeKcal });
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
