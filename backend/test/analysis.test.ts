import { describe, expect, it } from 'vitest';

import type { MealType, Targets } from '../../shared/api';
import { lastNDates } from '../../shared/dates';
import { analyze, periodStats, type AnalysisDay, type AnalysisInput, type AnalysisNight } from '../src/ai/analysis';
import { weekdayOf } from '../src/lib/time';

/** Deterministic pattern analysis on crafted data (no database). */

const END = '2026-09-26'; // Saturday
const DATES = lastNDates(END, 28);
const T: Targets = { kcal: 1750, proteinG: 110, carbsG: 190, fatG: 60, fibreG: 25, waterMl: 2300, steps: 8000, sleepMin: 450 };

/** A well-balanced default day: nothing to report except what a test changes. */
function day(date: string, over: Partial<AnalysisDay> = {}): AnalysisDay {
  return {
    date,
    mealsLogged: 4,
    mealTypes: ['breakfast', 'lunch', 'snack', 'dinner'] as MealType[],
    totals: { kcal: 1700, proteinG: 100, carbsG: 180, fatG: 60, fibreG: 22 },
    proteinBySlot: { breakfast: 25, lunch: 35, snack: 10, dinner: 30 },
    waterMl: 2100,
    steps: 7500,
    ...over,
  };
}
const night = (date: string, over: Partial<AnalysisNight> = {}): AnalysisNight => ({ date, bedtime: '23:40', totalMin: 435, ...over });

function input(over: Partial<AnalysisInput> = {}, dayOver: (d: string, i: number) => Partial<AnalysisDay> = () => ({}), nightOver: (d: string, i: number) => Partial<AnalysisNight> = () => ({})): AnalysisInput {
  return {
    end: END,
    days: DATES.map((d, i) => day(d, dayOver(d, i))),
    nights: DATES.map((d, i) => night(d, nightOver(d, i))),
    targets: T,
    window: null,
    care: false,
    ...over,
  };
}

const kinds = (inp: AnalysisInput) => analyze(inp).map((f) => f.kind);
const find = (inp: AnalysisInput, kind: string) => analyze(inp).find((f) => f.kind === kind);

describe('baseline', () => {
  it('finds nothing in steady, unremarkable data', () => {
    expect(analyze(input())).toEqual([]);
  });

  it('never invents findings without data', () => {
    expect(analyze({ end: END, days: [], nights: [], targets: T, window: { start: '23:00', end: '23:30', basedOnNights: 3 }, care: false })).toEqual([]);
    // Four logged days are below every nutrition guard.
    const few = input({ days: DATES.slice(-4).map((d) => day(d, { totals: { kcal: 1000, proteinG: 30, carbsG: 100, fatG: 30, fibreG: 5 }, mealTypes: ['lunch', 'dinner'], mealsLogged: 2 })) });
    expect(kinds(few)).not.toContain('protein_gap');
    expect(kinds(few)).not.toContain('fibre_low');
    expect(kinds(few)).not.toContain('breakfast_skipped');
  });
});

