import { eq } from 'drizzle-orm';

import type { CreateMealRequest, MealType, Nutrients, Profile } from '../../shared/api';
import { addDays, hmToMin, lastNDates, minToHm, mondayOf } from '../../shared/dates';
import { levelsFromScores, retestFrom, SAMPLE_ANSWERS, scoreAnswers, styleDescription, styleName } from '../../shared/personality';
import { computeTargets } from '../../shared/targets';
import { findingQuestion } from './ai/question-templates';
import type { Db } from './db/client';
import { healthDays, magicLinks, meals, personalities, sleepNights, tips, users, waterDays, weeklyQuestions, weights, workouts } from './db/schema';
import { weekdayOf, zonedTime } from './lib/time';
import { insertItems } from './services/meals';
import { DEFAULT_REMINDERS } from './services/users';

/**
 * Sample users.
 *
 * Ilze (CLAUDE.md): 34, with 28 days of history before `today` plus today's
 * exact sample day. The history is shaped so the pattern analysis has something
 * real to find (see README "Seed data"):
 * - protein below 85 % of target on 4 evenings of the last 14 days (light pasta dinners),
 * - weekends ~ +18 % energy vs weekdays,
 * - breakfast not logged on 2 of the last 14 days,
 * - 3 short nights (< 7 h), each followed by a day with clearly fewer steps,
 * - bedtime in the 23:00–23:30 window on 3 of the last 7 nights,
 * - water target reached on 5 of the last 7 days, steps up ~11 % week on week,
 * - last week's weekly question answered, a few accepted / dismissed tips.
 *
 * Marta (care@piemers.lv): free plan, eats well under the safety floor on the
 * last 7 days, so care mode (low_intake) switches on.
 *
 * Re-running resets both users (delete + insert), so it is idempotent.
 */

export const ILZE_EMAIL = 'ilze@piemers.lv';
export const CARE_EMAIL = 'care@piemers.lv';
export const SEED_TZ = 'Europe/Riga';
/** Days of history before today. */
export const HISTORY_DAYS = 28;

const n = (kcal: number, proteinG: number, carbsG: number, fatG: number, fibreG: number): Nutrients => ({ kcal, proteinG, carbsG, fatG, fibreG });
type Item = CreateMealRequest['items'][number];
const item = (name: string, grams: number, per100g: Nutrients, portionLabel: string | null = null): Item => ({ name, grams, per100g, portionLabel });
type SeedMeal = { type: MealType; time: string; items: Item[] };

export const ILZE_PROFILE: Profile = {
  firstName: 'Ilze',
  age: 34,
  heightCm: 168,
  weightKg: 71,
  sex: 'f',
  activity: 'light',
  goals: ['weight', 'routine'],
  weightDirection: 'down',
  goalWeightKg: 66,
};

/** Today: 420 + 514 + 546 = 1 480 kcal; protein 68 g, carbs 160 g, fat 52 g, fibre 18 g. */
export const TODAY_MEALS: { type: MealType; time: string; source: CreateMealRequest['source']; items: Item[] }[] = [
  {
    type: 'breakfast',
    time: '08:10',
    source: 'text',
    items: [item('Auzu putra ar ogām', 300, n(120, 1.7, 20.7, 2, 2.7), '1 porcija'), item('Kafija ar pienu', 200, n(30, 0.7, 2.4, 1.5, 0), '1 tase')],
  },
  {
    type: 'lunch',
    time: '13:05',
    source: 'photo',
    items: [
      item('Vistas krūtiņa', 150, n(165, 30.7, 0, 3.6, 0)),
      item('Rīsi, vārīti', 120, n(130, 2.7, 28, 0.3, 0.4)),
      item('Salāti', 80, n(18, 1.2, 3, 0.2, 1.5)),
      item('Mērce', 30, n(320, 1, 6, 33, 0)),
    ],
  },
  {
    type: 'snack',
    time: '16:20',
    source: 'manual',
    items: [
      item('Jogurts ar granolu', 150, n(150, 2.8, 18, 6, 1.6), '1 trauciņš'),
      item('Banāns', 120, n(90, 1.1, 22.8, 0.3, 2.6), '1 gab.'),
      item('Rieksti', 30, n(710, 18, 3, 59, 9), '1 sauja'),
    ],
  },
];

