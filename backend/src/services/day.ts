import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';

import type {
  Day,
  HealthSource,
  MealType,
  MovementOverview,
  NutritionStats,
  Progress,
  SleepNight,
  SleepOverview,
  SleepWindow,
  Tip,
  ToneStyle,
  WeeklyQuestion,
  Workout,
  WorkoutType,
} from '../../../shared/api';
import { addDays, lastNDates, mondayOf } from '../../../shared/dates';
import { effectiveTone, toneModifiers } from '../../../shared/personality';
import { computeSleepWindow, eveningMinutes, sleepScore } from '../../../shared/sleep';
import type { ToneInput, TrendsInput } from '../ai/tone';
import type { TipAngle } from '../ai/tone-types';
import type { Config } from '../config';
import type { Db } from '../db/client';
import {
  healthDays,
  sleepNights,
  tips,
  waterDays,
  weeklyQuestions,
  weights,
  workouts,
  type PersonalityRow,
  type SleepNightRow,
  type TipRow,
  type UserRow,
  type WeeklyQuestionRow,
  type WorkoutRow,
} from '../db/schema';
import { buildHistory, careFor, findingsFor } from './analysis';
import { dayTotals, mealsInRange } from './meals';
import { freshPantryItems } from './pantry';
import { DEFAULT_PREFERENCES } from './users';

const progress = (value: number, target: number): Progress => ({ value, target });

export const WORKOUT_NAME: Record<WorkoutType, string> = {
  walk: 'Pastaiga',
  nordic_walk: 'Nūjošana',
  run: 'Skriešana',
  bike: 'Riteņbraukšana',
  yoga: 'Joga',
  strength: 'Spēka treniņš',
  swim: 'Peldēšana',
  other: 'Aktivitāte',
};

export function toWorkout(w: WorkoutRow): Workout {
  return {
    id: w.id,
    type: w.type as WorkoutType,
    name: w.name,
    startedAt: w.startedAt.toISOString(),
    durationMin: w.durationMin,
    kcal: w.kcal,
    avgHr: w.avgHr,
    zones: w.zones,
    device: w.device,
    source: w.source as HealthSource,
  };
}

export function toTip(t: TipRow): Tip {
  return { id: t.id, date: t.date, tone: t.tone as ToneStyle, body: t.body, highlight: t.highlight, accepted: t.accepted, aiGenerated: t.aiGenerated };
}

export function toWeeklyQuestion(q: WeeklyQuestionRow): WeeklyQuestion {
  return {
    id: q.id,
    week: q.week,
    question: q.question,
    options: q.options,
    answerIndex: q.answerIndex,
    basedOn: q.basedOn,
    aiGenerated: q.aiGenerated,
  };
}

// ---------------------------------------------------------------- sleep

/** Nights ending on or before `date`, oldest first, at most `n`. */
export async function nightsUpTo(db: Db, userId: string, date: string, n = 14): Promise<SleepNightRow[]> {
  const rows = await db
    .select()
    .from(sleepNights)
    .where(and(eq(sleepNights.userId, userId), lte(sleepNights.date, date), gte(sleepNights.date, addDays(date, -(n - 1)))))
    .orderBy(asc(sleepNights.date));
  return rows.slice(-n);
}

export function windowFor(nights: SleepNightRow[]): SleepWindow | null {
  return computeSleepWindow(nights.map((n) => n.bedtime));
}

export function toSleepNight(row: SleepNightRow, targetMin: number, window: SleepWindow | null): SleepNight {
  return {
    date: row.date,
    bedtime: row.bedtime,
    wakeTime: row.wakeTime,
    totalMin: row.totalMin,
    deepMin: row.deepMin,
    remMin: row.remMin,
    lightMin: row.lightMin,
    awakeMin: row.awakeMin,
    score: sleepScore(row, targetMin, window),
    source: row.source as HealthSource,
  };
}

/** Bedtime inside the window (start .. end, evening-anchored). */
export function inWindow(bedtime: string, w: SleepWindow): boolean {
  const b = eveningMinutes(bedtime);
  return b >= eveningMinutes(w.start) && b <= eveningMinutes(w.end);
}

