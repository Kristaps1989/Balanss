import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Tip, WeeklyQuestion } from '../../shared/api';
import { tips } from '../src/db/schema';
import { ILZE_EMAIL, seedIlze } from '../src/seed-data';
import { authed, db, loginByEmail, makeApp, resetDb, type TestContext } from './helpers';

const SUNDAY = '2026-09-27';
let ctx: TestContext;
let call: ReturnType<typeof authed>;

beforeAll(async () => {
  ctx = await makeApp();
});
afterAll(() => ctx.app.close());
beforeEach(async () => {
  await resetDb();
  await seedIlze(db, SUNDAY);
  call = authed(ctx.app, (await loginByEmail(ctx.app, ILZE_EMAIL)).accessToken);
});

describe('tips', () => {
  it('generates today’s tip once in the user’s tone (Home copy for Ilze)', async () => {
    const res = await call({ method: 'GET', url: `/v1/tips/today?date=${SUNDAY}` });
    expect(res.statusCode).toBe(200);
    const tip = res.json() as Tip;
    expect(tip).toMatchObject({ date: SUNDAY, tone: 'plan', accepted: false, highlight: '42 g', aiGenerated: false });
    expect(tip.body).toBe(
      'Līdz olbaltumvielu mērķim trūkst 42 g. Viens viegls solis: biezpiens vai jogurts vakariņās (+18 g). Miegs bija nedaudz īsāks — tāpēc šodien bez spiediena.',
    );
    const again = (await call({ method: 'GET', url: `/v1/tips/today?date=${SUNDAY}` })).json() as Tip;
    expect(again.id).toBe(tip.id);
    expect(await db.select().from(tips).where(eq(tips.date, SUNDAY))).toHaveLength(1);
  });

  it('POST /tips/next gives a different tip each time and becomes today’s tip', async () => {
    const first = (await call({ method: 'GET', url: `/v1/tips/today?date=${SUNDAY}` })).json() as Tip;
    const second = (await call({ method: 'POST', url: `/v1/tips/next?date=${SUNDAY}` })).json() as Tip;
    const third = (await call({ method: 'POST', url: `/v1/tips/next?date=${SUNDAY}` })).json() as Tip;
    expect(new Set([first.body, second.body, third.body]).size).toBe(3);
    expect(second.highlight === null || second.body.includes(second.highlight)).toBe(true);
    const today = (await call({ method: 'GET', url: `/v1/tips/today?date=${SUNDAY}` })).json() as Tip;
    expect(today.id).toBe(third.id);
  });

  it('accepts a tip', async () => {
    const tip = (await call({ method: 'GET', url: `/v1/tips/today?date=${SUNDAY}` })).json() as Tip;
    const res = await call({ method: 'POST', url: `/v1/tips/${tip.id}/accept` });
    expect(res.json()).toMatchObject({ id: tip.id, accepted: true });
    expect((await call({ method: 'POST', url: '/v1/tips/00000000-0000-4000-8000-000000000000/accept' })).statusCode).toBe(404);
  });

  it('follows the tone preference', async () => {
    await call({ method: 'PUT', url: '/v1/me/tone', payload: { preference: 'gentle' } });
    const tip = (await call({ method: 'GET', url: `/v1/tips/today?date=2026-09-26` })).json() as Tip;
    expect(tip.tone).toBe('gentle');
    expect(tip.body).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('weekly question', () => {
  it('is null early in the week when none exists', async () => {
    const res = await call({ method: 'GET', url: '/v1/weekly-question?date=2026-09-23' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
  });

  it('is generated on Friday–Sunday for the week’s Monday, then answered', async () => {
    const q = (await call({ method: 'GET', url: `/v1/weekly-question?date=${SUNDAY}` })).json() as WeeklyQuestion;
    expect(q.week).toBe('2026-09-21');
    // Based on the strongest finding that was not last week's topic (last week: bedtime).
    expect(q.question).toBe('Kas tev šonedēļ palīdzēja dzert pietiekami daudz ūdens?');
    expect(q.basedOn).toBe('Ūdens mērķis sasniegts 5 no 7 dienām.');
    expect(q.aiGenerated).toBe(false);
    expect(q.options).toHaveLength(4);
    expect(q.options[0]!.reply).toContain('5 no 7 dienām');
    expect(q.options[3]!.label).toBe('Grūti pateikt');
    expect(q.answerIndex).toBeNull();

    // The same question is returned for the rest of the week, even on Monday–Thursday of it.
    const again = (await call({ method: 'GET', url: '/v1/weekly-question?date=2026-09-22' })).json() as WeeklyQuestion;
    expect(again.id).toBe(q.id);

    const answered = await call({ method: 'POST', url: `/v1/weekly-question/${q.id}/answer`, payload: { optionIndex: 2 } });
    expect(answered.json()).toMatchObject({ id: q.id, answerIndex: 2 });
    expect((await call({ method: 'POST', url: `/v1/weekly-question/${q.id}/answer`, payload: { optionIndex: 4 } })).statusCode).toBe(400);
  });
});
