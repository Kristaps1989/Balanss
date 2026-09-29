import { describe, expect, it } from 'vitest';

import type { Profile } from '../api';
import { addDays, ageOn, lastNDates, minToHm, mondayOf } from '../dates';
import { itemsTotals, mealTypeForTime, scale } from '../nutrition';
import {
  PERSONALITY_ITEMS,
  SAMPLE_ANSWERS,
  effectiveTone,
  levelLabel,
  levelsFromScores,
  scoreAnswers,
  selectTone,
  styleDescription,
  styleName,
  validateAnswers,
} from '../personality';
import { computeSleepWindow, sleepScore } from '../sleep';
import { computeTargets, targetSources, weeksToGoal } from '../targets';

const ilze: Profile = {
  firstName: 'Ilze',
  age: 34,
  heightCm: 168,
  weightKg: 71,
  sex: 'f',
  activity: 'light',
  goals: ['weight', 'routine'],
  weightDirection: 'down',
  goalWeightKg: 66,
};

describe('targets', () => {
  it('reproduces the sample user targets from CLAUDE.md', () => {
    expect(computeTargets(ilze)).toEqual({
      kcal: 1750,
      proteinG: 110,
      carbsG: 190,
      fatG: 60,
      fibreG: 25,
      waterMl: 2300,
      steps: 8000,
      sleepMin: 450,
    });
  });
  it('uses maintenance energy when weight is not a goal', () => {
    const t = computeTargets({ ...ilze, goals: ['health'], weightDirection: null, goalWeightKg: null });
    expect(t.kcal).toBe(1950);
  });
  it('adds a surplus to gain weight', () => {
    const t = computeTargets({ ...ilze, weightDirection: 'up', goalWeightKg: 75 });
    expect(t.kcal).toBeGreaterThan(2100);
  });
  it('explains the energy target', () => {
    expect(targetSources(ilze).kcal).toContain('1 960');
  });
  it('estimates weeks to goal', () => {
    expect(weeksToGoal(71, 66)).toBe(14);
  });
});

describe('personality', () => {
  it('has 20 items, 4 per trait, 2 reverse-keyed each', () => {
    expect(PERSONALITY_ITEMS).toHaveLength(20);
    const byTrait = new Map<string, number[]>();
    PERSONALITY_ITEMS.forEach((i) => byTrait.set(i.trait, [...(byTrait.get(i.trait) ?? []), i.key]));
    for (const keys of byTrait.values()) {
      expect(keys).toHaveLength(4);
      expect(keys.filter((k) => k === -1)).toHaveLength(2);
    }
  });
  it('scores the sample answers as the sample user', () => {
    const levels = levelsFromScores(scoreAnswers(SAMPLE_ANSWERS));
    expect(levels).toEqual({
      openness: 'medium',
      conscientiousness: 'high',
      extraversion: 'low',
      agreeableness: 'high',
      emotionalStability: 'low',
    });
    expect(styleName(levels, 'f')).toBe('Plānotāja ar maigu pieeju');
    expect(styleName(levels, 'm')).toBe('Plānotājs ar maigu pieeju');
    expect(selectTone(levels)).toBe('plan');
    expect(styleDescription(levels)).toContain('bez spiediena');
  });
  it('rejects invalid answers', () => {
    expect(validateAnswers([1, 2, 3])).toBe(false);
    expect(validateAnswers(Array(20).fill(6))).toBe(false);
    expect(() => scoreAnswers(Array(20).fill(0))).toThrow();
  });
  it('neutral answers give medium everywhere and neutral tone', () => {
    const levels = levelsFromScores(scoreAnswers(Array(20).fill(3)));
    expect(Object.values(levels).every((l) => l === 'medium')).toBe(true);
    expect(selectTone(levels)).toBe('neutral');
  });
  it('respects the tone preference', () => {
    const levels = levelsFromScores(scoreAnswers(SAMPLE_ANSWERS));
    expect(effectiveTone('auto', levels)).toBe('plan');
    expect(effectiveTone('neutral', levels)).toBe('neutral');
    expect(effectiveTone('auto', null)).toBe('neutral');
  });
  it('labels levels with the right grammatical gender', () => {
    expect(levelLabel('conscientiousness', 'high')).toBe('Augsts');
    expect(levelLabel('openness', 'medium')).toBe('Vidēja');
  });
});

describe('sleep', () => {
  const week = ['23:12', '23:40', '00:05', '23:25', '23:55', '00:20', '23:48'];
  it('computes the sample sleep window 23:00–23:30', () => {
    expect(computeSleepWindow(week)).toEqual({ start: '23:00', end: '23:30', basedOnNights: 7 });
  });
  it('needs at least 3 nights', () => {
    expect(computeSleepWindow(['23:00', '23:10'])).toBeNull();
  });
  it('handles bedtimes after midnight', () => {
    expect(computeSleepWindow(['00:40', '01:10', '00:55'])?.start).toBe('00:00');
  });
  it('scores the sample night in a plausible range', () => {
    const w = computeSleepWindow(week);
    const s = sleepScore({ totalMin: 400, deepMin: 65, remMin: 80, awakeMin: 12, bedtime: '23:48' }, 450, w);
    expect(s).toBeGreaterThan(65);
    expect(s).toBeLessThan(85);
    expect(sleepScore({ totalMin: 0, deepMin: 0, remMin: 0, awakeMin: 0, bedtime: '23:00' }, 450, w)).toBe(0);
  });
});

