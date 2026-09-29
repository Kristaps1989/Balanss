import { describe, expect, it } from 'vitest';

import type { AvoidFood, FoodPreferences } from '../../shared/api';
import { blacklistGroups, curatedRecipes, preferenceViolation, recipeFocus, whyText } from '../src/ai/recipes';
import { CURATED_RECIPES } from '../src/ai/recipes-data';
import { nextMealSlot } from '../src/services/insights';

const ing = (...names: string[]) => ({ title: 'Ideja', ingredients: names.map((name) => ({ name, amount: '1' })) });
const prefs = (diet: FoodPreferences['diet'], ...avoid: AvoidFood[]): FoodPreferences => ({ diet, avoid });

describe('preference blacklist', () => {
  it('catches meat, fish, dairy, eggs, gluten, nuts and pork by Latvian word stems', () => {
    expect(preferenceViolation(ing('Vistas fileja', 'Rīsi'), prefs('vegetarian'))).toBe('meat');
    expect(preferenceViolation(ing('Laša fileja'), prefs('vegetarian'))).toBe('fish');
    expect(preferenceViolation(ing('Laša fileja'), prefs('pescatarian'))).toBeNull();
    expect(preferenceViolation(ing('Cūkgaļas karbonāde'), prefs('pescatarian'))).toBe('meat');
    expect(preferenceViolation(ing('Biezpiens'), prefs('vegan'))).toBe('lactose');
    expect(preferenceViolation(ing('Olas'), prefs('vegan'))).toBe('eggs');
    expect(preferenceViolation(ing('Medus'), prefs('vegan'))).toBe('animal');
    expect(preferenceViolation(ing('Rupjmaize'), prefs('any', 'gluten'))).toBe('gluten');
    expect(preferenceViolation(ing('Sojas mērce'), prefs('any', 'gluten'))).toBe('gluten');
    expect(preferenceViolation(ing('Valrieksti'), prefs('any', 'nuts'))).toBe('nuts');
    expect(preferenceViolation(ing('Bekons'), prefs('any', 'pork'))).toBe('pork');
    expect(preferenceViolation({ title: 'Omlete ar sieru', ingredients: [] }, prefs('any', 'eggs'))).toBe('eggs');
  });

  it('does not trip on look-alikes and plant or free-from products', () => {
    expect(preferenceViolation(ing('Auzu dzēriens', 'Sojas jogurts', 'Kokosriekstu piens'), prefs('vegan'))).toBeNull();
    expect(preferenceViolation(ing('Olīveļļa', 'Granola bez olām?'), prefs('any', 'eggs'))).toBe('eggs');
    expect(preferenceViolation(ing('Olīveļļa', 'Šokolāde', 'Kola'), prefs('any', 'eggs'))).toBeNull();
    expect(preferenceViolation(ing('Tomātu pasta', 'Bezglutēna maize', 'Griķu milti'), prefs('any', 'gluten'))).toBeNull();
    expect(preferenceViolation(ing('Kokosriekstu skaidiņas', 'Muskatrieksts'), prefs('any', 'nuts'))).toBeNull();
    expect(preferenceViolation(ing('Zemesriekstu sviests'), prefs('any', 'lactose'))).toBeNull();
    expect(preferenceViolation(ing('Zemesriekstu sviests'), prefs('any', 'nuts'))).toBe('nuts');
    expect(preferenceViolation(ing('Dārzeņu buljons', 'Telefona lietotne'), prefs('vegan'))).toBeNull();
  });
});

