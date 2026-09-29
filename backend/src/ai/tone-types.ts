import type { FindingKind, FoodPreferences, MealType, Progress, Sex, SleepWindow, ToneStyle, WeeklyQuestionOption } from '../../../shared/api';
import type { ToneModifiers } from '../../../shared/personality';
import type { AnalysisFinding } from './analysis';

/**
 * What the app remembers about how earlier copy landed, so the next tip,
 * question or summary can adapt. Only our own short labels and counts; no free
 * text from the user.
 */
export interface ToneHistory {
  /** Last 4 weekly questions (newest first) and the option label the user picked, if any. */
  weeklyAnswers: { week: string; topic: FindingKind | null; question: string; answer: string | null }[];
  /** Tip outcomes of the last 14 days per angle. */
  tipFeedback: { angle: TipAngle; accepted: number; dismissed: number; reported: number }[];
}

export const EMPTY_HISTORY: ToneHistory = { weeklyAnswers: [], tipFeedback: [] };

/**
 * Everything the tone engine may talk about for one user-day. Numbers and short
 * labels only: no name, no e-mail, no personality scores (tone + modifiers
 * only), sex only for grammar.
 */
export interface ToneInput {
  date: string;
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
  /** Care mode: no deficit or weight-loss content, focus on regular meals and rest. */
  care: boolean;
  /** Strongest findings of the last 28 days (at most 5). */
  findings: AnalysisFinding[];
  history: ToneHistory;
  preferences: FoodPreferences;
  /** Angles not to use today (reported tips). */
  avoidAngles?: TipAngle[];
}

export interface TrendsInput {
  tone: ToneStyle;
  modifiers: ToneModifiers;
  sex: Sex;
  care: boolean;
  preferences: FoodPreferences;
  days: { date: string; kcal: number; proteinG: number }[];
  avgKcal: number;
  avgProteinG: number;
  targetKcal: number;
  targetProteinG: number;
}

/** 'meals' (regular meals) is used in care mode only. */
export type TipAngle = 'protein' | 'water' | 'steps' | 'fibre' | 'sleep' | 'meals' | 'overall';
export const TIP_ANGLES: TipAngle[] = ['protein', 'water', 'steps', 'fibre', 'sleep', 'meals', 'overall'];

export interface TipResult {
  body: string;
  highlight: string | null;
  angle: TipAngle | null;
  /** True only for Claude output that passed every check. */
  aiGenerated: boolean;
}

export interface WeeklyQuestionResult {
  question: string;
  options: WeeklyQuestionOption[];
  /** Fact of the finding the question is based on. */
  basedOn: string | null;
  basedOnKind: FindingKind | null;
  aiGenerated: boolean;
}

export type PushKind = 'sleep' | 'water' | 'food';

export interface PushCopy {
  title: string;
  body: string;
}
