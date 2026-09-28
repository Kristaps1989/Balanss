import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { AnalyzeMealResponse, BarcodeResponse, Favourite, FoodItemDraft } from '../../../shared/api';
import { itemsTotals, mealTypeForTime } from '../../../shared/nutrition';
import { barcodeCache, favourites, mealItems, meals, photos } from '../db/schema';
import { AppError, badRequest, notFound, parse } from '../errors';
import { localClockOf } from '../lib/time';
import { getMeal, insertItems } from '../services/meals';
import { keyFromPhotoUrl, looksLikeImage, savePhoto, signedPhotoUrl } from '../services/photos';
import { consumeAnalysis, getQuota } from '../services/quota';
import { getUser } from '../services/users';
import { CreateMeal, ItemSchema, UpdateMeal } from './schemas';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const BARCODE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BARCODE_MISS_TTL_MS = 24 * 60 * 60 * 1000;

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Open Food Facts product → draft item (Latvian name when the product has one). */
export function offToDraft(product: Record<string, unknown>): FoodItemDraft | null {
  const nutr = (product.nutriments ?? {}) as Record<string, unknown>;
  const name = [product.product_name_lv, product.product_name, product.generic_name_lv, product.generic_name]
    .find((v): v is string => typeof v === 'string' && v.trim().length > 0)
    ?.trim();
  const kcal = num(nutr['energy-kcal_100g']) || num(nutr['energy_100g']) / 4.184;
  if (!name || !kcal) return null;
  const brand = typeof product.brands === 'string' ? product.brands.split(',')[0]?.trim() : '';
  const serving = num(product.serving_quantity);
  const servingLabel = typeof product.serving_size === 'string' ? product.serving_size.trim().slice(0, 40) : null;
  return {
    name: (brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name}, ${brand}` : name).slice(0, 80),
    grams: serving > 0 && serving < 2000 ? Math.round(serving) : 100,
    per100g: {
      kcal: Math.round(kcal),
      proteinG: r1(num(nutr.proteins_100g)),
      carbsG: r1(num(nutr.carbohydrates_100g)),
      fatG: r1(num(nutr.fat_100g)),
      fibreG: r1(num(nutr.fiber_100g)),
    },
    confidence: 0.95,
    alternatives: [],
    portionLabel: serving > 0 ? servingLabel : null,
  };
}

export const mealRoutes: FastifyPluginAsync = async (app) => {
  const { db, config } = app.deps;

  // ------------------------------------------------------------ AI entry

  app.post('/meals/analyze', { bodyLimit: 8 * 1024 * 1024 }, async (req): Promise<AnalyzeMealResponse> => {
    const body = parse(
      z.object({
        imageBase64: z.string().min(100),
        mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        takenAt: z.string().max(40),
      }),
      req.body,
    );
    const data = Buffer.from(body.imageBase64.replace(/^data:[^,]+,/, ''), 'base64');
    if (data.length > MAX_IMAGE_BYTES) throw new AppError(413, 'image_too_large', 'Image must be at most 5 MB');
    if (!looksLikeImage(data, body.mediaType)) throw badRequest('invalid_image', 'The data is not an image of the given type');

    const user = await getUser(db, req.userId);
    const now = app.deps.now();
    if (!(await consumeAnalysis(db, user, config.freeAnalysesPerDay, now))) {
      throw new AppError(402, 'quota_exceeded', 'Free plan photo analyses for today are used up');
    }
    const [items, key] = await Promise.all([
      app.deps.ai.food.analyzeMeal(data.toString('base64'), body.mediaType, req.log),
      savePhoto(db, config, user.id, data, body.mediaType),
    ]);
    const [h, m] = localClockOf(body.takenAt, user.timezone).split(':').map(Number);
    const at = new Date(2000, 0, 1, h, m);
    return {
      items,
      suggestedType: mealTypeForTime(at),
      photoUrl: signedPhotoUrl(config, key),
      quota: await getQuota(db, user, config.freeAnalysesPerDay, now),
    };
  });

  app.post('/meals/parse-text', async (req) => {
    const { text } = parse(z.object({ text: z.string().trim().min(1).max(500) }), req.body);
    return { items: await app.deps.ai.food.parseText(text, req.log) };
  });

  app.get('/foods/barcode/:ean', async (req): Promise<BarcodeResponse> => {
    const { ean } = parse(z.object({ ean: z.string().regex(/^\d{8,14}$/, 'expected 8–14 digits') }), req.params);
    const now = app.deps.now();
    const [cached] = await db.select().from(barcodeCache).where(eq(barcodeCache.ean, ean));
    if (cached) {
      const age = now.getTime() - cached.fetchedAt.getTime();
      if (age < (cached.item ? BARCODE_TTL_MS : BARCODE_MISS_TTL_MS)) return { item: cached.item ?? null };
    }
    let item: FoodItemDraft | null = null;
    try {
      const res = await app.deps.fetch(`https://world.openfoodfacts.org/api/v2/product/${ean}.json`, {
        headers: { 'User-Agent': 'Balanss/0.1 (https://balanss.app)' },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const json = (await res.json()) as { status?: number; product?: Record<string, unknown> };
        item = json.status === 1 && json.product ? offToDraft(json.product) : null;
      } else if (res.status !== 404) {
        throw new Error(`off ${res.status}`);
      }
    } catch (err) {
      req.log.warn({ reason: err instanceof Error ? err.message : 'unknown' }, 'barcode lookup failed');
      if (cached) return { item: cached.item ?? null };
      throw new AppError(502, 'barcode_lookup_failed', 'The product database is not reachable right now');
    }
    await db
      .insert(barcodeCache)
      .values({ ean, item, fetchedAt: now })
      .onConflictDoUpdate({ target: barcodeCache.ean, set: { item, fetchedAt: now } });
    return { item };
  });

  // ------------------------------------------------------------ meals CRUD

  app.post('/meals', async (req) => {
    const body = parse(CreateMeal, req.body);
    let photoKey = keyFromPhotoUrl(body.photoUrl);
    if (photoKey) {
      // Only link photos this user uploaded.
      const [own] = await db.select().from(photos).where(and(eq(photos.key, photoKey), eq(photos.userId, req.userId)));
      if (!own) photoKey = null;
    }
    const meal = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(meals)
        .values({ userId: req.userId, date: body.date, type: body.type, eatenAt: new Date(body.eatenAt), source: body.source, photoKey })
        .returning();
      await insertItems(tx, row!.id, body.items);
      return row!;
    });
    return (await getMeal(db, config, req.userId, meal.id))!;
  });

  app.patch('/meals/:id', async (req) => {
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const patch = parse(UpdateMeal, req.body);
    const existing = await getMeal(db, config, req.userId, id);
    if (!existing) throw notFound('Meal');
    await db.transaction(async (tx) => {
      if (patch.type) await tx.update(meals).set({ type: patch.type }).where(eq(meals.id, id));
      if (patch.items) {
        await tx.delete(mealItems).where(eq(mealItems.mealId, id));
        await insertItems(tx, id, patch.items);
      }
    });
    return (await getMeal(db, config, req.userId, id))!;
  });

  app.delete('/meals/:id', async (req) => {
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const deleted = await db
      .delete(meals)
      .where(and(eq(meals.id, id), eq(meals.userId, req.userId)))
      .returning({ id: meals.id });
    if (!deleted.length) throw notFound('Meal');
    return { ok: true as const };
  });

  // ------------------------------------------------------------ favourites

  const toFavourite = (f: typeof favourites.$inferSelect): Favourite => ({
    id: f.id,
    name: f.name,
    items: f.items,
    totals: itemsTotals(f.items),
  });

  app.get('/favourites', async (req) => {
    const rows = await db.select().from(favourites).where(eq(favourites.userId, req.userId)).orderBy(desc(favourites.createdAt));
    return rows.map(toFavourite);
  });

  app.post('/favourites', async (req) => {
    const body = parse(z.object({ name: z.string().trim().min(1).max(80), items: z.array(ItemSchema).min(1).max(30) }), req.body);
    const items = body.items.map((i) => ({ ...i, portionLabel: i.portionLabel ?? null }));
    const [row] = await db.insert(favourites).values({ userId: req.userId, name: body.name, items }).returning();
    return toFavourite(row!);
  });

  app.delete('/favourites/:id', async (req) => {
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const deleted = await db
      .delete(favourites)
      .where(and(eq(favourites.id, id), eq(favourites.userId, req.userId)))
      .returning({ id: favourites.id });
    if (!deleted.length) throw notFound('Favourite');
    return { ok: true as const };
  });
};
