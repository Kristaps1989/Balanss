/**
 * Balanss API contract, shared by the app (src/api) and the backend (backend/).
 * All routes are prefixed with /v1 and, except /auth/* and the billing webhook,
 * require `Authorization: Bearer <accessToken>`.
 *
 * Dates are local calendar dates "YYYY-MM-DD"; timestamps are ISO 8601 strings.
 * Times of day are "HH:MM" (24 h).
 */

// ---------------------------------------------------------------- basics

export type HealthSource = 'apple_health' | 'health_connect' | 'manual';
export type TraitLevel = 'low' | 'medium' | 'high';
export type Trait = 'openness' | 'conscientiousness' | 'extraversion' | 'agreeableness' | 'emotionalStability';
export type PersonalityLevels = Record<Trait, TraitLevel>;
/** Tone styles the tone engine can write in. */
export type ToneStyle = 'plan' | 'novelty' | 'gentle' | 'neutral';
/** 'auto' = derived from the personality profile. */
export type TonePreference = 'auto' | ToneStyle;

export type Sex = 'f' | 'm' | 'x';
export type ActivityLevel = 'sit' | 'light' | 'active' | 'very';
export type Goal = 'health' | 'fit' | 'weight' | 'routine';
export type WeightDirection = 'down' | 'up';
export type Plan = 'free' | 'pro';
export type ReminderFrequency = 'low' | 'mid' | 'high';

export interface Progress {
  value: number;
  target: number;
}

export interface Nutrients {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fibreG: number;
}

// ---------------------------------------------------------------- auth

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until accessToken expires. */
  expiresIn: number;
  user: { id: string; email: string; isNew: boolean };
}

/** POST /auth/google */
export interface GoogleAuthRequest {
  idToken: string;
}
/** POST /auth/apple */
export interface AppleAuthRequest {
  identityToken: string;
  firstName?: string;
}
/** POST /auth/magic-link */
export interface MagicLinkRequest {
  email: string;
}
export interface MagicLinkResponse {
  ok: true;
  /** Only when the server runs with EMAIL_PROVIDER=console (dev/test). */
  devToken?: string;
}
/** POST /auth/magic-link/verify */
export interface MagicLinkVerifyRequest {
  token: string;
}
/** POST /auth/refresh and POST /auth/logout */
export interface RefreshRequest {
  refreshToken: string;
}

// ---------------------------------------------------------------- profile

export interface Profile {
  firstName: string;
  age: number;
  heightCm: number;
  weightKg: number;
  sex: Sex;
  activity: ActivityLevel;
  goals: Goal[];
  weightDirection: WeightDirection | null;
  goalWeightKg: number | null;
}

export interface Targets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fibreG: number;
  waterMl: number;
  steps: number;
  sleepMin: number;
}

export interface Personality {
  consent: boolean;
  levels: PersonalityLevels;
  /** 1..5 mean per trait. */
  scores: Record<Trait, number>;
  styleName: string;
  styleDescription: string;
  testedAt: string;
  /** Earliest date the test can be retaken. */
  retestFrom: string;
}

export interface Reminders {
  water: boolean;
  food: boolean;
  move: boolean;
  sleepWindow: boolean;
  frequency: ReminderFrequency;
  /** Minutes before the sleep window to send the wind-down nudge. */
  sleepLeadMin: 30 | 45 | 60;
}

export interface Devices {
  source: HealthSource | null;
  connected: boolean;
  devices: string[];
  lastSyncAt: string | null;
}

/** Food preferences used by recipes and meal ideas (never sent with the user's identity). */
export type Diet = 'any' | 'vegetarian' | 'vegan' | 'pescatarian';
export type AvoidFood = 'lactose' | 'gluten' | 'nuts' | 'fish' | 'eggs' | 'pork';
export interface FoodPreferences {
  diet: Diet;
  avoid: AvoidFood[];
  /** "Mani ieradumi": a sentence the user writes for the AI (≤ 240 chars), e.g. "Pirms katras maltītes apēdu dārzeņus". */
  habits?: string;
}
export const HABITS_MAX = 240;

/**
 * Wellbeing "care mode": when intake, weight change or goals look risky, the app
 * stops all deficit-oriented advice and gently points to professional support.
 */
