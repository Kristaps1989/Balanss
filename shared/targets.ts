import type { ActivityLevel, Profile, Sex, Targets } from './api';
import { KCAL_FLOOR, weightLossAllowed } from './safety';

/**
 * Daily targets from the onboarding basics (prototype: Onb-Goals).
 * General guidance for healthy adults, not medical advice.
 *
 * - Energy: Mifflin-St Jeor BMR × activity factor (TDEE); a gentle ~11 % deficit
 *   to lose weight, ~10 % surplus to gain; rounded to 50 kcal.
 * - Protein: 1,55 g/kg when losing weight (keeps muscle in a deficit), else 1,3 g/kg.
 * - Fat: 30 % of energy. Carbs: the remainder. Fibre: 14 g per 1 000 kcal.
 * - Water: EFSA adequate intake (women 2,0 l, men 2,5 l from all sources) + activity.
 * - Steps: 8 000 (benefit plateaus around there for adults). Sleep: 7 h 30 min.
 */

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = { sit: 1.2, light: 1.375, active: 1.55, very: 1.725 };
const WATER_BASE_ML: Record<Sex, number> = { f: 2000, m: 2500, x: 2250 };
const WATER_ACTIVITY_ML: Record<ActivityLevel, number> = { sit: 0, light: 300, active: 500, very: 700 };

const roundTo = (x: number, step: number) => Math.round(x / step) * step;

export function bmr(p: Pick<Profile, 'weightKg' | 'heightCm' | 'age' | 'sex'>): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  const sexTerm = p.sex === 'm' ? 5 : p.sex === 'f' ? -161 : -78;
  return base + sexTerm;
}

export function maintenanceKcal(p: Pick<Profile, 'weightKg' | 'heightCm' | 'age' | 'sex' | 'activity'>): number {
  return bmr(p) * ACTIVITY_FACTOR[p.activity];
}

function losing(p: Pick<Profile, 'goals' | 'weightDirection' | 'goalWeightKg' | 'weightKg' | 'age' | 'heightCm'>) {
  return (
    p.goals.includes('weight') && p.weightDirection === 'down' && (p.goalWeightKg ?? p.weightKg) < p.weightKg && weightLossAllowed(p)
  );
}
function gaining(p: Pick<Profile, 'goals' | 'weightDirection' | 'goalWeightKg' | 'weightKg' | 'age' | 'heightCm'>) {
  return p.goals.includes('weight') && p.weightDirection === 'up' && (p.goalWeightKg ?? p.weightKg) > p.weightKg;
}

export function computeTargets(p: Profile): Targets {
  const tdee = maintenanceKcal(p);
  // Never below the safety floor, whatever the formula says.
  const kcal = Math.max(KCAL_FLOOR[p.sex], roundTo(losing(p) ? tdee * 0.89 : gaining(p) ? tdee * 1.1 : tdee, 50));
  const proteinG = roundTo(p.weightKg * (losing(p) ? 1.55 : 1.3), 5);
  const fatG = roundTo((kcal * 0.3) / 9, 5);
  // Floor so the macro energy never exceeds the kcal target.
  const carbsG = Math.max(0, Math.floor((kcal - proteinG * 4 - fatG * 9) / 4 / 5) * 5);
  const fibreG = Math.round((kcal / 1000) * 14);
  const waterMl = WATER_BASE_ML[p.sex] + WATER_ACTIVITY_ML[p.activity];
  return { kcal, proteinG, carbsG, fatG, fibreG, waterMl, steps: 8000, sleepMin: 450 };
}

/** Source lines shown under each target (Latvian). */
export function targetSources(p: Profile) {
  const tdee = roundTo(maintenanceKcal(p), 10);
  const n = String(tdee).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const kcal = losing(p)
    ? `Mifflin-St Jeor formula: ~${n} kcal svara uzturēšanai, mīnus maigs deficīts`
    : gaining(p)
      ? `Mifflin-St Jeor formula: ~${n} kcal svara uzturēšanai, plus neliels pārpalikums`
      : `Mifflin-St Jeor formula: ~${n} kcal svara uzturēšanai`;
  const water =
    p.sex === 'm'
      ? 'EFSA: vīriešiem ~2,5 l dienā no visiem avotiem; + aktivitātei'
      : p.sex === 'f'
        ? 'EFSA: sievietēm ~2,0 l dienā no visiem avotiem; + aktivitātei'
        : 'EFSA: pieaugušajiem 2,0–2,5 l dienā no visiem avotiem; + aktivitātei';
  return {
    kcal,
    water,
    steps: 'PVO: 150–300 min kustību nedēļā; pētījumi — ieguvums līdz ~8 000 soļiem',
    sleep: 'Pieaugušajiem ieteicamas 7–9 stundas miega',
    protein: losing(p) ? '1,5–1,6 g uz kg ķermeņa svara, lai deficītā saglabātu muskuļus' : '1,2–1,4 g uz kg ķermeņa svara',
  };
}

/** Weeks to reach the goal weight at 0,35 kg/week (prototype copy: 0,25–0,5 kg nedēļā). */
export function weeksToGoal(weightKg: number, goalKg: number): number {
  return Math.round(Math.abs(weightKg - goalKg) / 0.35);
}
