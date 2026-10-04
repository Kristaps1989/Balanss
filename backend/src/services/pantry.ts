import { eq } from 'drizzle-orm';

import { PANTRY_FRESH_DAYS, type Pantry } from '../../../shared/api';
import { cleanPantryItems } from '../ai/food';
import type { Db } from '../db/client';
import { pantry } from '../db/schema';

const FRESH_MS = PANTRY_FRESH_DAYS * 86_400_000;

export async function getPantry(db: Db, userId: string, now: Date): Promise<Pantry> {
  const [row] = await db.select().from(pantry).where(eq(pantry.userId, userId));
  if (!row) return { items: [], updatedAt: null, fresh: false };
  return { items: row.items, updatedAt: row.updatedAt.toISOString(), fresh: now.getTime() - row.updatedAt.getTime() < FRESH_MS && row.items.length > 0 };
}

/** The list the tone engine may use: only a fresh, non-empty one (otherwise "unknown"). */
export async function freshPantryItems(db: Db, userId: string, now: Date): Promise<string[] | null> {
  const p = await getPantry(db, userId, now);
  return p.fresh ? p.items : null;
}

export async function savePantry(db: Db, userId: string, items: string[], now: Date): Promise<Pantry> {
  const clean = cleanPantryItems(items);
  await db
    .insert(pantry)
    .values({ userId, items: clean, updatedAt: now })
    .onConflictDoUpdate({ target: pantry.userId, set: { items: clean, updatedAt: now } });
  return getPantry(db, userId, now);
}
