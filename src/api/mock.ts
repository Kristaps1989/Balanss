/**
 * In-memory implementation of the API with the CLAUDE.md sample user.
 * Enabled with EXPO_PUBLIC_USE_MOCK=1 (or when no EXPO_PUBLIC_API_URL is set),
 * so screens work without the backend. Mirrors backend behaviour closely
 * enough for UI work; the backend is the source of truth.
 */
import type {
  LeisureItem,
  LeisureRequest,
  LeisureResponse,
  TipFocus,
  AnalyzeMealResponse,
  AuthTokens,
  CreateMealRequest,
  Day,
  FoodItemDraft,
  Favourite,
  Me,
  Meal,
  MealType,
  Nutrients,
  Profile,
  Recipe,
  SleepNight,
  Tip,
  ToneStyle,
  WeeklyQuestion,
  WeeklySummary,
  Workout,
} from '@shared/api';
import { PANTRY_FRESH_DAYS } from '@shared/api';
import { addDays, lastNDates, mondayOf, parseISODate, toISODate } from '@shared/dates';
import { itemsTotals, mealTypeForTime, scale } from '@shared/nutrition';
import {
  SAMPLE_ANSWERS,
  effectiveTone,
  levelsFromScores,
  retestFrom,
  scoreAnswers,
  styleDescription,
  styleName,
  validateAnswers,
} from '@shared/personality';
import { genreLabel } from '@shared/leisure';
import { computeSleepWindow, sleepScore } from '@shared/sleep';
import { computeTargets } from '@shared/targets';

import { ApiError, type Api } from './api';
import { tokenStore } from './http';

const delay = (ms = 150) => new Promise((r) => setTimeout(r, ms));
let seq = 0;
const id = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

const N = (kcal: number, proteinG: number, carbsG: number, fatG: number, fibreG: number): Nutrients => ({
  kcal,
  proteinG,
  carbsG,
  fatG,
  fibreG,
});

type StoredMeal = Omit<Meal, 'totals' | 'items'> & { items: CreateMealRequest['items'] };

interface State {
  me: Me;
  meals: StoredMeal[];
  water: Record<string, number>;
  weights: { date: string; kg: number }[];
  days: Record<string, { steps: number; activeKcal: number; restingHr: number | null; hrvMs: number | null }>;
  nights: Omit<SleepNight, 'score'>[];
  workouts: Workout[];
  favourites: Favourite[];
  tips: Tip[];
  questions: WeeklyQuestion[];
  analysesByDate: Record<string, number>;
  pantry: { items: string[]; updatedAt: string | null };
}

