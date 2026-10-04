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

  diagnostics: () => stepDiagnostics(),
};

const hm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const dhm = (iso: string) => `${toISODate(new Date(iso)).slice(5)} ${hm(iso)}`;

/**
 * What Health Connect holds for today and yesterday, per writing app and device. Used from
 * Es → Ierīces → Diagnostika when the step count does not match the watch app. Samsung Health
 * writes steps in long blocks (often one record per day), so the report also shows each
 * record's time span.
 */
export async function stepDiagnostics(): Promise<string> {
  const out: string[] = [];
  const status = await getSdkStatus();
  out.push(`Health Connect SDK: ${status === SdkAvailabilityStatus.SDK_AVAILABLE ? 'pieejams' : `statuss ${status}`}`);
  if (!(await init())) return out.concat('Neizdevās inicializēt Health Connect.').join('\n');
  const g = await granted();
  out.push(`Atļaujas: ${[...g].sort().join(', ') || 'nav'}`);
  if (!g.has('Steps')) return out.join('\n');

  const now = new Date();
  const today = toISODate(now);
  const yesterday = addDays(today, -1);
  for (const d of [today, yesterday]) {
    const from = parseISODate(d);
    const to = d === today ? now : parseISODate(addDays(d, 1));
    const range = { operator: 'between' as const, startTime: from.toISOString(), endTime: to.toISOString() };
    const agg = await aggregateRecord({ recordType: 'Steps', timeRangeFilter: range });
    out.push('', `${d} (${hm(from.toISOString())}–${hm(to.toISOString())})`, `  HC kopsumma (prioritātes avots): ${agg.COUNT_TOTAL}`);
    const recs = await readAll('Steps', range.startTime, range.endTime);
    const byOrigin = new Map<string, { n: number; sum: number; first: string; last: string; longest: number; devices: Set<string>; methods: Set<number> }>();
    for (const r of recs) {
      const origin = r.metadata?.dataOrigin ?? '?';
      const e = byOrigin.get(origin) ?? { n: 0, sum: 0, first: r.startTime, last: r.endTime, longest: 0, devices: new Set(), methods: new Set() };
      e.n += 1;
      e.sum += r.count;
      if (r.startTime < e.first) e.first = r.startTime;
      if (r.endTime > e.last) e.last = r.endTime;
      e.longest = Math.max(e.longest, (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 60_000);
      const dev = r.metadata?.device;
      if (dev?.model || dev?.manufacturer) e.devices.add([dev.manufacturer, dev.model].filter(Boolean).join(' '));
      if (r.metadata?.recordingMethod != null) e.methods.add(r.metadata.recordingMethod);
      byOrigin.set(origin, e);
    }
    if (!byOrigin.size) out.push('  Ierakstu nav.');
    for (const [origin, e] of byOrigin) {
      out.push(
        `  ${origin}: ${e.sum} soļi, ${e.n} ieraksti, ${dhm(e.first)}–${dhm(e.last)}, garākais ieraksts ${Math.round(e.longest)} min`,
        `    ierīces: ${[...e.devices].join('; ') || 'nav norādītas'}; metode: ${[...e.methods].join(',') || '-'}`,
      );
    }
  }
  // Records that started before today's midnight but reach into today (Samsung day blocks spanning a date change).
  const spanFrom = new Date(parseISODate(yesterday).getTime());
  const spanning = (await readAll('Steps', spanFrom.toISOString(), now.toISOString())).filter((r) => r.startTime < parseISODate(today).toISOString() && r.endTime > parseISODate(today).toISOString());
  if (spanning.length) out.push('', `Ieraksti pāri pusnaktij: ${spanning.map((r) => `${r.metadata?.dataOrigin ?? '?'} ${r.count} (${dhm(r.startTime)}–${dhm(r.endTime)})`).join('; ')}`);
  return out.join('\n');
}
