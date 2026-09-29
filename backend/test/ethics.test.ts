import pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FoodPreferences, Sex, ToneStyle } from '../../shared/api';
import { toneModifiers } from '../../shared/personality';
import { copyViolation, KCAL_FLOOR, mentionsKcalBelow } from '../../shared/safety';
import { anthropicAi } from '../src/ai';
import type { AnalysisFinding } from '../src/ai/analysis';
import type { ClaudeClient } from '../src/ai/claude';
import { templateSummary, type SummaryInput } from '../src/ai/insights';
import { findingQuestion, findingSuggestion } from '../src/ai/question-templates';
import { blacklistGroups, curatedRecipes, type RecipesInput } from '../src/ai/recipes';
import { copyIssue } from '../src/ai/safety';
import { LIMITS } from '../src/ai/tone';
import { fakePushCopy, fakeTrendsInsight, fakeWeeklyQuestion, templateTip } from '../src/ai/tone-templates';
import { EMPTY_HISTORY, TIP_ANGLES, type ToneInput } from '../src/ai/tone-types';

/**
 * Ethics layer: every template output for a matrix of inputs passes the same
 * gate as Claude output, templates respect food preferences, and violating
 * Claude copy of every type is replaced by templates.
 */

const log = pino({ level: 'silent' });
const TONES: ToneStyle[] = ['plan', 'novelty', 'gentle', 'neutral'];
const SEXES: Sex[] = ['f', 'm', 'x'];
const PREFS: FoodPreferences[] = [
  { diet: 'any', avoid: [] },
  { diet: 'vegan', avoid: ['gluten', 'nuts'] },
  { diet: 'vegetarian', avoid: ['lactose', 'eggs'] },
  { diet: 'pescatarian', avoid: ['fish', 'pork'] },
];

const p = (value: number, target: number) => ({ value, target });
const BASE: Omit<ToneInput, 'tone' | 'modifiers' | 'sex' | 'care' | 'preferences'> = {
  date: '2026-09-27',
  nutrition: { kcal: p(1480, 1750), proteinG: p(68, 110), carbsG: p(160, 190), fatG: p(52, 60), fibreG: p(18, 25), waterMl: p(1200, 2300) },
  mealsLogged: ['breakfast', 'lunch', 'snack'],
  steps: p(6430, 8000),
  sleep: { totalMin: 400, targetMin: 450, bedtime: '23:48', window: { start: '23:00', end: '23:30', basedOnNights: 14 } },
  week: { avgKcal: 1715, avgProteinG: 89, avgSteps: 7796, nightsInWindow: 2 },
  findings: [],
  history: EMPTY_HISTORY,
};
const DAYS: { name: string; day: Partial<ToneInput> }[] = [
  { name: 'sample', day: {} },
  { name: 'empty morning', day: { nutrition: { kcal: p(0, 1750), proteinG: p(0, 110), carbsG: p(0, 190), fatG: p(0, 60), fibreG: p(0, 25), waterMl: p(0, 2300) }, mealsLogged: [], steps: p(200, 8000), localTime: '08:30' } },
  { name: 'low intake', day: { nutrition: { kcal: p(650, 1750), proteinG: p(20, 110), carbsG: p(90, 190), fatG: p(15, 60), fibreG: p(6, 25), waterMl: p(900, 2300) }, week: { avgKcal: 700, avgProteinG: 25, avgSteps: 5000, nightsInWindow: 0 } } },
  { name: 'over energy target', day: { nutrition: { kcal: p(2400, 1750), proteinG: p(120, 110), carbsG: p(260, 190), fatG: p(95, 60), fibreG: p(30, 25), waterMl: p(2500, 2300) }, steps: p(9000, 8000) } },
  { name: 'no sleep data', day: { sleep: null, week: null } },
];

