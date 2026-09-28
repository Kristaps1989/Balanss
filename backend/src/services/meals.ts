import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';

import type { CreateMealRequest, Meal, MealItem, MealSource, MealType, Nutrients } from '../../../shared/api';
import { itemsTotals, scale, sum, ZERO } from '../../../shared/nutrition';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { mealItems, meals, type MealItemRow, type MealRow } from '../db/schema';
import { signedPhotoUrl } from './photos';

export function toMeal(config: Config, meal: MealRow, items: MealItemRow[]): Meal {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const mapped: MealItem[] = sorted.map((i) => ({
    id: i.id,
    name: i.name,
    grams: i.grams,
    per100g: i.per100g,
    totals: scale(i.per100g, i.grams),
    portionLabel: i.portionLabel,
  }));
  return {
    id: meal.id,
    date: meal.date,
    type: meal.type as MealType,
    eatenAt: meal.eatenAt.toISOString(),
    source: meal.source as MealSource,
    photoUrl: meal.photoKey ? signedPhotoUrl(config, meal.photoKey) : null,
    items: mapped,
    totals: itemsTotals(sorted),
  };
}

/** Meals with items between two dates (inclusive), ordered by time. */
export async function mealsInRange(db: Db, config: Config, userId: string, from: string, to: string): Promise<Meal[]> {
  const rows = await db
    .select()
    .from(meals)
    .where(and(eq(meals.userId, userId), gte(meals.date, from), lte(meals.date, to)))
    .orderBy(asc(meals.eatenAt));
  if (!rows.length) return [];
  const items = await db.select().from(mealItems).where(inArray(mealItems.mealId, rows.map((m) => m.id)));
  const byMeal = new Map<string, MealItemRow[]>();
  for (const i of items) byMeal.set(i.mealId, [...(byMeal.get(i.mealId) ?? []), i]);
  return rows.map((m) => toMeal(config, m, byMeal.get(m.id) ?? []));
}

export async function getMeal(db: Db, config: Config, userId: string, id: string): Promise<Meal | null> {
  const [m] = await db.select().from(meals).where(and(eq(meals.id, id), eq(meals.userId, userId)));
  if (!m) return null;
  const items = await db.select().from(mealItems).where(eq(mealItems.mealId, id));
  return toMeal(config, m, items);
}

export function dayTotals(list: Meal[]): Nutrients {
  return list.length ? sum(list.map((m) => m.totals)) : ZERO;
}

export async function insertItems(db: Pick<Db, 'insert'>, mealId: string, items: CreateMealRequest['items']): Promise<void> {
  if (!items.length) return;
  await db.insert(mealItems).values(
    items.map((i, position) => ({
      mealId,
      position,
      name: i.name,
      grams: i.grams,
      per100g: i.per100g,
      portionLabel: i.portionLabel ?? null,
    })),
  );
}
