import { and, eq, gte, inArray, lte } from 'drizzle-orm';

import { addDays } from '../../../shared/dates';
import type { Db } from '../db/client';
import { favourites, mealItems, meals } from '../db/schema';

export const LIKED_FOODS_MAX = 8;
const DAYS = 28;

/**
 * Foods the user actually eats, in their own words: item names logged most often in the
 * last 28 days, then favourites. Names only (no amounts), at most 8, so tips can say
 * "olas vai biezpiens" instead of a generic list.
 */
export async function likedFoods(db: Db, userId: string, date: string): Promise<string[]> {
  const rows = await db
    .select({ id: meals.id })
    .from(meals)
    .where(and(eq(meals.userId, userId), gte(meals.date, addDays(date, -DAYS + 1)), lte(meals.date, date)));
  const items = rows.length ? await db.select({ name: mealItems.name }).from(mealItems).where(inArray(mealItems.mealId, rows.map((r) => r.id))) : [];
  const favs = await db.select({ name: favourites.name }).from(favourites).where(eq(favourites.userId, userId));
  return rankFoods(items.map((i) => i.name), favs.map((f) => f.name));
}

const DRINKS = /^(kafija|tēja|ūdens|minerālūdens)\b/i;

/** Most frequent first; favourites count as 2 logs each; drinks are not food ideas. */
export function rankFoods(logged: string[], favs: string[] = []): string[] {
  const count = new Map<string, { label: string; n: number }>();
  const add = (raw: string, w: number) => {
    const label = raw.replace(/\s+/g, ' ').trim();
    const key = label.toLowerCase();
    if (!key || DRINKS.test(key)) return;
    const e = count.get(key) ?? { label, n: 0 };
    e.n += w;
    count.set(key, e);
  };
  for (const n of logged) add(n, 1);
  for (const n of favs) add(n, 2);
  return [...count.values()]
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'lv'))
    .slice(0, LIKED_FOODS_MAX)
    .map((e) => e.label);
}
