import type { PersonalityLevels, Sex, ToneStyle, Trait, TraitLevel } from './api';

/**
 * Short Big Five questionnaire: 20 statements, 4 per trait, 5-point scale.
 * Original Latvian wording in the style of public-domain IPIP items.
 * Not a clinical or diagnostic instrument.
 * `key: -1` items are reverse-scored (6 − answer).
 */
export interface PersonalityItem {
  trait: Trait;
  key: 1 | -1;
  text: string;
}

export const PERSONALITY_ITEMS: PersonalityItem[] = [
  { trait: 'conscientiousness', key: 1, text: 'Man patīk, ja lietas ir kārtībā un iepriekš saplānotas.' },
  { trait: 'emotionalStability', key: -1, text: 'Es mēdzu uztraukties par sīkumiem.' },
  { trait: 'openness', key: 1, text: 'Man patīk izmēģināt jaunus ēdienus un idejas.' },
  { trait: 'extraversion', key: 1, text: 'Kompānijā es jūtos kā zivs ūdenī.' },
  { trait: 'agreeableness', key: 1, text: 'Man rūp, kā jūtas cilvēki man apkārt.' },
  { trait: 'conscientiousness', key: -1, text: 'Man mēdz pietrūkt plāna, un es daru, kā sanāk.' },
  { trait: 'emotionalStability', key: 1, text: 'Stresa brīžos es parasti saglabāju mieru.' },
  { trait: 'openness', key: -1, text: 'Man labāk patīk ierastais nekā jaunais.' },
  { trait: 'extraversion', key: -1, text: 'Man labāk patīk palikt fonā, nevis uzmanības centrā.' },
  { trait: 'agreeableness', key: -1, text: 'Citu cilvēku problēmas mani īpaši neinteresē.' },
  { trait: 'conscientiousness', key: 1, text: 'Uzdevumus es parasti izdaru uzreiz, nevis atlieku.' },
  { trait: 'emotionalStability', key: -1, text: 'Mans garastāvoklis bieži mainās.' },
  { trait: 'openness', key: 1, text: 'Man ir bagāta iztēle.' },
  { trait: 'extraversion', key: 1, text: 'Es viegli uzsāku sarunu ar nepazīstamiem cilvēkiem.' },
  { trait: 'agreeableness', key: 1, text: 'Pat strīdā es cenšos atrast kopīgu valodu.' },
  { trait: 'conscientiousness', key: -1, text: 'Es bieži aizmirstu nolikt lietas atpakaļ vietā.' },
  { trait: 'emotionalStability', key: 1, text: 'Pēc sliktas dienas es ātri atgūstos.' },
  { trait: 'openness', key: -1, text: 'Abstraktas idejas mani maz interesē.' },
  { trait: 'extraversion', key: -1, text: 'Pēc ilga laika starp cilvēkiem man vajag pabūt vienatnē.' },
  { trait: 'agreeableness', key: -1, text: 'Man ir grūti izrādīt līdzjūtību.' },
];

export const LIKERT_LABELS = ['Pilnīgi nepiekrītu', 'Drīzāk nepiekrītu', 'Neitrāli', 'Drīzāk piekrītu', 'Pilnīgi piekrītu'];

export const TRAITS: Trait[] = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'emotionalStability'];

export const TRAIT_LABEL: Record<Trait, string> = {
  openness: 'Atvērtība',
  conscientiousness: 'Apzinīgums',
  extraversion: 'Ekstraversija',
  agreeableness: 'Labvēlība',
  emotionalStability: 'Emocionālā stabilitāte',
};

export const TRAIT_LABEL_SHORT: Record<Trait, string> = { ...TRAIT_LABEL, emotionalStability: 'Emoc. stabilitāte' };

/** Level label; "Atvērtība/Labvēlība/…stabilitāte" are feminine, "Apzinīgums" masculine. */
export function levelLabel(trait: Trait, level: TraitLevel): string {
  const masc = trait === 'conscientiousness';
  if (level === 'low') return masc ? 'Zems' : 'Zema';
  if (level === 'high') return masc ? 'Augsts' : 'Augsta';
  return masc ? 'Vidējs' : 'Vidēja';
}

export const LOW_MAX = 2.6;
export const HIGH_MIN = 3.4;

export function levelOf(score: number): TraitLevel {
  if (score < LOW_MAX) return 'low';
  if (score > HIGH_MIN) return 'high';
  return 'medium';
}

export function validateAnswers(answers: unknown): answers is number[] {
  return (
    Array.isArray(answers) &&
    answers.length === PERSONALITY_ITEMS.length &&
    answers.every((a) => Number.isInteger(a) && a >= 1 && a <= 5)
  );
}

/** Mean 1..5 per trait (reverse keys applied), rounded to 2 decimals. */
export function scoreAnswers(answers: number[]): Record<Trait, number> {
  if (!validateAnswers(answers)) throw new Error('answers must be 20 integers 1..5');
  const acc = Object.fromEntries(TRAITS.map((t) => [t, [] as number[]])) as Record<Trait, number[]>;
  PERSONALITY_ITEMS.forEach((item, i) => acc[item.trait].push(item.key === 1 ? answers[i] : 6 - answers[i]));
  return Object.fromEntries(
    TRAITS.map((t) => [t, Math.round((acc[t].reduce((a, b) => a + b, 0) / acc[t].length) * 100) / 100]),
  ) as Record<Trait, number>;
}

