import type { MealType, Progress, Sex, SleepWindow, ToneStyle, WeeklyQuestionOption } from '../../../shared/api';
import type { ToneModifiers } from '../../../shared/personality';

/** Everything the tone engine may talk about for one user-day. Numbers only; no free text from the user. */
export interface ToneInput {
  date: string;
  firstName: string;
  sex: Sex;
  tone: ToneStyle;
  modifiers: ToneModifiers;
  nutrition: {
    kcal: Progress;
    proteinG: Progress;
    carbsG: Progress;
    fatG: Progress;
    fibreG: Progress;
    waterMl: Progress;
  };
  mealsLogged: MealType[];
  steps: Progress;
  sleep: { totalMin: number; targetMin: number; bedtime: string; window: SleepWindow | null } | null;
  /** Last 7 days ending at `date`. */
  week: { avgKcal: number; avgProteinG: number; avgSteps: number | null; nightsInWindow: number | null } | null;
  /** Local "HH:MM" when the copy is generated (push copy only). */
  localTime?: string;
}

export interface TrendsInput {
  tone: ToneStyle;
  modifiers: ToneModifiers;
  firstName: string;
  days: { date: string; kcal: number; proteinG: number }[];
  avgKcal: number;
  avgProteinG: number;
  targetKcal: number;
  targetProteinG: number;
}

export type TipAngle = 'protein' | 'water' | 'steps' | 'fibre' | 'sleep' | 'overall';

export interface TipResult {
  body: string;
  highlight: string | null;
  angle: TipAngle | null;
}

export interface WeeklyQuestionResult {
  question: string;
  options: WeeklyQuestionOption[];
}

export type PushKind = 'sleep' | 'water' | 'food';

export interface PushCopy {
  title: string;
  body: string;
}
