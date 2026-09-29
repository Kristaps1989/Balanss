import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';

import type { CareStatus, FindingKind, MealType } from '../../../shared/api';
import { addDays, mondayOf } from '../../../shared/dates';
import { scale, sum } from '../../../shared/nutrition';
import { careStatus } from '../../../shared/safety';
import { computeSleepWindow } from '../../../shared/sleep';
import { analyze, type AnalysisDay, type AnalysisFinding, type AnalysisInput } from '../ai/analysis';
import type { TipAngle, ToneHistory } from '../ai/tone-types';
import type { Db } from '../db/client';
import { healthDays, mealItems, meals, sleepNights, tips, waterDays, weeklyQuestions, weights, type UserRow } from '../db/schema';

/**
 * Data loading for the deterministic analysis, care mode and the tone-engine
 * memory. Kept free of config/photo concerns so /me can compute care cheaply.
 */

export const ANALYSIS_DAYS = 28;

interface MealWithItems {
  date: string;
  type: MealType;
  totals: ReturnType<typeof sum>;
}

/** Meals with their nutrient totals between two dates (inclusive). */
async function mealTotals(db: Db, userId: string, from: string, to: string): Promise<MealWithItems[]> {
  const rows = await db
    .select()
    .from(meals)
    .where(and(eq(meals.userId, userId), gte(meals.date, from), lte(meals.date, to)))
    .orderBy(asc(meals.eatenAt));
  if (!rows.length) return [];
  const items = await db.select().from(mealItems).where(inArray(mealItems.mealId, rows.map((m) => m.id)));
  const byMeal = new Map<string, typeof items>();
  for (const i of items) byMeal.set(i.mealId, [...(byMeal.get(i.mealId) ?? []), i]);
  return rows.map((m) => ({
    date: m.date,
    type: m.type as MealType,
    totals: sum((byMeal.get(m.id) ?? []).map((i) => scale(i.per100g, i.grams))),
  }));
}

// ---------------------------------------------------------------- care mode

/**
 * Care status as of `date`: the 7 complete days before it (energy + meals
 * logged per day) and the weights of the 42 days up to it.
 */
export async function careFor(db: Db, user: Pick<UserRow, 'id' | 'profile'>, date: string): Promise<CareStatus> {
  const from = addDays(date, -7);
  const to = addDays(date, -1);
  const [mealRows, weightRows] = await Promise.all([
    mealTotals(db, user.id, from, to),
    db
      .select()
      .from(weights)
      .where(and(eq(weights.userId, user.id), gte(weights.date, addDays(date, -41)), lte(weights.date, date))),
  ]);
  const recentDays: { date: string; kcal: number; mealsLogged: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const list = mealRows.filter((m) => m.date === d);
    recentDays.push({ date: d, kcal: list.reduce((a, m) => a + m.totals.kcal, 0), mealsLogged: list.length });
  }
  return careStatus({ profile: user.profile, recentDays, weights: weightRows.map((w) => ({ date: w.date, kg: w.kg })) });
}

// ---------------------------------------------------------------- analysis input

