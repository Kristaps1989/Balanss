import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { pushLog, tips } from '../src/db/schema';
import { zonedTime } from '../src/lib/time';
import { runSchedulerTick, waterShareBy } from '../src/scheduler';
import { ILZE_EMAIL, seedIlze } from '../src/seed-data';
import { authed, db, loginByEmail, makeApp, resetDb, type TestContext } from './helpers';

const TODAY = '2026-09-27';
const RIGA = 'Europe/Riga';
const TOKEN = 'ExponentPushToken[ilze-test-device]';

let ctx: TestContext;
let call: ReturnType<typeof authed>;

beforeAll(async () => {
  ctx = await makeApp();
});
afterAll(() => ctx.app.close());

async function setup(timezone = RIGA) {
  await resetDb();
  await seedIlze(db, TODAY);
  call = authed(ctx.app, (await loginByEmail(ctx.app, ILZE_EMAIL)).accessToken);
  const res = await call({ method: 'PUT', url: '/v1/push/token', payload: { token: TOKEN, platform: 'android', timezone } });
  expect(res.json()).toEqual({ ok: true });
  ctx.push.sent = [];
}

const at = (hm: string, tz = RIGA) => runSchedulerTick(ctx.deps, ctx.app.log, zonedTime(TODAY, hm, tz));

describe('push scheduler', () => {
  beforeEach(() => setup());

  it('fires the right kinds at the right local times, once each', async () => {
    // 05:00 — pre-generate today's tip, no push.
    let r = await at('05:00');
    expect(r.tipsGenerated).toHaveLength(1);
    expect(r.pushes).toEqual([]);
    expect(await db.select().from(tips)).toHaveLength(1);
    expect((await at('05:05')).tipsGenerated).toEqual([]);

    // 10:00 and 13:10 — 1,2 l is ahead of the pro-rated target, so no water push.
    expect((await at('10:00')).pushes).toEqual([]);
    expect((await at('13:10')).pushes).toEqual([]);
    // 13:30 — lunch is logged, so no food reminder.
    expect((await at('13:30')).pushes).toEqual([]);

    // 19:00 — 1,2 l is behind ~1,9 l → water push in the plan tone.
    r = await at('19:00');
    expect(r.pushes).toHaveLength(1);
    expect(r.pushes[0]).toMatchObject({ kind: 'water', slot: '19:00', title: 'Ūdens: 1,2 no 2,3 l' });
    expect(ctx.push.sent.at(-1)).toMatchObject({ to: TOKEN, title: 'Ūdens: 1,2 no 2,3 l', data: { kind: 'water', date: TODAY } });

    // 19:30 — no dinner yet → food reminder.
    r = await at('19:30');
    expect(r.pushes.map((p) => [p.kind, p.slot])).toEqual([['food', '19:30']]);
    expect(r.pushes[0]!.body).toContain('Vakariņas');

    // Dedupe: the same slots do not fire again.
    expect((await at('19:35')).pushes).toEqual([]);
    expect((await at('19:10')).pushes).toEqual([]);

    // 22:15 — window 23:00–23:30 minus 45 min lead; allowed inside quiet hours.
    r = await at('22:15');
    expect(r.pushes).toHaveLength(1);
    expect(r.pushes[0]).toMatchObject({ kind: 'sleep', title: 'Miega logs 23:00–23:30' });
    expect(r.pushes[0]!.body).toBe('Plāns: tagad ierīces malā, 22:30 tēja, 23:00 gultā. Tā sasniegsi 7 h 30 min miega.');
    expect((await at('22:20')).pushes).toEqual([]);

    // Quiet hours: nothing but the sleep push.
    expect((await at('23:00')).pushes).toEqual([]);
    expect(ctx.push.sent).toHaveLength(3);
    const log = await db.select().from(pushLog);
    expect(log.map((l) => l.kind).sort()).toEqual(['food', 'sleep', 'tip', 'water']);
  });

  it('respects reminder settings and lead time', async () => {
    await call({ method: 'PUT', url: '/v1/me/reminders', payload: { sleepWindow: false, food: false } });
    expect((await at('22:15')).pushes).toEqual([]);
    expect((await at('19:30')).pushes).toEqual([]);

    await setup();
    await call({ method: 'PUT', url: '/v1/me/reminders', payload: { sleepLeadMin: 60 } });
    expect((await at('21:55')).pushes).toEqual([]);
    expect((await at('22:00')).pushes.map((p) => p.kind)).toEqual(['sleep']);
  });

  it('uses the gentle tone copy when the user prefers it', async () => {
    await call({ method: 'PUT', url: '/v1/me/tone', payload: { preference: 'gentle' } });
    const r = await at('19:00');
    expect(r.pushes[0]).toMatchObject({ kind: 'water', title: 'Balanss', body: 'Ja ērti, iedzer malku ūdens. Nekas nav nokavēts.' });
  });

  it('works in the token’s time zone', async () => {
    await setup('America/New_York');
    // 19:00 in Riga is 12:00 in New York: nothing due.
    expect((await at('19:00', RIGA)).pushes).toEqual([]);
    const r = await at('19:00', 'America/New_York');
    expect(r.pushes.map((p) => p.kind)).toEqual(['water']);
  });

  it('sends only to users with a push token', async () => {
    await resetDb();
    await seedIlze(db, TODAY);
    expect((await at('19:00')).pushes).toEqual([]);
  });
});

describe('water pro-rating', () => {
  it('ramps from 08:00 to 21:00', () => {
    expect(waterShareBy(7 * 60)).toBe(0);
    expect(waterShareBy(8 * 60)).toBe(0);
    expect(waterShareBy(14 * 60 + 30)).toBeCloseTo(0.5);
    expect(waterShareBy(22 * 60)).toBe(1);
  });
});