/** Rotating Latvian menus for earlier days (~24 % of energy from protein), scaled to the day's energy. */
const MENUS: SeedMeal[][] = [
  [
    { type: 'breakfast', time: '07:50', items: [item('Baltmaizes grauzdiņš ar sieru', 100, n(280, 13, 30, 12, 1.5)), item('Olas, vārītas', 60, n(156, 12.6, 1.1, 10.6, 0)), item('Tēja', 250, n(1, 0, 0.2, 0, 0))] },
    {
      type: 'lunch',
      time: '12:40',
      items: [
        item('Griķi, vārīti', 200, n(92, 3.4, 20, 0.6, 2.7)),
        item('Vistas fileja', 80, n(165, 31, 0, 3.6, 0)),
        item('Gurķu salāti', 150, n(30, 1, 4, 1.2, 0.8)),
        item('Salātu mērce ar eļļu', 20, n(450, 0.5, 5, 48, 0)),
      ],
    },
    { type: 'snack', time: '16:00', items: [item('Jogurts ar ogām', 150, n(80, 3.5, 11, 2.5, 1)), item('Banāns', 120, n(89, 1.1, 22.8, 0.3, 2.6))] },
    { type: 'dinner', time: '19:10', items: [item('Lasis, cepts', 100, n(206, 22, 0, 13, 0)), item('Kartupeļi, vārīti', 200, n(87, 1.9, 20, 0.1, 1.8)), item('Salāti', 100, n(18, 1.2, 3, 0.2, 1.5))] },
  ],
  [
    { type: 'breakfast', time: '08:00', items: [item('Olas, vārītas', 100, n(156, 12.6, 1.1, 10.6, 0), '2 gab.'), item('Rupjmaize', 70, n(229, 6.1, 44, 1.4, 7.5), '2 šķēles'), item('Tomāts', 100, n(18, 0.9, 3.9, 0.2, 1.2))] },
    { type: 'lunch', time: '13:00', items: [item('Liellopa gaļas sautējums', 250, n(120, 11, 6, 6, 1.2)), item('Rīsi, vārīti', 150, n(130, 2.7, 28, 0.3, 0.4)), item('Burkānu salāti', 100, n(41, 0.9, 10, 0.2, 2.8))] },
    { type: 'snack', time: '15:45', items: [item('Jogurts, dabīgs', 150, n(66, 4.2, 5.5, 3, 0)), item('Banāns', 120, n(89, 1.1, 22.8, 0.3, 2.6))] },
    {
      type: 'dinner',
      time: '19:00',
      items: [
        item('Tītara fileja', 90, n(135, 29, 0, 1.7, 0)),
        item('Griķi, vārīti', 150, n(92, 3.4, 20, 0.6, 2.7)),
        item('Cepti dārzeņi ar eļļu', 160, n(115, 1.5, 8, 8.5, 2.5)),
      ],
    },
  ],
  [
    { type: 'breakfast', time: '07:40', items: [item('Auzu putra ar ogām', 250, n(120, 1.7, 20.7, 2, 2.7)), item('Biezpiens, 5 %', 120, n(121, 17, 1.8, 5, 0))] },
    { type: 'lunch', time: '12:30', items: [item('Vistas zupa', 350, n(45, 4.5, 4, 1.2, 0.6)), item('Baltmaize', 90, n(265, 8, 49, 3.2, 2.7))] },
    { type: 'snack', time: '16:10', items: [item('Kefīrs', 250, n(52, 3.3, 4.5, 2.5, 0)), item('Ābols', 150, n(52, 0.3, 14, 0.2, 2.4))] },
    { type: 'dinner', time: '19:20', items: [item('Omlete ar dārzeņiem', 220, n(140, 9.5, 3, 10, 1)), item('Mencas fileja', 80, n(82, 18, 0, 0.7, 0)), item('Kartupeļi, vārīti', 150, n(87, 1.9, 20, 0.1, 1.8))] },
  ],
];