describe('nutrition', () => {
  it('scales per-100 g values', () => {
    expect(scale({ kcal: 165, proteinG: 30.7, carbsG: 0, fatG: 3.6, fibreG: 0 }, 150)).toEqual({
      kcal: 248,
      proteinG: 46.1,
      carbsG: 0,
      fatG: 5.4,
      fibreG: 0,
    });
  });
  it('sums items', () => {
    const t = itemsTotals([
      { per100g: { kcal: 100, proteinG: 10, carbsG: 0, fatG: 0, fibreG: 1 }, grams: 50 },
      { per100g: { kcal: 200, proteinG: 0, carbsG: 20, fatG: 0, fibreG: 0 }, grams: 100 },
    ]);
    expect(t.kcal).toBe(250);
    expect(t.proteinG).toBe(5);
  });
  it('suggests meal type from the time', () => {
    const at = (h: number, m = 0) => new Date(2026, 8, 28, h, m);
    expect(mealTypeForTime(at(8, 10))).toBe('breakfast');
    expect(mealTypeForTime(at(13, 5))).toBe('lunch');
    expect(mealTypeForTime(at(16, 20))).toBe('snack');
    expect(mealTypeForTime(at(19))).toBe('dinner');
    expect(mealTypeForTime(at(2))).toBe('snack');
  });
});

describe('dates', () => {
  it('does calendar math', () => {
    expect(addDays('2026-09-28', 3)).toBe('2026-10-01');
    expect(mondayOf('2026-09-27')).toBe('2026-09-21');
    expect(mondayOf('2026-09-28')).toBe('2026-09-28');
    expect(lastNDates('2026-09-28', 3)).toEqual(['2026-09-26', '2026-09-27', '2026-09-28']);
    expect(minToHm(-30)).toBe('23:30');
    expect(ageOn('1992-03-01', '2026-02-28')).toBe(33);
  });
});

describe('safety', async () => {
  const { careStatus, copyViolation, minGoalWeight, weightLossAllowed, mentionsKcalBelow } = await import('../safety');
  const base = { age: 34, sex: 'f' as const, weightKg: 71, heightCm: 168, goals: ['weight' as const], weightDirection: 'down' as const, goalWeightKg: 66 };
  const days = (kcal: number[]) => kcal.map((k, i) => ({ date: `2026-09-2${i}`, kcal: k, mealsLogged: 3 }));

  it('sample user is not in care mode', () => {
    expect(careStatus({ profile: base, recentDays: days([1690, 1820, 1710, 1640, 1905, 1760, 1480]), weights: [] })).toEqual({ active: false, reasons: [] });
  });
  it('flags repeated very low intake', () => {
    expect(careStatus({ profile: base, recentDays: days([700, 650, 800, 1700, 1600, 1500, 1500]), weights: [] }).reasons).toEqual(['low_intake']);
  });
  it('ignores days with too few meals logged', () => {
    const d = days([500, 500, 500, 500]).map((x) => ({ ...x, mealsLogged: 1 }));
    expect(careStatus({ profile: base, recentDays: d, weights: [] }).active).toBe(false);
  });
  it('flags rapid weight loss, low goals, underweight and minors', () => {
    const w = [{ date: '2026-09-01', kg: 75 }, { date: '2026-09-22', kg: 71 }];
    expect(careStatus({ profile: base, recentDays: [], weights: w }).reasons).toContain('rapid_weight_loss');
    expect(careStatus({ profile: { ...base, goalWeightKg: 50 }, recentDays: [], weights: [] }).reasons).toContain('low_goal');
    expect(careStatus({ profile: { ...base, weightKg: 50 }, recentDays: [], weights: [] }).reasons).toContain('underweight');
    expect(careStatus({ profile: { ...base, age: 16 }, recentDays: [], weights: [] }).reasons).toContain('minor_weight_loss');
  });
  it('limits goal weight and weight loss', () => {
    expect(minGoalWeight(168)).toBe(53);
    expect(weightLossAllowed({ age: 17, weightKg: 80, heightCm: 170 })).toBe(false);
    expect(weightLossAllowed({ age: 30, weightKg: 52, heightCm: 168 })).toBe(false);
  });
  it('never sets targets below the floor or with a deficit when loss is not allowed', () => {
    const tiny = computeTargets({ ...ilze, age: 70, heightCm: 150, weightKg: 45, activity: 'sit', goalWeightKg: 40 });
    expect(tiny.kcal).toBeGreaterThanOrEqual(1200);
    const teen = computeTargets({ ...ilze, age: 16 });
    expect(teen.kcal).toBe(computeTargets({ ...ilze, age: 16, goals: ['health'], weightDirection: null, goalWeightKg: null }).kcal);
  });
  it('catches unsafe copy', () => {
    expect(copyViolation('Ja sanāk, pastaiga pēc vakariņām.')).toBeNull();
    expect(copyViolation('Izlaid vakariņas, lai sasniegtu mērķi')).toBe('restriction');
    expect(copyViolation('Pastaiga palīdzēs sadedzināt kūku')).toBe('compensation');
    expect(copyViolation('Zaudēsi 2 kg nedēļā')).toBe('weight promise');
    expect(copyViolation('Tas samazinās holesterīnu')).toBe('medical');
    expect(copyViolation('Šodien bija neveiksme')).toBe('shame');
    expect(mentionsKcalBelow('Mērķis šodien: 900 kcal dienā', 1200)).toBe(true);
    expect(mentionsKcalBelow('Vēl 700 kcal līdz mērķim', 1200)).toBe(false);
    expect(mentionsKcalBelow('Enerģija: 1 750 kcal dienā', 1200)).toBe(false);
  });
});
