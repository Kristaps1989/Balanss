import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';

import type { Config } from '../config';
import type { Db } from '../db/client';
import {
  analysisUsage,
  exportTokens,
  favourites,
  healthDays,
  insights,
  magicLinks,
  mealItems,
  meals,
  personalities,
  photos,
  pushTokens,
  recipes,
  sleepNights,
  tips,
  users,
  waterDays,
  weeklyQuestions,
  weeklySummaries,
  weights,
  workouts,
} from '../db/schema';
import { randomToken, sha256 } from '../lib/crypto';
import { deletePhotoFiles } from './photos';
import { effectivePlan } from './users';

export const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;

export async function createExportToken(db: Db, config: Config, userId: string, now: Date) {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + EXPORT_TTL_MS);
  await db.insert(exportTokens).values({ tokenHash: sha256(token), userId, expiresAt });
  return { downloadUrl: `${config.publicApiUrl}/v1/exports/${token}`, expiresAt: expiresAt.toISOString() };
}

/** Marks the token used (single use) and returns its user, or null if unknown / used / expired. */
export async function redeemExportToken(db: Db, token: string, now: Date): Promise<string | null> {
  const [row] = await db
    .update(exportTokens)
    .set({ usedAt: now })
    .where(and(eq(exportTokens.tokenHash, sha256(token)), isNull(exportTokens.usedAt), gt(exportTokens.expiresAt, now)))
    .returning({ userId: exportTokens.userId });
  return row?.userId ?? null;
}

const redact = (token: string) => (token.length > 12 ? `${token.slice(0, 12)}…` : '…');

