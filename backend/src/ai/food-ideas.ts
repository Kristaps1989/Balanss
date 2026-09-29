import type { FoodPreferences } from '../../../shared/api';

/**
 * Food words used inside template copy, chosen so a template never suggests
 * something the user's diet or avoid-list excludes (e.g. no "biezpiens" for a
 * vegan user, no "rieksti" with a nut allergy). Default preferences keep the
 * original prototype wording.
 */

const has = (p: FoodPreferences, a: FoodPreferences['avoid'][number]) => p.avoid.includes(a);
const noDairy = (p: FoodPreferences) => p.diet === 'vegan' || has(p, 'lactose');
const noEggs = (p: FoodPreferences) => p.diet === 'vegan' || has(p, 'eggs');
const noFish = (p: FoodPreferences) => p.diet === 'vegan' || p.diet === 'vegetarian' || has(p, 'fish');
const noMeat = (p: FoodPreferences) => p.diet !== 'any';

export interface FoodIdeas {
  /** Nominative: "biezpiens vai jogurts" (+18 g). */
  proteinEvening: string;
  /** Accusative: "jogurtu vai biezpienu". */
  proteinEveningAcc: string;
  proteinEveningGrams: number;
  /** "sauja riekstu" (+6 g). */
  proteinSnack: string;
  /** Novelty idea (accusative): "lēcu salātus ar fetu". */
  proteinNovelty: string;
  /** Neutral list: "olas, biezpiens vai zivs". */
  proteinList: string;
  /** Plan fibre step: "rupjmaizes šķēle vakariņās (+3 g)". */
  fibreStep: string;
  /** Novelty fibre recipe (accusative): "lēcu zupu ar ciedru riekstiem". */
  fibreNovelty: string;
  /** Neutral fibre list: "dārzeņi, pākšaugi vai rupjmaize". */
  fibreList: string;
  /** Novelty trends idea: "pākšaugiem vai zivi". */
  dinnerNovelty: string;
  /** Portable breakfast idea (accusative): "jogurtu ar pārslām". */
  breakfastToGo: string;
}

export function foodIdeas(p: FoodPreferences): FoodIdeas {
  const dairy = !noDairy(p);
  const gluten = !has(p, 'gluten');
  const nuts = !has(p, 'nuts');

  const list: string[] = [];
  if (!noEggs(p)) list.push('olas');
  if (dairy) list.push('biezpiens');
  if (!noFish(p)) list.push('zivs');
  if (list.length < 3) list.push('pupiņas');
  if (list.length < 3) list.push('tofu');
  if (list.length < 3) list.push('lēcas');
  const proteinList = `${list.slice(0, -1).join(', ')} vai ${list.at(-1)}`;

  return {
    proteinEvening: dairy ? 'biezpiens vai jogurts' : p.diet === 'vegan' ? 'tofu vai sojas jogurts' : noEggs(p) ? 'pupiņas vai tofu' : 'olas vai pupiņas',
    proteinEveningAcc: dairy ? 'jogurtu vai biezpienu' : p.diet === 'vegan' ? 'tofu vai pupiņas' : noEggs(p) ? 'pupiņas vai tofu' : 'olu vai pupiņas',
    proteinEveningGrams: dairy ? 18 : 15,
    proteinSnack: nuts ? 'sauja riekstu' : 'sauja ķirbju sēklu',
    proteinNovelty: dairy ? 'lēcu salātus ar fetu' : 'lēcu salātus ar tofu',
    proteinList,
    fibreStep: gluten ? 'rupjmaizes šķēle vakariņās (+3 g)' : 'sauja griķu vakariņās (+3 g)',
    fibreNovelty: nuts ? 'lēcu zupu ar ciedru riekstiem' : 'lēcu zupu ar ķirbju sēklām',
    fibreList: gluten ? 'dārzeņi, pākšaugi vai rupjmaize' : 'dārzeņi, pākšaugi vai griķi',
    dinnerNovelty: noFish(p) ? (noMeat(p) ? 'pākšaugiem vai tofu' : 'pākšaugiem') : 'pākšaugiem vai zivi',
    breakfastToGo: dairy ? (gluten ? 'jogurtu ar pārslām' : 'jogurtu ar ogām') : 'sojas jogurtu ar ogām',
  };
}