export function levelsFromScores(scores: Record<Trait, number>): PersonalityLevels {
  return Object.fromEntries(TRAITS.map((t) => [t, levelOf(scores[t])])) as PersonalityLevels;
}

/** Position of the score on a 0..100 bar (1 → 0 %, 5 → 100 %). */
export function scorePercent(score: number): number {
  return Math.round(((score - 1) / 4) * 100);
}

/**
 * Tone the engine writes in, from the personality levels.
 * Conscientiousness high → plan & numbers; openness high → novelty;
 * low emotional stability (without the two above) → gentle; otherwise neutral.
 * Low emotional stability always softens the delivery (see toneModifiers).
 */
export function selectTone(levels: PersonalityLevels | null): ToneStyle {
  if (!levels) return 'neutral';
  if (levels.conscientiousness === 'high') return 'plan';
  if (levels.openness === 'high') return 'novelty';
  if (levels.emotionalStability === 'low') return 'gentle';
  return 'neutral';
}

export interface ToneModifiers {
  /** No pressure, never frame a hard day as failure, fewer reminders. */
  softer: boolean;
  /** Social framing is welcome ("ar draugu"). */
  social: boolean;
  /** Warm, caring wording. */
  warm: boolean;
}

export function toneModifiers(levels: PersonalityLevels | null): ToneModifiers {
  return {
    softer: levels?.emotionalStability === 'low',
    social: levels?.extraversion === 'high',
    warm: levels?.agreeableness === 'high',
  };
}

export function effectiveTone(preference: 'auto' | ToneStyle, levels: PersonalityLevels | null): ToneStyle {
  return preference === 'auto' ? selectTone(levels) : preference;
}

type Gendered = { f: string; m: string; x: string };

const PRIMARY: Record<'plan' | 'novelty' | 'social' | 'care' | 'balance', Gendered> = {
  plan: { f: 'Plānotāja', m: 'Plānotājs', x: 'Plānotāja stils' },
  novelty: { f: 'Atklājēja', m: 'Atklājējs', x: 'Atklājēja stils' },
  social: { f: 'Enerģijas avots', m: 'Enerģijas avots', x: 'Enerģijas avots' },
  care: { f: 'Rūpju nesēja', m: 'Rūpju nesējs', x: 'Rūpju stils' },
  balance: { f: 'Līdzsvara meklētāja', m: 'Līdzsvara meklētājs', x: 'Līdzsvara stils' },
};

/** "Plānotāja ar maigu pieeju" etc. */
export function styleName(levels: PersonalityLevels, sex: Sex): string {
  const key =
    levels.conscientiousness === 'high'
      ? 'plan'
      : levels.openness === 'high'
        ? 'novelty'
        : levels.extraversion === 'high'
          ? 'social'
          : levels.agreeableness === 'high'
            ? 'care'
            : 'balance';
  const noun = PRIMARY[key][sex];
  const modifier =
    levels.emotionalStability === 'low'
      ? 'ar maigu pieeju'
      : levels.emotionalStability === 'high'
        ? 'ar mierīgu pieeju'
        : key !== 'novelty' && levels.openness === 'high'
          ? 'ar zinātkāri'
          : 'savā ritmā';
  return `${noun} ${modifier}`;
}

/** "Tā mēs tev palīdzēsim" paragraph on the result screen. */
export function styleDescription(levels: PersonalityLevels): string {
  const tone = selectTone(levels);
  const mod = toneModifiers(levels);
  const parts: string[] = [];
  if (tone === 'plan') parts.push('Tev patīk skaidrs plāns, tāpēc ieteikumi būs konkrēti — ar skaitļiem un vienu nākamo soli.');
  else if (tone === 'novelty') parts.push('Tev patīk jaunais, tāpēc ieteikumi nāks ar idejām — jaunām receptēm, maršrutiem un mazām pārmaiņām.');
  else if (tone === 'gentle') parts.push('Ieteikumi būs mierīgi un bez spiediena — viens mazs solis, kad tev der.');
  else parts.push('Ieteikumi būs īsi un lietišķi — tikai tas, kas noder šodien.');
  if (mod.softer) parts.push('Atgādinājumu būs maz un bez spiediena, un grūtāka diena nekad netiks izcelta kā neveiksme.');
  else if (mod.social) parts.push('Ja gribēsi, ieteiksim arī kopīgas aktivitātes ar draugiem.');
  else if (mod.warm) parts.push('Runāsim draudzīgi un ar sapratni.');
  return parts.join(' ');
}

/** Retest allowed 6 months after the test. */
export function retestFrom(testedAt: Date): Date {
  const d = new Date(testedAt);
  d.setMonth(d.getMonth() + 6);
  return d;
}

/** Answers that reproduce the CLAUDE.md sample user (C high, O medium, E low, A high, ES low). */
export const SAMPLE_ANSWERS: number[] = [5, 4, 4, 2, 5, 1, 2, 3, 4, 1, 4, 4, 3, 2, 4, 2, 2, 3, 4, 2];
