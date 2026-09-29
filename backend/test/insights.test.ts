import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Day, Me, Meal, RecipesResponse, Tip, WeeklyQuestion, WeeklySummary } from '../../shared/api';
import { anthropicAi } from '../src/ai';
import type { ClaudeClient } from '../src/ai/claude';
import { preferenceViolation } from '../src/ai/recipes';
import { rankAngles } from '../src/ai/tone-templates';
import type { ToneInput } from '../src/ai/tone-types';
import { tips } from '../src/db/schema';
import { zonedTime } from '../src/lib/time';
import { CARE_EMAIL, ILZE_EMAIL, seedIlze, seedMarta } from '../src/seed-data';
import { authed, JPEG_BASE64, db, loginByEmail, makeApp, resetDb, type TestContext } from './helpers';

/** Sunday 27 September 2026, 18:30 in Riga (the next meal is dinner). */
const TODAY = '2026-09-27';
const NOW = zonedTime(TODAY, '18:30', 'Europe/Riga');

let ctx: TestContext;

async function login(c: TestContext, email: string) {
  return authed(c.app, (await loginByEmail(c.app, email)).accessToken);
}

async function makePro(c: TestContext, call: ReturnType<typeof authed>) {
  const me = (await call({ method: 'GET', url: '/v1/me' })).json() as Me;
  const res = await c.app.inject({
    method: 'POST',
    url: '/v1/billing/webhook',
    headers: { authorization: 'Bearer rc-test-secret' },
    payload: { event: { type: 'INITIAL_PURCHASE', app_user_id: me.id } },
  });
  expect(res.statusCode).toBe(200);
}

beforeAll(async () => {
  ctx = await makeApp({ now: () => NOW });
});
afterAll(() => ctx.app.close());

// ---------------------------------------------------------------- contract + care

describe('Me and Day contract', () => {
  beforeEach(async () => {
    await resetDb();
    await seedIlze(db, TODAY, NOW);
    await seedMarta(db, TODAY, NOW);
  });

  it('Me carries preferences, AI flag and care status; preferences and AI flag can be changed', async () => {
    const ilze = await login(ctx, ILZE_EMAIL);
    const me = (await ilze({ method: 'GET', url: '/v1/me' })).json() as Me;
    expect(me.preferences).toEqual({ diet: 'any', avoid: [] });
    expect(me.aiPersonalization).toBe(true);
    expect(me.care).toEqual({ active: false, reasons: [] });

    const p = await ilze({ method: 'PUT', url: '/v1/me/preferences', payload: { diet: 'vegan', avoid: ['nuts', 'gluten', 'nuts'] } });
    expect(p.json().preferences).toEqual({ diet: 'vegan', avoid: ['gluten', 'nuts'] });
    expect((await ilze({ method: 'PUT', url: '/v1/me/preferences', payload: { diet: 'keto' } })).statusCode).toBe(400);
    expect((await ilze({ method: 'PUT', url: '/v1/me/preferences', payload: { avoid: ['soy'] } })).statusCode).toBe(400);

    expect((await ilze({ method: 'PUT', url: '/v1/me/ai', payload: { enabled: false } })).json().aiPersonalization).toBe(false);
    expect((await ilze({ method: 'PUT', url: '/v1/me/ai', payload: {} })).statusCode).toBe(400);
  });

  it('care mode switches on for the low-intake sample user on /me and /days', async () => {
    const marta = await login(ctx, CARE_EMAIL);
    const me = (await marta({ method: 'GET', url: '/v1/me' })).json() as Me;
    expect(me.care).toEqual({ active: true, reasons: ['low_intake'] });
    expect(me.plan).toBe('free');
    const day = (await marta({ method: 'GET', url: `/v1/days/${TODAY}` })).json() as Day;
    expect(day.care).toEqual({ active: true, reasons: ['low_intake'] });
    // A day far in the past has no recent data: no care flag for it.
    expect(((await marta({ method: 'GET', url: '/v1/days/2026-01-01' })).json() as Day).care.active).toBe(false);

    const ilze = await login(ctx, ILZE_EMAIL);
    expect(((await ilze({ method: 'GET', url: `/v1/days/${TODAY}` })).json() as Day).care).toEqual({ active: false, reasons: [] });
  });

  it('care mode copy: regular meals first, no energy talk', async () => {
    const marta = await login(ctx, CARE_EMAIL);
    const tip = (await marta({ method: 'GET', url: `/v1/tips/today?date=${TODAY}` })).json() as Tip;
    expect(tip.body).toContain('regulāras maltītes');
    expect(tip.body).not.toMatch(/kcal|deficīt|svars|svaru/);
    const stats = (await marta({ method: 'GET', url: `/v1/stats/nutrition?days=7&date=${TODAY}` })).json();
    expect(stats.insight).not.toMatch(/kcal/);
    const q = (await marta({ method: 'GET', url: `/v1/weekly-question?date=${TODAY}` })).json() as WeeklyQuestion;
    expect(q.options[3]!.label).toBe('Grūti pateikt');
  });
});

