import { and, desc, eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';

import type { Tip, WeeklyQuestion } from '../../../shared/api';
import { mondayOf } from '../../../shared/dates';
import type { AppDeps } from '../deps';
import { tips, weeklyQuestions, type UserRow } from '../db/schema';
import { weekdayOf } from '../lib/time';
import { buildToneInput, toTip, toWeeklyQuestion } from './day';
import { getPersonality } from './users';

/** Today's tip: generated once per user and date, then stored. */
export async function getOrCreateTip(deps: AppDeps, user: UserRow, date: string, log: FastifyBaseLogger): Promise<Tip> {
  const [existing] = await deps.db
    .select()
    .from(tips)
    .where(and(eq(tips.userId, user.id), eq(tips.date, date)))
    .orderBy(desc(tips.createdAt))
    .limit(1);
  if (existing) return toTip(existing);
  return createTip(deps, user, date, [], log);
}

/** Another tip for the same day, from a different angle than every earlier one. */
export async function nextTip(deps: AppDeps, user: UserRow, date: string, log: FastifyBaseLogger): Promise<Tip> {
  const previous = await deps.db
    .select({ body: tips.body })
    .from(tips)
    .where(and(eq(tips.userId, user.id), eq(tips.date, date)));
  return createTip(
    deps,
    user,
    date,
    previous.map((p) => p.body),
    log,
  );
}

async function createTip(deps: AppDeps, user: UserRow, date: string, exclude: string[], log: FastifyBaseLogger): Promise<Tip> {
  const personality = await getPersonality(deps.db, user.id);
  const input = await buildToneInput(deps.db, deps.config, user, personality, date);
  const tip = await deps.ai.tone.tip(input, exclude, log);
  const [row] = await deps.db
    .insert(tips)
    .values({ userId: user.id, date, tone: input.tone, angle: tip.angle, body: tip.body, highlight: tip.highlight })
    .returning();
  return toTip(row!);
}

/**
 * The weekly question for the week containing `date`. Generated for the week's
 * Monday on Friday–Sunday if missing; earlier in the week only an existing one
 * is returned.
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
  const input = await buildToneInput(deps.db, deps.config, user, personality, date);
  const q = await deps.ai.tone.weeklyQuestion(input, log);
  await deps.db
    .insert(weeklyQuestions)
    .values({ userId: user.id, week, tone: input.tone, question: q.question, options: q.options })
    .onConflictDoNothing();
  const [row] = await deps.db
    .select()
    .from(weeklyQuestions)
    .where(and(eq(weeklyQuestions.userId, user.id), eq(weeklyQuestions.week, week)));
  return toWeeklyQuestion(row!);
}