describe('nutrition findings', () => {
  it('protein_gap: counts low days among logged days and names the meal the gap comes from', () => {
    const low = new Set([15, 18, 21, 24]);
    const f = find(
      input({}, (_d, i) =>
        low.has(i) ? { totals: { kcal: 1650, proteinG: 80, carbsG: 200, fatG: 55, fibreG: 22 }, proteinBySlot: { breakfast: 25, lunch: 35, snack: 10, dinner: 10 } } : {},
      ),
      'protein_gap',
    )!;
    expect(f).toMatchObject({ polarity: 'opportunity' });
    expect(f.fact).toBe('4 no 14 dienām olbaltumvielas bija zem 85 % no mērķa (110 g); šajās dienās vakariņās vidēji 10 g, citās dienās 30 g.');
    expect(f.strength).toBeGreaterThan(0.5);
  });

  it('protein_gap: needs at least 3 low days; days with < 2 meals do not count', () => {
    const two = input({}, (_d, i) => (i >= 26 ? { totals: { kcal: 1650, proteinG: 80, carbsG: 200, fatG: 55, fibreG: 22 } } : {}));
    expect(kinds(two)).not.toContain('protein_gap');
    const partial = input({}, (_d, i) => (i >= 20 ? { mealsLogged: 1, mealTypes: ['lunch'], totals: { kcal: 600, proteinG: 30, carbsG: 60, fatG: 20, fibreG: 6 } } : {}));
    expect(kinds(partial)).not.toContain('protein_gap');
    expect(kinds(partial)).toContain('logging_gaps');
  });

  it('fibre_low: at least half of logged days under 80 %', () => {
    const f = find(input({}, (_d, i) => (i % 2 === 0 ? { totals: { kcal: 1700, proteinG: 100, carbsG: 180, fatG: 60, fibreG: 14 } } : {})), 'fibre_low')!;
    expect(f.fact).toBe('7 no 14 dienām šķiedrvielas bija zem 80 % no mērķa (vidēji 18 g no 25 g).');
  });

  it('water_low: days under 80 % of the target, with litres in Latvian format', () => {
    const f = find(input({}, (_d, i) => (i >= 22 ? { waterMl: 1500 } : {})), 'water_low')!;
    expect(f.fact).toBe('6 no 14 dienām ūdens bija zem 80 % no mērķa (vidēji 1,8 l no 2,3 l).');
    // Days without any water logged are not counted as "low".
    expect(kinds(input({}, (_d, i) => (i >= 20 ? { waterMl: null } : {})))).not.toContain('water_low');
  });

  it('weekend_shift: Sat/Sun vs weekdays, ≥ 15 %', () => {
    const higher = input({}, (d) => (weekdayOf(d) >= 5 ? { totals: { kcal: 2010, proteinG: 100, carbsG: 220, fatG: 70, fibreG: 22 } } : {}));
    expect(find(higher, 'weekend_shift')!.fact).toBe('Brīvdienās vidēji 2 010 kcal, darba dienās 1 700 kcal (+18 %).');
    const small = input({}, (d) => (weekdayOf(d) >= 5 ? { totals: { kcal: 1900, proteinG: 100, carbsG: 200, fatG: 65, fibreG: 22 } } : {}));
    expect(kinds(small)).not.toContain('weekend_shift');
    const lower = input({}, (d) => (weekdayOf(d) >= 5 ? { totals: { kcal: 1300, proteinG: 90, carbsG: 150, fatG: 45, fibreG: 22 } } : {}));
    expect(find(lower, 'weekend_shift')!.fact).toContain('(−24 %)');
  });

  it('breakfast_skipped: phrased as "not logged", never as skipping', () => {
    const f = find(input({}, (_d, i) => (i === 20 || i === 25 ? { mealTypes: ['lunch', 'snack', 'dinner'], mealsLogged: 3 } : {})), 'breakfast_skipped')!;
    expect(f.fact).toBe('2 no 14 dienām brokastis nebija ierakstītas.');
    expect(kinds(input({}, (_d, i) => (i === 25 ? { mealTypes: ['lunch', 'dinner'], mealsLogged: 2 } : {})))).not.toContain('breakfast_skipped');
  });

  it('logging_gaps: ≥ 3 of the last 14 days with fewer than 2 meals', () => {
    const f = find(input({}, (_d, i) => (i >= 23 ? { mealsLogged: 1, mealTypes: ['lunch'] } : {})), 'logging_gaps')!;
    expect(f.fact).toBe('5 no 14 dienām bija ierakstītas mazāk nekā 2 maltītes, tāpēc šo dienu skaitļi ir nepilnīgi.');
  });
});

describe('sleep and movement findings', () => {
  const short = new Set([5, 12, 20]);
  it('short_sleep_low_steps: after ≥ 3 nights under target − 30 min, steps ≥ 15 % lower', () => {
    const inp = input({}, (_d, i) => (short.has(i) ? { steps: 5000 } : {}), (_d, i) => (short.has(i) ? { totalMin: 360 } : {}));
    const f = find(inp, 'short_sleep_low_steps')!;
    expect(f.fact).toBe('Pēc 3 naktīm, kad miegs bija īsāks par 7 h, nākamajā dienā bija vidēji 5 000 soļu — par 33 % mazāk nekā citās dienās (7 500).');
  });

  it('short_sleep_low_steps: not with only 2 short nights, nor when steps barely differ', () => {
    const two = input({}, (_d, i) => (i === 5 || i === 12 ? { steps: 5000 } : {}), (_d, i) => (i === 5 || i === 12 ? { totalMin: 360 } : {}));
    expect(kinds(two)).not.toContain('short_sleep_low_steps');
    const same = input({}, (_d, i) => (short.has(i) ? { steps: 7000 } : {}), (_d, i) => (short.has(i) ? { totalMin: 360 } : {}));
    expect(kinds(same)).not.toContain('short_sleep_low_steps');
  });

  it('bedtime_in_window: positive at ≥ half of the last 7 nights, an opportunity below', () => {
    const window = { start: '23:00', end: '23:30', basedOnNights: 14 };
    const good = input({ window }, undefined, (_d, i) => (i >= 21 && i <= 25 ? { bedtime: '23:15' } : {}));
    expect(find(good, 'bedtime_in_window')).toMatchObject({ polarity: 'positive', fact: '5 no 7 naktīm gulētiešana bija miega logā (23:00–23:30).' });
    const some = input({ window }, undefined, (_d, i) => (i === 21 || i === 23 || i === 26 ? { bedtime: '23:30' } : {}));
    expect(find(some, 'bedtime_in_window')).toMatchObject({ polarity: 'opportunity', fact: '3 no 7 naktīm gulētiešana bija miega logā (23:00–23:30).' });
    expect(kinds(input())).not.toContain('bedtime_in_window'); // no window yet
  });

  it('bedtime_irregular: spread of ≥ 45 min over the last 14 nights', () => {
    const inp = input({}, undefined, (_d, i) => (i >= 14 ? { bedtime: i % 2 ? '22:30' : '00:40' } : {}));
    const f = find(inp, 'bedtime_irregular')!;
    expect(f.fact).toBe('Pēdējās 14 naktīs gulētiešanas laiks svārstījās no 22:30 līdz 00:40 (vidēji ±65 min).');
  });

  it('steps_trend: this 7 days vs the previous 7, ≥ 10 %, both directions', () => {
    const up = input({}, (_d, i) => (i >= 21 ? { steps: 8500 } : {}));
    expect(find(up, 'steps_trend')).toMatchObject({ polarity: 'positive', fact: 'Pēdējās 7 dienās vidēji 8 500 soļu dienā — par 13 % vairāk nekā iepriekšējās 7 dienās (7 500).' });
    const down = input({}, (_d, i) => (i >= 21 ? { steps: 6000 } : {}));
    expect(find(down, 'steps_trend')).toMatchObject({ polarity: 'opportunity' });
    expect(find(down, 'steps_trend')!.fact).toContain('par 20 % mazāk');
    expect(kinds(input({}, (_d, i) => (i >= 21 ? { steps: 8000 } : {})))).not.toContain('steps_trend');
  });
});

