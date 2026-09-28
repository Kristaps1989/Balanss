import type { FoodItemDraft, Nutrients } from '../../../shared/api';

/**
 * Deterministic food "AI" used when AI_PROVIDER=fake and as the graceful
 * fallback when a Claude call fails.
 */

const n = (kcal: number, proteinG: number, carbsG: number, fatG: number, fibreG: number): Nutrients => ({
  kcal,
  proteinG,
  carbsG,
  fatG,
  fibreG,
});

/** The prototype's Food-Result screen: chicken, rice, salad and an uncertain sauce (514 kcal). */
export function fakeAnalyzeMeal(): FoodItemDraft[] {
  return [
    { name: 'Vistas krūtiņa', grams: 150, per100g: n(165, 30.7, 0, 3.6, 0), confidence: 0.92, alternatives: [], portionLabel: null },
    { name: 'Rīsi, vārīti', grams: 120, per100g: n(130, 2.7, 28, 0.3, 0.4), confidence: 0.88, alternatives: [], portionLabel: null },
    { name: 'Salāti', grams: 80, per100g: n(18, 1.2, 3, 0.2, 1.5), confidence: 0.81, alternatives: [], portionLabel: null },
    {
      name: 'Mērce',
      grams: 30,
      per100g: n(320, 1, 6, 33, 0),
      confidence: 0.45,
      alternatives: [
        { label: 'Jogurta mērce', grams: 30, per100g: n(90, 3.5, 5, 6, 0) },
        { label: 'Majonēze', grams: 30, per100g: n(680, 1, 1, 75, 0) },
        { label: 'Bez mērces', grams: 0, per100g: n(0, 0, 0, 0, 0) },
      ],
      portionLabel: null,
    },
  ];
}

interface DictEntry {
  match: RegExp;
  name: string;
  per100g: Nutrients;
  /** Grams of one unit (egg, slice, glass …). */
  unitG: number;
  unitLabel: (count: number) => string;
}

const gab = (c: number) => `${fmtCount(c)} gab.`;
const skele = (c: number) => `${fmtCount(c)} ${c === 1 ? 'šķēle' : 'šķēles'}`;
const glaze = (c: number) => `${fmtCount(c)} ${c === 1 ? 'glāze' : 'glāzes'}`;
const porcija = (c: number) => `${fmtCount(c)} ${c === 1 ? 'porcija' : 'porcijas'}`;
const tase = (c: number) => `${fmtCount(c)} ${c === 1 ? 'tase' : 'tases'}`;
const trauciņš = (c: number) => `${fmtCount(c)} ${c === 1 ? 'trauciņš' : 'trauciņi'}`;

function fmtCount(c: number): string {
  return Number.isInteger(c) ? String(c) : String(c).replace('.', ',');
}

