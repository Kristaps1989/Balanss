import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import type {
  CreateMealRequest,
  Devices,
  FoodItemDraft,
  HrZones,
  Nutrients,
  PersonalityLevels,
  Profile,
  Reminders,
  Targets,
  Trait,
  WeeklyQuestionOption,
} from '../../../shared/api';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const day = (name: string) => date(name, { mode: 'string' });
const userRef = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

// ---------------------------------------------------------------- users & auth

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Always stored lower-case. */
  email: text('email').notNull().unique(),
  googleSub: text('google_sub').unique(),
  appleSub: text('apple_sub').unique(),
  profile: jsonb('profile').$type<Profile>().notNull(),
  targets: jsonb('targets').$type<Targets>().notNull(),
  /** True once the user changed targets by hand; profile edits then stop recomputing them. */
  targetsEdited: boolean('targets_edited').notNull().default(false),
  tonePreference: text('tone_preference').notNull().default('auto'),
  reminders: jsonb('reminders').$type<Reminders>().notNull(),
  devices: jsonb('devices').$type<Devices>().notNull(),
  plan: text('plan').notNull().default('free'),
  planExpiresAt: ts('plan_expires_at'),
  onboardingDone: boolean('onboarding_done').notNull().default(false),
  timezone: text('timezone').notNull().default('Europe/Riga'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const personalities = pgTable('personalities', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  answers: jsonb('answers').$type<number[]>().notNull(),
  scores: jsonb('scores').$type<Record<Trait, number>>().notNull(),
  levels: jsonb('levels').$type<PersonalityLevels>().notNull(),
  styleName: text('style_name').notNull(),
  styleDescription: text('style_description').notNull(),
  testedAt: ts('tested_at').notNull(),
  retestFrom: day('retest_from').notNull(),
});

export const magicLinks = pgTable('magic_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    /** Set when the token was rotated; presenting it again means reuse. */
    replacedById: uuid('replaced_by_id'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('refresh_tokens_family_idx').on(t.familyId)],
);

export const exportTokens = pgTable('export_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  userId: userRef(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

// ---------------------------------------------------------------- nutrition

export const photos = pgTable('photos', {
  key: text('key').primaryKey(),
  userId: userRef(),
  mediaType: text('media_type').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const meals = pgTable(
  'meals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    date: day('date').notNull(),
    type: text('type').notNull(),
    eatenAt: ts('eaten_at').notNull(),
    source: text('source').notNull(),
    photoKey: text('photo_key'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('meals_user_date_idx').on(t.userId, t.date)],
);

export const mealItems = pgTable(
  'meal_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mealId: uuid('meal_id')
      .notNull()
      .references(() => meals.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    grams: doublePrecision('grams').notNull(),
    per100g: jsonb('per100g').$type<Nutrients>().notNull(),
    portionLabel: text('portion_label'),
  },
  (t) => [index('meal_items_meal_idx').on(t.mealId)],
);

export const favourites = pgTable('favourites', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  name: text('name').notNull(),
  items: jsonb('items').$type<CreateMealRequest['items']>().notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const waterDays = pgTable(
  'water_days',
  { userId: userRef(), date: day('date').notNull(), ml: integer('ml').notNull() },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export const weights = pgTable(
  'weights',
  { userId: userRef(), date: day('date').notNull(), kg: doublePrecision('kg').notNull() },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export const analysisUsage = pgTable(
  'analysis_usage',
  { userId: userRef(), date: day('date').notNull(), count: integer('count').notNull() },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export const barcodeCache = pgTable('barcode_cache', {
  ean: text('ean').primaryKey(),
  item: jsonb('item').$type<FoodItemDraft | null>(),
  fetchedAt: ts('fetched_at').notNull().defaultNow(),
});

// ---------------------------------------------------------------- health

export const healthDays = pgTable(
  'health_days',
  {
    userId: userRef(),
    date: day('date').notNull(),
    steps: integer('steps').notNull(),
    activeKcal: integer('active_kcal').notNull(),
    restingHr: integer('resting_hr'),
    hrvMs: doublePrecision('hrv_ms'),
    source: text('source').notNull(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export const sleepNights = pgTable(
  'sleep_nights',
  {
    userId: userRef(),
    date: day('date').notNull(),
    bedtime: text('bedtime').notNull(),
    wakeTime: text('wake_time').notNull(),
    totalMin: integer('total_min').notNull(),
    deepMin: integer('deep_min').notNull(),
    remMin: integer('rem_min').notNull(),
    lightMin: integer('light_min').notNull(),
    awakeMin: integer('awake_min').notNull(),
    source: text('source').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export const workouts = pgTable(
  'workouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    externalId: text('external_id'),
    type: text('type').notNull(),
    name: text('name').notNull(),
    startedAt: ts('started_at').notNull(),
    durationMin: integer('duration_min').notNull(),
    kcal: integer('kcal'),
    avgHr: integer('avg_hr'),
    zones: jsonb('zones').$type<HrZones>(),
    device: text('device'),
    source: text('source').notNull(),
  },
  (t) => [unique('workouts_user_external_uq').on(t.userId, t.externalId), index('workouts_user_started_idx').on(t.userId, t.startedAt)],
);

// ---------------------------------------------------------------- AI copy

export const tips = pgTable(
  'tips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    date: day('date').notNull(),
    tone: text('tone').notNull(),
    angle: text('angle'),
    body: text('body').notNull(),
    highlight: text('highlight'),
    accepted: boolean('accepted').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('tips_user_date_idx').on(t.userId, t.date)],
);

export const weeklyQuestions = pgTable(
  'weekly_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    week: day('week').notNull(),
    tone: text('tone').notNull(),
    question: text('question').notNull(),
    options: jsonb('options').$type<WeeklyQuestionOption[]>().notNull(),
    answerIndex: integer('answer_index'),
    answeredAt: ts('answered_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [unique('weekly_questions_user_week_uq').on(t.userId, t.week)],
);

/** Cached tone-engine copy that is not a tip, e.g. the trends insight. */
export const insights = pgTable(
  'insights',
  {
    userId: userRef(),
    date: day('date').notNull(),
    kind: text('kind').notNull(),
    text: text('text').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date, t.kind] })],
);

// ---------------------------------------------------------------- push

export const pushTokens = pgTable('push_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  token: text('token').notNull().unique(),
  platform: text('platform').notNull(),
  timezone: text('timezone').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** One row per push (or scheduled job) actually fired; the primary key is the dedupe key. */
export const pushLog = pgTable(
  'push_log',
  {
    userId: userRef(),
    kind: text('kind').notNull(),
    localDate: day('local_date').notNull(),
    slot: text('slot').notNull(),
    sentAt: ts('sent_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.localDate, t.slot] })],
);

export type UserRow = typeof users.$inferSelect;
export type MealRow = typeof meals.$inferSelect;
export type MealItemRow = typeof mealItems.$inferSelect;
export type WorkoutRow = typeof workouts.$inferSelect;
export type SleepNightRow = typeof sleepNights.$inferSelect;
export type TipRow = typeof tips.$inferSelect;
export type WeeklyQuestionRow = typeof weeklyQuestions.$inferSelect;
export type PersonalityRow = typeof personalities.$inferSelect;
