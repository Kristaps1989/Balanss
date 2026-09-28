import { eq } from 'drizzle-orm';

import type { CreateMealRequest, MealType, Nutrients, Profile } from '../../shared/api';
import { addDays, hmToMin, lastNDates } from '../../shared/dates';
import { levelsFromScores, retestFrom, SAMPLE_ANSWERS, scoreAnswers, styleDescription, styleName } from '../../shared/personality';
import { computeTargets } from '../../shared/targets';
import type { Db } from './db/client';
import { healthDays, magicLinks, meals, personalities, sleepNights, users, waterDays, weights, workouts } from './db/schema';
import { weekdayOf, zonedTime } from './lib/time';
import { insertItems } from './services/meals';
import { DEFAULT_REMINDERS } from './services/users';

/**
 * The sample user from CLAUDE.md: Ilze, 34, with 14 days of history ending
 * `today`. Re-running resets her (delete + insert), so it is idempotent.
 */

export const ILZE_EMAIL = 'ilze@piemers.lv';
export const SEED_TZ = 'Europe/Riga';

const n = (kcal: number, proteinG: number, carbsG: number, fatG: number, fibreG: number): Nutrients => ({ kcal, proteinG, carbsG, fatG, fibreG });
type Item = CreateMealRequest['items'][number];
const item = (name: string, grams: number, per100g: Nutrients, portionLabel: string | null = null): Item => ({ name, grams, per100g, portionLabel });

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

/** Earlier days: rotating Latvian menus, scaled towards the Food-Trends kcal. */
const MENUS: { type: MealType; time: string; items: Item[] }[][] = [
  [
    { type: 'breakfast', time: '07:50', items: [item('Rupjmaize ar sieru', 90, n(265, 13, 30, 10, 5)), item('Tēja', 250, n(1, 0, 0.2, 0, 0))] },
    { type: 'lunch', time: '12:40', items: [item('Griķi, vārīti', 200, n(92, 3.4, 20, 0.6, 2.7)), item('Vistas fileja', 150, n(165, 31, 0, 3.6, 0)), item('Gurķu salāti', 120, n(30, 1, 4, 1.2, 0.8))] },
    { type: 'snack', time: '16:00', items: [item('Biezpiens ar ogām', 200, n(95, 11, 7, 2.5, 1.2))] },
    { type: 'dinner', time: '19:10', items: [item('Dārzeņu zupa', 350, n(40, 1.5, 6, 1, 1.5)), item('Rupjmaize', 35, n(229, 6.1, 44, 1.4, 7.5))] },
  ],
  [
    { type: 'breakfast', time: '08:00', items: [item('Olas, vārītas', 100, n(156, 12.6, 1.1, 10.6, 0), '2 gab.'), item('Rupjmaize', 70, n(229, 6.1, 44, 1.4, 7.5), '2 šķēles')] },
    { type: 'lunch', time: '13:00', items: [item('Lasis, cepts', 130, n(206, 22, 0, 13, 0)), item('Kartupeļi, vārīti', 200, n(87, 1.9, 20, 0.1, 1.8)), item('Salāti', 100, n(18, 1.2, 3, 0.2, 1.5))] },
    { type: 'snack', time: '15:45', items: [item('Ābols', 180, n(52, 0.3, 14, 0.2, 2.4)), item('Jogurts, dabīgs', 150, n(66, 4.2, 5.5, 3, 0))] },
    { type: 'dinner', time: '19:00', items: [item('Pilngraudu makaroni ar tomātu mērci', 300, n(130, 5, 22, 2.5, 3))] },
  ],
  [
    { type: 'breakfast', time: '07:40', items: [item('Auzu putra ar ogām', 300, n(120, 1.7, 20.7, 2, 2.7)), item('Kafija ar pienu', 200, n(30, 0.7, 2.4, 1.5, 0))] },
    { type: 'lunch', time: '12:30', items: [item('Liellopa gaļas sautējums', 250, n(120, 11, 6, 6, 1.2)), item('Rīsi, vārīti', 150, n(130, 2.7, 28, 0.3, 0.4))] },
    { type: 'snack', time: '16:10', items: [item('Rieksti', 30, n(607, 20, 13, 54, 7)), item('Banāns', 120, n(89, 1.1, 22.8, 0.3, 2.6))] },
    { type: 'dinner', time: '19:20', items: [item('Omlete ar dārzeņiem', 220, n(140, 9.5, 3, 10, 1))] },
  ],
];