export type CareReason = 'low_intake' | 'rapid_weight_loss' | 'underweight' | 'low_goal' | 'minor_weight_loss';
export interface CareStatus {
  active: boolean;
  reasons: CareReason[];
}

export interface Me {
  id: string;
  email: string;
  profile: Profile;
  targets: Targets;
  preferences: FoodPreferences;
  /** When false no personal data is sent to the AI; tips and questions use built-in templates. Photo analysis stays available on request. */
  aiPersonalization: boolean;
  care: CareStatus;
  personality: Personality | null;
  tonePreference: TonePreference;
  /** Effective tone after applying the preference. */
  tone: ToneStyle;
  reminders: Reminders;
  devices: Devices;
  plan: Plan;
  onboardingDone: boolean;
  /** City for free-time suggestions (chosen by the user; no GPS). */
  leisureCity: string | null;
  createdAt: string;
}

/** POST /me/personality */
export interface PersonalityRequest {
  consent: boolean;
  /** 20 answers, 1..5, in PERSONALITY_ITEMS order. */
  answers: number[];
}

/** POST /me/export */
export interface ExportResponse {
  downloadUrl: string;
  expiresAt: string;
}

// ---------------------------------------------------------------- AI copy

/** What a tip is about; food tips (protein, fibre, meals) offer "Kas ir mājās?". */
export type TipFocus = 'protein' | 'water' | 'steps' | 'fibre' | 'sleep' | 'meals' | 'overall';

export interface Tip {
  id: string;
  date: string;
  tone: ToneStyle;
  angle: TipFocus | null;
  body: string;
  /** Short fragment of `body` to emphasise, e.g. "42 g". */
  highlight: string | null;
  accepted: boolean;
  /** Written by the AI (true) or by the built-in templates (false). Shown as a label. */
  aiGenerated: boolean;
}

/** POST /tips/:id/report — "this tip doesn't fit / isn't appropriate". Stored for review, never shown again. */
export type TipReportReason = 'not_relevant' | 'wrong_data' | 'inappropriate' | 'other';
export interface TipReportRequest {
  reason: TipReportReason;
}

export interface WeeklyQuestionOption {
  label: string;
  /** Tone-adapted reply shown after the user picks this option. */
  reply: string;
}

export interface WeeklyQuestion {
  id: string;
  /** Monday of the week, YYYY-MM-DD. */
  week: string;
  question: string;
  options: WeeklyQuestionOption[];
  answerIndex: number | null;
  /** The pattern the question is based on, e.g. "3 vakarus šonedēļ olbaltumvielas bija zem mērķa". */
  basedOn: string | null;
  aiGenerated: boolean;
}

// ---------------------------------------------------------------- AI analysis (Pro)

/** A deterministic pattern found in the last weeks of data; the AI only phrases it. */
export type FindingKind =
  | 'protein_gap'
  | 'fibre_low'
  | 'water_low'
  | 'weekend_shift'
  | 'breakfast_skipped'
  | 'short_sleep_low_steps'
  | 'bedtime_irregular'
  | 'bedtime_in_window'
  | 'steps_trend'
  | 'logging_gaps'
  | 'consistency';

export interface Finding {
  kind: FindingKind;
  /** Positive (something that works) or an opportunity. Never a failure. */
  polarity: 'positive' | 'opportunity';
  /** Short factual Latvian sentence with the numbers, e.g. "5 no 7 naktīm gulētiešana bija miega logā". */
  fact: string;
  /** 0..1, how clear the pattern is. */
  strength: number;
}

/** GET /insights/weekly?date — Pro. */
export interface WeeklySummary {
  week: string;
  periodStart: string;
  periodEnd: string;
  headline: string;
  observations: { title: string; text: string }[];
  suggestion: string;
  reflection: string;
  findings: Finding[];
  stats: { avgKcal: number; avgProteinG: number; avgSteps: number | null; avgSleepMin: number | null; daysLogged: number };
  aiGenerated: boolean;
  generatedAt: string;
}

/** GET /recipes?date — Pro: meal ideas that fit what is left of today's targets and the preferences. */
export interface Recipe {
  id: string;
  title: string;
  minutes: number;
  servings: number;
  ingredients: { name: string; amount: string }[];
  steps: string[];
  perServing: Nutrients;
  /** Why it fits today, e.g. "+32 g olbaltumvielu vakariņām". */
  why: string;
  tags: string[];
}
export interface RecipesResponse {
  date: string;
  mealType: MealType;
  recipes: Recipe[];
  aiGenerated: boolean;
}