export async function sleepOverview(db: Db, user: UserRow, date: string): Promise<SleepOverview> {
  const nights = await nightsUpTo(db, user.id, date, 14);
  const window = windowFor(nights);
  const last = nights.at(-1);
  return {
    lastNight: last && last.date === date ? toSleepNight(last, user.targets.sleepMin, window) : null,
    nights: nights.slice(-7).map((n) => ({ date: n.date, bedtime: n.bedtime })),
    window,
    source: user.devices.source,
    devices: user.devices.devices,
  };
}

// ---------------------------------------------------------------- movement

export async function movementOverview(db: Db, user: UserRow, date: string, days: number): Promise<MovementOverview> {
  const dates = lastNDates(date, days);
  const rows = await db
    .select()
    .from(healthDays)
    .where(and(eq(healthDays.userId, user.id), gte(healthDays.date, dates[0]!), lte(healthDays.date, date)));
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const today = byDate.get(date);
  // Workouts in the date range, with half a day of slack on each side for time zones.
  const from = new Date(`${dates[0]}T00:00:00Z`);
  from.setUTCHours(from.getUTCHours() - 12);
  const wRows = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.userId, user.id), gte(workouts.startedAt, from), lte(workouts.startedAt, new Date(`${addDays(date, 1)}T12:00:00Z`))))
    .orderBy(desc(workouts.startedAt));
  return {
    today: { steps: progress(today?.steps ?? 0, user.targets.steps), activeKcal: today?.activeKcal ?? 0 },
    days: dates.map((d) => ({ date: d, steps: byDate.get(d)?.steps ?? 0 })),
    restingHr: { today: today?.restingHr ?? null, series: dates.map((d) => byDate.get(d)?.restingHr ?? null) },
    hrv: { today: today?.hrvMs ?? null, series: dates.map((d) => byDate.get(d)?.hrvMs ?? null) },
    workouts: wRows.map(toWorkout),
    source: user.devices.source,
    devices: user.devices.devices,
  };
}

// ---------------------------------------------------------------- day

export async function waterFor(db: Db, userId: string, date: string): Promise<number> {
  const [w] = await db.select().from(waterDays).where(and(eq(waterDays.userId, userId), eq(waterDays.date, date)));
  return w?.ml ?? 0;
}

export async function buildDay(db: Db, config: Config, user: UserRow, date: string): Promise<Day> {
  const t = user.targets;
  const [meals, waterMl, [health], nights, [tip], [wq], [weight], care] = await Promise.all([
    mealsInRange(db, config, user.id, date, date),
    waterFor(db, user.id, date),
    db.select().from(healthDays).where(and(eq(healthDays.userId, user.id), eq(healthDays.date, date))),
    nightsUpTo(db, user.id, date, 14),
    db
      .select()
      .from(tips)
      .where(and(eq(tips.userId, user.id), eq(tips.date, date), eq(tips.hidden, false)))
      .orderBy(desc(tips.createdAt))
      .limit(1),
    db.select().from(weeklyQuestions).where(and(eq(weeklyQuestions.userId, user.id), eq(weeklyQuestions.week, mondayOf(date)))),
    db.select().from(weights).where(and(eq(weights.userId, user.id), lte(weights.date, date))).orderBy(desc(weights.date)).limit(1),
    careFor(db, user, date),
  ]);
  const totals = dayTotals(meals);
  const window = windowFor(nights);
  const last = nights.at(-1);
  return {
    date,
    nutrition: {
      kcal: progress(totals.kcal, t.kcal),
      proteinG: progress(totals.proteinG, t.proteinG),
      carbsG: progress(totals.carbsG, t.carbsG),
      fatG: progress(totals.fatG, t.fatG),
      fibreG: progress(totals.fibreG, t.fibreG),
      waterMl: progress(waterMl, t.waterMl),
    },
    meals,
    movement: {
      steps: progress(health?.steps ?? 0, t.steps),
      activeKcal: health?.activeKcal ?? 0,
      restingHr: health?.restingHr ?? null,
      hrvMs: health?.hrvMs ?? null,
      source: (health?.source as HealthSource | undefined) ?? user.devices.source,
    },
    sleep: last && last.date === date ? { ...toSleepNight(last, t.sleepMin, window), window } : null,
    tip: tip ? toTip(tip) : null,
    care,
    weeklyQuestion: wq ? toWeeklyQuestion(wq) : null,
    lastWeightKg: weight?.kg ?? null,
  };
}