/** Kcal and protein per day for the 6 days before today (prototype Food-Trends), older days around them. */
const TREND_KCAL = [1720, 1680, 1790, 1650, 1740, 1700, 1810, 1690, 1820, 1710, 1640, 1905, 1760];

const STEPS = [8120, 6900, 7400, 9050, 5200, 7700, 8600, 7820, 9140, 5600, 8310, 7050, 10220, 6430];
const RESTING_HR = [62, 63, 61, 62, 64, 62, 63, 63, 62, 62, 60, 61, 62, 61];
const HRV = [40, 39, 42, 41, 38, 40, 41, 38, 41, 40, 44, 39, 43, 42];
const BEDTIMES = ['23:30', '23:50', '23:20', '00:10', '23:45', '23:35', '23:58', '23:12', '23:40', '00:05', '23:25', '23:55', '00:20', '23:48'];
const WAKE = ['06:55', '07:05', '06:50', '07:15', '07:00', '06:45', '07:10', '06:50', '07:00', '07:05', '06:55', '07:10', '07:20', '06:45'];
const WATER = [2100, 1900, 2300, 1700, 2000, 2250, 1850, 2050, 1950, 2200, 1600, 2400, 1900, 1200];

function mealTotalsKcal(items: Item[]): number {
  return items.reduce((a, i) => a + (i.per100g.kcal * i.grams) / 100, 0);
}

function scaledMenu(menu: (typeof MENUS)[number], targetKcal: number) {
  const total = menu.reduce((a, m) => a + mealTotalsKcal(m.items), 0);
  const f = targetKcal / total;
  return menu.map((m) => ({ ...m, items: m.items.map((i) => ({ ...i, grams: Math.round((i.grams * f) / 5) * 5 })) }));
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
  await db.delete(users).where(eq(users.email, ILZE_EMAIL));
  await db.delete(magicLinks).where(eq(magicLinks.email, ILZE_EMAIL));

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
      createdAt: zonedTime(addDays(today, -20), '19:30', SEED_TZ),
    })
    .returning({ id: users.id });
  const userId = user!.id;

  const testedAt = zonedTime(addDays(today, -20), '19:45', SEED_TZ);
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

  const dates = lastNDates(today, 14);

  // Meals
  for (const [i, date] of dates.entries()) {
    const dayMeals =
      date === today
        ? TODAY_MEALS
        : scaledMenu(MENUS[i % MENUS.length]!, TREND_KCAL[i]!).map((m) => ({ ...m, source: (i % 2 ? 'photo' : 'text') as CreateMealRequest['source'] }));
    for (const m of dayMeals) {
      const [row] = await db
        .insert(meals)
        .values({ userId, date, type: m.type, eatenAt: zonedTime(date, m.time, SEED_TZ), source: m.source })
        .returning({ id: meals.id });
      await insertItems(db, row!.id, m.items);
    }
  }

  await db.insert(waterDays).values(dates.map((date, i) => ({ userId, date, ml: WATER[i]! })));

  await db.insert(healthDays).values(
    dates.map((date, i) => ({
      userId,
      date,
      steps: STEPS[i]!,
      activeKcal: date === today ? 310 : Math.round(STEPS[i]! * 0.042),
      restingHr: RESTING_HR[i]!,
      hrvMs: HRV[i]!,
      source: 'health_connect',
    })),
  );

  await db.insert(sleepNights).values(
    dates.map((date, i) => {
      if (date === today) {
        return { userId, date, bedtime: '23:48', wakeTime: '06:45', totalMin: 400, deepMin: 65, remMin: 80, lightMin: 255, awakeMin: 17, source: 'health_connect' };
      }
      const inBed = (hmToMin(WAKE[i]!) - hmToMin(BEDTIMES[i]!) + 1440) % 1440;
      const awakeMin = 12 + (i % 4) * 4;
      const totalMin = inBed - awakeMin;
      const deepMin = Math.round(totalMin * 0.17);
      const remMin = Math.round(totalMin * 0.22);
      return { userId, date, bedtime: BEDTIMES[i]!, wakeTime: WAKE[i]!, totalMin, deepMin, remMin, lightMin: totalMin - deepMin - remMin, awakeMin, source: 'health_connect' };
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
    [-13, 71.8],
    [-10, 71.6],
    [-7, 71.4],
    [-3, 71.2],
    [0, 71],
  ];
  await db.insert(weights).values(weighIns.map(([d, kg]) => ({ userId, date: addDays(today, d), kg })));

  return userId;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