/** Order matters: more specific entries first (kafija ar pienu before piens, biezpiens before piens). */
const DICT: DictEntry[] = [
  { match: /auzu\s*putr|auzu\s*pārsl|putr/, name: 'Auzu putra', per100g: n(88, 3, 15, 1.7, 1.7), unitG: 250, unitLabel: porcija },
  { match: /kafij/, name: 'Kafija ar pienu', per100g: n(30, 1.6, 2.4, 1.5, 0), unitG: 200, unitLabel: tase },
  { match: /biezpien/, name: 'Biezpiens', per100g: n(121, 17, 3, 5, 0), unitG: 100, unitLabel: porcija },
  { match: /jogurt/, name: 'Jogurts, dabīgs', per100g: n(66, 4.2, 5.5, 3, 0), unitG: 150, unitLabel: trauciņš },
  { match: /\bol(a|as|u|ām|e)\b|\bolu\b/, name: 'Olas, vārītas', per100g: n(156, 12.6, 1.1, 10.6, 0), unitG: 50, unitLabel: gab },
  { match: /rupjmaiz|maiz/, name: 'Rupjmaize', per100g: n(229, 6.1, 44, 1.4, 7.5), unitG: 35, unitLabel: skele },
  { match: /banān/, name: 'Banāns', per100g: n(89, 1.1, 22.8, 0.3, 2.6), unitG: 120, unitLabel: gab },
  { match: /ābol/, name: 'Ābols', per100g: n(52, 0.3, 14, 0.2, 2.4), unitG: 180, unitLabel: gab },
  { match: /tēj/, name: 'Tēja', per100g: n(1, 0, 0.2, 0, 0), unitG: 250, unitLabel: tase },
  { match: /pien/, name: 'Piens, 2 %', per100g: n(50, 3.3, 4.8, 2, 0), unitG: 250, unitLabel: glaze },
  { match: /vist/, name: 'Vistas krūtiņa', per100g: n(165, 31, 0, 3.6, 0), unitG: 150, unitLabel: porcija },
  { match: /rīs/, name: 'Rīsi, vārīti', per100g: n(130, 2.7, 28, 0.3, 0.4), unitG: 150, unitLabel: porcija },
  { match: /kartupe/, name: 'Kartupeļi, vārīti', per100g: n(87, 1.9, 20, 0.1, 1.8), unitG: 150, unitLabel: porcija },
  { match: /salāt/, name: 'Salāti', per100g: n(18, 1.2, 3, 0.2, 1.5), unitG: 100, unitLabel: porcija },
  { match: /sier/, name: 'Siers', per100g: n(350, 25, 1, 27, 0), unitG: 20, unitLabel: skele },
  { match: /sviest/, name: 'Sviests', per100g: n(717, 0.9, 0.1, 81, 0), unitG: 10, unitLabel: porcija },
  { match: /lasi|zivs|zivi/, name: 'Lasis, cepts', per100g: n(206, 22, 0, 13, 0), unitG: 120, unitLabel: porcija },
  { match: /griķ/, name: 'Griķi, vārīti', per100g: n(92, 3.4, 20, 0.6, 2.7), unitG: 150, unitLabel: porcija },
  { match: /zup/, name: 'Dārzeņu zupa', per100g: n(40, 1.5, 6, 1, 1.5), unitG: 300, unitLabel: porcija },
  { match: /riekst/, name: 'Rieksti', per100g: n(607, 20, 13, 54, 7), unitG: 30, unitLabel: porcija },
  { match: /granol|musli|müsli/, name: 'Granola', per100g: n(470, 10, 60, 20, 7), unitG: 50, unitLabel: porcija },
  { match: /ogas|ogām|mellen|zemen/, name: 'Ogas', per100g: n(45, 0.8, 10, 0.3, 3), unitG: 100, unitLabel: porcija },
  { match: /tomāt/, name: 'Tomāts', per100g: n(18, 0.9, 3.9, 0.2, 1.2), unitG: 120, unitLabel: gab },
  { match: /gurķ/, name: 'Gurķis', per100g: n(15, 0.7, 3.6, 0.1, 0.5), unitG: 150, unitLabel: gab },
];

const NUMBER_WORDS: Record<string, number> = {
  pus: 0.5,
  puse: 0.5,
  pusi: 0.5,
  viens: 1,
  viena: 1,
  vienu: 1,
  divi: 2,
  divas: 2,
  trīs: 3,
  četri: 4,
  četras: 4,
  pieci: 5,
  piecas: 5,
  seši: 6,
  sešas: 6,
};

/** "2 olas un maize" → Olas, vārītas 2 gab. 100 g; Rupjmaize 1 šķēle 35 g. */
export function fakeParseText(text: string): FoodItemDraft[] {
  const chunks = text
    .toLowerCase()
    .split(/,|;|\+|\n|\bun\b|\bplus\b/)
    .map((c) => c.trim())
    .filter(Boolean);
  const items: FoodItemDraft[] = [];
  for (const chunk of chunks) {
    const entry = DICT.find((e) => e.match.test(chunk));
    if (!entry) continue;
    let grams: number;
    let portionLabel: string | null;
    const explicit = /(\d+(?:[.,]\d+)?)\s*(g|gr|grami|gramus|ml)\b/.exec(chunk);
    if (explicit) {
      grams = Number(explicit[1]!.replace(',', '.'));
      portionLabel = null;
    } else {
      const digit = /(\d+(?:[.,]\d+)?)/.exec(chunk);
      const word = chunk.split(/\s+/).find((w) => w in NUMBER_WORDS);
      const count = digit ? Number(digit[1]!.replace(',', '.')) : word ? NUMBER_WORDS[word]! : 1;
      grams = Math.round(entry.unitG * count);
      portionLabel = entry.unitLabel(count);
    }
    items.push({ name: entry.name, grams, per100g: entry.per100g, confidence: 0.8, alternatives: [], portionLabel });
  }
  return items;
}