/** Everything stored about the user (GDPR Art. 15/20), as plain JSON. */
export async function collectExport(db: Db, userId: string, now: Date) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return null;
  const [personality, mealRows, favs, water, weightRows, health, nights, workoutRows, tipRows, weekly, tokens, usage, insightRows, photoRows, summaryRows, recipeRows] =
    await Promise.all([
      db.select().from(personalities).where(eq(personalities.userId, userId)),
      db.select().from(meals).where(eq(meals.userId, userId)).orderBy(asc(meals.eatenAt)),
      db.select().from(favourites).where(eq(favourites.userId, userId)),
      db.select().from(waterDays).where(eq(waterDays.userId, userId)).orderBy(asc(waterDays.date)),
      db.select().from(weights).where(eq(weights.userId, userId)).orderBy(asc(weights.date)),
      db.select().from(healthDays).where(eq(healthDays.userId, userId)).orderBy(asc(healthDays.date)),
      db.select().from(sleepNights).where(eq(sleepNights.userId, userId)).orderBy(asc(sleepNights.date)),
      db.select().from(workouts).where(eq(workouts.userId, userId)).orderBy(asc(workouts.startedAt)),
      db.select().from(tips).where(eq(tips.userId, userId)).orderBy(asc(tips.createdAt)),
      db.select().from(weeklyQuestions).where(eq(weeklyQuestions.userId, userId)).orderBy(asc(weeklyQuestions.week)),
      db.select().from(pushTokens).where(eq(pushTokens.userId, userId)),
      db.select().from(analysisUsage).where(eq(analysisUsage.userId, userId)),
      db.select().from(insights).where(eq(insights.userId, userId)),
      db.select().from(photos).where(eq(photos.userId, userId)),
      db.select().from(weeklySummaries).where(eq(weeklySummaries.userId, userId)).orderBy(asc(weeklySummaries.date)),
      db.select().from(recipes).where(eq(recipes.userId, userId)).orderBy(asc(recipes.date), asc(recipes.position)),
    ]);
  const items = mealRows.length ? await db.select().from(mealItems).where(inArray(mealItems.mealId, mealRows.map((m) => m.id))) : [];
  const p = personality[0];
  return {
    exportedAt: now.toISOString(),
    format: 'balanss-export-v1',
    account: {
      id: user.id,
      email: user.email,
      signIn: { google: !!user.googleSub, apple: !!user.appleSub, email: true },
      plan: effectivePlan(user, now),
      planExpiresAt: user.planExpiresAt?.toISOString() ?? null,
      onboardingDone: user.onboardingDone,
      timezone: user.timezone,
      createdAt: user.createdAt.toISOString(),
    },
    profile: user.profile,
    targets: user.targets,
    targetsEditedManually: user.targetsEdited,
    preferences: user.preferences,
    aiPersonalization: user.aiPersonalization,
    tonePreference: user.tonePreference,
    reminders: user.reminders,
    devices: user.devices,
    personality: p
      ? {
          consent: true,
          answers: p.answers,
          scores: p.scores,
          levels: p.levels,
          styleName: p.styleName,
          styleDescription: p.styleDescription,
          testedAt: p.testedAt.toISOString(),
          retestFrom: p.retestFrom,
        }
      : null,
    meals: mealRows.map((m) => ({
      id: m.id,
      date: m.date,
      type: m.type,
      eatenAt: m.eatenAt.toISOString(),
      source: m.source,
      photoKey: m.photoKey,
      items: items
        .filter((i) => i.mealId === m.id)
        .sort((a, b) => a.position - b.position)
        .map((i) => ({ name: i.name, grams: i.grams, per100g: i.per100g, portionLabel: i.portionLabel })),
    })),
    favourites: favs.map((f) => ({ id: f.id, name: f.name, items: f.items, createdAt: f.createdAt.toISOString() })),
    water: water.map((w) => ({ date: w.date, ml: w.ml })),
    weights: weightRows.map((w) => ({ date: w.date, kg: w.kg })),
    healthDays: health.map((h) => ({ date: h.date, steps: h.steps, activeKcal: h.activeKcal, restingHr: h.restingHr, hrvMs: h.hrvMs, source: h.source })),
    sleepNights: nights.map(({ userId: _u, ...n }) => n),
    workouts: workoutRows.map(({ userId: _u, ...w }) => ({ ...w, startedAt: w.startedAt.toISOString() })),
    tips: tipRows.map((t) => ({
      date: t.date,
      tone: t.tone,
      angle: t.angle,
      body: t.body,
      highlight: t.highlight,
      accepted: t.accepted,
      dismissed: t.dismissed,
      reported: t.hidden ? { reason: t.reportReason, at: t.reportedAt?.toISOString() ?? null } : null,
      aiGenerated: t.aiGenerated,
      createdAt: t.createdAt.toISOString(),
    })),
    weeklyQuestions: weekly.map((q) => ({
      week: q.week,
      tone: q.tone,
      question: q.question,
      options: q.options,
      answerIndex: q.answerIndex,
      basedOn: q.basedOn,
      aiGenerated: q.aiGenerated,
    })),
    weeklySummaries: summaryRows.map((w) => ({ week: w.week, date: w.date, summary: w.summary })),
    recipes: recipeRows.map((r) => ({ id: r.id, date: r.date, mealType: r.mealType, recipe: r.recipe, aiGenerated: r.aiGenerated })),
    insights: insightRows.map((i) => ({ date: i.date, kind: i.kind, text: i.text })),
    photoAnalyses: usage.map((u) => ({ date: u.date, count: u.count })),
    photos: photoRows.map((ph) => ({ key: ph.key, mediaType: ph.mediaType, createdAt: ph.createdAt.toISOString() })),
    pushTokens: tokens.map((t) => ({ token: redact(t.token), platform: t.platform, timezone: t.timezone, updatedAt: t.updatedAt.toISOString() })),
  };
}

/** Hard delete: the user row cascades to every table; stored photo files are removed too. */
export async function deleteAccount(db: Db, config: Config, userId: string): Promise<void> {
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  if (!user) return;
  const keys = (await db.select({ key: photos.key }).from(photos).where(eq(photos.userId, userId))).map((p) => p.key);
  await db.transaction(async (tx) => {
    await tx.delete(magicLinks).where(eq(magicLinks.email, user.email));
    await tx.delete(users).where(eq(users.id, userId));
  });
  await deletePhotoFiles(config, keys);
}
