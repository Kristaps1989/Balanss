import { z } from 'zod';

/** Request schemas mirroring shared/api.ts. */

export const DateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'not a valid date');

export const HmStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM');
export const IsoStr = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'expected an ISO 8601 timestamp');

export const NutrientsSchema = z.object({
  kcal: z.number().min(0).max(1000),
  proteinG: z.number().min(0).max(100),
  carbsG: z.number().min(0).max(100),
  fatG: z.number().min(0).max(100),
  fibreG: z.number().min(0).max(100),
});

export const ItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  grams: z.number().min(0).max(5000),
  per100g: NutrientsSchema,
  portionLabel: z.string().trim().max(40).nullish(),
});

export const MealType = z.enum(['breakfast', 'lunch', 'snack', 'dinner']);
export const MealSource = z.enum(['photo', 'text', 'barcode', 'favourite', 'manual']);
export const HealthSource = z.enum(['apple_health', 'health_connect', 'manual']);
export const WorkoutType = z.enum(['walk', 'nordic_walk', 'run', 'bike', 'yoga', 'strength', 'swim', 'other']);
export const ToneStyle = z.enum(['plan', 'novelty', 'gentle', 'neutral']);

export const ProfilePatch = z
  .object({
    firstName: z.string().trim().max(60),
    age: z.number().int().min(13).max(120),
    heightCm: z.number().min(100).max(250),
    weightKg: z.number().min(30).max(350),
    sex: z.enum(['f', 'm', 'x']),
    activity: z.enum(['sit', 'light', 'active', 'very']),
    goals: z.array(z.enum(['health', 'fit', 'weight', 'routine'])).max(4),
    weightDirection: z.enum(['down', 'up']).nullable(),
    goalWeightKg: z.number().min(30).max(350).nullable(),
  })
  .partial()
  .strict();

export const TargetsPatch = z
  .object({
    kcal: z.number().int().min(800).max(6000),
    proteinG: z.number().min(0).max(400),
    carbsG: z.number().min(0).max(1000),
    fatG: z.number().min(0).max(400),
    fibreG: z.number().min(0).max(150),
    waterMl: z.number().int().min(500).max(6000),
    steps: z.number().int().min(0).max(60000),
    sleepMin: z.number().int().min(240).max(720),
  })
  .partial()
  .strict();

export const RemindersPatch = z
  .object({
    water: z.boolean(),
    food: z.boolean(),
    move: z.boolean(),
    sleepWindow: z.boolean(),
    frequency: z.enum(['low', 'mid', 'high']),
    sleepLeadMin: z.union([z.literal(30), z.literal(45), z.literal(60)]),
  })
  .partial()
  .strict();

export const DevicesPatch = z
  .object({
    source: HealthSource.nullable(),
    connected: z.boolean(),
    devices: z.array(z.string().trim().min(1).max(60)).max(10),
    lastSyncAt: IsoStr.nullable(),
  })
  .partial()
  .strict();

export const CreateMeal = z.object({
  date: DateStr,
  type: MealType,
  eatenAt: IsoStr,
  source: MealSource,
  photoUrl: z.string().max(1000).nullish(),
  items: z.array(ItemSchema).min(1).max(30),
});

export const UpdateMeal = z.object({ type: MealType, items: z.array(ItemSchema).min(1).max(30) }).partial().strict();

export const DaysQuery = z.object({
  days: z.coerce.number().int().min(1).max(31).default(7),
  date: DateStr.optional(),
});

export const DateQuery = z.object({ date: DateStr.optional() });
