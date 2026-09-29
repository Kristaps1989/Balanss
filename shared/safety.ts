/**
 * Wellbeing safeguards shared by the app and the backend.
 *
 * Balanss gives habit-level suggestions only. These rules keep targets and AI
 * copy away from anything that could encourage under-eating, rapid weight loss,
 * guilt or medical claims, and switch the app into "care mode" when the data
 * suggests someone may be at risk. Thresholds are conservative on purpose.
 */
import type { CareReason, CareStatus, Profile, Sex } from './api';

/** Lowest daily energy target the app will ever set or accept. */
export const KCAL_FLOOR: Record<Sex, number> = { f: 1200, m: 1500, x: 1350 };

/** BMI below which the app never suggests losing weight. */
export const MIN_BMI = 18.5;

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** Lowest goal weight the app accepts for a height (BMI 18,5), rounded up to whole kg. */
export function minGoalWeight(heightCm: number): number {
  const m = heightCm / 100;
  return Math.ceil(MIN_BMI * m * m);
}

/** Weight loss is not offered to under-18s or people already at/below BMI 18,5. */
export function weightLossAllowed(p: Pick<Profile, 'age' | 'weightKg' | 'heightCm'>): boolean {
  return p.age >= 18 && bmi(p.weightKg, p.heightCm) > MIN_BMI;
}

export interface CareInput {
  profile: Pick<Profile, 'age' | 'sex' | 'weightKg' | 'heightCm' | 'goals' | 'weightDirection' | 'goalWeightKg'>;
  /** Last 7 complete days (today excluded), with how many meals were logged. */
  recentDays: { date: string; kcal: number; mealsLogged: number }[];
  /** Weight entries of the last 42 days, any order. */
  weights: { date: string; kg: number }[];
}

const DAY = 86_400_000;

/**
 * Care mode triggers:
 * - low_intake: on ≥ 3 of the last 7 days with ≥ 2 meals logged, energy was below 70 % of the floor
 * - rapid_weight_loss: > 1 kg per week on average over at least 14 days
 * - underweight: current BMI below 18,5
 * - low_goal: goal weight below BMI 18,5 (older data; new goals are validated)
 * - minor_weight_loss: under 18 with a weight-loss goal
 */
export function careStatus(input: CareInput): CareStatus {
  const reasons: CareReason[] = [];
  const p = input.profile;
  const floor = KCAL_FLOOR[p.sex];

  const logged = input.recentDays.filter((d) => d.mealsLogged >= 2);
  if (logged.filter((d) => d.kcal < floor * 0.7).length >= 3) reasons.push('low_intake');

  const w = [...input.weights].sort((a, b) => a.date.localeCompare(b.date));
  if (w.length >= 2) {
    const first = w[0];
    const last = w[w.length - 1];
    const days = (Date.parse(last.date) - Date.parse(first.date)) / DAY;
    if (days >= 14 && (first.kg - last.kg) / (days / 7) > 1) reasons.push('rapid_weight_loss');
  }

  if (bmi(p.weightKg, p.heightCm) < MIN_BMI) reasons.push('underweight');
  const losing = p.goals.includes('weight') && p.weightDirection === 'down';
  if (losing && p.goalWeightKg !== null && p.goalWeightKg < minGoalWeight(p.heightCm)) reasons.push('low_goal');
  if (losing && p.age < 18) reasons.push('minor_weight_loss');

  return { active: reasons.length > 0, reasons };
}

/** Copy for the care card (Latvian, calm, no diagnosis). */
export const CARE_COPY = {
  title: 'Parūpēsimies par tevi',
  body:
    'Pēdējās dienās dati izskatās tā, ka ēdienam un atpūtai vajadzētu vairāk vietas. Tāpēc tagad nerādīsim ieteikumus par mazāk ēšanu vai svara samazināšanu. Ja ēšana vai svars rada satraukumu, par to vērts parunāt ar ģimenes ārstu.',
  support: 'Ja vajag parunāt ar kādu tūlīt: emocionālā atbalsta tālrunis 116 123 (bez maksas, visu diennakti).',
} as const;

/**
 * Phrases AI copy must never contain. Checked after generation; any hit falls
 * back to the reviewed templates. Lower-case, Latvian stems.
 */
export const BANNED_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /diagnoz|slimīb|slimo|simptom|terapij|ārstē|izārst/i, why: 'medical' },
  { re: /zāl(es|ēm|ītes)|medikament|tablet|uztura bagātinātāj|vitamīnu kurs|detoks|attīr[īi]/i, why: 'medical/supplement' },
  { re: /holesterīn|asinsspiedien|cukura līmen|insulīn|diabēt/i, why: 'medical' },
  { re: /zaudēsi|nometīsi|notievēsi|garantēt|garantij|ātri tievē|- ?\d+ ?kg (nedēļā|mēnesī)/i, why: 'weight promise' },
  { re: /badoš|badā|neēd |neēst|izlaid (maltīti|brokastis|pusdienas|vakariņas)|atteikties no ēšanas|tukšā dūšā visu dienu/i, why: 'restriction' },
  { re: /sadedzin|nostrādā(t|jot) kalorij|kompensē|atpelnī|sods|sodī/i, why: 'compensation' },
  { re: /resn|tievul|neglīt|kauns|kaunēties|vainīg|slikti ēdi|neveiksm|izgāz/i, why: 'shame' },
  // Whole words only: "atgādinājums", "krējums", "sautējums" end in "-jums" and are fine.
  { re: /(?<!\p{L})(jums|jūs|jūsu)(?!\p{L})/iu, why: 'formal address' },
];

export function copyViolation(text: string): string | null {
  const t = ` ${text.toLowerCase()} `;
  for (const b of BANNED_PATTERNS) if (b.re.test(t)) return b.why;
  return null;
}

/** A daily energy amount below the floor ("900 kcal dienā") is never suggested. Remaining amounts ("vēl 700 kcal") are fine. */
export function mentionsKcalBelow(text: string, floor: number): boolean {
  const re = /(\d[\d\s\u00a0]*)\s?kcal\s+(dienā|diena|dienas mērķ)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = Number(m[1].replace(/[\s\u00a0]/g, ''));
    if (n > 0 && n < floor) return true;
  }
  return false;
}
