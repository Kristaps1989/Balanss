import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

import type { FoodItemDraft } from '../../../shared/api';
import { callStructured, logAiFailure, type ClaudeClient } from './claude';
import { fakeAnalyzeMeal, fakeParseText } from './fake-food';

// Schema sent to the model (no refinements: structured outputs support a JSON-schema subset).
const NutrientsSchema = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fibreG: z.number(),
});

const FoodItemsSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      grams: z.number(),
      per100g: NutrientsSchema,
      confidence: z.number(),
      alternatives: z.array(z.object({ label: z.string(), grams: z.number(), per100g: NutrientsSchema })),
      portionLabel: z.string().nullable(),
    }),
  ),
});

const round1 = (x: number) => Math.round(x * 10) / 10;
const clampNutrients = (v: z.infer<typeof NutrientsSchema>) => ({
  kcal: Math.max(0, Math.min(900, Math.round(v.kcal))),
  proteinG: Math.max(0, Math.min(100, round1(v.proteinG))),
  carbsG: Math.max(0, Math.min(100, round1(v.carbsG))),
  fatG: Math.max(0, Math.min(100, round1(v.fatG))),
  fibreG: Math.max(0, Math.min(100, round1(v.fibreG))),
});

/** Second, domain-level validation of the model's output: clamp ranges, keep alternatives only for unsure items. */
export function sanitizeItems(raw: z.infer<typeof FoodItemsSchema>['items']): FoodItemDraft[] {
  return raw
    .filter((i) => i.name.trim().length > 0 && i.grams >= 0 && i.grams <= 3000)
    .slice(0, 12)
    .map((i) => {
      const confidence = Math.max(0, Math.min(1, i.confidence));
      return {
        name: i.name.trim().slice(0, 80),
        grams: Math.round(i.grams),
        per100g: clampNutrients(i.per100g),
        confidence: Math.round(confidence * 100) / 100,
        alternatives:
          confidence < 0.6
            ? i.alternatives.slice(0, 3).map((a) => ({
                label: a.label.trim().slice(0, 60),
                grams: Math.max(0, Math.round(a.grams)),
                per100g: clampNutrients(a.per100g),
              }))
            : [],
        portionLabel: i.portionLabel?.trim() ? i.portionLabel.trim().slice(0, 40) : null,
      };
    });
}

export const ANALYZE_SYSTEM = `You are the food-recognition step of Balanss, a Latvian nutrition app. You receive one photo of a meal and return the foods on it as structured data.

Rules:
- Identify each distinct food or drink that is visible (e.g. "Vistas krūtiņa", "Rīsi, vārīti", "Salāti", "Mērce"). Do not merge separate components; do not list garnish that weighs under 5 g.
- Estimate the grams of each item from its visible volume, using the plate (a standard dinner plate is about 26 cm), bowl, glass or cutlery as a size reference. Cooked weight as served.
- Give nutrients per 100 g of the item as served (kcal, proteinG, carbsG, fatG, fibreG), using standard food-composition tables (e.g. USDA FoodData Central, Fineli, the Latvian food composition data). Use one decimal for grams of macronutrients, whole kcal.
- "name" is the Latvian name of the food, short, capitalised, in the style "Rīsi, vārīti", "Auzu putra ar ogām", "Rupjmaize".
- "confidence" is 0..1: how sure you are about both the identity and the amount. Sauces, dressings, oils and mixed dishes are usually below 0.6.
- For items with confidence below 0.6, give up to 3 "alternatives" the user can pick instead (e.g. for a sauce: "Jogurta mērce", "Majonēze"), each with grams and per-100 g nutrients, and always include a "none" option such as "Bez mērces" with 0 g and zero nutrients. For items with confidence 0.6 or above, "alternatives" is an empty list.
- "portionLabel" is a short Latvian unit description when natural ("2 gab.", "1 šķēle", "1 glāze"), otherwise null.
- If the image does not show food or drink, return an empty "items" list.
- Never add health advice or commentary; return only the data.`;

