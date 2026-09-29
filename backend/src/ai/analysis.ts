import type { Finding, FindingKind, MealType, Nutrients, SleepWindow, Targets } from '../../../shared/api';
import { addDays, lastNDates } from '../../../shared/dates';
import { eveningMinutes, fromEveningMinutes } from '../../../shared/sleep';
import { fmtDuration, fmtInt, fmtLitres } from '../lib/format';
import { weekdayOf } from '../lib/time';

/**
 * Deterministic pattern analysis over the last 28 complete days.
 *
 * The AI never "finds" anything on its own: this module mines the numbers and
 * returns factual findings with the real figures in Latvian number format. The
 * AI (or the templates) only phrase questions, summaries and tips around them.
 *
 * Rules:
 * - Every finding has a minimum-data guard; with too little data it is skipped,
 *   never guessed.
 * - Positive findings (what works) are included next to opportunities.
 * - Wording is factual and neutral ("nebija ierakstītas", not "izlaidi").
 * - Care mode drops every finding whose natural suggestion is "eat less"
 *   (e.g. higher weekend energy) and anything that pushes more tracking.
 */

export interface AnalysisDay {
  date: string;
  /** Number of meals logged. */
  mealsLogged: number;
  mealTypes: MealType[];
  totals: Nutrients;
  /** Protein per meal slot (g) for the slots that were logged. */
  proteinBySlot: Partial<Record<MealType, number>>;
  /** null when nothing was logged. */
  waterMl: number | null;
  /** null without device / manual data. */
  steps: number | null;
}

export interface AnalysisNight {
  /** Wake-up date. */
  date: string;
  bedtime: string;
  totalMin: number;
}

export interface AnalysisInput {
  /** Last complete day (inclusive); the 28-day window ends here. */
  end: string;
  days: AnalysisDay[];
  nights: AnalysisNight[];
  targets: Targets;
  window: SleepWindow | null;
  care: boolean;
}

/** Numbers behind a finding, used by the templates (never shown raw). */
export type FindingData = Record<string, number | string | null>;

export interface AnalysisFinding extends Finding {
  data: FindingData;
}

/** Public shape (drops the template data). */
export function publicFinding(f: AnalysisFinding): Finding {
  return { kind: f.kind, polarity: f.polarity, fact: f.fact, strength: f.strength };
}

export const MIN_LOGGED_DAYS = 5;
/** A day counts as "logged" for nutrition findings with at least this many meals. */
export const LOGGED_MEALS = 2;

/** Latvian meal slot words after "no" (plural → dative). */
export const SLOT_FROM: Record<MealType, string> = { breakfast: 'brokastīm', lunch: 'pusdienām', snack: 'uzkodām', dinner: 'vakariņām' };
/** Locative: "vakariņās". */
export const SLOT_IN_WORD: Record<MealType, string> = { breakfast: 'brokastīs', lunch: 'pusdienās', snack: 'uzkodās', dinner: 'vakariņās' };

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round2 = (x: number) => Math.round(x * 100) / 100;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const pct = (x: number) => fmtInt(Math.round(Math.abs(x) * 100));

function f(kind: FindingKind, polarity: Finding['polarity'], fact: string, strength: number, data: FindingData = {}): AnalysisFinding {
  return { kind, polarity, fact, strength: round2(clamp01(strength)), data };
}

/** Days (by date) inside [from, to], only those with data. */
function inRange<T extends { date: string }>(list: T[], from: string, to: string): T[] {
  return list.filter((d) => d.date >= from && d.date <= to);
}

// ---------------------------------------------------------------- individual findings

function proteinGap(logged: AnalysisDay[], t: Targets): AnalysisFinding | null {
  if (logged.length < MIN_LOGGED_DAYS || t.proteinG <= 0) return null;
  const low = logged.filter((d) => d.totals.proteinG < t.proteinG * 0.85);
  if (low.length < 3) return null;
  // Which main meal the gap comes from: the slot that drops most on the low days
  // compared with the other days (needs the slot on ≥ 2 days of each group).
  // Without enough other days: the slot that contributes least overall.
  const slots: MealType[] = ['breakfast', 'lunch', 'dinner'];
  const other = logged.filter((d) => !low.includes(d));
  const values = (days: AnalysisDay[], slot: MealType) => days.map((d) => d.proteinBySlot[slot]).filter((v): v is number => v != null);
  let least: { slot: MealType; avg: number; other: number | null } | null = null;
  let bestDrop = 0;
  for (const slot of slots) {
    const l = values(low, slot);
    const o = values(other, slot);
    if (l.length < 2 || o.length < 2) continue;
    const drop = avg(o) - avg(l);
    if (drop > bestDrop) {
      bestDrop = drop;
      least = { slot, avg: avg(l), other: avg(o) };
    }
  }
  if (!least) {
    for (const slot of slots) {
      const v = values(logged, slot);
      if (v.length < 3) continue;
      if (!least || avg(v) < least.avg) least = { slot, avg: avg(v), other: null };
    }
  }
  const slotPart = !least
    ? ''
    : least.other != null
      ? `; šajās dienās ${SLOT_IN_WORD[least.slot]} vidēji ${fmtInt(least.avg)} g, citās dienās ${fmtInt(least.other)} g`
      : `; vismazāk olbaltumvielu nāk no ${SLOT_FROM[least.slot]} (vidēji ${fmtInt(least.avg)} g)`;
  return f(
    'protein_gap',
    'opportunity',
    `${low.length} no ${logged.length} dienām olbaltumvielas bija zem 85 % no mērķa (${fmtInt(t.proteinG)} g)${slotPart}.`,
    0.3 + low.length / logged.length,
    {
      low: low.length,
      of: logged.length,
      avg: Math.round(avg(logged.map((d) => d.totals.proteinG))),
      slot: least?.slot ?? null,
      slotAvg: least ? Math.round(least.avg) : null,
      slotOther: least?.other != null ? Math.round(least.other) : null,
    },
  );
}

