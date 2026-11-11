import { and, isNotNull, lt, or } from 'drizzle-orm';

import type { Db } from '../db/client';
import { analysisUsage, exportTokens, leisureUsage, magicLinks, pushLog, refreshTokens } from '../db/schema';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Keep a day after expiry so a just-expired token still gets a clear "expired" answer. */
const TOKEN_GRACE_MS = DAY_MS;
/** Push dedupe and daily quota counters only matter for the current day; keep a month for support. */
const COUNTER_RETENTION_MS = 35 * DAY_MS;

export interface CleanupResult {
  magicLinks: number;
  refreshTokens: number;
  exportTokens: number;
  pushLog: number;
  usage: number;
}

/**
 * Data minimisation (GDPR art. 5(1)(e)): removes sign-in, export and bookkeeping rows nobody can use
 * any more. Refresh tokens are kept until they expire even when revoked or rotated, so presenting an
 * old one is still detected as reuse.
 */
export async function cleanupExpired(db: Db, now: Date): Promise<CleanupResult> {
  const tokenCutoff = new Date(now.getTime() - TOKEN_GRACE_MS);
  const counterCutoff = new Date(now.getTime() - COUNTER_RETENTION_MS);
  const counterDay = counterCutoff.toISOString().slice(0, 10);

  const ml = await db
    .delete(magicLinks)
    .where(or(lt(magicLinks.expiresAt, tokenCutoff), and(isNotNull(magicLinks.usedAt), lt(magicLinks.usedAt, tokenCutoff))))
    .returning({ id: magicLinks.id });
  const rt = await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, tokenCutoff)).returning({ id: refreshTokens.id });
  const et = await db
    .delete(exportTokens)
    .where(or(lt(exportTokens.expiresAt, tokenCutoff), and(isNotNull(exportTokens.usedAt), lt(exportTokens.usedAt, tokenCutoff))))
    .returning({ t: exportTokens.tokenHash });
  const pl = await db.delete(pushLog).where(lt(pushLog.sentAt, counterCutoff)).returning({ k: pushLog.kind });
  const au = await db.delete(analysisUsage).where(lt(analysisUsage.date, counterDay)).returning({ d: analysisUsage.date });
  const lu = await db.delete(leisureUsage).where(lt(leisureUsage.date, counterDay)).returning({ d: leisureUsage.date });

  return { magicLinks: ml.length, refreshTokens: rt.length, exportTokens: et.length, pushLog: pl.length, usage: au.length + lu.length };
}