/** A light, low-protein dinner (the "evening protein gap" pattern). */
const LIGHT_DINNER: SeedMeal = {
  type: 'dinner',
  time: '19:30',
  items: [item('Pilngraudu makaroni ar tomātu mērci', 300, n(130, 4, 24, 2.5, 3)), item('Salāti', 100, n(18, 1.2, 3, 0.2, 1.5))],
};

/** Index (0 = 28 days ago, 27 = yesterday) → pattern. */
/** Preferred light-dinner days; moved to a neighbouring weekday so the weekend energy bump never hides the gap. */
const LIGHT_DINNER_CANDIDATES = [16, 19, 22, 25];
const NO_BREAKFAST_DAYS = new Set([17, 23]);
const SHORT_NIGHTS = new Set([8, 19, 24]);

// The last 14 days (index 15..28) keep the values the app's tests and prototype screens use.
const STEPS_OLD = [8420, 7910, 9230, 8150, 7640, 8880, 9310, 7760, 5100, 8230, 9020, 7480, 8660, 7900, 6800];
const STEPS_RECENT = [8120, 6900, 7400, 9050, 5200, 7700, 8600, 7820, 9140, 5600, 8310, 7050, 10220, 6430];
const RESTING_HR = [62, 63, 61, 62, 64, 62, 63, 63, 62, 62, 60, 61, 62, 61];
const HRV = [40, 39, 42, 41, 38, 40, 41, 38, 41, 40, 44, 39, 43, 42];
const BEDTIMES_OLD = ['23:35', '23:50', '23:20', '23:45', '00:05', '23:30', '23:55', '23:40', '00:15', '23:25', '23:50', '23:35', '23:45', '00:00', '23:40'];
const BEDTIMES_RECENT = ['23:30', '23:50', '23:20', '00:10', '23:45', '23:35', '23:58', '23:12', '23:28', '00:05', '23:25', '23:55', '00:20', '23:48'];
/** Water: ~2,0–2,2 l in earlier weeks, the target (2,3 l) on 5 of the last 7 days, today 1,2 l. */
const WATER_OLD = [2100, 1950, 2200, 2050, 2000, 2150, 1900, 2250, 2000, 2100, 1950, 2200, 2050, 2100, 2000, 2150, 1900, 2250, 2050, 2100, 2000];
const WATER_LAST7 = [2350, 2400, 2100, 2300, 2500, 2050, 2300];

function mealKcal(m: SeedMeal): number {
  return m.items.reduce((a, i) => a + (i.per100g.kcal * i.grams) / 100, 0);
}

function scaled(dayMeals: SeedMeal[], targetKcal: number): SeedMeal[] {
  const f = targetKcal / dayMeals.reduce((a, m) => a + mealKcal(m), 0);
  return dayMeals.map((m) => ({ ...m, items: m.items.map((i) => ({ ...i, grams: Math.max(5, Math.round((i.grams * f) / 5) * 5) })) }));
}

/** Indices of the 4 light-dinner days for a history ending the day before `today`: always weekdays. */
export function lightDinnerDays(today: string): Set<number> {
  const dates = lastNDates(today, HISTORY_DAYS + 1);
  const out = new Set<number>();
  for (const c of LIGHT_DINNER_CANDIDATES) {
    const pick = [c, c - 1, c + 1, c - 2].find((i) => i < HISTORY_DAYS && weekdayOf(dates[i]!) < 5 && !NO_BREAKFAST_DAYS.has(i) && !out.has(i));
    if (pick !== undefined) out.add(pick);
  }
  return out;
}