describe('positive findings and ordering', () => {
  it('consistency: notices targets reached on ≥ 5 of the last 7 days', () => {
    const inp = input({}, (_d, i) => (i >= 21 && i !== 23 && i !== 25 ? { waterMl: 2400 } : {}));
    expect(find(inp, 'consistency')).toMatchObject({ polarity: 'positive', fact: 'Ūdens mērķis sasniegts 5 no 7 dienām.' });
    expect(kinds(input({}, (_d, i) => (i >= 24 ? { waterMl: 2400 } : {})))).not.toContain('consistency');
  });

  it('sorts by strength, strongest first', () => {
    const inp = input(
      { window: { start: '23:00', end: '23:30', basedOnNights: 14 } },
      (d, i) => ({
        ...(i >= 21 ? { waterMl: 2400, steps: 9000 } : {}),
        ...(weekdayOf(d) >= 5 ? { totals: { kcal: 2100, proteinG: 100, carbsG: 230, fatG: 72, fibreG: 22 } } : {}),
      }),
    );
    const s = analyze(inp).map((f) => f.strength);
    expect(s.length).toBeGreaterThan(2);
    expect([...s].sort((a, b) => b - a)).toEqual(s);
    expect(analyze(inp).some((f) => f.polarity === 'positive')).toBe(true);
  });

  it('periodStats averages the 7 days ending at `end`', () => {
    expect(periodStats(input())).toEqual({ avgKcal: 1700, avgProteinG: 100, avgSteps: 7500, avgSleepMin: 435, daysLogged: 7 });
  });
});

describe('care mode', () => {
  it('drops findings whose natural suggestion is "eat less" and tracking pressure', () => {
    const risky = (care: boolean) =>
      input({ care }, (d, i) => ({
        ...(weekdayOf(d) >= 5 ? { totals: { kcal: 2100, proteinG: 100, carbsG: 230, fatG: 72, fibreG: 22 } } : {}),
        ...(i >= 23 ? { mealsLogged: 1, mealTypes: ['lunch'] as MealType[] } : {}),
      }));
    expect(kinds(risky(false))).toEqual(expect.arrayContaining(['weekend_shift', 'logging_gaps']));
    expect(kinds(risky(true))).not.toContain('weekend_shift');
    expect(kinds(risky(true))).not.toContain('logging_gaps');
  });

  it('keeps a lower weekend intake (the suggestion there is regular meals, never less)', () => {
    const lower = input({ care: true }, (d) => (weekdayOf(d) >= 5 ? { totals: { kcal: 1300, proteinG: 90, carbsG: 150, fatG: 45, fibreG: 22 } } : {}));
    expect(kinds(lower)).toContain('weekend_shift');
  });

  it('keeps protein, water and sleep findings', () => {
    const inp = input({ care: true }, (_d, i) => (i % 2 ? { totals: { kcal: 1500, proteinG: 60, carbsG: 180, fatG: 50, fibreG: 22 }, waterMl: 1200 } : {}));
    expect(kinds(inp)).toEqual(expect.arrayContaining(['protein_gap', 'water_low']));
  });
});
