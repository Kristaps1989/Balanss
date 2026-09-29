import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

import type { AvoidFood, Diet, FoodPreferences, MealType, Nutrients, Recipe, Sex } from '../../../shared/api';
import { fmtInt } from '../lib/format';
import { callStructured, logAiFailure, type ClaudeClient } from './claude';
import { CURATED_RECIPES, type CuratedRecipe } from './recipes-data';
import { firstIssue, logSafetyRejection } from './safety';
import { dataBlock, TONE_SYSTEM } from './tone';

/**
 * Meal ideas (Pro) for the next meal slot, filling what is left of today's
 * targets — mostly the largest gap (protein or fibre). Never "low calorie".
 *
 * Preferences are strict: every recipe (Claude's and the curated ones) is
 * checked against a keyword blacklist per diet and avoid-group; a recipe with a
 * single hit is dropped, and the set is topped up from the curated list.
 */

export type RecipeFocus = 'protein' | 'fibre' | 'balanced';

export interface RecipesInput {
  date: string;
  sex: Sex;
  care: boolean;
  mealType: MealType;
  /** What is left of today's targets (never negative). */
  remaining: Nutrients;
  focus: RecipeFocus;
  preferences: FoodPreferences;
}

/** A recipe before it gets its stored id. */
export type RecipeDraft = Omit<Recipe, 'id'> & { servingGrams: number };

export interface RecipesResult {
  recipes: RecipeDraft[];
  aiGenerated: boolean;
}

export const RECIPE_COUNT = 3;
export const MAX_MINUTES = 40;

// ---------------------------------------------------------------- preference blacklist

/** Word-start stems (lower-case) per group; matched after a non-letter or at the start. */
const STEMS: Record<'meat' | 'fish' | AvoidFood | 'animal', string[]> = {
  meat: ['gaļ', 'vist', 'cūk', 'liellop', 'tītar', 'pīle', 'pīļ', 'jēr', 'teļ', 'šķiņķ', 'bekon', 'desa', 'desiņ', 'cīsiņ', 'speķ', 'karbonād', 'akn', 'salami', 'prošut'],
  fish: ['ziv', 'lasi', 'laš', 'menc', 'siļķ', 'reņģ', 'tunc', 'skumbr', 'forel', 'brētliņ', 'šprot', 'garnel', 'krab', 'kalmār', 'mīdij', 'jūras velt', 'anšov', 'sardīn', 'karp', 'zandart', 'līdak', 'pikš', 'heks', 'surim'],
  lactose: ['pien', 'jogurt', 'kefīr', 'biezpien', 'sier', 'sviest', 'krējum', 'feta', 'fetu', 'fetas', 'mocarell', 'parmezān', 'rikot', 'maskarpon', 'halum', 'hallou', 'rūgušpien', 'skābpien', 'paniņ', 'sūkal', 'kazas sier'],
  gluten: ['kvieš', 'rudz', 'miež', 'spelt', 'manna', 'bulgur', 'kuskus', 'makaron', 'spaget', 'nūdel', 'maiz', 'rupjmaiz', 'baltmaiz', 'saldskābmaiz', 'grauzdiņ', 'lavaš', 'tortilj', 'pīrāg', 'milt', 'auz', 'sojas mērc', 'kruton', 'lazanj', 'kraukšķmaiz', 'granol', 'musli', 'müsli', 'pank'],
  nuts: ['riekst', 'zemesriekst', 'valriekst', 'mandel', 'lazdu', 'pistāc', 'pekan', 'makadām', 'makadam', 'indijas riekst', 'ciedr', 'marcipān', 'nutell', 'pesto'],
  eggs: ['ola', 'olu', 'olām', 'olai', 'omlet', 'majonēz', 'kultenis no olām'],
  pork: ['cūk', 'šķiņķ', 'bekon', 'speķ', 'desa', 'desiņ', 'cīsiņ', 'karbonād', 'salami', 'prošut', 'pančet'],
  animal: ['medus', 'medu', 'želatīn'],
} as Record<'meat' | 'fish' | AvoidFood | 'animal', string[]>;

/** Plant or free-from phrases removed before matching, so "auzu dzēriens" or "bezglutēna maize" do not trigger. */
const ALLOWED_PHRASES: Partial<Record<AvoidFood | 'meat' | 'animal', RegExp[]>> = {
  lactose: [
    /(auzu|sojas|mandeļu|kokosriekstu|kokosa|rīsu|augu|zirņu)\s+(pien|jogurt|krējum|dzērien|sier)\p{L}*/giu,
    /bezlaktozes\s+\p{L}+/giu,
    /(zemesriekstu|mandeļu|riekstu|kakao|kokosriekstu)\s+sviest\p{L}*/giu,
  ],
  gluten: [/bezglutēna\s+\p{L}+/giu, /(griķu|rīsu|kukurūzas|mandeļu|kokosriekstu|zirņu|aunazirņu|kartupeļu)\s+(milt|nūdel|tortilj|maiz|pank)\p{L}*/giu],
  nuts: [/kokos\p{L}*/giu, /muskatriekst\p{L}*/giu],
  eggs: [/olīv\p{L}*/giu],
};

