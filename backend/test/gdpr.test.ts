import { existsSync } from 'node:fs';
import path from 'node:path';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { photos } from '../src/db/schema';
import { ILZE_EMAIL, seedIlze } from '../src/seed-data';
import { authed, db, JPEG_BASE64, loginByEmail, makeApp, resetDb, type TestContext } from './helpers';

const TODAY = '2026-09-27';
let ctx: TestContext;
let call: ReturnType<typeof authed>;

beforeAll(async () => {
  ctx = await makeApp();
});
afterAll(() => ctx.app.close());
beforeEach(async () => {
  await resetDb();
  await seedIlze(db, TODAY);
  const t = await loginByEmail(ctx.app, ILZE_EMAIL);
  call = authed(ctx.app, t.accessToken);
  await call({ method: 'PUT', url: '/v1/push/token', payload: { token: 'ExponentPushToken[secret-device-token]', platform: 'android', timezone: 'Europe/Riga' } });
  await call({ method: 'GET', url: `/v1/tips/today?date=${TODAY}` });
  await call({ method: 'GET', url: `/v1/weekly-question?date=${TODAY}` });
  await call({ method: 'POST', url: '/v1/favourites', payload: { name: 'Brokastis', items: [{ name: 'Ola', grams: 50, per100g: { kcal: 156, proteinG: 12.6, carbsG: 1.1, fatG: 10.6, fibreG: 0 } }] } });
});

describe('export', () => {
  it('creates a single-use 24 h download with all the user’s data', async () => {
    const res = await call({ method: 'POST', url: '/v1/me/export' });
    expect(res.statusCode).toBe(200);
    const { downloadUrl, expiresAt } = res.json();
    expect(downloadUrl).toMatch(/^http:\/\/api\.test\/v1\/exports\/[A-Za-z0-9_-]{43}$/);
    const hours = (Date.parse(expiresAt) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);

    const url = downloadUrl.replace('http://api.test', '');
    const dl = await ctx.app.inject({ method: 'GET', url });
    expect(dl.statusCode).toBe(200);
    expect(dl.headers['content-disposition']).toMatch(/^attachment; filename="balanss-dati-\d{4}-\d{2}-\d{2}\.json"$/);
    const data = dl.json();
    expect(data.account.email).toBe(ILZE_EMAIL);
    expect(data.profile.firstName).toBe('Ilze');
    expect(data.targets.kcal).toBe(1750);
    expect(data.personality.answers).toHaveLength(20);
    expect(data.meals.length).toBeGreaterThan(40);
    expect(data.meals.find((m: { date: string; type: string }) => m.date === TODAY && m.type === 'lunch').items).toHaveLength(4);
    expect(data.water).toHaveLength(14);
    expect(data.weights).toHaveLength(5);
    expect(data.healthDays).toHaveLength(14);
    expect(data.sleepNights).toHaveLength(14);
    expect(data.workouts).toHaveLength(3);
    expect(data.tips).toHaveLength(1);
    expect(data.weeklyQuestions).toHaveLength(1);
    expect(data.favourites).toHaveLength(1);
    expect(data.reminders.sleepLeadMin).toBe(45);
    expect(data.pushTokens).toHaveLength(1);
    expect(data.pushTokens[0].token).not.toContain('secret-device-token');

    const second = await ctx.app.inject({ method: 'GET', url });
    expect(second.statusCode).toBe(410);
    expect(second.json().error.code).toBe('export_unavailable');
  });
});

describe('DELETE /me', () => {
  it('removes the user, every related row and stored photos', async () => {
    const analyzed = (
      await call({ method: 'POST', url: '/v1/meals/analyze', payload: { imageBase64: JPEG_BASE64, mediaType: 'image/jpeg', takenAt: `${TODAY}T13:05:00+03:00` } })
    ).json();
    const [photo] = await db.select().from(photos);
    const file = path.join(ctx.config.storageDir, photo!.key);
    expect(existsSync(file)).toBe(true);
    expect(analyzed.photoUrl).toContain(photo!.key);

    const res = await call({ method: 'DELETE', url: '/v1/me' });
    expect(res.json()).toEqual({ ok: true });
    expect(existsSync(file)).toBe(false);

    const tables = [
      'users',
      'personalities',
      'refresh_tokens',
      'export_tokens',
      'photos',
      'meals',
      'meal_items',
      'favourites',
      'water_days',
      'weights',
      'analysis_usage',
      'health_days',
      'sleep_nights',
      'workouts',
      'tips',
      'weekly_questions',
      'insights',
      'push_tokens',
      'push_log',
      'magic_links',
    ];
    for (const t of tables) {
      const { rows } = await db.execute<{ n: number }>(sql.raw(`select count(*)::int as n from "${t}"`));
      expect([t, rows[0]!.n]).toEqual([t, 0]);
    }
    // The old access token no longer works.
    expect((await call({ method: 'GET', url: '/v1/me' })).statusCode).toBe(401);
  });
});
