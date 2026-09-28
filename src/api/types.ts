export type HealthSource = 'apple_health' | 'health_connect';

export type TraitLevel = 'low' | 'medium' | 'high';

export interface PersonalityProfile {
  openness: TraitLevel;
  conscientiousness: TraitLevel;
  extraversion: TraitLevel;
  agreeableness: TraitLevel;
  emotionalStability: TraitLevel;
}

/** Tone styles the tip engine can deliver in. */
export type ToneStyle = 'plan' | 'novelty' | 'gentle' | 'neutral';

export interface User {
  id: string;
  firstName: string;
  age: number;
  heightCm: number;
  weightKg: number;
  goalWeightKg: number;
  personality: PersonalityProfile;
  tone: ToneStyle;
}

export interface Progress {
  value: number;
  target: number;
}

export interface DayNutrition {
  kcal: Progress;
  proteinG: Progress;
  carbsG: Progress;
  fatG: Progress;
  fibreG: Progress;
  waterMl: Progress;
}

export interface DayMovement {
  steps: Progress;
  activeKcal: number;
  restingHr: number;
  hrvMs: number;
  source: HealthSource;
}

export interface DaySleep {
  totalMin: number;
  deepMin: number;
  remMin: number;
  lightMin: number;
  /** "HH:MM" local time */
  bedtime: string;
  wakeTime: string;
  /** 0..100 */
  score: number;
  windowStart: string;
  windowEnd: string;
  source: HealthSource;
}

export interface Tip {
  id: string;
  tone: ToneStyle;
  body: string;
  /** Short fragment inside `body` to emphasise (e.g. "42 g"). */
  highlight?: string;
}

export interface WeeklyQuestionOption {
  label: string;
  /** Tone-adapted reply shown after the user picks this option. */
  reply: string;
}

export interface WeeklyQuestion {
  id: string;
  question: string;
  options: WeeklyQuestionOption[];
}

export interface Today {
  date: string;
  nutrition: DayNutrition;
  movement: DayMovement;
  sleep: DaySleep;
  tip: Tip;
  weeklyQuestion: WeeklyQuestion | null;
  lastWeightKg: number;
}
