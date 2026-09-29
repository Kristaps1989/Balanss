import type { SleepNight, SleepWindow } from './api';
import { hmToMin, minToHm } from './dates';

/**
 * Bedtime as minutes on an evening-anchored axis (18:00 = 0), so that
 * 23:48 and 00:20 compare correctly.
 */
export function eveningMinutes(hm: string): number {
  return (hmToMin(hm) - 18 * 60 + 1440) % 1440;
}

export function fromEveningMinutes(m: number): string {
  return minToHm(m + 18 * 60);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Sleep window: a 30-minute slot starting at the median bedtime of up to the
 * last 14 nights minus 30 min, floored to the half hour. Nudges bedtime a
 * little earlier than the current habit. Needs at least 3 nights.
 */
export function computeSleepWindow(bedtimes: string[]): SleepWindow | null {
  const recent = bedtimes.slice(-14);
  if (recent.length < 3) return null;
  const med = median(recent.map(eveningMinutes));
  const start = Math.floor((med - 30) / 30) * 30;
  return { start: fromEveningMinutes(start), end: fromEveningMinutes(start + 30), basedOnNights: recent.length };
}

/**
 * Sleep score 0..100 (habit-level indicator, not a medical measure):
 * - duration vs target, up to 50 points (convex, so short nights cost more)
 * - deep + REM share of sleep vs 45 %, up to 30 points
 * - bedtime within 15 min of the window middle, up to 20 points (−1 per 3 min beyond)
 * - minus 1 point per 5 min awake after the first 15 min
 */
export function sleepScore(
  night: Pick<SleepNight, 'totalMin' | 'deepMin' | 'remMin' | 'awakeMin' | 'bedtime'>,
  targetMin: number,
  window: SleepWindow | null,
): number {
  if (night.totalMin <= 0) return 0;
  const duration = 50 * Math.min(1, night.totalMin / targetMin) ** 1.5;
  const stages = 30 * Math.min(1, (night.deepMin + night.remMin) / night.totalMin / 0.45);
  let regularity = 20;
  if (window) {
    const mid = eveningMinutes(window.start) + 15;
    const dev = Math.max(0, Math.abs(eveningMinutes(night.bedtime) - mid) - 15);
    regularity = Math.max(0, 20 - dev / 3);
  }
  const awake = Math.max(0, night.awakeMin - 15) / 5;
  return Math.max(0, Math.min(100, Math.round(duration + stages + regularity - awake)));
}
