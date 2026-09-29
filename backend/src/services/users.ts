import { eq } from 'drizzle-orm';

import type { CareStatus, Devices, FoodPreferences, Me, Personality, Plan, Profile, Reminders, TonePreference } from '../../../shared/api';
import { effectiveTone } from '../../../shared/personality';
import { computeTargets } from '../../../shared/targets';
import type { Db } from '../db/client';
import { personalities, users, type PersonalityRow, type UserRow } from '../db/schema';
import { AppError, unauthorized } from '../errors';
import { localNow } from '../lib/time';
import { careFor } from './analysis';

export const DEFAULT_PROFILE: Profile = {
  firstName: '',
  age: 35,
  heightCm: 170,
  weightKg: 70,
  sex: 'x',
  activity: 'light',
  goals: ['health'],
  weightDirection: null,
  goalWeightKg: null,
};

export const DEFAULT_REMINDERS: Reminders = {
  water: true,
  food: true,
  move: false,
  sleepWindow: true,
  frequency: 'mid',
  sleepLeadMin: 45,
};

export const DEFAULT_DEVICES: Devices = { source: null, connected: false, devices: [], lastSyncAt: null };

export const DEFAULT_PREFERENCES: FoodPreferences = { diet: 'any', avoid: [] };

export function newUserValues(email: string, extra: { firstName?: string | null; googleSub?: string; appleSub?: string; timezone?: string } = {}) {
  const profile: Profile = { ...DEFAULT_PROFILE, firstName: extra.firstName?.trim().slice(0, 60) ?? '' };
  return {
    email,
    googleSub: extra.googleSub ?? null,
    appleSub: extra.appleSub ?? null,
    profile,
    targets: computeTargets(profile),
    reminders: DEFAULT_REMINDERS,
    devices: DEFAULT_DEVICES,
    ...(extra.timezone ? { timezone: extra.timezone } : {}),
  };
}

/** Pro counts only while the entitlement has not expired. */
export function effectivePlan(user: Pick<UserRow, 'plan' | 'planExpiresAt'>, now = new Date()): Plan {
  if (user.plan !== 'pro') return 'free';
  return !user.planExpiresAt || user.planExpiresAt > now ? 'pro' : 'free';
}

export function toPersonality(row: PersonalityRow | null | undefined): Personality | null {
  if (!row) return null;
  return {
    consent: true,
    levels: row.levels,
    scores: row.scores,
    styleName: row.styleName,
    styleDescription: row.styleDescription,
    testedAt: row.testedAt.toISOString(),
    retestFrom: row.retestFrom,
  };
}

/** 402 `pro_required` unless the user has an active Pro entitlement. */
export function requirePro(user: Pick<UserRow, 'plan' | 'planExpiresAt'>, now: Date): void {
  if (effectivePlan(user, now) !== 'pro') throw new AppError(402, 'pro_required', 'This feature is part of Balanss Pro');
}

export function toMe(user: UserRow, personality: PersonalityRow | null | undefined, care: CareStatus): Me {
  const pref = user.tonePreference as TonePreference;
  return {
    id: user.id,
    email: user.email,
    profile: user.profile,
    targets: user.targets,
    preferences: user.preferences ?? DEFAULT_PREFERENCES,
    aiPersonalization: user.aiPersonalization,
    care,
    personality: toPersonality(personality),
    tonePreference: pref,
    tone: effectiveTone(pref, personality?.levels ?? null),
    reminders: user.reminders,
    devices: user.devices,
    plan: effectivePlan(user),
    onboardingDone: user.onboardingDone,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function getUser(db: Db, userId: string): Promise<UserRow> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw unauthorized('invalid_token', 'User no longer exists');
  return user;
}

export async function getPersonality(db: Db, userId: string): Promise<PersonalityRow | null> {
  const [row] = await db.select().from(personalities).where(eq(personalities.userId, userId));
  return row ?? null;
}

/** Me, with care mode computed as of the user's local today. */
export async function loadMe(db: Db, userId: string, now: Date = new Date()): Promise<Me> {
  const [user, p] = await Promise.all([getUser(db, userId), getPersonality(db, userId)]);
  const care = await careFor(db, user, localNow(user.timezone, now).date);
  return toMe(user, p, care);
}