// ---------------------------------------------------------------- nutrition

export type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export type MealSource = 'photo' | 'text' | 'barcode' | 'favourite' | 'manual';

export interface FoodAlternative {
  label: string;
  grams: number;
  per100g: Nutrients;
}

/** A food as suggested by analysis / parsing / barcode, before saving. */
export interface FoodItemDraft {
  name: string;
  grams: number;
  per100g: Nutrients;
  /** 0..1; below 0.6 the app asks the user to confirm. */
  confidence: number;
  /** Shown as chips when confidence is low ("Jogurta mērce", "Bez mērces"). */
  alternatives: FoodAlternative[];
  /** Optional unit description, e.g. "2 gab.", "1 šķēle". */
  portionLabel?: string | null;
}

export interface MealItem {
  id: string;
  name: string;
  grams: number;
  per100g: Nutrients;
  totals: Nutrients;
  portionLabel: string | null;
}

export interface Meal {
  id: string;
  date: string;
  type: MealType;
  eatenAt: string;
  source: MealSource;
  photoUrl: string | null;
  items: MealItem[];
  totals: Nutrients;
}

/** POST /meals */
export interface CreateMealRequest {
  date: string;
  type: MealType;
  eatenAt: string;
  source: MealSource;
  photoUrl?: string | null;
  items: { name: string; grams: number; per100g: Nutrients; portionLabel?: string | null }[];
}

/** PATCH /meals/:id */
export type UpdateMealRequest = Partial<Pick<CreateMealRequest, 'type' | 'items'>>;

export interface Quota {
  plan: Plan;
  /** null = unlimited */
  photoAnalysesLimit: number | null;
  photoAnalysesUsed: number;
  photoAnalysesLeft: number | null;
}

/** POST /meals/analyze */
export interface AnalyzeMealRequest {
  /** Base64 JPEG/PNG without data: prefix, ≤ 5 MB decoded. */
  imageBase64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Local time of the photo, used to suggest the meal type. */
  takenAt: string;
}
export interface AnalyzeMealResponse {
  items: FoodItemDraft[];
  suggestedType: MealType;
  photoUrl: string;
  quota: Quota;
}

/** POST /meals/parse-text */
export interface ParseTextRequest {
  text: string;
}
export interface ParseTextResponse {
  items: FoodItemDraft[];
}

/** GET /foods/barcode/:ean */
export interface BarcodeResponse {
  item: FoodItemDraft | null;
}

export interface Favourite {
  id: string;
  name: string;
  items: CreateMealRequest['items'];
  totals: Nutrients;
}
/** POST /favourites */
export interface CreateFavouriteRequest {
  name: string;
  items: CreateMealRequest['items'];
}

/** GET /stats/nutrition?days=7&date=YYYY-MM-DD */
export interface NutritionStats {
  days: { date: string; kcal: number; proteinG: number }[];
  avgKcal: number;
  avgProteinG: number;
  targetKcal: number;
  targetProteinG: number;
  insight: string | null;
}

// ---------------------------------------------------------------- health

export interface SleepNight {
  /** Date the night ended (wake-up date). */
  date: string;
  bedtime: string;
  wakeTime: string;
  totalMin: number;
  deepMin: number;
  remMin: number;
  lightMin: number;
  awakeMin: number;
  /** 0..100, see shared/sleep.ts sleepScore(). */
  score: number;
  source: HealthSource;
}

export interface SleepWindow {
  start: string;
  end: string;
  basedOnNights: number;
}

export type WorkoutType = 'walk' | 'nordic_walk' | 'run' | 'bike' | 'yoga' | 'strength' | 'swim' | 'other';

export interface HrZones {
  /** Minutes in zones 1..5. */
  minutes: [number, number, number, number, number];
}

export interface Workout {
  id: string;
  type: WorkoutType;
  name: string;
  startedAt: string;
  durationMin: number;
  kcal: number | null;
  avgHr: number | null;
  zones: HrZones | null;
  device: string | null;
  source: HealthSource;
}

