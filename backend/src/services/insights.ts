import { and, asc, eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';

import type { Meal, MealType, Nutrients, Recipe, RecipesResponse, WeeklySummary } from '../../../shared/api';
import { addDays, mondayOf } from '../../../shared/dates';
import { mealTypeForTime } from '../../../shared/nutrition';
import { copyAiFor } from '../ai';
import { analyze, periodStats, publicFinding } from '../ai/analysis';
import { recipeFocus } from '../ai/recipes';
import type { AppDeps } from '../deps';
import { meals, recipes, weeklySummaries, type RecipeRow, type UserRow } from '../db/schema';
import { notFound } from '../errors';
import { localNow, zonedTime } from '../lib/time';
import { buildHistory, careFor, loadAnalysisInput } from './analysis';
import { userTone } from './day';
import { dayTotals, getMeal, insertItems, mealsInRange } from './meals';
import { DEFAULT_PREFERENCES, getPersonality, requirePro } from './users';

// ---------------------------------------------------------------- weekly summary (Pro)

/**
 * The weekly summary for the 7 complete days before `date`, cached per user,
 * week and date (a new request date regenerates it, so new data is picked up
 * at most a day later).
 */
export async function getWeeklySummary(deps: AppDeps, user: UserRow, date: string, log: FastifyBaseLogger): Promise<WeeklySummary> {
  requirePro(user, deps.now());
  const week = mondayOf(date);
  const [cached] = await deps.db
    .select()
    .from(weeklySummaries)
    .where(and(eq(weeklySummaries.userId, user.id), eq(weeklySummaries.week, week), eq(weeklySummaries.date, date)));
  if (cached) return cached.summary;

  const care = await careFor(deps.db, user, date);
  const [input, personality, history] = await Promise.all([
    loadAnalysisInput(deps.db, user, date, care),
    getPersonality(deps.db, user.id),
    buildHistory(deps.db, user.id, date),
  ]);
  const findings = analyze(input);
  const stats = periodStats(input);
  const periodStart = addDays(input.end, -6);
  const copy = await copyAiFor(deps.ai, user).summary.weeklySummary(
    {
      date,
      sex: user.profile.sex,
      ...userTone(user, personality),
      care: care.active,
      preferences: user.preferences ?? DEFAULT_PREFERENCES,
      findings,
      stats,
      history,
      periodStart,
      periodEnd: input.end,
    },
    log,
  );
  const summary: WeeklySummary = {
    week,
    periodStart,
    periodEnd: input.end,
    ...copy,
    findings: findings.map(publicFinding),
    stats,
    generatedAt: deps.now().toISOString(),
  };
  await deps.db
    .insert(weeklySummaries)
    .values({ userId: user.id, week, date, summary, findings: summary.findings })
    .onConflictDoNothing();
  return summary;
}

// ---------------------------------------------------------------- recipes (Pro)

const MAIN: MealType[] = ['breakfast', 'lunch', 'dinner'];

/**
 * The next meal slot: by local time for today (the next main meal if the
 * current one is already logged), breakfast for a future date, and the first
 * unlogged main meal for a past date.
 */
export function nextMealSlot(date: string, localDate: string, localHm: string, logged: MealType[]): MealType {
  let slot: MealType;
  if (date === localDate) {
    const [h, m] = localHm.split(':').map(Number);
    slot = mealTypeForTime(new Date(2000, 0, 1, h, m));
  } else if (date > localDate) {
    return 'breakfast';
  } else {
    slot = 'breakfast';
  }
  if (slot === 'snack' || !logged.includes(slot)) return slot;
  const next = MAIN.slice(MAIN.indexOf(slot) + 1).find((s) => !logged.includes(s));
  return next ?? 'snack';
}

export const prefsKey = (p: { diet: string; avoid: string[] }) => `${p.diet}|${[...p.avoid].sort().join(',')}`;

function toRecipe(row: RecipeRow): Recipe {
  return { id: row.id, ...row.recipe };
}

const minus = (target: number, value: number) => Math.max(0, Math.round((target - value) * 10) / 10);

export async function getRecipes(deps: AppDeps, user: UserRow, date: string, log: FastifyBaseLogger): Promise<RecipesResponse> {
  const now = deps.now();
  requirePro(user, now);
  const local = localNow(user.timezone, now);
  const dayMeals = await mealsInRange(deps.db, deps.config, user.id, date, date);
  const mealType = nextMealSlot(date, local.date, local.hm, [...new Set(dayMeals.map((m) => m.type))]);
  const preferences = user.preferences ?? DEFAULT_PREFERENCES;
  const key = prefsKey(preferences);

  const cached = await deps.db
    .select()
    .from(recipes)
    .where(and(eq(recipes.userId, user.id), eq(recipes.date, date), eq(recipes.mealType, mealType), eq(recipes.prefsKey, key)))
    .orderBy(asc(recipes.position));
  if (cached.length) return { date, mealType, recipes: cached.map(toRecipe), aiGenerated: cached.some((r) => r.aiGenerated) };

  const totals = dayTotals(dayMeals);
  const t = user.targets;
  const targets: Nutrients = { kcal: t.kcal, proteinG: t.proteinG, carbsG: t.carbsG, fatG: t.fatG, fibreG: t.fibreG };
  const remaining: Nutrients = {
    kcal: minus(t.kcal, totals.kcal),
    proteinG: minus(t.proteinG, totals.proteinG),
    carbsG: minus(t.carbsG, totals.carbsG),
    fatG: minus(t.fatG, totals.fatG),
    fibreG: minus(t.fibreG, totals.fibreG),
  };
  const care = await careFor(deps.db, user, date);
  const result = await copyAiFor(deps.ai, user).recipes.recipes(
    { date, sex: user.profile.sex, care: care.active, mealType, remaining, focus: recipeFocus(remaining, targets), preferences },
    log,
  );
  if (!result.recipes.length) return { date, mealType, recipes: [], aiGenerated: false };
  const rows = await deps.db
    .insert(recipes)
    .values(
      result.recipes.map(({ servingGrams, ...recipe }, position) => ({
        userId: user.id,
        date,
        mealType,
        prefsKey: key,
        position,
        recipe,
        servingGrams,
        aiGenerated: result.aiGenerated,
      })),
    )
    .returning();
  return { date, mealType, recipes: rows.sort((a, b) => a.position - b.position).map(toRecipe), aiGenerated: result.aiGenerated };
}

/** Typical local time per slot, for recipes logged on another day than today. */
const SLOT_TIME: Record<MealType, string> = { breakfast: '08:00', lunch: '13:00', snack: '16:00', dinner: '19:00' };

/**
 * Logs one serving of a recipe as a single meal item (source 'manual', the meal
 * type the recipe was suggested for). per100g is derived from the serving, so
 * the meal totals equal the recipe's perServing values.
 */
export async function logRecipe(deps: AppDeps, user: UserRow, id: string, date: string): Promise<Meal> {
  const [row] = await deps.db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.userId, user.id)));
  if (!row) throw notFound('Recipe');
  const f = 100 / row.servingGrams;
  const p = row.recipe.perServing;
  const per100g: Nutrients = { kcal: p.kcal * f, proteinG: p.proteinG * f, carbsG: p.carbsG * f, fatG: p.fatG * f, fibreG: p.fibreG * f };
  const now = deps.now();
  const local = localNow(user.timezone, now);
  const eatenAt = date === local.date ? now : zonedTime(date, SLOT_TIME[row.mealType as MealType], user.timezone);
  const mealId = await deps.db.transaction(async (tx) => {
    const [meal] = await tx
      .insert(meals)
      .values({ userId: user.id, date, type: row.mealType, eatenAt, source: 'manual' })
      .returning({ id: meals.id });
    await insertItems(tx, meal!.id, [{ name: row.recipe.title.slice(0, 80), grams: row.servingGrams, per100g, portionLabel: '1 porcija' }]);
    return meal!.id;
  });
  return (await getMeal(deps.db, deps.config, user.id, mealId))!;
}