/** One finding of every kind (and both polarities where they exist). */
export const SAMPLE_FINDINGS: AnalysisFinding[] = [
  { kind: 'protein_gap', polarity: 'opportunity', fact: '4 no 14 dienām olbaltumvielas bija zem 85 % no mērķa (110 g).', strength: 0.6, data: { low: 4, of: 14, avg: 98, slot: 'dinner', slotAvg: 15, slotOther: 43 } },
  { kind: 'protein_gap', polarity: 'opportunity', fact: '7 no 7 dienām olbaltumvielas bija zem 85 % no mērķa (75 g).', strength: 1, data: { low: 7, of: 7, avg: 24, slot: 'breakfast', slotAvg: 10, slotOther: null } },
  { kind: 'fibre_low', polarity: 'opportunity', fact: '8 no 14 dienām šķiedrvielas bija zem 80 % no mērķa.', strength: 0.5, data: { low: 8, of: 14, avg: 17 } },
  { kind: 'water_low', polarity: 'opportunity', fact: '6 no 14 dienām ūdens bija zem 80 % no mērķa.', strength: 0.5, data: { low: 6, of: 14, avgMl: 1750 } },
  { kind: 'weekend_shift', polarity: 'opportunity', fact: 'Brīvdienās vidēji 2 013 kcal, darba dienās 1 705 kcal (+18 %).', strength: 0.45, data: { weekendKcal: 2013, weekdayKcal: 1705, diffPct: 18 } },
  { kind: 'breakfast_skipped', polarity: 'opportunity', fact: '2 no 14 dienām brokastis nebija ierakstītas.', strength: 0.34, data: { days: 2, of: 14 } },
  { kind: 'short_sleep_low_steps', polarity: 'opportunity', fact: 'Pēc 3 naktīm soļu bija mazāk.', strength: 0.66, data: { nights: 3, stepsAfter: 5300, stepsOther: 8228, diffPct: 36 } },
  { kind: 'bedtime_irregular', polarity: 'opportunity', fact: 'Gulētiešanas laiks svārstījās.', strength: 0.7, data: { sdMin: 65, nights: 14 } },
  { kind: 'bedtime_in_window', polarity: 'opportunity', fact: '3 no 7 naktīm gulētiešana bija miega logā (23:00–23:30).', strength: 0.42, data: { inWindow: 3, of: 7, start: '23:00', end: '23:30' } },
  { kind: 'bedtime_in_window', polarity: 'positive', fact: '5 no 7 naktīm gulētiešana bija miega logā (23:00–23:30).', strength: 0.73, data: { inWindow: 5, of: 7, start: '23:00', end: '23:30' } },
  { kind: 'steps_trend', polarity: 'positive', fact: 'Pēdējās 7 dienās vidēji 8 106 soļu dienā.', strength: 0.52, data: { avg: 8106, prevAvg: 7310, diffPct: 11 } },
  { kind: 'steps_trend', polarity: 'opportunity', fact: 'Pēdējās 7 dienās vidēji 6 000 soļu dienā.', strength: 0.7, data: { avg: 6000, prevAvg: 7500, diffPct: -20 } },
  { kind: 'logging_gaps', polarity: 'opportunity', fact: '5 no 14 dienām bija ierakstītas mazāk nekā 2 maltītes.', strength: 0.3, data: { gaps: 5, of: 14 } },
  ...['water', 'steps', 'protein', 'fibre', 'sleep'].map(
    (metric): AnalysisFinding => ({ kind: 'consistency', polarity: 'positive', fact: 'Mērķis sasniegts 5 no 7 dienām.', strength: 0.66, data: { metric, hits: 5, of: 7 } }),
  ),
];

function expectClean(text: string, max: number, ctx: { sex: Sex; care: boolean }, where: string) {
  expect([where, text, copyIssue(text, max, ctx)]).toEqual([where, text, null]);
  expect(copyViolation(text)).toBeNull();
  expect(mentionsKcalBelow(text, KCAL_FLOOR[ctx.sex])).toBe(false);
}

/** Template food words must respect the diet / avoid list. */
function expectPrefs(text: string, prefs: FoodPreferences, where: string) {
  const groups = blacklistGroups({ title: text, ingredients: [] });
  const banned = new Set<string>(prefs.avoid);
  if (prefs.diet !== 'any') banned.add('meat');
  if (prefs.diet === 'vegan' || prefs.diet === 'vegetarian') banned.add('fish');
  if (prefs.diet === 'vegan') ['lactose', 'eggs', 'animal'].forEach((g) => banned.add(g));
  expect([where, text, groups.filter((g) => banned.has(g))]).toEqual([where, text, []]);
}