function fibreLow(logged: AnalysisDay[], t: Targets): AnalysisFinding | null {
  if (logged.length < MIN_LOGGED_DAYS || t.fibreG <= 0) return null;
  const low = logged.filter((d) => d.totals.fibreG < t.fibreG * 0.8);
  if (low.length < Math.ceil(logged.length / 2)) return null;
  const a = avg(logged.map((d) => d.totals.fibreG));
  return f(
    'fibre_low',
    'opportunity',
    `${low.length} no ${logged.length} dienām šķiedrvielas bija zem 80 % no mērķa (vidēji ${fmtInt(a)} g no ${fmtInt(t.fibreG)} g).`,
    0.2 + (low.length / logged.length) * 0.6,
    { low: low.length, of: logged.length, avg: Math.round(a) },
  );
}

function waterLow(days: AnalysisDay[], t: Targets): AnalysisFinding | null {
  const withWater = days.filter((d) => d.waterMl != null && d.waterMl > 0);
  if (withWater.length < MIN_LOGGED_DAYS || t.waterMl <= 0) return null;
  const low = withWater.filter((d) => d.waterMl! < t.waterMl * 0.8);
  if (low.length < 3 || low.length / withWater.length < 0.3) return null;
  const a = avg(withWater.map((d) => d.waterMl!));
  return f(
    'water_low',
    'opportunity',
    `${low.length} no ${withWater.length} dienām ūdens bija zem 80 % no mērķa (vidēji ${fmtLitres(a)} no ${fmtLitres(t.waterMl)}).`,
    0.2 + (low.length / withWater.length) * 0.6,
    { low: low.length, of: withWater.length, avgMl: Math.round(a) },
  );
}

function weekendShift(logged: AnalysisDay[], care: boolean): AnalysisFinding | null {
  const weekend = logged.filter((d) => weekdayOf(d.date) >= 5);
  const weekdays = logged.filter((d) => weekdayOf(d.date) < 5);
  if (weekend.length < 3 || weekdays.length < 6) return null;
  const we = avg(weekend.map((d) => d.totals.kcal));
  const wd = avg(weekdays.map((d) => d.totals.kcal));
  if (wd <= 0) return null;
  const diff = (we - wd) / wd;
  if (Math.abs(diff) < 0.15) return null;
  // Care mode: a higher weekend intake would invite "eat less" — never shown.
  if (care && diff > 0) return null;
  return f(
    'weekend_shift',
    'opportunity',
    `Brīvdienās vidēji ${fmtInt(we)} kcal, darba dienās ${fmtInt(wd)} kcal (${diff > 0 ? '+' : '−'}${pct(diff)} %).`,
    0.2 + Math.abs(diff) * 1.5,
    { weekendKcal: Math.round(we), weekdayKcal: Math.round(wd), diffPct: Math.round(diff * 100) },
  );
}

function breakfastSkipped(logged: AnalysisDay[]): AnalysisFinding | null {
  if (logged.length < MIN_LOGGED_DAYS) return null;
  const without = logged.filter((d) => !d.mealTypes.includes('breakfast'));
  if (without.length < 2) return null;
  return f(
    'breakfast_skipped',
    'opportunity',
    `${without.length} no ${logged.length} dienām brokastis nebija ierakstītas.`,
    0.2 + without.length / logged.length,
    { days: without.length, of: logged.length },
  );
}