// ---------------------------------------------------------------- stats

export async function nutritionSeries(db: Db, config: Config, userId: string, date: string, days: number) {
  const dates = lastNDates(date, days);
  const meals = await mealsInRange(db, config, userId, dates[0]!, date);
  return dates.map((d) => {
    const t = dayTotals(meals.filter((m) => m.date === d));
    return { date: d, kcal: t.kcal, proteinG: t.proteinG };
  });
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function statsFrom(series: { date: string; kcal: number; proteinG: number }[], user: UserRow): Omit<NutritionStats, 'insight'> {
  const logged = series.filter((d) => d.kcal > 0);
  return {
    days: series,
    avgKcal: Math.round(avg(logged.map((d) => d.kcal))),
    avgProteinG: Math.round(avg(logged.map((d) => d.proteinG))),
    targetKcal: user.targets.kcal,
    targetProteinG: user.targets.proteinG,
  };
}

// ---------------------------------------------------------------- tone engine input

export function userTone(user: UserRow, personality: PersonalityRow | null) {
  const levels = personality?.levels ?? null;
  return { tone: effectiveTone(user.tonePreference as 'auto' | ToneStyle, levels), modifiers: toneModifiers(levels) };
}

export async function buildToneInput(
  db: Db,
  config: Config,
  user: UserRow,
  personality: PersonalityRow | null,
  date: string,
  localTime?: string,
  avoidAngles: TipAngle[] = [],
  now: Date = new Date(),
): Promise<ToneInput> {
  const day = await buildDay(db, config, user, date);
  const [series, nights, health, findings, history] = await Promise.all([
    nutritionSeries(db, config, user.id, date, 7),
    nightsUpTo(db, user.id, date, 14),
    db
      .select()
      .from(healthDays)
      .where(and(eq(healthDays.userId, user.id), gte(healthDays.date, addDays(date, -6)), lte(healthDays.date, date))),
    findingsFor(db, user, date, day.care),
    buildHistory(db, user.id, date),
  ]);
  const pantryItems = await freshPantryItems(db, user.id, now);
  const stats = statsFrom(series, user);
  const window = windowFor(nights);
  const lastWeek = nights.filter((n) => n.date > addDays(date, -7));
  return {
    date,
    sex: user.profile.sex,
    ...userTone(user, personality),
    nutrition: day.nutrition,
    mealsLogged: [...new Set(day.meals.map((m) => m.type))] as MealType[],
    steps: day.movement.steps,
    sleep: day.sleep ? { totalMin: day.sleep.totalMin, targetMin: user.targets.sleepMin, bedtime: day.sleep.bedtime, window } : null,
    week: {
      avgKcal: stats.avgKcal,
      avgProteinG: stats.avgProteinG,
      avgSteps: health.length ? Math.round(avg(health.map((h) => h.steps))) : null,
      nightsInWindow: window ? lastWeek.filter((n) => inWindow(n.bedtime, window)).length : null,
    },
    ...(localTime ? { localTime } : {}),
    care: day.care.active,
    findings: findings.slice(0, 5),
    history,
    preferences: user.preferences ?? DEFAULT_PREFERENCES,
    pantry: pantryItems,
    ...(avoidAngles.length ? { avoidAngles } : {}),
  };
}

export function trendsInput(user: UserRow, personality: PersonalityRow | null, stats: Omit<NutritionStats, 'insight'>, care: boolean): TrendsInput {
  return { ...userTone(user, personality), sex: user.profile.sex, care, preferences: user.preferences ?? DEFAULT_PREFERENCES, ...stats };
}