const today = () => toISODate(new Date());
const at = (date: string, hm: string) => {
  const d = parseISODate(date);
  const [h, m] = hm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const ILZE_PROFILE: Profile = {
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

function personalityFrom(answers: number[], sex: Profile['sex']): NonNullable<Me['personality']> {
  const scores = scoreAnswers(answers);
  const levels = levelsFromScores(scores);
  const now = new Date();
  return {
    consent: true,
    scores,
    levels,
    styleName: styleName(levels, sex),
    styleDescription: styleDescription(levels),
    testedAt: now.toISOString(),
    retestFrom: retestFrom(now).toISOString(),
  };
}

function newMe(email: string, seeded: boolean): Me {
  const profile: Profile = seeded
    ? ILZE_PROFILE
    : { firstName: '', age: 30, heightCm: 170, weightKg: 70, sex: 'x', activity: 'light', goals: [], weightDirection: null, goalWeightKg: null };
  const personality = seeded ? personalityFrom(SAMPLE_ANSWERS, 'f') : null;
  return {
    id: id('user'),
    email,
    profile,
    targets: computeTargets(profile),
    personality,
    tonePreference: 'auto',
    tone: effectiveTone('auto', personality?.levels ?? null),
    reminders: { water: true, food: true, move: false, sleepWindow: true, frequency: 'low', sleepLeadMin: 45 },
    devices: seeded
      ? { source: 'health_connect', connected: true, devices: ['Apple Watch', 'Polar H10'], lastSyncAt: new Date().toISOString() }
      : { source: null, connected: false, devices: [], lastSyncAt: null },
    plan: 'free',
    onboardingDone: seeded,
    leisureCity: seeded ? 'Rīga' : null,
    createdAt: new Date().toISOString(),
    preferences: { diet: 'any', avoid: [] },
    aiPersonalization: true,
    care: { active: false, reasons: [] },
  };
}

const FOODS = {
  oats: { name: 'Auzu putra ar ogām', per100g: N(118, 3.6, 19.5, 2.4, 2.6) },
  coffee: { name: 'Kafija ar pienu', per100g: N(40, 2, 3.2, 2, 0) },
  chicken: { name: 'Vistas krūtiņa', per100g: N(165, 30.7, 0, 3.6, 0) },
  rice: { name: 'Rīsi, vārīti', per100g: N(130, 2.7, 28, 0.3, 0.4) },
  salad: { name: 'Salāti', per100g: N(18, 1.2, 3, 0.2, 1.5) },
  sauce: { name: 'Mērce', per100g: N(320, 1, 6, 33, 0) },
  yoghurt: { name: 'Jogurts ar granolu', per100g: N(160, 5, 20, 6, 2) },
  banana: { name: 'Banāns', per100g: N(89, 1.1, 22.8, 0.3, 2.6) },
  nuts: { name: 'Rieksti', per100g: N(620, 15, 13, 55, 7) },
};

type F = keyof typeof FOODS;
const item = (f: F, grams: number) => ({ name: FOODS[f].name, grams, per100g: FOODS[f].per100g, portionLabel: null });

function seed(): State {
  const me = newMe('ilze@piemers.lv', true);
  const t = today();
  const dates = lastNDates(t, 14);
  const meals: StoredMeal[] = [];
  const water: Record<string, number> = {};
  const days: State['days'] = {};
  const nights: State['nights'] = [];
  const steps7 = [7820, 9140, 5600, 8310, 7050, 10220, 6430];
  const hr7 = [63, 62, 62, 60, 61, 62, 61];
  const hrv7 = [38, 41, 40, 44, 39, 43, 42];
  const bed7 = ['23:12', '23:40', '00:05', '23:25', '23:55', '00:20', '23:48'];
  const bedOlder = ['23:30', '23:20', '23:50', '00:10', '23:35', '23:15', '23:45'];
  const kcal7 = [1690, 1820, 1710, 1640, 1905, 1760];
  dates.forEach((d, i) => {
    const last7 = i - 7;
    days[d] = {
      steps: last7 >= 0 ? steps7[last7] : 6000 + ((i * 937) % 4000),
      activeKcal: last7 === 6 ? 310 : 250 + ((i * 53) % 150),
      restingHr: last7 >= 0 ? hr7[last7] : 62,
      hrvMs: last7 >= 0 ? hrv7[last7] : 40,
    };
    const bedtime = last7 >= 0 ? bed7[last7] : bedOlder[i % 7];
    const isToday = d === t;
    const total = isToday ? 400 : 390 + ((i * 17) % 70);
    const deep = isToday ? 65 : Math.round(total * 0.17);
    const rem = isToday ? 80 : Math.round(total * 0.21);
    nights.push({
      date: d,
      bedtime,
      wakeTime: isToday ? '06:45' : '06:50',
      totalMin: total,
      deepMin: deep,
      remMin: rem,
      lightMin: total - deep - rem,
      awakeMin: 12,
      source: 'health_connect',
    });
    if (isToday) {
      water[d] = 1200;
      meals.push(
        { id: id('meal'), date: d, type: 'breakfast', eatenAt: at(d, '08:10'), source: 'manual', photoUrl: null, items: [item('oats', 300), item('coffee', 165)] },
        {
          id: id('meal'),
          date: d,
          type: 'lunch',
          eatenAt: at(d, '13:05'),
          source: 'photo',
          photoUrl: null,
          items: [item('chicken', 150), item('rice', 120), item('salad', 80), item('sauce', 30)],
        },
        { id: id('meal'), date: d, type: 'snack', eatenAt: at(d, '16:20'), source: 'manual', photoUrl: null, items: [item('yoghurt', 180), item('banana', 110), item('nuts', 26)] },
      );
    } else {
      water[d] = 1800 + ((i * 131) % 600);
      const k = last7 >= 0 && last7 < 6 ? kcal7[last7] : 1700 + ((i * 71) % 200);
      const g = Math.round((k / 1480) * 100) / 100;
      meals.push(
        { id: id('meal'), date: d, type: 'breakfast', eatenAt: at(d, '08:00'), source: 'manual', photoUrl: null, items: [item('oats', Math.round(300 * g)), item('coffee', 165)] },
        { id: id('meal'), date: d, type: 'lunch', eatenAt: at(d, '13:00'), source: 'photo', photoUrl: null, items: [item('chicken', Math.round(170 * g)), item('rice', Math.round(140 * g)), item('salad', 80)] },
        { id: id('meal'), date: d, type: 'dinner', eatenAt: at(d, '19:00'), source: 'manual', photoUrl: null, items: [item('yoghurt', Math.round(250 * g)), item('banana', 110)] },
      );
    }
  });
  const dow = (d: string) => parseISODate(d).getDay();
  const findDow = (target: number) => [...dates].reverse().find((d) => d !== t && dow(d) === target) ?? addDays(t, -2);
  const workouts: Workout[] = [
    {
      id: id('w'),
      type: 'nordic_walk',
      name: 'Nūjošana',
      startedAt: at(t, '09:30'),
      durationMin: 42,
      kcal: 210,
      avgHr: 112,
      zones: { minutes: [9, 21, 10, 2, 0] },
      device: 'Polar H10',
      source: 'health_connect',
    },
    { id: id('w'), type: 'yoga', name: 'Joga', startedAt: at(findDow(5), '18:00'), durationMin: 30, kcal: 90, avgHr: 88, zones: null, device: 'Apple Watch', source: 'health_connect' },
    { id: id('w'), type: 'walk', name: 'Pastaiga', startedAt: at(findDow(4), '17:30'), durationMin: 55, kcal: 180, avgHr: 98, zones: null, device: 'Apple Watch', source: 'health_connect' },
  ];
  return {
    me,
    meals,
    water,
    weights: [{ date: addDays(t, -3), kg: 71 }],
    days,
    nights,
    workouts,
    favourites: [
      { id: id('fav'), name: 'Auzu putra ar ogām', items: [item('oats', 290)], totals: scale(FOODS.oats.per100g, 290) },
      { id: id('fav'), name: 'Biezpiens ar medu', items: [{ name: 'Biezpiens ar medu', grams: 150, per100g: N(140, 12, 12, 4.5, 0), portionLabel: null }], totals: N(210, 18, 18, 6.8, 0) },
      { id: id('fav'), name: 'Kafija ar pienu', items: [item('coffee', 200)], totals: scale(FOODS.coffee.per100g, 200) },
    ],
    tips: [],
    questions: [],
    analysesByDate: {},
    pantry: { items: [], updatedAt: null },
  };
}

let state: State | null = null;
const S = (): State => {
  if (!state) throw new ApiError(401, 'unauthorized', 'Not signed in');
  return state;
};

function toMeal(m: StoredMeal): Meal {
  const items = m.items.map((i, k) => ({
    id: `${m.id}-${k}`,
    name: i.name,
    grams: i.grams,
    per100g: i.per100g,
    totals: scale(i.per100g, i.grams),
    portionLabel: i.portionLabel ?? null,
  }));
  return { ...m, items, totals: itemsTotals(m.items) };
}

function nightsWithScore(upTo: string) {
  const s = S();
  const list = s.nights.filter((n) => n.date <= upTo).sort((a, b) => a.date.localeCompare(b.date));
  const window = computeSleepWindow(list.slice(-14).map((n) => n.bedtime));
  return {
    window,
    list: list.map((n) => ({ ...n, score: sleepScore(n, s.me.targets.sleepMin, window) })),
  };
}

// ---- tone templates (the backend uses Claude; this mirrors its fake provider)

function fmt(n: number) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const pantryFresh = () => {
  const p = S().pantry;
  return !!p.updatedAt && p.items.length > 0 && Date.now() - new Date(p.updatedAt).getTime() < PANTRY_FRESH_DAYS * 86_400_000;
};

/** Offline listings: always in the future, with links only where a search would give one. */
function mockLeisure(req: LeisureRequest, city: string): LeisureResponse {
  const now = Date.now();
  const at = (min: number) => new Date(now + min * 60_000).toISOString();
  const g = genreLabel(req.kind, req.genre);
  const base = { subtitle: null, venue: null, url: null, startsAt: null };
  let items: LeisureItem[];
  if (req.kind === 'book') {
    items = [
      { ...base, id: 'b1', title: 'Mātes piens', subtitle: 'Nora Ikstena', description: 'Pajautā bibliotēkā vai grāmatnīcā.', provider: 'book' },
      { ...base, id: 'b2', title: 'Paisums', subtitle: 'Inga Ābele', description: 'Pajautā bibliotēkā vai grāmatnīcā.', provider: 'book' },
    ];
  } else if (req.kind === 'movie' && req.where === 'go3') {
    items = [{ ...base, id: 'g1', title: `Go3: ${g}`, subtitle: '2024', description: 'Viegla filma vakaram.', url: 'https://go3.lv', provider: 'go3' }];
  } else if (req.kind === 'movie') {
    items = [{ ...base, id: 'c1', title: `Vakara seanss: ${g}`, venue: `Kino, ${city}`, description: 'Seanss vēl šovakar.', startsAt: at(120), url: 'https://www.forumcinemas.lv', provider: 'cinema' }];
  } else {
    items = [{ ...base, id: 'e1', title: `${g}: ${city}`, venue: city, description: 'Mierīgs pasākums vakarā.', startsAt: at(150), url: 'https://www.bilesuserviss.lv', provider: 'event' }];
  }
  return { items, city, live: req.kind !== 'book', note: null, generatedAt: new Date(now).toISOString() };
}

function makeTip(date: string, variant: number): Tip {
  const s = S();
  const d = dayFor(date);
  const proteinLeft = Math.max(0, Math.round(d.nutrition.proteinG.target - d.nutrition.proteinG.value));
  const waterLeft = Math.max(0, d.nutrition.waterMl.target - d.nutrition.waterMl.value);
  const tone: ToneStyle = s.me.tone;
  const soft = s.me.personality?.levels.emotionalStability === 'low';
  const shortSleep = (d.sleep?.totalMin ?? 450) < s.me.targets.sleepMin;
  const options: { body: string; highlight: string | null; angle: TipFocus }[] = [];
  const home = pantryFresh() ? s.pantry.items.slice(0, 2) : [];
  if (home.length && proteinLeft > 10) {
    options.push({ body: `No tā, kas ir mājās: ${home.join(' un ')} vakariņās — līdz olbaltumvielu mērķim trūkst ${proteinLeft} g.`, highlight: home[0]!, angle: 'protein' });
  } else if (proteinLeft > 10) {
    const h = `${proteinLeft} g`;
    options.push(
      tone === 'plan'
        ? { body: `Līdz olbaltumvielu mērķim trūkst ${h}. Viens viegls solis: biezpiens vai jogurts vakariņās (+18 g).${soft && shortSleep ? ' Miegs bija nedaudz īsāks — tāpēc šodien bez spiediena.' : ''}`, highlight: h, angle: 'protein' as const }
        : tone === 'novelty'
          ? { body: `Ideja vakariņām, ja tas ir mājās: lēcu zupa — tā pietuvinās olbaltumvielu mērķim, kam vēl trūkst ${h}.`, highlight: h, angle: 'protein' as const }
          : tone === 'gentle'
            ? { body: `Ja sanāk, vakariņās pievieno kaut ko ar olbaltumvielām — vēl ${h}. Arī šodiena jau ir laba.`, highlight: h, angle: 'protein' as const }
            : { body: `Olbaltumvielām šodien vēl ${h}. Der jogurts, biezpiens vai pākšaugi.`, highlight: h, angle: 'protein' as const },
    );
  }
  if (waterLeft > 300) {
    const h = `${(waterLeft / 1000).toFixed(1).replace('.', ',')} l`;
    options.push(
      tone === 'plan'
        ? { body: `Ūdenim vēl ${h}. Plāns: glāze tagad un glāze pie katras maltītes.`, highlight: h, angle: 'water' as const }
        : tone === 'novelty'
          ? { body: `Pamēģini ūdeni ar gurķi un piparmētru — līdz mērķim vēl ${h}.`, highlight: h, angle: 'water' as const }
          : { body: `Ja ērti, iedzer malku ūdens. Līdz mērķim vēl ${h}, nekas nav nokavēts.`, highlight: h, angle: 'water' as const },
    );
  }
  options.push({ body: 'Īsa pastaiga pēc vakariņām palīdz arī miegam. 15 minūtes ir gana.', highlight: '15 minūtes', angle: 'steps' });
  const pick = options[variant % options.length];
  return { id: id('tip'), date, tone, angle: pick.angle, body: pick.body, highlight: pick.highlight, accepted: false, aiGenerated: false };
}

function weeklyQuestionFor(date: string): WeeklyQuestion | null {
  const s = S();
  const week = mondayOf(date);
  const existing = s.questions.find((q) => q.week === week);
  if (existing) return existing;
  const q: WeeklyQuestion = {
    id: id('wq'),
    week,
    question: 'Kas šonedēļ tev palīdzēja visvairāk?',
    options: [
      { label: 'Plānotas maltītes', reply: 'Labi, turpinām to. Nākamnedēļ ieplānosim arī 2 vakariņas ar olbaltumvielām — tikai ja gribi.' },
      { label: 'Agrāka gulētiešana', reply: 'Šonedēļ 2 naktis biji miega logā. Paturēsim 22:15 brīdinājumu, lai nākamnedēļ būtu vairāk.' },
      { label: 'Pastaigas', reply: `Vidēji ${fmt(7800)} soļu dienā. Pastaigas paliks tavā nedēļas plānā.` },
      { label: 'Grūti pateikt', reply: 'Tas ir pilnīgi normāli. Nākamnedēļ pajautāšu vēlreiz — bez spiediena.' },
    ],
    answerIndex: null,
    basedOn: '4 no 7 dienām olbaltumvielas bija zem mērķa, visbiežāk vakaros',
    aiGenerated: false,
  };
  s.questions.push(q);
  return q;
}

function dayFor(date: string): Day {
  const s = S();
  const meals = s.meals.filter((m) => m.date === date).map(toMeal).sort((a, b) => a.eatenAt.localeCompare(b.eatenAt));
  const tot = itemsTotals(meals.flatMap((m) => m.items));
  const T = s.me.targets;
  const h = s.days[date];
  const { window, list } = nightsWithScore(date);
  const last = list.find((n) => n.date === date) ?? null;
  const tip = [...s.tips].reverse().find((t) => t.date === date) ?? null;
  const week = mondayOf(date);
  const w = [...s.weights].sort((a, b) => a.date.localeCompare(b.date)).pop();
  return {
    date,
    nutrition: {
      kcal: { value: tot.kcal, target: T.kcal },
      proteinG: { value: tot.proteinG, target: T.proteinG },
      carbsG: { value: tot.carbsG, target: T.carbsG },
      fatG: { value: tot.fatG, target: T.fatG },
      fibreG: { value: tot.fibreG, target: T.fibreG },
      waterMl: { value: s.water[date] ?? 0, target: T.waterMl },
    },
    meals,
    movement: {
      steps: { value: h?.steps ?? 0, target: T.steps },
      activeKcal: h?.activeKcal ?? 0,
      restingHr: h?.restingHr ?? null,
      hrvMs: h?.hrvMs ?? null,
      source: s.me.devices.source,
    },
    sleep: last ? { ...last, window } : null,
    tip,
    weeklyQuestion: s.questions.find((q) => q.week === week) ?? null,
    lastWeightKg: w?.kg ?? s.me.profile.weightKg,
    care: s.me.care,
  };
}

function withTone(me: Me): Me {
  return { ...me, tone: effectiveTone(me.tonePreference, me.personality?.levels ?? null) };
}

async function tokensFor(email: string): Promise<AuthTokens> {
  const pro = email.trim().toLowerCase() === 'pro@piemers.lv';
  const seeded = email.trim().toLowerCase() === 'ilze@piemers.lv' || pro;
  const care = email.trim().toLowerCase() === 'care@piemers.lv';
  const isNew = !state || state.me.email !== email;
  if (isNew) {
    state = seed();
    if (!seeded) {
      state.me = newMe(email, false);
      state.meals = [];
      state.water = {};
      state.workouts = [];
      state.weights = [];
      state.days = {};
      state.nights = [];
    }
    if (pro) state.me = { ...state.me, email, plan: 'pro' };
    if (care) {
      state.me = {
        ...state.me,
        onboardingDone: true,
        profile: { ...state.me.profile, firstName: 'Marta', sex: 'f', age: 27, heightCm: 165, weightKg: 58 },
        care: { active: true, reasons: ['low_intake'] },
      };
    }
  }
  const t: AuthTokens = { accessToken: 'mock', refreshToken: 'mock', expiresIn: 3600 * 24 * 365, user: { id: S().me.id, email, isNew } };
  await tokenStore.save(t);
  return t;
}

// Restore the seeded state when a persisted mock session exists (page reload).
void tokenStore.load().then((t) => {
  if (t && !state) state = seed();
});

const PHOTO_SAMPLE: FoodItemDraft[] = [
  { name: 'Vistas krūtiņa', grams: 150, per100g: FOODS.chicken.per100g, confidence: 0.9, alternatives: [] },
  { name: 'Rīsi, vārīti', grams: 120, per100g: FOODS.rice.per100g, confidence: 0.85, alternatives: [] },
  { name: 'Salāti', grams: 80, per100g: FOODS.salad.per100g, confidence: 0.8, alternatives: [] },
  {
    name: 'Mērce',
    grams: 30,
    per100g: FOODS.sauce.per100g,
    confidence: 0.45,
    alternatives: [
      { label: 'Jogurta mērce', grams: 30, per100g: N(90, 3.5, 4.5, 6.5, 0) },
      { label: 'Majonēze', grams: 30, per100g: N(680, 1, 1, 75, 0) },
      { label: 'Bez mērces', grams: 0, per100g: N(0, 0, 0, 0, 0) },
    ],
  },
];

const DICT: { re: RegExp; name: string; gramsEach: number; unit: string; per100g: Nutrients }[] = [
  { re: /ol(a|as|u)\b/i, name: 'Olas, vārītas', gramsEach: 50, unit: 'gab.', per100g: N(156, 12.6, 1.1, 10.6, 0) },
  { re: /(rupj)?maiz/i, name: 'Rupjmaize', gramsEach: 35, unit: 'šķēle', per100g: N(229, 6.5, 44, 1.6, 7) },
  { re: /biezpien/i, name: 'Biezpiens', gramsEach: 150, unit: 'porcija', per100g: N(120, 17, 3, 4.5, 0) },
  { re: /jogurt/i, name: 'Jogurts', gramsEach: 150, unit: 'porcija', per100g: N(65, 4, 5, 3, 0) },
  { re: /banān/i, name: 'Banāns', gramsEach: 120, unit: 'gab.', per100g: FOODS.banana.per100g },
  { re: /ābol/i, name: 'Ābols', gramsEach: 150, unit: 'gab.', per100g: N(52, 0.3, 14, 0.2, 2.4) },
  { re: /kafij/i, name: 'Kafija ar pienu', gramsEach: 200, unit: 'tase', per100g: FOODS.coffee.per100g },
  { re: /siers|sier/i, name: 'Siers', gramsEach: 20, unit: 'šķēle', per100g: N(350, 25, 1, 27, 0) },
  { re: /putr/i, name: 'Auzu putra', gramsEach: 250, unit: 'porcija', per100g: N(90, 3, 15, 1.8, 2) },
];

const NUM: Record<string, number> = { viena: 1, viens: 1, divas: 2, divi: 2, trīs: 3, četras: 4, četri: 4 };

// --------------------------------------------------------------- the mock

export class MockApi implements Api {
  requestMagicLink = async (email: string) => {
    await delay();
    if (!/.+@.+\..+/.test(email)) throw new ApiError(400, 'invalid_email', 'Invalid e-mail');
    return { devToken: `mock:${email}` };
  };
  verifyMagicLink = async (token: string) => {
    await delay();
    return tokensFor(token.replace(/^mock:/, ''));
  };
  signInWithGoogle = async () => tokensFor('ilze@piemers.lv');
  signInWithApple = async () => tokensFor('ilze@piemers.lv');
  logout = async () => {
    state = null;
    await tokenStore.clear();
  };

  me = async () => {
    await delay(50);
    return S().me;
  };
  updateProfile: Api['updateProfile'] = async (p) => {
    const s = S();
    const profile = { ...s.me.profile, ...p };
    s.me = withTone({ ...s.me, profile, targets: computeTargets(profile) });
    return s.me;
  };
  updateTargets: Api['updateTargets'] = async (t) => {
    const s = S();
    s.me = { ...s.me, targets: { ...s.me.targets, ...t } };
    return s.me;
  };
  setTone: Api['setTone'] = async (preference) => {
    const s = S();
    s.me = withTone({ ...s.me, tonePreference: preference });
    return s.me;
  };
  updateReminders: Api['updateReminders'] = async (r) => {
    const s = S();
    s.me = { ...s.me, reminders: { ...s.me.reminders, ...r } };
    return s.me;
  };
  updateDevices: Api['updateDevices'] = async (d) => {
    const s = S();
    s.me = { ...s.me, devices: { ...s.me.devices, ...d } };
    return s.me;
  };
  completeOnboarding: Api['completeOnboarding'] = async () => {
    const s = S();
    s.me = { ...s.me, onboardingDone: true };
    return s.me;
  };
  submitPersonality: Api['submitPersonality'] = async (req) => {
    const s = S();
    if (!req.consent) throw new ApiError(400, 'consent_required', 'Consent required');
    if (!validateAnswers(req.answers)) throw new ApiError(400, 'invalid_answers', 'Invalid answers');
    s.me = withTone({ ...s.me, personality: personalityFrom(req.answers, s.me.profile.sex) });
    return s.me;
  };
  deletePersonality: Api['deletePersonality'] = async () => {
    const s = S();
    s.me = withTone({ ...s.me, personality: null });
    return s.me;
  };
  exportData: Api['exportData'] = async () => ({
    downloadUrl: 'data:application/json,' + encodeURIComponent(JSON.stringify(S())),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  deleteAccount: Api['deleteAccount'] = async () => {
    state = null;
    await tokenStore.clear();
  };
  quota: Api['quota'] = async () => {
    const s = S();
    const used = s.analysesByDate[today()] ?? 0;
    const limit = s.me.plan === 'pro' ? null : 3;
    return { plan: s.me.plan, photoAnalysesLimit: limit, photoAnalysesUsed: used, photoAnalysesLeft: limit === null ? null : Math.max(0, limit - used) };
  };

  day: Api['day'] = async (date) => {
    await delay();
    return dayFor(date);
  };
  addWater: Api['addWater'] = async (date, ml) => {
    const s = S();
    s.water[date] = Math.max(0, (s.water[date] ?? 0) + ml);
    return { date, waterMl: s.water[date] };
  };
  addWeight: Api['addWeight'] = async (date, kg) => {
    const s = S();
    s.weights = [...s.weights.filter((w) => w.date !== date), { date, kg }];
    s.me = { ...s.me, profile: { ...s.me.profile, weightKg: kg } };
    return { date, kg };
  };

  analyzeMeal: Api['analyzeMeal'] = async (req): Promise<AnalyzeMealResponse> => {
    const q = await this.quota();
    if (q.photoAnalysesLeft === 0) throw new ApiError(402, 'quota_exceeded', 'Daily photo analysis limit reached');
    await delay(1800);
    const s = S();
    s.analysesByDate[today()] = (s.analysesByDate[today()] ?? 0) + 1;
    return {
      items: PHOTO_SAMPLE,
      suggestedType: mealTypeForTime(new Date(req.takenAt)),
      photoUrl: `data:${req.mediaType};base64,${req.imageBase64}`,
      quota: await this.quota(),
    };
  };
  parseText: Api['parseText'] = async (text) => {
    await delay(300);
    const items: FoodItemDraft[] = [];
    for (const part of text.toLowerCase().split(/,| un | ar |\+/)) {
      const hit = DICT.find((d) => d.re.test(part));
      if (!hit) continue;
      const numMatch = part.match(/(\d+)/);
      const word = Object.keys(NUM).find((w) => part.includes(w));
      const count = numMatch ? Number(numMatch[1]) : word ? NUM[word] : 1;
      items.push({
        name: hit.name,
        grams: hit.gramsEach * count,
        per100g: hit.per100g,
        confidence: 0.8,
        alternatives: [],
        portionLabel: `${count} ${hit.unit}`,
      });
    }
    return { items };
  };
  barcode: Api['barcode'] = async (ean) => ({
    item:
      ean === '4750000000000'
        ? { name: 'Kefīrs 2,5 %', grams: 250, per100g: N(52, 3, 4, 2.5, 0), confidence: 1, alternatives: [], portionLabel: '1 glāze' }
        : null,
  });
  createMeal: Api['createMeal'] = async (req) => {
    const s = S();
    const m: StoredMeal = { id: id('meal'), date: req.date, type: req.type, eatenAt: req.eatenAt, source: req.source, photoUrl: req.photoUrl ?? null, items: req.items };
    s.meals.push(m);
    return toMeal(m);
  };
  updateMeal: Api['updateMeal'] = async (mealId, req) => {
    const s = S();
    const m = s.meals.find((x) => x.id === mealId);
    if (!m) throw new ApiError(404, 'not_found', 'Meal not found');
    if (req.type) m.type = req.type as MealType;
    if (req.items) m.items = req.items;
    return toMeal(m);
  };
  deleteMeal: Api['deleteMeal'] = async (mealId) => {
    const s = S();
    s.meals = s.meals.filter((m) => m.id !== mealId);
  };
  favourites: Api['favourites'] = async () => S().favourites;
  createFavourite: Api['createFavourite'] = async (req) => {
    const f: Favourite = { id: id('fav'), name: req.name, items: req.items, totals: itemsTotals(req.items) };
    S().favourites.push(f);
    return f;
  };
  deleteFavourite: Api['deleteFavourite'] = async (favId) => {
    const s = S();
    s.favourites = s.favourites.filter((f) => f.id !== favId);
  };
  nutritionStats: Api['nutritionStats'] = async (date, n = 7) => {
    const s = S();
    const days = lastNDates(date, n).map((d) => {
      const t = itemsTotals(s.meals.filter((m) => m.date === d).flatMap((m) => m.items));
      return { date: d, kcal: t.kcal, proteinG: Math.round(t.proteinG) };
    });
    const full = days.slice(0, -1);
    const avg = (f: (x: (typeof days)[number]) => number) => (full.length ? Math.round(full.reduce((a, x) => a + f(x), 0) / full.length) : 0);
    return {
      days,
      avgKcal: avg((x) => x.kcal),
      avgProteinG: avg((x) => x.proteinG),
      targetKcal: s.me.targets.kcal,
      targetProteinG: s.me.targets.proteinG,
      insight:
        'Enerģija turas tuvu mērķim. Olbaltumvielas visbiežāk pietrūkst vakaros — ja gribi, vakariņām pievieno vienu olbaltumvielu avotu.',
    };
  };

  healthSync: Api['healthSync'] = async (req) => {
    const s = S();
    req.days.forEach((d) => (s.days[d.date] = { steps: d.steps, activeKcal: d.activeKcal, restingHr: d.restingHr, hrvMs: d.hrvMs }));
    req.nights.forEach((n) => {
      s.nights = [...s.nights.filter((x) => x.date !== n.date), { ...n, source: req.source }];
    });
    const lastSyncAt = new Date().toISOString();
    s.me = { ...s.me, devices: { ...s.me.devices, source: req.source, connected: true, devices: req.devices, lastSyncAt } };
    return { daysUpserted: req.days.length, nightsUpserted: req.nights.length, workoutsUpserted: req.workouts.length, lastSyncAt };
  };
  movement: Api['movement'] = async (date, n = 7) => {
    const s = S();
    const dates = lastNDates(date, n);
    const h = s.days[date];
    return {
      today: { steps: { value: h?.steps ?? 0, target: s.me.targets.steps }, activeKcal: h?.activeKcal ?? 0 },
      days: dates.map((d) => ({ date: d, steps: s.days[d]?.steps ?? 0 })),
      restingHr: { today: h?.restingHr ?? null, series: dates.map((d) => s.days[d]?.restingHr ?? null) },
      hrv: { today: h?.hrvMs ?? null, series: dates.map((d) => s.days[d]?.hrvMs ?? null) },
      workouts: [...s.workouts].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      source: s.me.devices.source,
      devices: s.me.devices.devices,
    };
  };
  sleep: Api['sleep'] = async (date) => {
    const s = S();
    const { window, list } = nightsWithScore(date);
    return {
      lastNight: list.find((n) => n.date === date) ?? list[list.length - 1] ?? null,
      nights: list.slice(-7).map((n) => ({ date: n.date, bedtime: n.bedtime })),
      window,
      source: s.me.devices.source,
      devices: s.me.devices.devices,
    };
  };
  createActivity: Api['createActivity'] = async (req) => {
    const names: Record<string, string> = {
      walk: 'Pastaiga',
      nordic_walk: 'Nūjošana',
      run: 'Skriešana',
      bike: 'Riteņbraukšana',
      yoga: 'Joga',
      strength: 'Spēka treniņš',
      swim: 'Peldēšana',
      other: 'Aktivitāte',
    };
    const w: Workout = {
      id: id('w'),
      type: req.type,
      name: names[req.type],
      startedAt: req.startedAt,
      durationMin: req.durationMin,
      kcal: req.kcal ?? null,
      avgHr: null,
      zones: null,
      device: null,
      source: 'manual',
    };
    S().workouts.push(w);
    return w;
  };

  tipToday: Api['tipToday'] = async (date) => {
    await delay(300);
    const s = S();
    const existing = [...s.tips].reverse().find((t) => t.date === date);
    if (existing) return existing;
    const t = makeTip(date, 0);
    s.tips.push(t);
    return t;
  };
  tipNext: Api['tipNext'] = async (date) => {
    await delay(400);
    const s = S();
    const n = s.tips.filter((t) => t.date === date).length;
    const t = makeTip(date, n);
    s.tips.push(t);
    return t;
  };
  acceptTip: Api['acceptTip'] = async (tipId) => {
    const t = S().tips.find((x) => x.id === tipId);
    if (!t) throw new ApiError(404, 'not_found', 'Tip not found');
    t.accepted = true;
    return t;
  };
  weeklyQuestion: Api['weeklyQuestion'] = async (date) => weeklyQuestionFor(date);
  answerWeeklyQuestion: Api['answerWeeklyQuestion'] = async (qId, optionIndex) => {
    const q = S().questions.find((x) => x.id === qId);
    if (!q) throw new ApiError(404, 'not_found', 'Question not found');
    q.answerIndex = optionIndex;
    return q;
  };

  refreshTip: Api['refreshTip'] = async (date) => {
    await delay(300);
    const s = S();
    s.tips = s.tips.filter((t) => t.date !== date || t.accepted);
    const t = makeTip(date, 0);
    s.tips.push(t);
    return t;
  };
  pantry: Api['pantry'] = async () => ({ ...S().pantry, fresh: pantryFresh() });
  savePantry: Api['savePantry'] = async (items) => {
    const clean = [...new Set(items.map((i) => i.trim().toLowerCase()).filter(Boolean))];
    S().pantry = { items: clean, updatedAt: new Date().toISOString() };
    return this.pantry();
  };
  scanPantry: Api['scanPantry'] = async () => {
    await delay(800);
    return { items: ['olas', 'piens', 'auzu pārslas', 'āboli', 'burkāni', 'siers'] };
  };
  setCity: Api['setCity'] = async (city) => {
    const s = S();
    s.me = { ...s.me, leisureCity: city };
    return s.me;
  };
  suggestLeisure: Api['suggestLeisure'] = async (req) => {
    await delay(700);
    const city = S().me.leisureCity;
    if (!city) throw new ApiError(400, 'city_required', 'Choose a city first');
    return mockLeisure(req, city);
  };

  reportTip: Api['reportTip'] = async (tipId) => {
    const s = S();
    s.tips = s.tips.filter((t) => t.id !== tipId);
  };
  weeklySummary: Api['weeklySummary'] = async (date) => {
    const s = S();
    if (s.me.plan !== 'pro') throw new ApiError(402, 'pro_required', 'Pro required');
    return MOCK_SUMMARY(date);
  };
  recipes: Api['recipes'] = async (date) => {
    const s = S();
    if (s.me.plan !== 'pro') throw new ApiError(402, 'pro_required', 'Pro required');
    const p = s.me.preferences;
    const ok = (r: Recipe) =>
      (p.diet === 'any' || r.tags.includes(p.diet) || (p.diet === 'vegetarian' && r.tags.includes('vegan'))) &&
      p.avoid.every((a) => !r.tags.includes(`contains:${a}`));
    return { date, mealType: mealTypeForTime(new Date()), recipes: MOCK_RECIPES.filter(ok).slice(0, 3), aiGenerated: false };
  };
  logRecipe: Api['logRecipe'] = async (recipeId, date) => {
    const r = MOCK_RECIPES.find((x) => x.id === recipeId);
    if (!r) throw new ApiError(404, 'not_found', 'Recipe not found');
    return this.createMeal({
      date,
      type: mealTypeForTime(new Date()),
      eatenAt: new Date().toISOString(),
      source: 'manual',
      items: [{ name: r.title, grams: 100, per100g: r.perServing, portionLabel: '1 porcija' }],
    });
  };
  updatePreferences: Api['updatePreferences'] = async (pref) => {
    const s = S();
    s.me = { ...s.me, preferences: { ...s.me.preferences, ...pref } };
    return s.me;
  };
  setAiPersonalization: Api['setAiPersonalization'] = async (enabled) => {
    const s = S();
    s.me = { ...s.me, aiPersonalization: enabled };
    return s.me;
  };

  registerPushToken: Api['registerPushToken'] = async () => undefined;
}

const MOCK_SUMMARY = (date: string): WeeklySummary => ({
  week: mondayOf(date),
  periodStart: addDays(date, -6),
  periodEnd: date,
  headline: 'Stabila nedēļa ar labu miega ritmu',
  observations: [
    { title: 'Kas strādā', text: '5 no 7 naktīm gulētiešana bija tavā miega logā, un pēc tām soļu bija vairāk.' },
    { title: 'Vakari', text: '4 vakarus olbaltumvielas palika zem mērķa — pusdienās tās parasti ir pietiekami.' },
  ],
  suggestion: 'Ja gribi, pievieno vakariņām vienu olbaltumvielu avotu — biezpienu, olas vai pupiņas.',
  reflection: 'Kas palīdz tev vakarā paēst mierīgi?',
  findings: [],
  stats: { avgKcal: 1715, avgProteinG: 89, avgSteps: 7800, avgSleepMin: 410, daysLogged: 7 },
  aiGenerated: false,
  generatedAt: new Date().toISOString(),
});

const MOCK_RECIPES: Recipe[] = [
  {
    id: 'r-biezpiens',
    title: 'Biezpiens ar ogām un auzu pārslām',
    minutes: 5,
    servings: 1,
    ingredients: [
      { name: 'Biezpiens', amount: '200 g' },
      { name: 'Ogas', amount: '100 g' },
      { name: 'Auzu pārslas', amount: '2 ēdamkarotes' },
    ],
    steps: ['Samaisi biezpienu ar ogām.', 'Pārkaisi auzu pārslas.'],
    perServing: N(330, 30, 32, 9, 5),
    why: '+30 g olbaltumvielu vakariņām',
    tags: ['vegetarian', 'contains:lactose', 'contains:gluten'],
  },
  {
    id: 'r-lecas',
    title: 'Lēcu zupa ar burkāniem',
    minutes: 35,
    servings: 3,
    ingredients: [
      { name: 'Sarkanās lēcas', amount: '200 g' },
      { name: 'Burkāni', amount: '2 gab.' },
      { name: 'Sīpols', amount: '1 gab.' },
      { name: 'Dārzeņu buljons', amount: '1 l' },
    ],
    steps: ['Apcep sīpolu un burkānus.', 'Pievieno lēcas un buljonu, vāri 20 minūtes.', 'Sablendē pēc garšas.'],
    perServing: N(290, 17, 45, 4, 11),
    why: '+11 g šķiedrvielu un 17 g olbaltumvielu',
    tags: ['vegetarian', 'vegan', 'pescatarian'],
  },
  {
    id: 'r-lasis',
    title: 'Cepts lasis ar kartupeļiem un salātiem',
    minutes: 30,
    servings: 2,
    ingredients: [
      { name: 'Laša fileja', amount: '300 g' },
      { name: 'Jaunie kartupeļi', amount: '400 g' },
      { name: 'Lapu salāti', amount: '1 sauja' },
    ],
    steps: ['Vāri kartupeļus.', 'Cep lasi 4 minūtes no katras puses.', 'Pasniedz ar salātiem.'],
    perServing: N(520, 34, 38, 24, 5),
    why: '+34 g olbaltumvielu',
    tags: ['pescatarian', 'contains:fish'],
  },
  {
    id: 'r-vista',
    title: 'Vistas un griķu bļoda',
    minutes: 25,
    servings: 2,
    ingredients: [
      { name: 'Vistas fileja', amount: '300 g' },
      { name: 'Griķi', amount: '150 g' },
      { name: 'Gurķis un tomāts', amount: '1 + 1 gab.' },
    ],
    steps: ['Izvāri griķus.', 'Apcep vistu sagrieztu strēmelēs.', 'Saliec bļodā ar dārzeņiem.'],
    perServing: N(480, 42, 50, 9, 6),
    why: '+42 g olbaltumvielu',
    tags: [],
  },
];