describe('every template output passes the safety gate', () => {
  it('tips, pushes, weekly questions and trends insights for a matrix of inputs', () => {
    let checked = 0;
    for (const tone of TONES)
      for (const sex of SEXES)
        for (const care of [false, true])
          for (const preferences of PREFS)
            for (const { name, day } of DAYS) {
              const input: ToneInput = { ...BASE, ...day, tone, sex, care, preferences, modifiers: toneModifiers(null) } as ToneInput;
              const ctx = { sex, care };
              const where = `${tone}/${sex}/care=${care}/${preferences.diet}/${name}`;
              for (const angle of TIP_ANGLES) {
                if (angle === 'sleep' && !input.sleep) continue;
                if (angle === 'meals' && !care) continue;
                const tip = templateTip(input, angle);
                expectClean(tip.body, LIMITS.tip, ctx, `${where}/tip.${angle}`);
                expectPrefs(tip.body, preferences, `${where}/tip.${angle}`);
                expect(tip.aiGenerated).toBe(false);
                checked++;
              }
              for (const kind of ['sleep', 'water', 'food'] as const)
                for (const meal of ['lunch', 'dinner'] as const) {
                  const push = fakePushCopy(kind, input, meal);
                  expectClean(push.title, LIMITS.pushTitle, ctx, `${where}/push.${kind}`);
                  expectClean(push.body, LIMITS.push, ctx, `${where}/push.${kind}`);
                }
              for (const findings of [[], ...SAMPLE_FINDINGS.map((f) => [f])]) {
                const q = fakeWeeklyQuestion({ ...input, findings });
                expect(q.options).toHaveLength(4);
                expect(q.options[3]!.label).toBe('Grūti pateikt');
                expectClean(q.question, LIMITS.question, ctx, `${where}/question`);
                expect(q.question).not.toMatch(/svar|ķermen|izskat|kāpēc/i);
                for (const o of q.options) {
                  expectClean(o.label, LIMITS.optionLabel, ctx, `${where}/option`);
                  expectClean(o.reply, LIMITS.reply, ctx, `${where}/reply`);
                  expectPrefs(o.reply, preferences, `${where}/reply`);
                }
              }
              const trends = fakeTrendsInsight({
                tone,
                sex,
                care,
                preferences,
                modifiers: toneModifiers(null),
                days: [],
                avgKcal: input.week?.avgKcal ?? 0,
                avgProteinG: input.week?.avgProteinG ?? 0,
                targetKcal: 1750,
                targetProteinG: 110,
              });
              expectClean(trends, LIMITS.insight, ctx, `${where}/trends`);
              expectPrefs(trends, preferences, `${where}/trends`);
              if (care) expect(trends).not.toMatch(/kcal/);
            }
    expect(checked).toBeGreaterThan(1000);
  });

  it('weekly summaries and suggestions (with and without findings, care and not)', () => {
    for (const tone of TONES)
      for (const care of [false, true])
        for (const preferences of PREFS)
          for (const findings of [[], SAMPLE_FINDINGS.slice(0, 1), SAMPLE_FINDINGS.slice(8, 12), SAMPLE_FINDINGS]) {
            const input: SummaryInput = {
              date: '2026-09-27',
              sex: 'f',
              tone,
              modifiers: toneModifiers(null),
              care,
              preferences,
              findings,
              stats: { avgKcal: 1700, avgProteinG: 100, avgSteps: 8000, avgSleepMin: 430, daysLogged: findings.length ? 7 : 1 },
              history: EMPTY_HISTORY,
              periodStart: '2026-09-20',
              periodEnd: '2026-09-26',
            };
            const s = templateSummary(input);
            const ctx = { sex: 'f' as Sex, care };
            expect(s.observations.length).toBeGreaterThanOrEqual(2);
            expect(s.observations.length).toBeLessThanOrEqual(3);
            expectClean(s.headline, LIMITS.headline, ctx, 'headline');
            for (const o of s.observations) {
              expectClean(o.title, LIMITS.obsTitle, ctx, 'obs.title');
              expectClean(o.text, LIMITS.obsText, { sex: 'f', care: false }, 'obs.text'); // facts are data; care-mode findings are filtered upstream
            }
            expectClean(s.suggestion, LIMITS.suggestion, ctx, 'suggestion');
            expectClean(s.reflection, LIMITS.reflection, ctx, 'reflection');
            expectPrefs(s.suggestion, preferences, 'suggestion');
            if (findings.some((f) => f.polarity === 'positive')) expect(s.observations.some((o) => findings.find((f) => f.fact === o.text)?.polarity === 'positive')).toBe(true);
            for (const f of findings) {
              expectClean(findingSuggestion(f, { tone, care, preferences }), LIMITS.suggestion, ctx, `suggestion.${f.kind}`);
              expect(findingQuestion(f, { tone, care, preferences }).options[3]!.label).toBe('Grūti pateikt');
            }
          }
  });

  it('curated recipes', () => {
    for (const preferences of PREFS)
      for (const mealType of ['breakfast', 'lunch', 'snack', 'dinner'] as const) {
        const input: RecipesInput = { date: '2026-09-27', sex: 'f', care: true, mealType, remaining: { kcal: 700, proteinG: 40, carbsG: 60, fatG: 20, fibreG: 8 }, focus: 'protein', preferences };
        const list = curatedRecipes(input);
        expect(list).toHaveLength(3);
        for (const r of list) {
          for (const t of [r.title, r.why, ...r.steps, ...r.ingredients.map((i) => i.name)]) expectClean(t, 300, { sex: 'f', care: true }, r.title);
          expect(r.minutes).toBeLessThanOrEqual(40);
        }
      }
  });
});