export const PARSE_SYSTEM = `You are the text-entry step of Balanss, a Latvian nutrition app. The user describes what they ate in Latvian (sometimes typed quickly, without diacritics, or dictated). Return each food as structured data.

Rules:
- One item per distinct food. "2 olas un maize" is two items: eggs (2 pieces) and bread (1 slice).
- Latvian food names, short and capitalised, e.g. "Olas, vārītas", "Rupjmaize", "Biezpiens", "Kafija ar pienu".
- Convert quantities to grams using typical Latvian portions: 1 egg 50 g, 1 slice of rye bread 35 g, 1 glass 250 ml, 1 cup of coffee 200 ml, 1 portion of porridge 250 g. If no quantity is given, assume one typical portion.
- "portionLabel" repeats the user's unit in Latvian ("2 gab.", "1 šķēle", "1 glāze"), or null when the user gave grams.
- Nutrients per 100 g from standard food-composition tables; whole kcal, one decimal for grams.
- "confidence" 0..1; alternatives only for items below 0.6 (up to 3, with grams and per-100 g nutrients), otherwise an empty list.
- Ignore words that are not food. If nothing is food, return an empty "items" list.`;

export const PANTRY_SYSTEM = `You are the pantry step of Balanss, a Latvian nutrition app. The user photographs the inside of their fridge or kitchen shelf so the app can suggest food ideas that need no shopping. Return the food products you can actually see.

Rules:
- One entry per distinct product, Latvian, lower case, short, plural where natural: "olas", "piens", "biezpiens", "burkāni", "auzu pārslas", "vistas fileja".
- Only what is clearly visible. If you are unsure what a package is, leave it out rather than guess. Do not list brands, non-food items, cleaning products or medicines.
- At most 30 entries. If the image shows no food, return an empty "items" list.
- Return only the data.`;

const PantrySchema = z.object({ items: z.array(z.string()) });

/** Normalise an ingredient list: trimmed, lower case, unique, at most 40 entries of 40 characters. */
export function cleanPantryItems(items: string[]): string[] {
  const out: string[] = [];
  for (const raw of items) {
    const v = raw.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 40);
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, 40);
}

export interface FoodAi {
  analyzeMeal(imageBase64: string, mediaType: 'image/jpeg' | 'image/png' | 'image/webp', log: FastifyBaseLogger): Promise<FoodItemDraft[]>;
  parseText(text: string, log: FastifyBaseLogger): Promise<FoodItemDraft[]>;
  /** Fridge photo → ingredient names. Empty on failure (never a guessed list). */
  scanPantry(imageBase64: string, mediaType: 'image/jpeg' | 'image/png' | 'image/webp', log: FastifyBaseLogger): Promise<string[]>;
}

export const FAKE_PANTRY = ['olas', 'piens', 'auzu pārslas', 'āboli', 'burkāni', 'siers'];

export const fakeFoodAi: FoodAi = {
  analyzeMeal: async () => fakeAnalyzeMeal(),
  parseText: async (text) => fakeParseText(text),
  scanPantry: async () => FAKE_PANTRY,
};

export function claudeFoodAi(client: ClaudeClient, model: string): FoodAi {
  return {
    async analyzeMeal(imageBase64, mediaType, log) {
      try {
        const out = await callStructured(client, model, log, {
          route: 'meals.analyze',
          system: ANALYZE_SYSTEM,
          effort: 'medium',
          schema: FoodItemsSchema,
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: 'Analysē šo maltīti.' },
          ],
        });
        return sanitizeItems(out.items);
      } catch (err) {
        logAiFailure(log, 'meals.analyze', err);
        return fakeAnalyzeMeal();
      }
    },
    async parseText(text, log) {
      try {
        const out = await callStructured(client, model, log, {
          route: 'meals.parse-text',
          system: PARSE_SYSTEM,
          effort: 'low',
          maxTokens: 8000,
          schema: FoodItemsSchema,
          content: `<user_text>${text}</user_text>`,
        });
        return sanitizeItems(out.items);
      } catch (err) {
        logAiFailure(log, 'meals.parse-text', err);
        return fakeParseText(text);
      }
    },
    async scanPantry(imageBase64, mediaType, log) {
      try {
        const out = await callStructured(client, model, log, {
          route: 'pantry.scan',
          system: PANTRY_SYSTEM,
          effort: 'low',
          maxTokens: 4000,
          schema: PantrySchema,
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: 'Kas ir redzams šajā ledusskapī vai plauktā?' },
          ],
        });
        return cleanPantryItems(out.items).slice(0, 30);
      } catch (err) {
        logAiFailure(log, 'pantry.scan', err);
        return [];
      }
    },
  };
}
