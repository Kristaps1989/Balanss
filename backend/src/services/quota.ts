import { and, eq, lt, sql } from 'drizzle-orm';

import type { Quota } from '../../../shared/api';
import type { Db } from '../db/client';
import { analysisUsage, type UserRow } from '../db/schema';
import { localNow } from '../lib/time';
import { effectivePlan } from './users';

export const userToday = (user: Pick<UserRow, 'timezone'>, now: Date) => localNow(user.timezone, now).date;

export async function getQuota(db: Db, user: UserRow, limit: number, now: Date): Promise<Quota> {
  const plan = effectivePlan(user, now);
  const [row] = await db
    .select()
    .from(analysisUsage)
    .where(and(eq(analysisUsage.userId, user.id), eq(analysisUsage.date, userToday(user, now))));
  const used = row?.count ?? 0;
  if (plan === 'pro') return { plan, photoAnalysesLimit: null, photoAnalysesUsed: used, photoAnalysesLeft: null };
  return { plan, photoAnalysesLimit: limit, photoAnalysesUsed: used, photoAnalysesLeft: Math.max(0, limit - used) };
}

/**
 * Atomically count one analysis. Returns false when a free user already used
 * the daily limit (the counter is not incremented then).
 */
export async function consumeAnalysis(db: Db, user: UserRow, limit: number, now: Date): Promise<boolean> {
  const date = userToday(user, now);
  const pro = effectivePlan(user, now) === 'pro';
  const rows = await db
    .insert(analysisUsage)
    .values({ userId: user.id, date, count: 1 })
    .onConflictDoUpdate({
      target: [analysisUsage.userId, analysisUsage.date],
      set: { count: sql`${analysisUsage.count} + 1` },
      setWhere: pro ? undefined : lt(analysisUsage.count, limit),
    })
    .returning({ count: analysisUsage.count });
  return rows.length > 0;
}
