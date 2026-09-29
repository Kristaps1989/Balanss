import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { HealthSyncRequest, MovementOverview, SleepOverview } from '../../shared/api';
import { healthDays, sleepNights, workouts } from '../src/db/schema';
import { ILZE_EMAIL, seedIlze } from '../src/seed-data';
import { authed, db, loginByEmail, makeApp, resetDb, type TestContext } from './helpers';

const TODAY = '2026-09-27';
let ctx: TestContext;

beforeAll(async () => {
  ctx = await makeApp();
});
afterAll(() => ctx.app.close());
beforeEach(resetDb);

describe('POST /health/sync', () => {
  const payload: HealthSyncRequest = {
    source: 'health_connect',
    devices: ['Pixel Watch'],
    days: [
      { date: '2026-09-26', steps: 5000, activeKcal: 200, restingHr: 60, hrvMs: 40 },
      { date: '2026-09-27', steps: 3000, activeKcal: 120.4, restingHr: null, hrvMs: null },
    ],
    nights: [{ date: '2026-09-27', bedtime: '23:30', wakeTime: '07:00', totalMin: 430, deepMin: 70, remMin: 90, lightMin: 270, awakeMin: 20 }],
    workouts: [
      { externalId: 'hc-1', type: 'run', startedAt: '2026-09-27T07:30:00Z', durationMin: 30, kcal: 300, avgHr: 150, zones: { minutes: [2, 8, 12, 6, 2] }, device: 'Pixel Watch' },
    ],
    weights: [{ date: '2026-09-27', kg: 64.2 }],
  };

  it('is idempotent and updates devices', async () => {
    const call = authed(ctx.app, (await loginByEmail(ctx.app, 'sync@example.lv')).accessToken);
    const first = await call({ method: 'POST', url: '/v1/health/sync', payload });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ daysUpserted: 2, nightsUpserted: 1, workoutsUpserted: 1 });

    const changed = { ...payload, days: [{ ...payload.days[1]!, steps: 4200 }], workouts: [{ ...payload.workouts[0]!, durationMin: 32 }] };
    await call({ method: 'POST', url: '/v1/health/sync', payload });
    await call({ method: 'POST', url: '/v1/health/sync', payload: changed });

    const userId = (await call({ method: 'GET', url: '/v1/me' })).json().id;
    const days = await db.select().from(healthDays).where(eq(healthDays.userId, userId));
    expect(days).toHaveLength(2);
    expect(days.find((d) => d.date === TODAY)!.steps).toBe(4200);
    expect(await db.select().from(sleepNights).where(eq(sleepNights.userId, userId))).toHaveLength(1);
    const w = await db.select().from(workouts).where(eq(workouts.userId, userId));
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ name: 'Skriešana', durationMin: 32, source: 'health_connect' });

    const me = (await call({ method: 'GET', url: '/v1/me' })).json();
    expect(me.devices).toMatchObject({ source: 'health_connect', connected: true, devices: ['Pixel Watch'] });
    expect(Date.parse(me.devices.lastSyncAt)).toBeGreaterThanOrEqual(Date.parse(first.json().lastSyncAt));
    expect(me.profile.weightKg).toBe(64.2);
  });

  it('dedupes repeated keys inside one batch', async () => {
    const call = authed(ctx.app, (await loginByEmail(ctx.app, 'dup@example.lv')).accessToken);
    const res = await call({
      method: 'POST',
      url: '/v1/health/sync',
      payload: { ...payload, days: [payload.days[0]!, { ...payload.days[0]!, steps: 5100 }], workouts: [payload.workouts[0]!, payload.workouts[0]!] },
    });
    expect(res.json()).toMatchObject({ daysUpserted: 1, workoutsUpserted: 1 });
  });

  it('validates the payload', async () => {
    const call = authed(ctx.app, (await loginByEmail(ctx.app, 'bad@example.lv')).accessToken);
    const res = await call({ method: 'POST', url: '/v1/health/sync', payload: { ...payload, nights: [{ ...payload.nights[0]!, bedtime: '25:00' }] } });
    expect(res.statusCode).toBe(400);
  });
});

describe('overviews for the seeded sample user', () => {
  let call: ReturnType<typeof authed>;
  beforeEach(async () => {
    await seedIlze(db, TODAY);
    call = authed(ctx.app, (await loginByEmail(ctx.app, ILZE_EMAIL)).accessToken);
  });

  it('GET /health/movement', async () => {
    const m = (await call({ method: 'GET', url: `/v1/health/movement?days=7&date=${TODAY}` })).json() as MovementOverview;
    expect(m.today).toEqual({ steps: { value: 6430, target: 8000 }, activeKcal: 310 });
    expect(m.days.map((d) => d.steps)).toEqual([7820, 9140, 5600, 8310, 7050, 10220, 6430]);
    expect(m.restingHr).toEqual({ today: 61, series: [63, 62, 62, 60, 61, 62, 61] });
    expect(m.hrv).toEqual({ today: 42, series: [38, 41, 40, 44, 39, 43, 42] });
    expect(m.workouts.map((w) => w.name)).toEqual(['Nūjošana', 'Joga', 'Pastaiga']);
    expect(m.workouts[0]).toMatchObject({ durationMin: 42, avgHr: 112, zones: { minutes: [9, 21, 10, 2, 0] }, device: 'Polar H10' });
    expect(m.source).toBe('health_connect');
    expect(m.devices).toEqual(['Apple Watch', 'Polar H10']);
  });

  it('GET /health/sleep gives the 23:00–23:30 window', async () => {
    const s = (await call({ method: 'GET', url: `/v1/health/sleep?date=${TODAY}` })).json() as SleepOverview;
    expect(s.window).toEqual({ start: '23:00', end: '23:30', basedOnNights: 14 });
    expect(s.nights.map((n) => n.bedtime)).toEqual(['23:12', '23:28', '00:05', '23:25', '23:55', '00:20', '23:48']);
    expect(s.lastNight).toMatchObject({ totalMin: 400, deepMin: 65, remMin: 80, lightMin: 255, bedtime: '23:48', wakeTime: '06:45' });
    expect(s.devices).toEqual(['Apple Watch', 'Polar H10']);
  });

  it('POST /activities stores a manual workout with a Latvian name', async () => {
    const res = await call({ method: 'POST', url: '/v1/activities', payload: { type: 'swim', startedAt: '2026-09-27T15:00:00Z', durationMin: 40 } });
    expect(res.json()).toMatchObject({ type: 'swim', name: 'Peldēšana', source: 'manual', kcal: null, zones: null, device: null });
    const other = await call({ method: 'POST', url: '/v1/activities', payload: { type: 'other', startedAt: '2026-09-27T16:00:00Z', durationMin: 10, kcal: 40 } });
    expect(other.json()).toMatchObject({ name: 'Aktivitāte', kcal: 40 });
    const m = (await call({ method: 'GET', url: `/v1/health/movement?date=${TODAY}` })).json() as MovementOverview;
    expect(m.workouts.map((w) => w.name)).toContain('Peldēšana');
  });
});