/** POST /health/sync — idempotent upsert of the last N days. */
export interface HealthSyncRequest {
  source: Exclude<HealthSource, 'manual'>;
  devices: string[];
  days: { date: string; steps: number; activeKcal: number; restingHr: number | null; hrvMs: number | null }[];
  nights: Omit<SleepNight, 'score' | 'source'>[];
  workouts: (Omit<Workout, 'id' | 'source' | 'name'> & { externalId: string })[];
  weights?: { date: string; kg: number }[];
}
export interface HealthSyncResponse {
  daysUpserted: number;
  nightsUpserted: number;
  workoutsUpserted: number;
  lastSyncAt: string;
}

/** POST /activities — manual activity. */
export interface CreateActivityRequest {
  type: WorkoutType;
  startedAt: string;
  durationMin: number;
  kcal?: number | null;
}

/** GET /health/movement?days=7&date=YYYY-MM-DD */
export interface MovementOverview {
  today: { steps: Progress; activeKcal: number };
  days: { date: string; steps: number }[];
  restingHr: { today: number | null; series: (number | null)[] };
  hrv: { today: number | null; series: (number | null)[] };
  workouts: Workout[];
  source: HealthSource | null;
  devices: string[];
}

/** GET /health/sleep?date=YYYY-MM-DD */
export interface SleepOverview {
  lastNight: SleepNight | null;
  /** Last 7 nights, oldest first. */
  nights: { date: string; bedtime: string }[];
  window: SleepWindow | null;
  source: HealthSource | null;
  devices: string[];
}

// ---------------------------------------------------------------- day

/** GET /days/:date — everything the Home screen needs in one call. */
export interface Day {
  date: string;
  nutrition: {
    kcal: Progress;
    proteinG: Progress;
    carbsG: Progress;
    fatG: Progress;
    fibreG: Progress;
    waterMl: Progress;
  };
  meals: Meal[];
  movement: { steps: Progress; activeKcal: number; restingHr: number | null; hrvMs: number | null; source: HealthSource | null };
  sleep: (SleepNight & { window: SleepWindow | null }) | null;
  tip: Tip | null;
  care: CareStatus;
  weeklyQuestion: WeeklyQuestion | null;
  lastWeightKg: number | null;
}

/** POST /water */
export interface AddWaterRequest {
  date: string;
  ml: number;
}
export interface AddWaterResponse {
  date: string;
  waterMl: number;
}

/** POST /weight */
export interface AddWeightRequest {
  date: string;
  kg: number;
}

// ---------------------------------------------------------------- push & billing