describe('safety floors', () => {
  let call: ReturnType<typeof authed>;
  beforeEach(async () => {
    await resetDb();
    await seedIlze(db, TODAY, NOW);
    call = await login(ctx, ILZE_EMAIL);
  });

  it('PUT /me/targets rejects energy below the floor for the user’s sex', async () => {
    const low = await call({ method: 'PUT', url: '/v1/me/targets', payload: { kcal: 1100 } });
    expect(low.statusCode).toBe(400);
    expect(low.json().error.code).toBe('target_below_floor');
    expect((await call({ method: 'PUT', url: '/v1/me/targets', payload: { kcal: 1200 } })).json().targets.kcal).toBe(1200);
    await call({ method: 'PUT', url: '/v1/me/profile', payload: { sex: 'm' } });
    expect((await call({ method: 'PUT', url: '/v1/me/targets', payload: { kcal: 1400 } })).json().error.code).toBe('target_below_floor');
  });

  it('PUT /me/profile rejects a goal below BMI 18,5 and weight loss where it is not offered', async () => {
    const low = await call({ method: 'PUT', url: '/v1/me/profile', payload: { goalWeightKg: 50 } });
    expect(low.statusCode).toBe(400);
    expect(low.json().error.code).toBe('goal_below_healthy');
    expect((await call({ method: 'PUT', url: '/v1/me/profile', payload: { goalWeightKg: 53 } })).statusCode).toBe(200);

    const thin = await call({ method: 'PUT', url: '/v1/me/profile', payload: { weightKg: 50, goals: ['weight'], weightDirection: 'down', goalWeightKg: 48 } });
    expect(thin.json().error.code).toBe('weight_loss_not_allowed');
    const minor = await call({ method: 'PUT', url: '/v1/me/profile', payload: { age: 16, goals: ['weight'], weightDirection: 'down', goalWeightKg: 66 } });
    expect(minor.json().error.code).toBe('weight_loss_not_allowed');
    // Gaining or other goals stay available.
    expect((await call({ method: 'PUT', url: '/v1/me/profile', payload: { weightKg: 50, goals: ['weight'], weightDirection: 'up', goalWeightKg: 54 } })).statusCode).toBe(200);
    // Editing unrelated fields never trips the goal checks.
    expect((await call({ method: 'PUT', url: '/v1/me/profile', payload: { firstName: 'Ilze' } })).statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------- tips memory

describe('tip report, dismiss and ranking', () => {
  let call: ReturnType<typeof authed>;
  beforeEach(async () => {
    await resetDb();
    await seedIlze(db, TODAY, NOW);
    call = await login(ctx, ILZE_EMAIL);
  });

  it('a reported tip is hidden and today’s next tip avoids its angle', async () => {
    const first = (await call({ method: 'GET', url: `/v1/tips/today?date=${TODAY}` })).json() as Tip;
    expect(first.body).toContain('olbaltumvielu');
    const res = await call({ method: 'POST', url: `/v1/tips/${first.id}/report`, payload: { reason: 'not_relevant' } });
    expect(res.json()).toEqual({ ok: true });
    const [row] = await db.select().from(tips).where(eq(tips.id, first.id));
    expect(row).toMatchObject({ hidden: true, reportReason: 'not_relevant' });

    const next = (await call({ method: 'GET', url: `/v1/tips/today?date=${TODAY}` })).json() as Tip;
    expect(next.id).not.toBe(first.id);
    expect(next.body).not.toContain('olbaltumvielu');
    const [nextRow] = await db.select().from(tips).where(eq(tips.id, next.id));
    expect(nextRow!.angle).not.toBe('protein');
    expect(((await call({ method: 'GET', url: `/v1/days/${TODAY}` })).json() as Day).tip?.id).toBe(next.id);

    expect((await call({ method: 'POST', url: `/v1/tips/${next.id}/report`, payload: { reason: 'rude' } })).statusCode).toBe(400);
    expect((await call({ method: 'POST', url: '/v1/tips/00000000-0000-4000-8000-000000000000/report', payload: { reason: 'other' } })).statusCode).toBe(404);
  });

  it('"Cits ieteikums" marks the shown tip dismissed (accepted ones stay accepted)', async () => {
    const first = (await call({ method: 'GET', url: `/v1/tips/today?date=${TODAY}` })).json() as Tip;
    await call({ method: 'POST', url: `/v1/tips/next?date=${TODAY}` });
    const [row] = await db.select().from(tips).where(eq(tips.id, first.id));
    expect(row!.dismissed).toBe(true);

    const second = (await call({ method: 'GET', url: `/v1/tips/today?date=${TODAY}` })).json() as Tip;
    await call({ method: 'POST', url: `/v1/tips/${second.id}/accept` });
    await call({ method: 'POST', url: `/v1/tips/next?date=${TODAY}` });
    const [kept] = await db.select().from(tips).where(eq(tips.id, second.id));
    expect(kept).toMatchObject({ accepted: true, dismissed: false });
  });

  it('dismissed and reported angles are ranked down, accepted ones up', () => {
    const input = {
      nutrition: { kcal: { value: 1480, target: 1750 }, proteinG: { value: 68, target: 110 }, carbsG: { value: 160, target: 190 }, fatG: { value: 52, target: 60 }, fibreG: { value: 18, target: 25 }, waterMl: { value: 1200, target: 2300 } },
      steps: { value: 6430, target: 8000 },
      sleep: { totalMin: 400, targetMin: 450, bedtime: '23:48', window: null },
      care: false,
      history: { weeklyAnswers: [], tipFeedback: [] },
    } as unknown as ToneInput;
    expect(rankAngles(input)).toEqual(['protein', 'water', 'fibre', 'steps', 'sleep', 'overall']);
    const dismissed = { ...input, history: { weeklyAnswers: [], tipFeedback: [{ angle: 'protein' as const, accepted: 0, dismissed: 2, reported: 0 }] } };
    expect(rankAngles(dismissed)[0]).toBe('water');
    const reported = { ...input, history: { weeklyAnswers: [], tipFeedback: [{ angle: 'water' as const, accepted: 0, dismissed: 0, reported: 1 }] } };
    expect(rankAngles(reported)).not.toContain('water');
    const accepted = { ...input, history: { weeklyAnswers: [], tipFeedback: [{ angle: 'water' as const, accepted: 3, dismissed: 0, reported: 0 }] } };
    expect(rankAngles(accepted)[0]).toBe('water');
    expect(rankAngles({ ...input, avoidAngles: ['protein'] })).not.toContain('protein');
  });
});

// ---------------------------------------------------------------- weekly question

describe('weekly question from findings', () => {
  it('is based on the strongest finding not asked last week, and is stored for next week’s history', async () => {
    await resetDb();
    await seedIlze(db, TODAY, NOW);
    const call = await login(ctx, ILZE_EMAIL);
    const q = (await call({ method: 'GET', url: `/v1/weekly-question?date=${TODAY}` })).json() as WeeklyQuestion;
    expect(q).toMatchObject({ basedOn: 'Ūdens mērķis sasniegts 5 no 7 dienām.', aiGenerated: false, answerIndex: null });
    await call({ method: 'POST', url: `/v1/weekly-question/${q.id}/answer`, payload: { optionIndex: 1 } });
    // Next week: this week's topic (water consistency) is skipped for the next strongest finding.
    const nextWeek = (await call({ method: 'GET', url: '/v1/weekly-question?date=2026-10-02' })).json() as WeeklyQuestion;
    expect(nextWeek.week).toBe('2026-09-28');
    expect(nextWeek.basedOn).not.toBe(q.basedOn);
  });
});

// ---------------------------------------------------------------- Pro: summary + recipes

describe('weekly summary and recipes (Pro)', () => {
  let call: ReturnType<typeof authed>;
  beforeEach(async () => {
    await resetDb();
    await seedIlze(db, TODAY, NOW);
    call = await login(ctx, ILZE_EMAIL);
  });

  it('are Pro-only', async () => {
    for (const url of [`/v1/insights/weekly?date=${TODAY}`, `/v1/recipes?date=${TODAY}`]) {
      const res = await call({ method: 'GET', url });
      expect(res.statusCode).toBe(402);
      expect(res.json().error.code).toBe('pro_required');
    }
  });

  it('weekly summary: findings, stats, 2–3 observations, cached per date', async () => {
    await makePro(ctx, call);
    const s = (await call({ method: 'GET', url: `/v1/insights/weekly?date=${TODAY}` })).json() as WeeklySummary;
    expect(s).toMatchObject({ week: '2026-09-21', periodStart: '2026-09-20', periodEnd: '2026-09-26', aiGenerated: false });
    expect(s.findings.map((f) => f.kind)).toEqual([
      'consistency',
      'short_sleep_low_steps',
      'protein_gap',
      'steps_trend',
      'weekend_shift',
      'bedtime_in_window',
      'breakfast_skipped',
    ]);
    expect(s.findings.some((f) => f.polarity === 'positive')).toBe(true);
    expect(s.observations.length).toBeGreaterThanOrEqual(2);
    expect(s.observations.length).toBeLessThanOrEqual(3);
    expect(s.observations[0]).toEqual({ title: 'Stabils ritms', text: 'Ūdens mērķis sasniegts 5 no 7 dienām.' });
    expect(s.stats).toMatchObject({ avgProteinG: 103, avgSteps: 8106, daysLogged: 7 });
    expect(s.suggestion).toMatch(/ja gribi/i);
    const again = (await call({ method: 'GET', url: `/v1/insights/weekly?date=${TODAY}` })).json() as WeeklySummary;
    expect(again.generatedAt).toBe(s.generatedAt);
  });

  it('recipes for the next meal fit the largest gap; logging one creates a meal', async () => {
    await makePro(ctx, call);
    const r = (await call({ method: 'GET', url: `/v1/recipes?date=${TODAY}` })).json() as RecipesResponse;
    expect(r).toMatchObject({ date: TODAY, mealType: 'dinner', aiGenerated: false });
    expect(r.recipes.map((x) => x.title)).toEqual([
      'Griķi ar vistas fileju un gurķu salātiem',
      'Tītara fileja ar ceptiem dārzeņiem',
      'Cūkgaļas fileja ar kāpostu salātiem un kartupeļiem',
    ]);
    expect(r.recipes[0]!.why).toBe('+44 g olbaltumvielu vakariņām');
    // Cached: the same ids come back.
    const again = (await call({ method: 'GET', url: `/v1/recipes?date=${TODAY}` })).json() as RecipesResponse;
    expect(again.recipes.map((x) => x.id)).toEqual(r.recipes.map((x) => x.id));

    const before = ((await call({ method: 'GET', url: `/v1/days/${TODAY}` })).json() as Day).nutrition.kcal.value;
    const logged = await call({ method: 'POST', url: `/v1/recipes/${r.recipes[0]!.id}/log`, payload: { date: TODAY } });
    expect(logged.statusCode).toBe(200);
    const meal = logged.json() as Meal;
    expect(meal).toMatchObject({ date: TODAY, type: 'dinner', source: 'manual' });
    expect(meal.items).toHaveLength(1);
    expect(meal.items[0]).toMatchObject({ name: 'Griķi ar vistas fileju un gurķu salātiem', portionLabel: '1 porcija' });
    expect(meal.totals).toEqual(r.recipes[0]!.perServing);
    const after = ((await call({ method: 'GET', url: `/v1/days/${TODAY}` })).json() as Day).nutrition.kcal.value;
    expect(after).toBe(before + r.recipes[0]!.perServing.kcal);
    expect((await call({ method: 'POST', url: `/v1/recipes/${r.recipes[0]!.id}/log`, payload: {} })).statusCode).toBe(400);
    expect((await call({ method: 'POST', url: '/v1/recipes/00000000-0000-4000-8000-000000000000/log', payload: { date: TODAY } })).statusCode).toBe(404);
  });

  it('respects preferences strictly (vegan without gluten gets a new set)', async () => {
    await makePro(ctx, call);
    const any = (await call({ method: 'GET', url: `/v1/recipes?date=${TODAY}` })).json() as RecipesResponse;
    await call({ method: 'PUT', url: '/v1/me/preferences', payload: { diet: 'vegan', avoid: ['gluten'] } });
    const vegan = (await call({ method: 'GET', url: `/v1/recipes?date=${TODAY}` })).json() as RecipesResponse;
    expect(vegan.recipes).toHaveLength(3);
    expect(vegan.recipes.map((x) => x.id)).not.toEqual(any.recipes.map((x) => x.id));
    for (const r of vegan.recipes) expect(preferenceViolation(r, { diet: 'vegan', avoid: ['gluten'] })).toBeNull();
    // The tip templates follow the preferences too.
    const tip = (await call({ method: 'GET', url: `/v1/tips/today?date=${TODAY}` })).json() as Tip;
    expect(preferenceViolation({ title: tip.body, ingredients: [] }, { diet: 'vegan', avoid: ['gluten'] })).toBeNull();
  });
});

// ---------------------------------------------------------------- with (mocked) Claude

describe('with Claude', () => {
  const create = vi.fn();
  const client = { beta: { messages: { create } } } as unknown as ClaudeClient;
  let ai: TestContext;
  let call: ReturnType<typeof authed>;
  const reply = (json: unknown) => ({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    stop_reason: 'end_turn',
    stop_details: null,
    content: [{ type: 'text', text: JSON.stringify(json) }],
    usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, iterations: [] },
  });
  const dataOf = (callIndex: number) => {
    const content = create.mock.calls[callIndex]![0].messages[0].content as string;
    return JSON.parse(/<data>([\s\S]*)<\/data>/.exec(content)![1]!);
  };

  beforeAll(async () => {
    ai = await makeApp({ ai: anthropicAi(client, 'claude-opus-5-5'), now: () => NOW });
  });
  afterAll(() => ai.app.close());
  beforeEach(async () => {
    create.mockReset();
    await resetDb();
    await seedIlze(db, TODAY, NOW);
    call = await login(ai, ILZE_EMAIL);
  });

  it('sends history, findings, preferences and care — never the name, e-mail or personality scores', async () => {
    create.mockResolvedValueOnce(reply({ angle: 'water', body: 'Ūdens: 1,2 no 2,3 l. Plāns: glāze tagad un pēc katras maltītes.', highlight: '1,2 no 2,3 l' }));
    const tip = (await call({ method: 'GET', url: `/v1/tips/today?date=${TODAY}` })).json() as Tip;
    expect(tip).toMatchObject({ aiGenerated: true, highlight: '1,2 no 2,3 l' });
    const [row] = await db.select().from(tips).where(and(eq(tips.id, tip.id)));
    expect(row!.angle).toBe('water');

    const params = create.mock.calls[0]![0];
    const raw = JSON.stringify(params);
    expect(raw).not.toContain('Ilze');
    expect(raw).not.toContain(ILZE_EMAIL);
    expect(raw).not.toMatch(/openness|conscientiousness|emotionalStability|"scores"/);
    const data = dataOf(0);
    expect(data).not.toHaveProperty('firstName');
    expect(data).toMatchObject({ tone: 'plan', sex: 'f', care: false, preferences: { diet: 'any', avoid: [] } });
    expect(data.history.weeklyAnswers[0]).toMatchObject({ week: '2026-09-14', topic: 'bedtime_in_window', answer: 'Telefons vai seriāli' });
    expect(data.history.tipFeedback).toEqual([
      { angle: 'protein', accepted: 1, dismissed: 0, reported: 0 },
      { angle: 'steps', accepted: 0, dismissed: 1, reported: 0 },
      { angle: 'water', accepted: 1, dismissed: 0, reported: 0 },
    ]);
    expect(data.findings[0]).toEqual({ kind: 'consistency', polarity: 'positive', fact: 'Ūdens mērķis sasniegts 5 no 7 dienām.' });
    expect(data.findings.length).toBeLessThanOrEqual(5);
  });

  it('weekly question: Claude phrases it around the chosen finding (basedOn)', async () => {
    create.mockResolvedValueOnce(
      reply({
        question: 'Kas tev šonedēļ palīdzēja dzert vairāk ūdens?',
        options: [
          { label: 'Pudele', reply: 'Ūdens mērķis 5 no 7 dienām. Ja gribi, pudele paliek uz galda.' },
          { label: 'Atgādinājumi', reply: 'Labi, atgādinājumi paliek.' },
          { label: 'Ieradums', reply: 'Ieradums ir labs palīgs.' },
          { label: 'Grūti pateikt', reply: 'Tas ir normāli.' },
        ],
      }),
    );
    const q = (await call({ method: 'GET', url: `/v1/weekly-question?date=${TODAY}` })).json() as WeeklyQuestion;
    expect(q).toMatchObject({ aiGenerated: true, basedOn: 'Ūdens mērķis sasniegts 5 no 7 dienām.', question: 'Kas tev šonedēļ palīdzēja dzert vairāk ūdens?' });
    expect(dataOf(0).focusFinding).toEqual({ kind: 'consistency', fact: 'Ūdens mērķis sasniegts 5 no 7 dienām.' });
  });

  it('recipes: a Claude recipe that breaks the preferences is dropped and topped up from the curated list', async () => {
    await makePro(ai, call);
    await call({ method: 'PUT', url: '/v1/me/preferences', payload: { diet: 'vegan', avoid: [] } });
    const ok = {
      title: 'Tofu ar griķiem un brokoļiem',
      minutes: 25,
      servings: 2,
      servingGrams: 400,
      ingredients: [
        { name: 'Tofu', amount: '200 g' },
        { name: 'Griķi', amount: '120 g' },
        { name: 'Brokoļi', amount: '200 g' },
      ],
      steps: ['Vāri griķus.', 'Apcep tofu un brokoļus.'],
      perServing: { kcal: 480, proteinG: 28, carbsG: 50, fatG: 17, fibreG: 9 },
      why: '+28 g olbaltumvielu vakariņām',
      tags: ['vegāns'],
    };
    create.mockResolvedValueOnce(
      reply({
        recipes: [
          ok,
          { ...ok, title: 'Pupiņu čili', ingredients: [{ name: 'Sarkanās pupiņas', amount: '400 g' }, { name: 'Tomāti', amount: '400 g' }] },
          { ...ok, title: 'Vistas un dārzeņu wok', ingredients: [{ name: 'Vistas fileja', amount: '200 g' }, { name: 'Dārzeņi', amount: '300 g' }] },
        ],
      }),
    );
    const r = (await call({ method: 'GET', url: `/v1/recipes?date=${TODAY}` })).json() as RecipesResponse;
    expect(r.aiGenerated).toBe(true);
    expect(r.recipes).toHaveLength(3);
    expect(r.recipes.map((x) => x.title).slice(0, 2)).toEqual(['Tofu ar griķiem un brokoļiem', 'Pupiņu čili']);
    expect(r.recipes.map((x) => x.title)).not.toContain('Vistas un dārzeņu wok');
    for (const x of r.recipes) expect(preferenceViolation(x, { diet: 'vegan', avoid: [] })).toBeNull();
    const data = dataOf(0);
    expect(data).toMatchObject({ mealType: 'dinner', focus: 'protein', preferences: { diet: 'vegan', avoid: [] }, care: false });
    expect(data.remainingToday.proteinG).toBe(42);
  });

  it('falls back to templates / curated recipes when Claude fails', async () => {
    await makePro(ai, call);
    create.mockRejectedValue(new Error('down'));
    const s = (await call({ method: 'GET', url: `/v1/insights/weekly?date=${TODAY}` })).json() as WeeklySummary;
    expect(s.aiGenerated).toBe(false);
    expect(s.observations.length).toBeGreaterThanOrEqual(2);
    const r = (await call({ method: 'GET', url: `/v1/recipes?date=${TODAY}` })).json() as RecipesResponse;
    expect(r.aiGenerated).toBe(false);
    expect(r.recipes).toHaveLength(3);
  });

  it('AI personalisation off: no copy request reaches Claude; photo analysis still does', async () => {
    await makePro(ai, call);
    await call({ method: 'PUT', url: '/v1/me/ai', payload: { enabled: false } });
    const tip = (await call({ method: 'GET', url: `/v1/tips/today?date=${TODAY}` })).json() as Tip;
    expect(tip.aiGenerated).toBe(false);
    await call({ method: 'POST', url: `/v1/tips/next?date=${TODAY}` });
    expect(((await call({ method: 'GET', url: `/v1/weekly-question?date=${TODAY}` })).json() as WeeklyQuestion).aiGenerated).toBe(false);
    expect((await call({ method: 'GET', url: `/v1/stats/nutrition?days=7&date=${TODAY}` })).json().insight).toBeTruthy();
    expect(((await call({ method: 'GET', url: `/v1/insights/weekly?date=${TODAY}` })).json() as WeeklySummary).aiGenerated).toBe(false);
    expect(((await call({ method: 'GET', url: `/v1/recipes?date=${TODAY}` })).json() as RecipesResponse).aiGenerated).toBe(false);
    expect(create).not.toHaveBeenCalled();

    create.mockResolvedValueOnce(reply({ items: [] }));
    const res = await call({ method: 'POST', url: '/v1/meals/analyze', payload: { imageBase64: JPEG_BASE64, mediaType: 'image/jpeg', takenAt: `${TODAY}T13:05:00+03:00` } });
    expect(res.statusCode).toBe(200);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
