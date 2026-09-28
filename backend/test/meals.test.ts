import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AuthTokens, Meal, NutritionStats } from '../../shared/api';
import { barcodeCache, insights } from '../src/db/schema';
import { ILZE_EMAIL, seedIlze } from '../src/seed-data';
import { authed, db, JPEG_BASE64, loginByEmail, makeApp, resetDb, type TestContext } from './helpers';

let ctx: TestContext;
let tokens: AuthTokens;
let call: ReturnType<typeof authed>;

beforeAll(async () => {
  ctx = await makeApp();
});
afterAll(() => ctx.app.close());
beforeEach(async () => {
  await resetDb();
  tokens = await loginByEmail(ctx.app, 'meals@example.lv');
  call = authed(ctx.app, tokens.accessToken);
});

const egg = { kcal: 156, proteinG: 12.6, carbsG: 1.1, fatG: 10.6, fibreG: 0 };
const bread = { kcal: 229, proteinG: 6.1, carbsG: 44, fatG: 1.4, fibreG: 7.5 };

const analyze = () =>
  call({ method: 'POST', url: '/v1/meals/analyze', payload: { imageBase64: JPEG_BASE64, mediaType: 'image/jpeg', takenAt: '2026-09-27T13:05:00+03:00' } });

describe('meals CRUD', () => {
  it('creates, updates and deletes a meal with computed totals', async () => {
    const created = await call({
      method: 'POST',
      url: '/v1/meals',
      payload: {
        date: '2026-09-27',
        type: 'breakfast',
        eatenAt: '2026-09-27T08:10:00+03:00',
        source: 'text',
        items: [
          { name: 'Olas, vārītas', grams: 100, per100g: egg, portionLabel: '2 gab.' },
          { name: 'Rupjmaize', grams: 35, per100g: bread, portionLabel: '1 šķēle' },
        ],
      },
    });
    expect(created.statusCode).toBe(200);
    const meal = created.json() as Meal;
    expect(meal.items[0]!.totals).toEqual({ kcal: 156, proteinG: 12.6, carbsG: 1.1, fatG: 10.6, fibreG: 0 });
    expect(meal.items[1]!.totals.kcal).toBe(80);
    expect(meal.totals).toEqual({ kcal: 236, proteinG: 14.7, carbsG: 16.5, fatG: 11.1, fibreG: 2.6 });
    expect(meal.photoUrl).toBeNull();

    const patched = await call({
      method: 'PATCH',
      url: `/v1/meals/${meal.id}`,
      payload: { type: 'lunch', items: [{ name: 'Olas, vārītas', grams: 150, per100g: egg }] },
    });
    expect(patched.json().type).toBe('lunch');
    expect(patched.json().totals.kcal).toBe(234);
    expect(patched.json().items).toHaveLength(1);

    const day = (await call({ method: 'GET', url: '/v1/days/2026-09-27' })).json();
    expect(day.nutrition.kcal.value).toBe(234);

    expect((await call({ method: 'DELETE', url: `/v1/meals/${meal.id}` })).json()).toEqual({ ok: true });
    expect((await call({ method: 'DELETE', url: `/v1/meals/${meal.id}` })).statusCode).toBe(404);
  });

  it('cannot touch another user’s meal', async () => {
    const meal = (
      await call({
        method: 'POST',
        url: '/v1/meals',
        payload: { date: '2026-09-27', type: 'snack', eatenAt: '2026-09-27T16:00:00Z', source: 'manual', items: [{ name: 'Ābols', grams: 180, per100g: egg }] },
      })
    ).json() as Meal;
    const other = authed(ctx.app, (await loginByEmail(ctx.app, 'other@example.lv')).accessToken);
    expect((await other({ method: 'PATCH', url: `/v1/meals/${meal.id}`, payload: { type: 'lunch' } })).statusCode).toBe(404);
    expect((await other({ method: 'DELETE', url: `/v1/meals/${meal.id}` })).statusCode).toBe(404);
  });

  it('validates items', async () => {
    const res = await call({
      method: 'POST',
      url: '/v1/meals',
      payload: { date: '2026-09-27', type: 'snack', eatenAt: 'x', source: 'manual', items: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('favourites', () => {
  it('creates, lists and deletes favourites with totals', async () => {
    const fav = await call({
      method: 'POST',
      url: '/v1/favourites',
      payload: { name: 'Olu brokastis', items: [{ name: 'Olas, vārītas', grams: 100, per100g: egg }] },
    });
    expect(fav.json()).toMatchObject({ name: 'Olu brokastis', totals: { kcal: 156 } });
    const list = await call({ method: 'GET', url: '/v1/favourites' });
    expect(list.json()).toHaveLength(1);
    expect((await call({ method: 'DELETE', url: `/v1/favourites/${fav.json().id}` })).json()).toEqual({ ok: true });
    expect((await call({ method: 'GET', url: '/v1/favourites' })).json()).toEqual([]);
  });
});

describe('photo analysis and quota', () => {
  it('returns the Food-Result sample, a signed photo URL and the quota; 4th free analysis → 402', async () => {
    const first = await analyze();
    expect(first.statusCode).toBe(200);
    const body = first.json();
    expect(body.items.map((i: { name: string }) => i.name)).toEqual(['Vistas krūtiņa', 'Rīsi, vārīti', 'Salāti', 'Mērce']);
    expect(body.items[3].confidence).toBe(0.45);
    expect(body.items[3].alternatives.map((a: { label: string }) => a.label)).toEqual(['Jogurta mērce', 'Majonēze', 'Bez mērces']);
    expect(body.suggestedType).toBe('lunch');
    expect(body.photoUrl).toMatch(/^http:\/\/api\.test\/v1\/photos\/[A-Za-z0-9_-]{24}\.jpg\?exp=\d+&sig=/);
    expect(body.quota).toEqual({ plan: 'free', photoAnalysesLimit: 3, photoAnalysesUsed: 1, photoAnalysesLeft: 2 });

    // The signed URL serves the stored bytes without an auth header.
    const path = body.photoUrl.replace('http://api.test', '');
    const photo = await ctx.app.inject({ method: 'GET', url: path });
    expect(photo.statusCode).toBe(200);
    expect(photo.headers['content-type']).toBe('image/jpeg');
    expect(photo.rawPayload.equals(Buffer.from(JPEG_BASE64, 'base64'))).toBe(true);
    const tampered = await ctx.app.inject({ method: 'GET', url: path.replace(/sig=.*/, 'sig=AAAA') });
    expect(tampered.statusCode).toBe(403);

    // Saving the meal keeps the photo.
    const meal = await call({
      method: 'POST',
      url: '/v1/meals',
      payload: { date: '2026-09-27', type: 'lunch', eatenAt: '2026-09-27T13:05:00+03:00', source: 'photo', photoUrl: body.photoUrl, items: body.items },
    });
    expect(meal.json().photoUrl).toMatch(/\/v1\/photos\//);
    expect(meal.json().totals.kcal).toBe(514);

    expect((await analyze()).statusCode).toBe(200);
    expect((await analyze()).statusCode).toBe(200);
    const fourth = await analyze();
    expect(fourth.statusCode).toBe(402);
    expect(fourth.json().error.code).toBe('quota_exceeded');
    expect((await call({ method: 'GET', url: '/v1/me/quota' })).json()).toEqual({
      plan: 'free',
      photoAnalysesLimit: 3,
      photoAnalysesUsed: 3,
      photoAnalysesLeft: 0,
    });
  });

  it('Pro via the RevenueCat webhook is unlimited; EXPIRATION returns to free', async () => {
    const hook = (payload: object, secret = 'rc-test-secret') =>
      ctx.app.inject({ method: 'POST', url: '/v1/billing/webhook', headers: { authorization: `Bearer ${secret}` }, payload });

    expect((await hook({ event: { type: 'INITIAL_PURCHASE', app_user_id: tokens.user.id } }, 'wrong')).statusCode).toBe(401);
    const ok = await hook({ event: { type: 'INITIAL_PURCHASE', app_user_id: tokens.user.id, expiration_at_ms: Date.now() + 86_400_000 } });
    expect(ok.json()).toEqual({ ok: true });
    expect((await call({ method: 'GET', url: '/v1/me' })).json().plan).toBe('pro');

    for (let i = 0; i < 5; i++) expect((await analyze()).statusCode).toBe(200);
    expect((await call({ method: 'GET', url: '/v1/me/quota' })).json()).toMatchObject({ plan: 'pro', photoAnalysesLimit: null, photoAnalysesLeft: null });

    await hook({ event: { type: 'EXPIRATION', app_user_id: tokens.user.id } });
    expect((await call({ method: 'GET', url: '/v1/me' })).json().plan).toBe('free');
    expect((await analyze()).statusCode).toBe(402);
    // Unknown users are acknowledged and ignored.
    expect((await hook({ event: { type: 'RENEWAL', app_user_id: '$RCAnonymousID:abc' } })).statusCode).toBe(200);
  });

  it('rejects data that is not an image', async () => {
    const res = await call({
      method: 'POST',
      url: '/v1/meals/analyze',
      payload: { imageBase64: Buffer.alloc(300, 7).toString('base64'), mediaType: 'image/jpeg', takenAt: '2026-09-27T13:05:00Z' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_image');
  });
});

describe('parse-text', () => {
  it('parses "2 olas un maize" with the Latvian dictionary', async () => {
    const res = await call({ method: 'POST', url: '/v1/meals/parse-text', payload: { text: '2 olas un maize' } });
    expect(res.json().items).toEqual([
      expect.objectContaining({ name: 'Olas, vārītas', grams: 100, portionLabel: '2 gab.', per100g: expect.objectContaining({ kcal: 156 }) }),
      expect.objectContaining({ name: 'Rupjmaize', grams: 35, portionLabel: '1 šķēle' }),
    ]);
  });
});

describe('barcode', () => {
  const product = {
    status: 1,
    product: {
      product_name: 'Kefir',
      product_name_lv: 'Kefīrs 2,5 %',
      brands: 'Tukuma Piens',
      serving_quantity: 250,
      serving_size: '250 ml',
      nutriments: { 'energy-kcal_100g': 52, proteins_100g: 3, carbohydrates_100g: 4.1, fat_100g: 2.5, fiber_100g: 0 },
    },
  };

  it('maps Open Food Facts to a draft item with the Latvian name and caches it', async () => {
    ctx.fetch.mockResolvedValueOnce(new Response(JSON.stringify(product), { status: 200 }));
    const res = await call({ method: 'GET', url: '/v1/foods/barcode/4750102000124' });
    expect(res.json().item).toMatchObject({
      name: 'Kefīrs 2,5 %, Tukuma Piens',
      grams: 250,
      per100g: { kcal: 52, proteinG: 3, carbsG: 4.1, fatG: 2.5, fibreG: 0 },
      portionLabel: '250 ml',
    });
    expect(ctx.fetch).toHaveBeenCalledWith('https://world.openfoodfacts.org/api/v2/product/4750102000124.json', expect.anything());
    // Second call is served from the cache.
    ctx.fetch.mockClear();
    const again = await call({ method: 'GET', url: '/v1/foods/barcode/4750102000124' });
    expect(again.json().item.name).toBe('Kefīrs 2,5 %, Tukuma Piens');
    expect(ctx.fetch).not.toHaveBeenCalled();
    expect(await db.select().from(barcodeCache)).toHaveLength(1);
  });

  it('returns null for unknown products and 502 when the lookup fails without cache', async () => {
    ctx.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ status: 0 }), { status: 200 }));
    expect((await call({ method: 'GET', url: '/v1/foods/barcode/00000000' })).json()).toEqual({ item: null });
    ctx.fetch.mockRejectedValueOnce(new Error('network down'));
    const res = await call({ method: 'GET', url: '/v1/foods/barcode/12345678' });
    expect(res.statusCode).toBe(502);
    expect((await call({ method: 'GET', url: '/v1/foods/barcode/abc' })).statusCode).toBe(400);
  });
});

describe('nutrition stats', () => {
  it('returns 7 days with averages and a cached tone insight', async () => {
    await resetDb();
    await seedIlze(db, '2026-09-27');
    const ilze = authed(ctx.app, (await loginByEmail(ctx.app, ILZE_EMAIL)).accessToken);
    const res = await ilze({ method: 'GET', url: '/v1/stats/nutrition?days=7&date=2026-09-27' });
    const stats = res.json() as NutritionStats;
    expect(stats.days).toHaveLength(7);
    expect(stats.days.at(-1)).toEqual({ date: '2026-09-27', kcal: 1480, proteinG: 68 });
    expect(stats.targetKcal).toBe(1750);
    expect(stats.targetProteinG).toBe(110);
    expect(stats.avgKcal).toBeGreaterThan(1500);
    expect(stats.avgKcal).toBeLessThan(1900);
    expect(stats.insight).toBeTruthy();
    // Plan tone copy uses Latvian number format.
    expect(stats.insight).toMatch(/\d \d{3} kcal/);
    const cached = await ilze({ method: 'GET', url: '/v1/stats/nutrition?days=7&date=2026-09-27' });
    expect(cached.json().insight).toBe(stats.insight);
    expect(await db.select().from(insights)).toHaveLength(1);
  });
});
