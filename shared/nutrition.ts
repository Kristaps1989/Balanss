import type { MealType, Nutrients } from './api';

export const ZERO: Nutrients = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0 };

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Nutrients for `grams` of a food given per-100 g values. */
export function scale(per100g: Nutrients, grams: number): Nutrients {
  const f = grams / 100;
  return {
    kcal: Math.round(per100g.kcal * f),
    proteinG: round1(per100g.proteinG * f),
    carbsG: round1(per100g.carbsG * f),
    fatG: round1(per100g.fatG * f),
    fibreG: round1(per100g.fibreG * f),
  };
}

export function sum(list: Nutrients[]): Nutrients {
  const t = list.reduce(
    (a, n) => ({
      kcal: a.kcal + n.kcal,
      proteinG: a.proteinG + n.proteinG,
      carbsG: a.carbsG + n.carbsG,
      fatG: a.fatG + n.fatG,
      fibreG: a.fibreG + n.fibreG,
    }),
    ZERO,
  );
  return { kcal: Math.round(t.kcal), proteinG: round1(t.proteinG), carbsG: round1(t.carbsG), fatG: round1(t.fatG), fibreG: round1(t.fibreG) };
}

export function itemsTotals(items: { per100g: Nutrients; grams: number }[]): Nutrients {
  return sum(items.map((i) => scale(i.per100g, i.grams)));
}

/** Suggest the meal slot from a local time. */
export function mealTypeForTime(d: Date): MealType {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m < 4 * 60) return 'snack';
  if (m < 10 * 60 + 30) return 'breakfast';
  if (m < 15 * 60) return 'lunch';
  if (m < 17 * 60 + 30) return 'snack';
  return 'dinner';
}

export const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Brokastis',
  lunch: 'Pusdienas',
  snack: 'Uzkodas',
  dinner: 'Vakariņas',
};