function shortSleepLowSteps(days: AnalysisDay[], nights: AnalysisNight[], t: Targets): AnalysisFinding | null {
  const threshold = t.sleepMin - 30;
  const stepsBy = new Map(days.filter((d) => d.steps != null).map((d) => [d.date, d.steps!]));
  const shortDates = new Set(nights.filter((n) => n.totalMin < threshold).map((n) => n.date));
  const after = [...shortDates].filter((d) => stepsBy.has(d)).map((d) => stepsBy.get(d)!);
  const others = [...stepsBy.entries()].filter(([d]) => !shortDates.has(d)).map(([, s]) => s);
  if (after.length < 3 || others.length < MIN_LOGGED_DAYS) return null;
  const a = avg(after);
  const o = avg(others);
  if (o <= 0) return null;
  const diff = (o - a) / o;
  if (diff < 0.15) return null;
  return f(
    'short_sleep_low_steps',
    'opportunity',
    `Pēc ${after.length} naktīm, kad miegs bija īsāks par ${fmtDuration(threshold)}, nākamajā dienā bija vidēji ${fmtInt(a)} soļu — par ${pct(diff)} % mazāk nekā citās dienās (${fmtInt(o)}).`,
    0.3 + diff,
    { nights: after.length, stepsAfter: Math.round(a), stepsOther: Math.round(o), diffPct: Math.round(diff * 100) },
  );
}

function bedtimeFindings(nights: AnalysisNight[], window: SleepWindow | null, end: string): AnalysisFinding[] {
  const out: AnalysisFinding[] = [];
  const last14 = inRange(nights, addDays(end, -13), end);
  if (last14.length >= 7) {
    const mins = last14.map((n) => eveningMinutes(n.bedtime));
    const mean = avg(mins);
    const sd = Math.sqrt(avg(mins.map((m) => (m - mean) ** 2)));
    if (sd >= 45) {
      out.push(
        f(
          'bedtime_irregular',
          'opportunity',
          `Pēdējās ${last14.length} naktīs gulētiešanas laiks svārstījās no ${fromEveningMinutes(Math.min(...mins))} līdz ${fromEveningMinutes(Math.max(...mins))} (vidēji ±${fmtInt(sd)} min).`,
          Math.min(0.9, sd / 90),
          { sdMin: Math.round(sd), nights: last14.length },
        ),
      );
    }
  }
  if (window) {
    const last7 = inRange(nights, addDays(end, -6), end);
    if (last7.length >= 4) {
      const s = eveningMinutes(window.start);
      const e = eveningMinutes(window.end);
      const inW = last7.filter((n) => {
        const b = eveningMinutes(n.bedtime);
        return b >= s && b <= e;
      }).length;
      const positive = inW / last7.length >= 0.5;
      out.push(
        f(
          'bedtime_in_window',
          positive ? 'positive' : 'opportunity',
          `${inW} no ${last7.length} naktīm gulētiešana bija miega logā (${window.start}–${window.end}).`,
          positive ? 0.3 + (inW / last7.length) * 0.6 : 0.25 + (1 - inW / last7.length) * 0.3,
          { inWindow: inW, of: last7.length, start: window.start, end: window.end },
        ),
      );
    }
  }
  return out;
}

function stepsTrend(days: AnalysisDay[], end: string): AnalysisFinding | null {
  const thisWeek = inRange(days, addDays(end, -6), end).filter((d) => d.steps != null);
  const prevWeek = inRange(days, addDays(end, -13), addDays(end, -7)).filter((d) => d.steps != null);
  if (thisWeek.length < MIN_LOGGED_DAYS || prevWeek.length < MIN_LOGGED_DAYS) return null;
  const a = avg(thisWeek.map((d) => d.steps!));
  const b = avg(prevWeek.map((d) => d.steps!));
  if (b <= 0) return null;
  const diff = (a - b) / b;
  if (Math.abs(diff) < 0.1) return null;
  const up = diff > 0;
  return f(
    'steps_trend',
    up ? 'positive' : 'opportunity',
    `Pēdējās 7 dienās vidēji ${fmtInt(a)} soļu dienā — par ${pct(diff)} % ${up ? 'vairāk' : 'mazāk'} nekā iepriekšējās 7 dienās (${fmtInt(b)}).`,
    0.3 + Math.abs(diff) * 2,
    { avg: Math.round(a), prevAvg: Math.round(b), diffPct: Math.round(diff * 100) },
  );
}

function loggingGaps(last14: AnalysisDay[], dates14: string[]): AnalysisFinding | null {
  const byDate = new Map(last14.map((d) => [d.date, d]));
  const anyLogged = last14.filter((d) => d.mealsLogged > 0).length;
  if (anyLogged < 3) return null; // not using food logging: nothing to say
  const gaps = dates14.filter((d) => (byDate.get(d)?.mealsLogged ?? 0) < LOGGED_MEALS).length;
  if (gaps < 3) return null;
  return f(
    'logging_gaps',
    'opportunity',
    `${gaps} no ${dates14.length} dienām bija ierakstītas mazāk nekā 2 maltītes, tāpēc šo dienu skaitļi ir nepilnīgi.`,
    0.15 + (gaps / dates14.length) * 0.5,
    { gaps, of: dates14.length },
  );
}