function groupsFor(p: FoodPreferences): (AvoidFood | 'meat' | 'animal')[] {
  const g = new Set<AvoidFood | 'meat' | 'animal'>(p.avoid);
  const diet: Diet = p.diet;
  if (diet === 'pescatarian' || diet === 'vegetarian' || diet === 'vegan') g.add('meat');
  if (diet === 'vegetarian' || diet === 'vegan') g.add('fish');
  if (diet === 'vegan') {
    g.add('lactose');
    g.add('eggs');
    g.add('animal');
  }
  return [...g];
}

function hits(text: string, group: AvoidFood | 'meat' | 'animal'): string | null {
  let t = ` ${text.toLowerCase()} `;
  for (const re of ALLOWED_PHRASES[group] ?? []) t = t.replace(re, ' ');
  for (const stem of STEMS[group] ?? []) {
    const re = new RegExp(`(?<![\\p{L}])${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'iu');
    if (re.test(t)) return stem;
  }
  return null;
}

/** The group a recipe violates for these preferences, or null. Checks title and ingredient names. */
export function preferenceViolation(recipe: Pick<Recipe, 'title' | 'ingredients'>, prefs: FoodPreferences): string | null {
  const texts = [recipe.title, ...recipe.ingredients.map((i) => i.name)];
  for (const group of groupsFor(prefs)) {
    for (const text of texts) if (hits(text, group)) return group;
  }
  return null;
}

/** Which avoid-groups / diets a text list trips (used by the curated-data consistency test). */
export function blacklistGroups(recipe: Pick<Recipe, 'title' | 'ingredients'>): (AvoidFood | 'meat' | 'animal')[] {
  const all: (AvoidFood | 'meat' | 'animal')[] = ['meat', 'fish', 'lactose', 'gluten', 'nuts', 'eggs', 'pork', 'animal'];
  const texts = [recipe.title, ...recipe.ingredients.map((i) => i.name)];
  return all.filter((g) => texts.some((t) => hits(t, g)));
}

// ---------------------------------------------------------------- focus and "why"

const SLOT_FOR: Record<MealType, string> = { breakfast: 'brokastīm', lunch: 'pusdienām', snack: 'uzkodām', dinner: 'vakariņām' };

/** The largest relative gap left today: protein or fibre (never energy). */
export function recipeFocus(remaining: Nutrients, targets: Nutrients): RecipeFocus {
  const p = targets.proteinG > 0 ? remaining.proteinG / targets.proteinG : 0;
  const f = targets.fibreG > 0 ? remaining.fibreG / targets.fibreG : 0;
  if (p < 0.1 && f < 0.1) return 'balanced';
  return p >= f ? 'protein' : 'fibre';
}

export function whyText(r: Pick<Recipe, 'perServing'>, focus: RecipeFocus, mealType: MealType): string {
  const slot = SLOT_FOR[mealType];
  if (focus === 'protein') return `+${fmtInt(r.perServing.proteinG)} g olbaltumvielu ${slot}`;
  if (focus === 'fibre') return `+${fmtInt(r.perServing.fibreG)} g šķiedrvielu ${slot}`;
  return `Sabalansēta maltīte ${slot}`;
}

// ---------------------------------------------------------------- curated fallback

function fits(r: CuratedRecipe, prefs: FoodPreferences): boolean {
  if (prefs.diet !== 'any' && !r.diets.includes(prefs.diet)) return false;
  if (prefs.avoid.some((a) => r.contains.includes(a))) return false;
  return preferenceViolation(r, prefs) === null;
}

const NEIGHBOUR: Record<MealType, MealType[]> = {
  breakfast: ['snack', 'lunch', 'dinner'],
  lunch: ['dinner', 'snack', 'breakfast'],
  dinner: ['lunch', 'snack', 'breakfast'],
  snack: ['breakfast', 'lunch', 'dinner'],
};

function toDraft(r: CuratedRecipe, focus: RecipeFocus, mealType: MealType): RecipeDraft {
  return {
    title: r.title,
    minutes: r.minutes,
    servings: r.servings,
    ingredients: r.ingredients,
    steps: r.steps,
    perServing: r.perServing,
    why: whyText(r, focus, mealType),
    tags: r.tags,
    servingGrams: r.servingGrams,
  };
}

/** Up to `count` curated recipes for the slot (then neighbouring slots), best for the focus first. */
export function curatedRecipes(input: RecipesInput, count = RECIPE_COUNT, excludeTitles: string[] = []): RecipeDraft[] {
  const score = (r: CuratedRecipe) => (input.focus === 'fibre' ? r.perServing.fibreG : input.focus === 'protein' ? r.perServing.proteinG : 0);
  const pool = CURATED_RECIPES.filter((r) => fits(r, input.preferences) && !excludeTitles.includes(r.title));
  const out: CuratedRecipe[] = [];
  for (const slot of [input.mealType, ...NEIGHBOUR[input.mealType]]) {
    const forSlot = pool.filter((r) => r.mealTypes.includes(slot) && !out.includes(r)).sort((a, b) => score(b) - score(a) || a.key.localeCompare(b.key));
    for (const r of forSlot) if (out.length < count) out.push(r);
    if (out.length >= count) break;
  }
  return out.map((r) => toDraft(r, input.focus, input.mealType));
}

// ---------------------------------------------------------------- validation of Claude output

const r1 = (x: number) => Math.round(x * 10) / 10;

/** A Claude recipe that passes preferences, the ethics gate and sanity ranges, or the rejection reason. */
export function validRecipe(r: z.infer<typeof RecipeSchema>, input: RecipesInput): RecipeDraft | string {
  const title = r.title.trim();
  if (!title || r.ingredients.length < 2 || r.ingredients.length > 15 || r.steps.length < 1 || r.steps.length > 10) return 'shape';
  if (!(r.minutes > 0 && r.minutes <= MAX_MINUTES)) return 'too_long';
  if (!(r.servings >= 1 && r.servings <= 8) || !(r.servingGrams >= 50 && r.servingGrams <= 1000)) return 'servings';
  const p = r.perServing;
  if (!(p.kcal >= 50 && p.kcal <= 1200) || [p.proteinG, p.carbsG, p.fatG, p.fibreG].some((v) => !(v >= 0 && v <= 150))) return 'nutrients';
  const violation = preferenceViolation({ title, ingredients: r.ingredients }, input.preferences);
  if (violation) return `preference:${violation}`;
  const ctx = { sex: input.sex, care: input.care };
  const issue = firstIssue(
    [
      [title, 80],
      [r.why, 120],
      ...r.ingredients.flatMap((i): [string, number][] => [[i.name, 80], [i.amount, 40]]),
      ...r.steps.map((s): [string, number] => [s, 300]),
      ...r.tags.map((t): [string, number] => [t, 30]),
    ],
    ctx,
  );
  if (issue) return issue;
  return {
    title,
    minutes: Math.round(r.minutes),
    servings: Math.round(r.servings),
    ingredients: r.ingredients.map((i) => ({ name: i.name.trim(), amount: i.amount.trim() })),
    steps: r.steps.map((s) => s.trim()),
    perServing: { kcal: Math.round(p.kcal), proteinG: r1(p.proteinG), carbsG: r1(p.carbsG), fatG: r1(p.fatG), fibreG: r1(p.fibreG) },
    why: r.why.trim(),
    tags: r.tags.slice(0, 4).map((t) => t.trim()),
    servingGrams: Math.round(r.servingGrams),
  };
}

const RecipeSchema = z.object({
  title: z.string(),
  minutes: z.number(),
  servings: z.number(),
  servingGrams: z.number(),
  ingredients: z.array(z.object({ name: z.string(), amount: z.string() })),
  steps: z.array(z.string()),
  perServing: z.object({ kcal: z.number(), proteinG: z.number(), carbsG: z.number(), fatG: z.number(), fibreG: z.number() }),
  why: z.string(),
  tags: z.array(z.string()),
});
const RecipesSchema = z.object({ recipes: z.array(RecipeSchema) });

export interface RecipeEngine {
  recipes(input: RecipesInput, log: FastifyBaseLogger): Promise<RecipesResult>;
}

export const fakeRecipeEngine: RecipeEngine = {
  recipes: async (input) => ({ recipes: curatedRecipes(input), aiGenerated: false }),
};

export function claudeRecipeEngine(client: ClaudeClient, model: string): RecipeEngine {
  return {
    async recipes(input, log) {
      const task = `Iesaki ${RECIPE_COUNT} maltīšu idejas maltītei "${input.mealType}". Galvenais fokuss: ${input.focus}. Ievēro "preferences" stingri.`;
      const data = { date: input.date, sex: input.sex, care: input.care, mealType: input.mealType, remainingToday: input.remaining, focus: input.focus, preferences: input.preferences };
      try {
        const out = await callStructured(client, model, log, {
          route: 'recipes',
          system: TONE_SYSTEM,
          schema: RecipesSchema,
          effort: 'medium',
          maxTokens: 12_000,
          content: dataBlock(task, data),
        });
        const kept: RecipeDraft[] = [];
        for (const r of out.recipes.slice(0, RECIPE_COUNT + 2)) {
          const v = validRecipe(r, input);
          if (typeof v === 'string') logSafetyRejection(log, 'recipes', v);
          else if (kept.length < RECIPE_COUNT && !kept.some((k) => k.title === v.title)) kept.push(v);
        }
        if (kept.length) {
          const fill = kept.length < RECIPE_COUNT ? curatedRecipes(input, RECIPE_COUNT - kept.length, kept.map((k) => k.title)) : [];
          return { recipes: [...kept, ...fill], aiGenerated: true };
        }
      } catch (err) {
        logAiFailure(log, 'recipes', err);
      }
      return { recipes: curatedRecipes(input), aiGenerated: false };
    },
  };
}

