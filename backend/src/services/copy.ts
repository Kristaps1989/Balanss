import { and, desc, eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';

import type { Tip, TipReportReason, WeeklyQuestion } from '../../../shared/api';
import { mondayOf } from '../../../shared/dates';
import { copyAiFor } from '../ai';
import type { TipAngle } from '../ai/tone-types';
import type { AppDeps } from '../deps';
import { tips, weeklyQuestions, type UserRow } from '../db/schema';
import { notFound } from '../errors';
import { weekdayOf } from '../lib/time';
import { buildToneInput, toTip, toWeeklyQuestion } from './day';
import { getPersonality } from './users';

/** Today's tip: generated once per user and date, then stored. Reported (hidden) tips are skipped. */
export async function getOrCreateTip(deps: AppDeps, user: UserRow, date: string, log: FastifyBaseLogger): Promise<Tip> {
  const [existing] = await deps.db
    .select()
    .from(tips)
    .where(and(eq(tips.userId, user.id), eq(tips.date, date), eq(tips.hidden, false)))
    .orderBy(desc(tips.createdAt))
    .limit(1);
  if (existing) return toTip(existing);
  return createTip(deps, user, date, log);
}

/**
 * "Cits ieteikums": the tip on screen is marked dismissed (unless it was
 * accepted) and another one is generated, from a different angle than every
 * earlier tip of the day.
 */
export async function nextTip(deps: AppDeps, user: UserRow, date: string, log: FastifyBaseLogger): Promise<Tip> {
  const [current] = await deps.db
    .select()
    .from(tips)
    .where(and(eq(tips.userId, user.id), eq(tips.date, date), eq(tips.hidden, false)))
    .orderBy(desc(tips.createdAt))
    .limit(1);
  if (current && !current.accepted) await deps.db.update(tips).set({ dismissed: true }).where(eq(tips.id, current.id));
  return createTip(deps, user, date, log);
}

/**
 * After the pantry changes: the tip on screen is replaced by one that uses what is at home.
 * Not a "Cits ieteikums" (no dismissal is recorded); an accepted tip is kept in history.
 */
export async function refreshTip(deps: AppDeps, user: UserRow, date: string, log: FastifyBaseLogger): Promise<Tip> {
  const [current] = await deps.db
    .select()
    .from(tips)
    .where(and(eq(tips.userId, user.id), eq(tips.date, date), eq(tips.hidden, false)))
    .orderBy(desc(tips.createdAt))
    .limit(1);
  if (current && !current.accepted) await deps.db.delete(tips).where(eq(tips.id, current.id));
  return createTip(deps, user, date, log);
}

/** Reported tips are hidden for good; the reason is stored for review. The next GET /tips/today avoids its angle. */
export async function reportTip(deps: AppDeps, userId: string, id: string, reason: TipReportReason): Promise<void> {
  const rows = await deps.db
    .update(tips)
    .set({ hidden: true, reportReason: reason, reportedAt: deps.now() })
    .where(and(eq(tips.id, id), eq(tips.userId, userId)))
    .returning({ id: tips.id });
  if (!rows.length) throw notFound('Tip');
}

async function createTip(deps: AppDeps, user: UserRow, date: string, log: FastifyBaseLogger): Promise<Tip> {
  const earlier = await deps.db
    .select({ body: tips.body, angle: tips.angle, hidden: tips.hidden })
    .from(tips)
    .where(and(eq(tips.userId, user.id), eq(tips.date, date)));
  const avoid = [...new Set(earlier.filter((t) => t.hidden && t.angle).map((t) => t.angle as TipAngle))];
  const personality = await getPersonality(deps.db, user.id);
  const input = await buildToneInput(deps.db, deps.config, user, personality, date, undefined, avoid, deps.now());
  const tip = await copyAiFor(deps.ai, user).tone.tip(
    input,
    earlier.map((p) => p.body),
    log,
  );
  const [row] = await deps.db
    .insert(tips)
    .values({ userId: user.id, date, tone: input.tone, angle: tip.angle, body: tip.body, highlight: tip.highlight, aiGenerated: tip.aiGenerated })
    .returning();
  return toTip(row!);
}

/**
 * The weekly question for the week containing `date`. Generated for the week's
 * Monday on Friday–Sunday if missing, from the strongest finding of the last
 * 28 days; earlier in the week only an existing one is returned.
 */
export async function getWeeklyQuestion(deps: AppDeps, user: UserRow, date: string, log: FastifyBaseLogger): Promise<WeeklyQuestion | null> {
  const week = mondayOf(date);
  const [existing] = await deps.db
    .select()
    .from(weeklyQuestions)
    .where(and(eq(weeklyQuestions.userId, user.id), eq(weeklyQuestions.week, week)));
  if (existing) return toWeeklyQuestion(existing);
  if (weekdayOf(date) < 4) return null;

  const personality = await getPersonality(deps.db, user.id);
  const input = await buildToneInput(deps.db, deps.config, user, personality, date, undefined, [], deps.now());
  const q = await copyAiFor(deps.ai, user).tone.weeklyQuestion(input, log);
  await deps.db
    .insert(weeklyQuestions)
    .values({
      userId: user.id,
      week,
      tone: input.tone,
      question: q.question,
      options: q.options,
      basedOn: q.basedOn,
      basedOnKind: q.basedOnKind,
      aiGenerated: q.aiGenerated,
    })
    .onConflictDoNothing();
  const [row] = await deps.db
    .select()
    .from(weeklyQuestions)
    .where(and(eq(weeklyQuestions.userId, user.id), eq(weeklyQuestions.week, week)));
  return toWeeklyQuestion(row!);
}