/** Meals of history day `i` (0..27) on `date`. */
export function historyMeals(i: number, date: string, lightDinners: Set<number>): SeedMeal[] {
  const weekend = weekdayOf(date) >= 5;
  let dayMeals = MENUS[i % MENUS.length]!.map((m) => ({ ...m }));
  if (lightDinners.has(i)) dayMeals = dayMeals.map((m) => (m.type === 'dinner' ? LIGHT_DINNER : m));
  if (NO_BREAKFAST_DAYS.has(i)) dayMeals = dayMeals.filter((m) => m.type !== 'breakfast');
  const base = 1700 + (((i * 37) % 7) - 3) * 15;
  return scaled(dayMeals, weekend ? Math.round(base * 1.19) : base);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function resetUser(db: Db, email: string) {
  await db.delete(users).where(eq(users.email, email));
  await db.delete(magicLinks).where(eq(magicLinks.email, email));
}

async function insertMeals(db: Db, userId: string, date: string, dayMeals: (SeedMeal & { source?: CreateMealRequest['source'] })[], source: CreateMealRequest['source']) {
  for (const m of dayMeals) {
    const [row] = await db
      .insert(meals)
      .values({ userId, date, type: m.type, eatenAt: zonedTime(date, m.time, SEED_TZ), source: m.source ?? source })
      .returning({ id: meals.id });
    await insertItems(db, row!.id, m.items);
  }
}

/** Most recent date before `today` that falls on `weekday` (0 = Monday). */
function lastWeekday(today: string, weekday: number): string {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, -i);
    if (weekdayOf(d) === weekday) return d;
  }
  return addDays(today, -7);
}

