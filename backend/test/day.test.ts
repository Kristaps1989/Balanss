import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Day } from '../../shared/api';
import { ILZE_EMAIL, seedIlze } from '../src/seed-data';
import { authed, db, loginByEmail, makeApp, resetDb, type TestContext } from './helpers';

/** Sunday, 27 September 2026 — the prototype's Home date. */
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
  expect(t.user.isNew).toBe(false);
  call = authed(ctx.app, t.accessToken);
});

describe('GET /days/:date', () => {
  it('aggregates the sample day exactly as in CLAUDE.md', async () => {
    const res = await call({ method: 'GET', url: `/v1/days/${TODAY}` });
    expect(res.statusCode).toBe(200);
    const day = res.json() as Day;
    expect(day.nutrition).toEqual({
      kcal: { value: 1480, target: 1750 },
      proteinG: { value: 68, target: 110 },
      carbsG: { value: 160, target: 190 },
      fatG: { value: 52, target: 60 },
      fibreG: { value: 18, target: 25 },
      waterMl: { value: 1200, target: 2300 },
    });
    expect(day.meals.map((m) => [m.type, m.totals.kcal])).toEqual([
      ['breakfast', 420],
      ['lunch', 514],
      ['snack', 546],
    ]);
    expect(day.meals[1]!.source).toBe('photo');
    expect(day.meals[1]!.items.map((i) => i.name)).toEqual(['Vistas krūtiņa', 'Rīsi, vārīti', 'Salāti', 'Mērce']);
    expect(day.movement).toEqual({ steps: { value: 6430, target: 8000 }, activeKcal: 310, restingHr: 61, hrvMs: 42, source: 'health_connect' });
    expect(day.sleep).toMatchObject({
      date: TODAY,
      bedtime: '23:48',
      wakeTime: '06:45',
      totalMin: 400,
      deepMin: 65,
      remMin: 80,
      lightMin: 255,
      window: { start: '23:00', end: '23:30', basedOnNights: 14 },
    });
    expect(day.sleep!.score).toBeGreaterThan(60);
    expect(day.sleep!.score).toBeLessThanOrEqual(100);
    // Tips are never generated inside this route.
    expect(day.tip).toBeNull();
    expect(day.weeklyQuestion).toBeNull();
    expect(day.lastWeightKg).toBe(71);
  });

  it('returns an empty day for a date without data', async () => {
    const day = (await call({ method: 'GET', url: '/v1/days/2026-01-01' })).json() as Day;
    expect(day.nutrition.kcal).toEqual({ value: 0, target: 1750 });
    expect(day.meals).toEqual([]);
    expect(day.sleep).toBeNull();
    expect(day.lastWeightKg).toBeNull();
  });

  it('includes the stored tip and weekly question once they exist', async () => {
    const tip = (await call({ method: 'GET', url: `/v1/tips/today?date=${TODAY}` })).json();
    const wq = (await call({ method: 'GET', url: `/v1/weekly-question?date=${TODAY}` })).json();
    const day = (await call({ method: 'GET', url: `/v1/days/${TODAY}` })).json() as Day;
    expect(day.tip?.id).toBe(tip.id);
    expect(day.weeklyQuestion?.id).toBe(wq.id);
  });

  it('rejects malformed dates', async () => {
    expect((await call({ method: 'GET', url: '/v1/days/2026-02-30' })).statusCode).toBe(400);
    expect((await call({ method: 'GET', url: '/v1/days/today' })).statusCode).toBe(400);
  });
});

describe('water and weight', () => {
  it('adds water, undoes it, and never goes below zero', async () => {
    const add = await call({ method: 'POST', url: '/v1/water', payload: { date: TODAY, ml: 250 } });
    expect(add.json()).toEqual({ date: TODAY, waterMl: 1450 });
    const undo = await call({ method: 'POST', url: '/v1/water', payload: { date: TODAY, ml: -250 } });
    expect(undo.json()).toEqual({ date: TODAY, waterMl: 1200 });
    const clamp = await call({ method: 'POST', url: '/v1/water', payload: { date: TODAY, ml: -5000 } });
    expect(clamp.json().waterMl).toBe(0);
    const fresh = await call({ method: 'POST', url: '/v1/water', payload: { date: '2026-10-01', ml: -250 } });
    expect(fresh.json().waterMl).toBe(0);
  });

  it('records weight and updates the profile weight for the newest entry', async () => {
    const res = await call({ method: 'POST', url: '/v1/weight', payload: { date: '2026-09-28', kg: 70.84 } });
    expect(res.json()).toEqual({ date: '2026-09-28', kg: 70.8 });
    expect((await call({ method: 'GET', url: '/v1/me' })).json().profile.weightKg).toBe(70.8);
    const older = await call({ method: 'POST', url: '/v1/weight', payload: { date: '2026-09-01', kg: 72 } });
    expect(older.statusCode).toBe(200);
    expect((await call({ method: 'GET', url: '/v1/me' })).json().profile.weightKg).toBe(70.8);
    expect((await call({ method: 'GET', url: '/v1/days/2026-09-28' })).json().lastWeightKg).toBe(70.8);
  });
});