/** PUT /push/token */
export interface PushTokenRequest {
  token: string;
  platform: 'android' | 'ios' | 'web';
  /** IANA zone, e.g. "Europe/Riga"; used to schedule reminders. */
  timezone: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

/**
 * Route table (method, path → request / response):
 *
 * POST   /auth/google                 GoogleAuthRequest       → AuthTokens
 * POST   /auth/apple                  AppleAuthRequest        → AuthTokens
 * POST   /auth/magic-link             MagicLinkRequest        → MagicLinkResponse
 * POST   /auth/magic-link/verify      MagicLinkVerifyRequest  → AuthTokens
 * POST   /auth/refresh                RefreshRequest          → AuthTokens
 * POST   /auth/logout                 RefreshRequest          → { ok: true }
 *
 * GET    /me                                                  → Me
 * PUT    /me/profile                  Partial<Profile>        → Me
 * PUT    /me/targets                  Partial<Targets>        → Me
 * PUT    /me/tone                     { preference }          → Me
 * PUT    /me/reminders                Partial<Reminders>      → Me
 * PUT    /me/devices                  Partial<Devices>        → Me
 * POST   /me/onboarding/complete                              → Me
 * POST   /me/personality              PersonalityRequest      → Me
 * DELETE /me/personality                                      → Me
 * POST   /me/export                                           → ExportResponse
 * GET    /exports/:token              (no auth, single-use)   → JSON file
 * DELETE /me                                                  → { ok: true }
 * GET    /me/quota                                            → Quota
 * PUT    /me/preferences              Partial<FoodPreferences> → Me
 * PUT    /me/ai                       { enabled: boolean }    → Me
 *
 * GET    /days/:date                                          → Day
 * POST   /water                       AddWaterRequest         → AddWaterResponse
 * POST   /weight                      AddWeightRequest        → { date, kg }
 *
 * POST   /meals/analyze               AnalyzeMealRequest      → AnalyzeMealResponse   (402 quota_exceeded)
 * POST   /meals/parse-text            ParseTextRequest        → ParseTextResponse
 * GET    /foods/barcode/:ean                                  → BarcodeResponse
 * POST   /meals                       CreateMealRequest       → Meal
 * PATCH  /meals/:id                   UpdateMealRequest       → Meal
 * DELETE /meals/:id                                           → { ok: true }
 * GET    /favourites                                          → Favourite[]
 * POST   /favourites                  CreateFavouriteRequest  → Favourite
 * DELETE /favourites/:id                                      → { ok: true }
 * GET    /stats/nutrition?days&date                           → NutritionStats
 * GET    /photos/:key                 (signed, no auth)       → image
 *
 * POST   /health/sync                 HealthSyncRequest       → HealthSyncResponse
 * GET    /health/movement?days&date                           → MovementOverview
 * GET    /health/sleep?date                                   → SleepOverview
 * POST   /activities                  CreateActivityRequest   → Workout
 *
 * GET    /tips/today?date                                     → Tip
 * POST   /tips/next?date                                      → Tip
 * POST   /tips/:id/accept                                     → Tip
 * POST   /tips/:id/report             TipReportRequest        → { ok: true }   (hides the tip, next one is generated)
 * GET    /insights/weekly?date        (Pro; 402 pro_required) → WeeklySummary
 * GET    /recipes?date                (Pro; 402 pro_required) → RecipesResponse
 *
 * GET    /pantry                                              → Pantry
 * PUT    /pantry                      PantryUpdate            → Pantry
 * POST   /pantry/scan                 PantryScanRequest       → PantryScanResponse   (fridge photo → ingredients; not saved)
 * POST   /tips/refresh?date                                   → Tip   (after a pantry change; not counted as "Cits ieteikums")
 * PUT    /me/city                     { city }                → Me
 * POST   /leisure/suggest             LeisureRequest          → LeisureResponse      (429 leisure_limit after 15/day)
 * POST   /recipes/:id/log             { date }                → Meal
 * GET    /weekly-question?date                                → WeeklyQuestion | null
 * POST   /weekly-question/:id/answer  { optionIndex }         → WeeklyQuestion
 *
 * PUT    /push/token                  PushTokenRequest        → { ok: true }
 * POST   /billing/webhook             RevenueCat event (Authorization: Bearer REVENUECAT_WEBHOOK_SECRET) → { ok: true }
 *
 * GET    /health                      (liveness, no /v1 prefix) → { ok: true }
 */

// ---------------------------------------------------------------- pantry

/** What the user has at home. Fresh for PANTRY_FRESH_DAYS after the last update. */
export interface Pantry {
  items: string[];
  updatedAt: string | null;
  fresh: boolean;
}
export interface PantryUpdate {
  items: string[];
}
export interface PantryScanRequest {
  imageBase64: string;
}
export interface PantryScanResponse {
  items: string[];
}
export const PANTRY_FRESH_DAYS = 3;

// ---------------------------------------------------------------- free time

export type LeisureKind = 'movie' | 'book' | 'event';
/** Films: in a cinema, on Go3, or anything (cinema, Go3 or other streaming). */
export type MovieWhere = 'cinema' | 'go3' | 'any';
export type EventWhen = 'today' | 'weekend';

export interface LeisureRequest {
  kind: LeisureKind;
  /** Key from LEISURE_GENRES[kind]. */
  genre: string;
  where?: MovieWhere;
  when?: EventWhen;
}

export interface LeisureItem {
  id: string;
  title: string;
  /** Author, director/year, or venue line. */
  subtitle: string | null;
  description: string;
  /** Screening or event start (ISO); null for books, streaming and timeless ideas. */
  startsAt: string | null;
  venue: string | null;
  /** Link from the web search (cinema page, go3.lv, event page); never invented. */
  url: string | null;
  provider: 'cinema' | 'go3' | 'streaming' | 'book' | 'event' | 'idea';
}

export interface LeisureResponse {
  items: LeisureItem[];
  city: string;
  /** True when the items come from a live web search done now (or cached within 2 h). */
  live: boolean;
  /** Short Latvian note, e.g. why nothing live was found. */
  note: string | null;
  generatedAt: string;
}