/** Everything `analyze()` needs for the 28 complete days before `date`. */
export async function loadAnalysisInput(db: Db, user: UserRow, date: string, care?: CareStatus): Promise<AnalysisInput> {
  const end = addDays(date, -1);
  const from = addDays(end, -(ANALYSIS_DAYS - 1));
  const [mealRows, water, health, nights, windowNights, careNow] = await Promise.all([
    mealTotals(db, user.id, from, end),
    db
      .select()
      .from(waterDays)
      .where(and(eq(waterDays.userId, user.id), gte(waterDays.date, from), lte(waterDays.date, end))),
    db
      .select()
      .from(healthDays)
      .where(and(eq(healthDays.userId, user.id), gte(healthDays.date, from), lte(healthDays.date, end))),
    db
      .select()
      .from(sleepNights)
      .where(and(eq(sleepNights.userId, user.id), gte(sleepNights.date, from), lte(sleepNights.date, end))),
    // The sleep window the user sees today (same rule as /health/sleep).
    db
      .select({ bedtime: sleepNights.bedtime })
      .from(sleepNights)
      .where(and(eq(sleepNights.userId, user.id), gte(sleepNights.date, addDays(date, -13)), lte(sleepNights.date, date)))
      .orderBy(asc(sleepNights.date)),
    care ? Promise.resolve(care) : careFor(db, user, date),
  ]);
  const waterBy = new Map(water.map((w) => [w.date, w.ml]));
  const stepsBy = new Map(health.map((h) => [h.date, h.steps]));
  const days: AnalysisDay[] = [];
  for (let d = from; d <= end; d = addDays(d, 1)) {
    const list = mealRows.filter((m) => m.date === d);
    const proteinBySlot: Partial<Record<MealType, number>> = {};
    for (const m of list) proteinBySlot[m.type] = Math.round(((proteinBySlot[m.type] ?? 0) + m.totals.proteinG) * 10) / 10;
    const hasAny = list.length > 0 || waterBy.has(d) || stepsBy.has(d);
    if (!hasAny) continue;
    days.push({
      date: d,
      mealsLogged: list.length,
      mealTypes: [...new Set(list.map((m) => m.type))],
      totals: sum(list.map((m) => m.totals)),
      proteinBySlot,
      waterMl: waterBy.get(d) ?? null,
      steps: stepsBy.get(d) ?? null,
    });
  }
  return {
    end,
    days,
    nights: nights.map((n) => ({ date: n.date, bedtime: n.bedtime, totalMin: n.totalMin })),
    targets: user.targets,
    window: computeSleepWindow(windowNights.map((n) => n.bedtime)),
    care: careNow.active,
  };
}

export async function findingsFor(db: Db, user: UserRow, date: string, care?: CareStatus): Promise<AnalysisFinding[]> {
  return analyze(await loadAnalysisInput(db, user, date, care));
}

// ---------------------------------------------------------------- memory

/**
 * What the tone engine remembers: the last 4 weekly questions with the chosen
 * option label, and per angle how tips of the last 14 days were received.
 */
export async function buildHistory(db: Db, userId: string, date: string): Promise<ToneHistory> {
  const [questions, tipRows] = await Promise.all([
    db
      .select()
      .from(weeklyQuestions)
      .where(and(eq(weeklyQuestions.userId, userId), lte(weeklyQuestions.week, mondayOf(date))))
      .orderBy(desc(weeklyQuestions.week))
      .limit(4),
    db
      .select({ angle: tips.angle, accepted: tips.accepted, dismissed: tips.dismissed, hidden: tips.hidden })
      .from(tips)
      .where(and(eq(tips.userId, userId), gte(tips.date, addDays(date, -13)), lte(tips.date, date))),
  ]);
  const byAngle = new Map<TipAngle, { angle: TipAngle; accepted: number; dismissed: number; reported: number }>();
  for (const t of tipRows) {
    if (!t.angle) continue;
    const angle = t.angle as TipAngle;
    const e = byAngle.get(angle) ?? { angle, accepted: 0, dismissed: 0, reported: 0 };
    if (t.hidden) e.reported++;
    else if (t.accepted) e.accepted++;
    else if (t.dismissed) e.dismissed++;
    byAngle.set(angle, e);
  }
  return {
    weeklyAnswers: questions.map((q) => ({
      week: q.week,
      topic: (q.basedOnKind as FindingKind | null) ?? null,
      question: q.question,
      answer: q.answerIndex != null ? (q.options[q.answerIndex]?.label ?? null) : null,
    })),
    tipFeedback: [...byAngle.values()].filter((e) => e.accepted + e.dismissed + e.reported > 0).sort((a, b) => a.angle.localeCompare(b.angle)),
  };
}