export async function seedIlze(db: Db, today: string, now: Date = new Date()): Promise<string> {
  await resetUser(db, ILZE_EMAIL);

  const scores = scoreAnswers(SAMPLE_ANSWERS);
  const levels = levelsFromScores(scores);
  const [user] = await db
    .insert(users)
    .values({
      email: ILZE_EMAIL,
      profile: ILZE_PROFILE,
      targets: computeTargets(ILZE_PROFILE),
      reminders: { ...DEFAULT_REMINDERS, frequency: 'mid', sleepLeadMin: 45 },
      devices: { source: 'health_connect', connected: true, devices: ['Apple Watch', 'Polar H10'], lastSyncAt: now.toISOString() },
      onboardingDone: true,
      timezone: SEED_TZ,
      createdAt: zonedTime(addDays(today, -HISTORY_DAYS - 2), '19:30', SEED_TZ),
    })
    .returning({ id: users.id });
  const userId = user!.id;

  const testedAt = zonedTime(addDays(today, -HISTORY_DAYS - 2), '19:45', SEED_TZ);
  await db.insert(personalities).values({
    userId,
    answers: SAMPLE_ANSWERS,
    scores,
    levels,
    styleName: styleName(levels, ILZE_PROFILE.sex),
    styleDescription: styleDescription(levels),
    testedAt,
    retestFrom: isoDate(retestFrom(testedAt)),
  });

  // 28 history days + today.
  const dates = lastNDates(today, HISTORY_DAYS + 1);

  const lightDinners = lightDinnerDays(today);
  for (const [i, date] of dates.entries()) {
    if (date === today) await insertMeals(db, userId, date, TODAY_MEALS, 'manual');
    else await insertMeals(db, userId, date, historyMeals(i, date, lightDinners), i % 2 ? 'photo' : 'text');
  }

  const water = [...WATER_OLD, ...WATER_LAST7, 1200];
  await db.insert(waterDays).values(dates.map((date, i) => ({ userId, date, ml: water[i]! })));

  const steps = [...STEPS_OLD, ...STEPS_RECENT];
  await db.insert(healthDays).values(
    dates.map((date, i) => ({
      userId,
      date,
      steps: steps[i]!,
      activeKcal: date === today ? 310 : Math.round(steps[i]! * 0.042),
      restingHr: RESTING_HR[(i + 13) % 14]!,
      hrvMs: HRV[(i + 13) % 14]!,
      source: 'health_connect',
    })),
  );

  const bedtimes = [...BEDTIMES_OLD, ...BEDTIMES_RECENT];
  await db.insert(sleepNights).values(
    dates.map((date, i) => {
      if (date === today) {
        return { userId, date, bedtime: '23:48', wakeTime: '06:45', totalMin: 400, deepMin: 65, remMin: 80, lightMin: 255, awakeMin: 17, source: 'health_connect' };
      }
      // Ordinary nights 7 h 10 min – 7 h 25 min; the three short ones 6 h.
      const totalMin = SHORT_NIGHTS.has(i) ? 360 : 430 + (i % 4) * 5;
      const awakeMin = 12 + (i % 4) * 3;
      const bedtime = bedtimes[i]!;
      const deepMin = Math.round(totalMin * 0.17);
      const remMin = Math.round(totalMin * 0.22);
      return {
        userId,
        date,
        bedtime,
        wakeTime: minToHm(hmToMin(bedtime) + totalMin + awakeMin),
        totalMin,
        deepMin,
        remMin,
        lightMin: totalMin - deepMin - remMin,
        awakeMin,
        source: 'health_connect',
      };
    }),
  );

  const friday = lastWeekday(today, 4);
  const thursday = lastWeekday(today, 3);
  await db.insert(workouts).values([
    {
      userId,
      externalId: `seed-nordic-${today}`,
      type: 'nordic_walk',
      name: 'Nūjošana',
      startedAt: zonedTime(today, '09:30', SEED_TZ),
      durationMin: 42,
      kcal: 265,
      avgHr: 112,
      zones: { minutes: [9, 21, 10, 2, 0] },
      device: 'Polar H10',
      source: 'health_connect',
    },
    {
      userId,
      externalId: `seed-yoga-${friday}`,
      type: 'yoga',
      name: 'Joga',
      startedAt: zonedTime(friday, '18:30', SEED_TZ),
      durationMin: 30,
      kcal: 95,
      avgHr: 88,
      zones: null,
      device: 'Apple Watch',
      source: 'health_connect',
    },
    {
      userId,
      externalId: `seed-walk-${thursday}`,
      type: 'walk',
      name: 'Pastaiga',
      startedAt: zonedTime(thursday, '17:40', SEED_TZ),
      durationMin: 55,
      kcal: 190,
      avgHr: 98,
      zones: null,
      device: 'Apple Watch',
      source: 'health_connect',
    },
  ]);

  const weighIns: [number, number][] = [
    [-27, 72.2],
    [-20, 72],
    [-13, 71.8],
    [-10, 71.6],
    [-7, 71.4],
    [-3, 71.2],
    [0, 71],
  ];
  await db.insert(weights).values(weighIns.map(([d, kg]) => ({ userId, date: addDays(today, d), kg })));

  // Memory: last week's weekly question, answered.
  const lastWeek = mondayOf(addDays(today, -7));
  const lastWeekFinding = {
    kind: 'bedtime_in_window' as const,
    polarity: 'opportunity' as const,
    fact: '2 no 7 naktīm gulētiešana bija miega logā (23:00–23:30).',
    strength: 0.47,
    data: { inWindow: 2, of: 7, start: '23:00', end: '23:30' },
  };
  const lastQ = findingQuestion(lastWeekFinding, { tone: 'plan', care: false, preferences: { diet: 'any', avoid: [] } });
  await db.insert(weeklyQuestions).values({
    userId,
    week: lastWeek,
    tone: 'plan',
    question: lastQ.question,
    options: lastQ.options,
    answerIndex: 1,
    answeredAt: zonedTime(addDays(lastWeek, 5), '10:15', SEED_TZ),
    basedOn: lastWeekFinding.fact,
    basedOnKind: lastWeekFinding.kind,
    aiGenerated: false,
  });

  // Memory: a protein tip accepted, a steps tip dismissed ("Cits ieteikums") and the water tip after it accepted.
  await db.insert(tips).values([
    {
      userId,
      date: addDays(today, -4),
      tone: 'plan',
      angle: 'protein',
      body: 'Šodien trūkst 30 g olbaltumvielu. Plāns: biezpiens vai jogurts vakariņās (+18 g) un sauja riekstu uzkodām (+6 g).',
      highlight: '30 g',
      accepted: true,
      createdAt: zonedTime(addDays(today, -4), '05:00', SEED_TZ),
    },
    {
      userId,
      date: addDays(today, -2),
      tone: 'plan',
      angle: 'steps',
      body: 'Līdz 8 000 soļiem trūkst 3 100. Plāns: 20 minūšu pastaiga pēc pusdienām — tas ir ap 2 000 soļu.',
      highlight: '3 100',
      dismissed: true,
      createdAt: zonedTime(addDays(today, -2), '05:00', SEED_TZ),
    },
    {
      userId,
      date: addDays(today, -2),
      tone: 'plan',
      angle: 'water',
      body: 'Ūdens: 0,8 no 2,3 l. Plāns: glāze tagad un pa glāzei pēc katras maltītes — tā pietrūkstošie 1,5 l sanāks līdz vakaram.',
      highlight: '1,5 l',
      accepted: true,
      createdAt: zonedTime(addDays(today, -2), '09:40', SEED_TZ),
    },
  ]);

  return userId;
}