/** What already works: targets reached on most of the last 7 days (at least 5 of ≥ 5 days with data). */
function consistency(days7: AnalysisDay[], nights7: AnalysisNight[], t: Targets): AnalysisFinding[] {
  const logged = days7.filter((d) => d.mealsLogged >= LOGGED_MEALS);
  const withWater = days7.filter((d) => d.waterMl != null && d.waterMl > 0);
  const withSteps = days7.filter((d) => d.steps != null);
  const candidates: { metric: string; hits: number; of: number; text: string }[] = [
    { metric: 'water', hits: withWater.filter((d) => d.waterMl! >= t.waterMl).length, of: withWater.length, text: 'Ūdens mērķis' },
    { metric: 'steps', hits: withSteps.filter((d) => d.steps! >= t.steps).length, of: withSteps.length, text: 'Soļu mērķis' },
    { metric: 'protein', hits: logged.filter((d) => d.totals.proteinG >= t.proteinG).length, of: logged.length, text: 'Olbaltumvielu mērķis' },
    { metric: 'fibre', hits: logged.filter((d) => d.totals.fibreG >= t.fibreG).length, of: logged.length, text: 'Šķiedrvielu mērķis' },
    { metric: 'sleep', hits: nights7.filter((n) => n.totalMin >= t.sleepMin).length, of: nights7.length, text: 'Miega mērķis' },
  ];
  return candidates
    .filter((c) => c.of >= MIN_LOGGED_DAYS && c.hits >= 5)
    .sort((a, b) => b.hits / b.of - a.hits / a.of)
    .slice(0, 2)
    .map((c) =>
      f('consistency', 'positive', `${c.text} sasniegts ${c.hits} no ${c.of} ${c.metric === 'sleep' ? 'naktīm' : 'dienām'}.`, 0.3 + (c.hits / c.of) * 0.5, {
        metric: c.metric,
        hits: c.hits,
        of: c.of,
      }),
    );
}

// ---------------------------------------------------------------- entry

/** Kinds never shown in care mode (they invite "eat less" or more tracking pressure). */
const CARE_DROPPED: FindingKind[] = ['logging_gaps'];

/** All findings for the 28 days ending `input.end`, strongest first. */
export function analyze(input: AnalysisInput): AnalysisFinding[] {
  const { end, targets: t } = input;
  const from = addDays(end, -27);
  const days = inRange(input.days, from, end);
  const nights = inRange(input.nights, from, end);
  const dates14 = lastNDates(end, 14);
  const last14 = inRange(days, dates14[0]!, end);
  const logged14 = last14.filter((d) => d.mealsLogged >= LOGGED_MEALS);
  const logged28 = days.filter((d) => d.mealsLogged >= LOGGED_MEALS);
  const days7 = inRange(days, addDays(end, -6), end);
  const nights7 = inRange(nights, addDays(end, -6), end);

  const all = [
    proteinGap(logged14, t),
    fibreLow(logged14, t),
    waterLow(last14, t),
    weekendShift(logged28, input.care),
    breakfastSkipped(logged14),
    shortSleepLowSteps(days, nights, t),
    ...bedtimeFindings(nights, input.window, end),
    stepsTrend(days, end),
    loggingGaps(last14, dates14),
    ...consistency(days7, nights7, t),
  ].filter((x): x is AnalysisFinding => x !== null);

  const kept = input.care ? all.filter((x) => !CARE_DROPPED.includes(x.kind)) : all;
  // Stable order: strength, then positives first on ties, then kind.
  return kept.sort((a, b) => b.strength - a.strength || (a.polarity === 'positive' ? -1 : 1) - (b.polarity === 'positive' ? -1 : 1) || a.kind.localeCompare(b.kind));
}

/** Averages for the summary period (the 7 days ending `end`). */
export function periodStats(input: AnalysisInput) {
  const days7 = inRange(input.days, addDays(input.end, -6), input.end);
  const logged = days7.filter((d) => d.mealsLogged >= LOGGED_MEALS);
  const steps = days7.filter((d) => d.steps != null).map((d) => d.steps!);
  const nights = inRange(input.nights, addDays(input.end, -6), input.end);
  return {
    avgKcal: Math.round(avg(logged.map((d) => d.totals.kcal))),
    avgProteinG: Math.round(avg(logged.map((d) => d.totals.proteinG))),
    avgSteps: steps.length ? Math.round(avg(steps)) : null,
    avgSleepMin: nights.length ? Math.round(avg(nights.map((n) => n.totalMin))) : null,
    daysLogged: logged.length,
  };
}

