/**
 * Pure conversion from Health Connect records to the backend sync payload.
 * Kept free of native imports so it can be unit-tested.
 */
import type { HealthSyncRequest, WorkoutType } from '@shared/api';
import { toISODate } from '@shared/dates';

export interface HcMeta {
  id?: string;
  dataOrigin?: string;
  device?: { manufacturer?: string; model?: string };
}
export interface HcSleep {
  startTime: string;
  endTime: string;
  stages?: { startTime: string; endTime: string; stage: number }[];
  metadata?: HcMeta;
}
export interface HcExercise {
  startTime: string;
  endTime: string;
  exerciseType: number;
  title?: string;
  metadata?: HcMeta;
}
export interface HcHeartRate {
  samples: { time: string; beatsPerMinute: number }[];
  metadata?: HcMeta;
}
export interface HcInstant<V> {
  time: string;
  value: V;
  metadata?: HcMeta;
}

export interface HcDayAggregate {
  date: string;
  steps: number;
  activeKcal: number;
}

export interface HcInput {
  days: HcDayAggregate[];
  restingHr: HcInstant<number>[];
  hrv: HcInstant<number>[];
  sleep: HcSleep[];
  exercise: HcExercise[];
  heartRate: HcHeartRate[];
  weights: HcInstant<number>[];
  age: number;
}

// Health Connect SleepStageType
const AWAKE = new Set([1, 3]);
const DEEP = 5;
const REM = 6;

// Health Connect ExerciseType → ours
const EXERCISE: Record<number, WorkoutType> = { 79: 'walk', 37: 'walk', 56: 'run', 8: 'bike', 9: 'bike', 83: 'yoga', 70: 'strength', 73: 'swim', 74: 'swim' };

const ORIGIN_NAMES: [RegExp, string][] = [
  [/polar/i, 'Polar'],
  [/garmin/i, 'Garmin'],
  [/oura/i, 'Oura'],
  [/withings/i, 'Withings'],
  [/fitbit/i, 'Fitbit'],
  [/samsung/i, 'Samsung Health'],
  [/google\.android\.apps\.fitness/i, 'Google Fit'],
  [/suunto/i, 'Suunto'],
  [/xiaomi|mi\.health|zepp|huami/i, 'Xiaomi / Zepp'],
];

const localHm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const localDate = (iso: string) => toISODate(new Date(iso));
const minutesBetween = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60000);

/** Human device name from record metadata ("Polar H10", "Garmin"), or null. */
export function deviceName(meta?: HcMeta): string | null {
  const d = meta?.device;
  if (d?.model) return [d.manufacturer, d.model].filter(Boolean).join(' ').trim();
  const origin = meta?.dataOrigin ?? '';
  for (const [re, name] of ORIGIN_NAMES) if (re.test(origin)) return name;
  return null;
}

export function sleepNight(s: HcSleep) {
  let deep = 0;
  let rem = 0;
  let light = 0;
  let awake = 0;
  if (s.stages?.length) {
    for (const st of s.stages) {
      const m = minutesBetween(st.startTime, st.endTime);
      if (AWAKE.has(st.stage)) awake += m;
      else if (st.stage === DEEP) deep += m;
      else if (st.stage === REM) rem += m;
      else light += m;
    }
  } else {
    light = minutesBetween(s.startTime, s.endTime);
  }
  const r = Math.round;
  return {
    date: localDate(s.endTime),
    bedtime: localHm(s.startTime),
    wakeTime: localHm(s.endTime),
    totalMin: r(deep) + r(rem) + r(light),
    deepMin: r(deep),
    remMin: r(rem),
    lightMin: r(light),
    awakeMin: r(awake),
  };
}

/** Minutes in HR zones 1..5 by % of max HR (50–60, 60–70, 70–80, 80–90, 90+). */
export function hrZones(samples: { time: string; beatsPerMinute: number }[], maxHr: number): [number, number, number, number, number] {
  const z: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  const sorted = [...samples].sort((a, b) => a.time.localeCompare(b.time));
  for (let i = 0; i < sorted.length - 1; i++) {
    const dt = Math.min(5, minutesBetween(sorted[i].time, sorted[i + 1].time));
    const pct = sorted[i].beatsPerMinute / maxHr;
    if (pct < 0.5) continue;
    const idx = Math.min(4, Math.floor((pct - 0.5) / 0.1));
    z[idx] += dt;
  }
  return z.map(Math.round) as typeof z;
}

export function buildSyncPayload(input: HcInput): HealthSyncRequest {
  const devices = new Set<string>();
  const note = (m?: HcMeta) => {
    const n = deviceName(m);
    if (n) devices.add(n);
    return n;
  };

  const byDate = <V>(list: HcInstant<V>[]) => {
    const map = new Map<string, HcInstant<V>[]>();
    for (const x of list) {
      note(x.metadata);
      const d = localDate(x.time);
      map.set(d, [...(map.get(d) ?? []), x]);
    }
    return map;
  };
  const rhr = byDate(input.restingHr);
  const hrv = byDate(input.hrv);

  const days = input.days.map((d) => {
    const r = rhr.get(d.date);
    const h = hrv.get(d.date);
    return {
      date: d.date,
      steps: Math.round(d.steps),
      activeKcal: Math.round(d.activeKcal),
      restingHr: r?.length ? Math.round(r[r.length - 1].value) : null,
      hrvMs: h?.length ? Math.round(h.reduce((a, x) => a + x.value, 0) / h.length) : null,
    };
  });

  // Keep the longest session per wake-up date (naps are ignored).
  const nightsByDate = new Map<string, ReturnType<typeof sleepNight>>();
  for (const s of input.sleep) {
    note(s.metadata);
    const n = sleepNight(s);
    const prev = nightsByDate.get(n.date);
    if (!prev || n.totalMin > prev.totalMin) nightsByDate.set(n.date, n);
  }

  const allSamples = input.heartRate.flatMap((r) => {
    note(r.metadata);
    return r.samples;
  });
  const maxHr = 220 - input.age;
  const workouts = input.exercise.map((e, i) => {
    const device = note(e.metadata);
    const inSession = allSamples.filter((s) => s.time >= e.startTime && s.time <= e.endTime);
    const avg = inSession.length ? Math.round(inSession.reduce((a, s) => a + s.beatsPerMinute, 0) / inSession.length) : null;
    return {
      externalId: e.metadata?.id ?? `${e.startTime}-${i}`,
      type: EXERCISE[e.exerciseType] ?? 'other',
      startedAt: e.startTime,
      durationMin: Math.round(minutesBetween(e.startTime, e.endTime)),
      kcal: null,
      avgHr: avg,
      zones: inSession.length > 1 ? { minutes: hrZones(inSession, maxHr) } : null,
      device,
    };
  });

  const weights = [...byDate(input.weights).entries()].map(([date, list]) => ({ date, kg: Math.round(list[list.length - 1].value * 10) / 10 }));

  return {
    source: 'health_connect',
    devices: [...devices],
    days,
    nights: [...nightsByDate.values()],
    workouts,
    weights,
  };
}