// ---------------------------------------------------------------- Claude output that breaks the rules

const create = vi.fn();
const client = { beta: { messages: { create } } } as unknown as ClaudeClient;
const ai = anthropicAi(client, 'claude-opus-5-5');
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

const input: ToneInput = { ...BASE, tone: 'plan', sex: 'f', care: false, preferences: { diet: 'any', avoid: [] }, modifiers: toneModifiers(null) };
const careInput: ToneInput = { ...input, care: true };

beforeEach(() => create.mockReset());

describe('violating Claude copy is replaced by templates', () => {
  it('tips: restriction, compensation, shame, medical, weight promise, kcal under the floor, deficit in care mode', async () => {
    const bad = [
      'Vakariņas šodien vari izlaist — tā būs vieglāk.',
      'Pēc kūkas nostaigā 3 000 soļu, lai to sadedzinātu.',
      'Šodien slikti ēdi, bet rīt būs labāk.',
      'Olbaltumvielas palīdz pret diabētu.',
      'Tā zaudēsi 2 kg mēnesī.',
      'Mērķis šodien: 900 kcal dienā.',
      'Ēd mazāk vakariņās, tas palīdz.',
    ];
    for (const body of bad) {
      create.mockResolvedValueOnce(reply({ angle: 'protein', body, highlight: null }));
      const tip = await ai.tone.tip(input, [], log);
      expect([body, tip.aiGenerated]).toEqual([body, false]);
    }
    create.mockResolvedValueOnce(reply({ angle: 'protein', body: 'Tev ir neliels deficīts, turpini tā.', highlight: null }));
    expect((await ai.tone.tip(careInput, [], log)).aiGenerated).toBe(false);
    // The same sentence is fine outside care mode only if it passes the gate: "deficīt" is care-only.
    create.mockResolvedValueOnce(reply({ angle: 'overall', body: 'Šodien viss rit mierīgi. Ja gribi, vakarā pastaiga.', highlight: null }));
    expect((await ai.tone.tip(careInput, [], log)).aiGenerated).toBe(true);
  });

  it('weekly question: judgemental wording or no neutral way out', async () => {
    create.mockResolvedValueOnce(
      reply({
        question: 'Kāpēc šonedēļ neizdevās?',
        options: [
          { label: 'Slinkums', reply: 'Tā ir tava neveiksme.' },
          { label: 'Darbs', reply: 'Labi.' },
          { label: 'Stress', reply: 'Labi.' },
          { label: 'Grūti pateikt', reply: 'Labi.' },
        ],
      }),
    );
    const q = await ai.tone.weeklyQuestion(input, log);
    expect(q.aiGenerated).toBe(false);
    create.mockResolvedValueOnce(
      reply({
        question: 'Kas palīdzēja?',
        options: [
          { label: 'A', reply: 'Labi.' },
          { label: 'B', reply: 'Labi.' },
          { label: 'C', reply: 'Labi.' },
          { label: 'D', reply: 'Labi.' },
        ],
      }),
    );
    expect((await ai.tone.weeklyQuestion(input, log)).aiGenerated).toBe(false);
  });

  it('push and trends insight', async () => {
    create.mockResolvedValueOnce(reply({ title: 'Kustība', body: 'Nostaigā vēl 2 000 soļu, lai sadedzinātu pusdienas.' }));
    expect(await ai.tone.pushCopy('water', input, undefined, log)).toEqual(fakePushCopy('water', input));
    create.mockResolvedValueOnce(reply({ text: 'Ar šādu ritmu nometīsi 3 kg.' }));
    const trends = { tone: 'plan' as const, modifiers: toneModifiers(null), sex: 'f' as const, care: false, preferences: { diet: 'any' as const, avoid: [] }, days: [], avgKcal: 1700, avgProteinG: 90, targetKcal: 1750, targetProteinG: 110 };
    expect(await ai.tone.trendsInsight(trends, log)).toBe(fakeTrendsInsight(trends));
  });

  it('weekly summary: body talk, care-mode deficit, repeated doctor mentions', async () => {
    const summaryInput: SummaryInput = {
      date: '2026-09-27',
      sex: 'f',
      tone: 'gentle',
      modifiers: toneModifiers(null),
      care: true,
      preferences: { diet: 'any', avoid: [] },
      findings: SAMPLE_FINDINGS.slice(0, 2),
      stats: { avgKcal: 700, avgProteinG: 30, avgSteps: 5000, avgSleepMin: 400, daysLogged: 7 },
      history: EMPTY_HISTORY,
      periodStart: '2026-09-20',
      periodEnd: '2026-09-26',
    };
    const good = { headline: 'Mierīga nedēļa', observations: [{ title: 'Maltītes', text: 'Brokastis bija katru dienu.' }, { title: 'Miegs', text: 'Vidēji 6 h 40 min.' }], suggestion: 'Ja gribi, ēd ik 3–4 stundas.', reflection: 'Kas tev palīdz justies labi?' };
    for (const bad of [
      { ...good, headline: 'Figūra uzlabojas' },
      { ...good, suggestion: 'Saglabā nelielu deficītu.' },
      { ...good, suggestion: 'Parunā ar ģimenes ārstu.', reflection: 'Vai ārsts to zina?' },
      { ...good, observations: [good.observations[0]] },
    ]) {
      create.mockResolvedValueOnce(reply(bad));
      expect((await ai.summary.weeklySummary(summaryInput, log)).aiGenerated).toBe(false);
    }
    create.mockResolvedValueOnce(reply(good));
    expect(await ai.summary.weeklySummary(summaryInput, log)).toMatchObject({ ...good, aiGenerated: true });
  });

  it('recipes: "low calorie" framing and too-long recipes are dropped', async () => {
    const recipe = {
      title: 'Lēcu zupa',
      minutes: 30,
      servings: 2,
      servingGrams: 400,
      ingredients: [
        { name: 'Sarkanās lēcas', amount: '200 g' },
        { name: 'Burkāni', amount: '2 gab.' },
      ],
      steps: ['Vāri 20 minūtes.'],
      perServing: { kcal: 320, proteinG: 19, carbsG: 50, fatG: 3, fibreG: 12 },
      why: '+19 g olbaltumvielu vakariņām',
      tags: ['vegāns'],
    };
    create.mockResolvedValueOnce(
      reply({ recipes: [{ ...recipe, title: 'Mazkaloriju lēcu zupa' }, { ...recipe, title: 'Lēcu sautējums', minutes: 90 }, { ...recipe, why: 'Diētisks ēdiens' }] }),
    );
    const r = await ai.recipes.recipes(
      { date: '2026-09-27', sex: 'f', care: false, mealType: 'dinner', remaining: { kcal: 600, proteinG: 40, carbsG: 50, fatG: 10, fibreG: 7 }, focus: 'protein', preferences: { diet: 'any', avoid: [] } },
      log,
    );
    expect(r.aiGenerated).toBe(false);
    expect(r.recipes).toHaveLength(3);
    expect(r.recipes.map((x) => x.title)).not.toContain('Mazkaloriju lēcu zupa');
  });
});