// ---------------------------------------------------------------- care-mode sample user

export const MARTA_PROFILE: Profile = {
  firstName: 'Marta',
  age: 27,
  heightCm: 166,
  weightKg: 57,
  sex: 'f',
  activity: 'light',
  goals: ['health', 'routine'],
  weightDirection: null,
  goalWeightKg: null,
};

/** ~650–780 kcal on each of the last 7 days (2 meals): well under 70 % of the 1 200 kcal floor. */
const MARTA_MEALS: SeedMeal[] = [
  { type: 'breakfast', time: '09:30', items: [item('Jogurts, dabīgs', 150, n(66, 4.2, 5.5, 3, 0)), item('Ābols', 150, n(52, 0.3, 14, 0.2, 2.4))] },
  { type: 'dinner', time: '19:00', items: [item('Dārzeņu zupa', 400, n(40, 1.5, 6, 1, 1.5)), item('Rupjmaize', 60, n(229, 6.1, 44, 1.4, 7.5))] },
];

export async function seedMarta(db: Db, today: string, now: Date = new Date()): Promise<string> {
  await resetUser(db, CARE_EMAIL);
  const [user] = await db
    .insert(users)
    .values({
      email: CARE_EMAIL,
      profile: MARTA_PROFILE,
      targets: computeTargets(MARTA_PROFILE),
      reminders: DEFAULT_REMINDERS,
      devices: { source: 'health_connect', connected: true, devices: ['Telefons'], lastSyncAt: now.toISOString() },
      onboardingDone: true,
      timezone: SEED_TZ,
      createdAt: zonedTime(addDays(today, -10), '20:00', SEED_TZ),
    })
    .returning({ id: users.id });
  const userId = user!.id;
  const dates = lastNDates(today, 8);
  for (const [i, date] of dates.entries()) {
    const dayMeals = date === today ? MARTA_MEALS.slice(0, 1) : scaled(MARTA_MEALS, 650 + (i % 3) * 60);
    await insertMeals(db, userId, date, dayMeals, 'text');
  }
  await db.insert(waterDays).values(dates.map((date, i) => ({ userId, date, ml: 1400 + (i % 3) * 200 })));
  await db.insert(healthDays).values(
    dates.map((date, i) => ({ userId, date, steps: 5200 + (i % 4) * 700, activeKcal: 180, restingHr: 64, hrvMs: 38, source: 'health_connect' })),
  );
  await db.insert(sleepNights).values(
    dates.map((date, i) => ({
      userId,
      date,
      bedtime: ['00:10', '23:50', '00:30', '23:40'][i % 4]!,
      wakeTime: '07:15',
      totalMin: 390 + (i % 3) * 15,
      deepMin: 60,
      remMin: 80,
      lightMin: 250 + (i % 3) * 15,
      awakeMin: 20,
      source: 'health_connect',
    })),
  );
  return userId;
}