describe('curated recipes', () => {
  it('has at least 12 recipes, ≤ 40 min, with realistic per-serving values', () => {
    expect(CURATED_RECIPES.length).toBeGreaterThanOrEqual(12);
    for (const r of CURATED_RECIPES) {
      expect(r.minutes).toBeLessThanOrEqual(40);
      expect(r.ingredients.length).toBeGreaterThanOrEqual(2);
      const macroKcal = r.perServing.proteinG * 4 + r.perServing.carbsG * 4 + r.perServing.fatG * 9;
      expect(Math.abs(macroKcal - r.perServing.kcal) / r.perServing.kcal).toBeLessThan(0.15);
    }
  });

  it('diet and allergen tags agree with the keyword blacklist', () => {
    const avoid: AvoidFood[] = ['lactose', 'gluten', 'nuts', 'fish', 'eggs', 'pork'];
    for (const r of CURATED_RECIPES) {
      const groups = blacklistGroups(r);
      for (const a of avoid) expect([r.key, a, groups.includes(a)]).toEqual([r.key, a, r.contains.includes(a)]);
      const meat = groups.includes('meat');
      const fish = groups.includes('fish');
      const animal = groups.includes('lactose') || groups.includes('eggs') || groups.includes('animal');
      expect([r.key, 'pescatarian', r.diets.includes('pescatarian')]).toEqual([r.key, 'pescatarian', !meat]);
      expect([r.key, 'vegetarian', r.diets.includes('vegetarian')]).toEqual([r.key, 'vegetarian', !meat && !fish]);
      expect([r.key, 'vegan', r.diets.includes('vegan')]).toEqual([r.key, 'vegan', !meat && !fish && !animal]);
    }
  });

  it('picks 3 for the slot, best for the focus, respecting preferences', () => {
    const base = { date: '2026-09-27', sex: 'f' as const, care: false, remaining: { kcal: 700, proteinG: 42, carbsG: 30, fatG: 8, fibreG: 7 } };
    const any = curatedRecipes({ ...base, mealType: 'dinner', focus: 'protein', preferences: prefs('any') });
    expect(any.map((r) => r.title)).toEqual(['Griķi ar vistas fileju un gurķu salātiem', 'Tītara fileja ar ceptiem dārzeņiem', 'Cūkgaļas fileja ar kāpostu salātiem un kartupeļiem']);
    expect(any[0]!.why).toBe('+44 g olbaltumvielu vakariņām');
    const vegan = curatedRecipes({ ...base, mealType: 'dinner', focus: 'fibre', preferences: prefs('vegan', 'gluten') });
    expect(vegan).toHaveLength(3);
    for (const r of vegan) expect(preferenceViolation(r, prefs('vegan', 'gluten'))).toBeNull();
    expect(vegan[0]!.why).toMatch(/^\+\d+ g šķiedrvielu vakariņām$/);
  });

  it('focus is the largest relative gap, never energy', () => {
    const t = { kcal: 1750, proteinG: 110, carbsG: 190, fatG: 60, fibreG: 25 };
    expect(recipeFocus({ kcal: 270, proteinG: 42, carbsG: 30, fatG: 8, fibreG: 7 }, t)).toBe('protein');
    expect(recipeFocus({ kcal: 900, proteinG: 10, carbsG: 30, fatG: 8, fibreG: 15 }, t)).toBe('fibre');
    expect(recipeFocus({ kcal: 900, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0 }, t)).toBe('balanced');
    expect(whyText({ perServing: { kcal: 1, proteinG: 1, carbsG: 1, fatG: 1, fibreG: 1 } }, 'balanced', 'lunch')).toBe('Sabalansēta maltīte pusdienām');
  });
});

describe('next meal slot', () => {
  it('follows local time today and skips slots already logged', () => {
    expect(nextMealSlot('2026-09-27', '2026-09-27', '07:30', [])).toBe('breakfast');
    expect(nextMealSlot('2026-09-27', '2026-09-27', '09:00', ['breakfast'])).toBe('lunch');
    expect(nextMealSlot('2026-09-27', '2026-09-27', '18:30', ['breakfast', 'lunch', 'snack'])).toBe('dinner');
    expect(nextMealSlot('2026-09-27', '2026-09-27', '19:30', ['breakfast', 'lunch', 'dinner'])).toBe('snack');
    expect(nextMealSlot('2026-09-27', '2026-09-27', '16:00', [])).toBe('snack');
    expect(nextMealSlot('2026-09-28', '2026-09-27', '20:00', [])).toBe('breakfast');
    expect(nextMealSlot('2026-09-20', '2026-09-27', '20:00', ['breakfast'])).toBe('lunch');
  });
});
