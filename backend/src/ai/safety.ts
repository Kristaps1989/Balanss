import type { FastifyBaseLogger } from 'fastify';

import type { Sex } from '../../../shared/api';
import { copyViolation, KCAL_FLOOR, mentionsKcalBelow } from '../../../shared/safety';

/**
 * Ethics / safety gate for every piece of generated copy (tips, pushes, weekly
 * questions and replies, insights, weekly summaries, recipe texts).
 *
 * Wraps the shared rules (`copyViolation`, `mentionsKcalBelow`) and adds the
 * backend's own checks: length, emoji, markup, and a few extra phrasings that
 * frame food as something to restrict or that turn meal ideas into "diet food".
 * In care mode anything about deficits or weight loss is rejected as well.
 *
 * Claude output that fails any check is dropped and replaced by the reviewed
 * templates; the reason (never the content) is logged.
 */

const EMOJI = /\p{Extended_Pictographic}/u;

/** Backend-only additions to shared BANNED_PATTERNS (lower-case Latvian stems). */
const EXTRA_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /ēd(ie)? mazāk|samazin(i|ā) (porcij|ēdien|maltīt)|atsakies no|aizliegt|nedrīkst ēst|ierobežo(t|jot|) (ēdien|kalorij|ēšan)|neēd\p{L}*/iu, why: 'restriction' },
  // "izlaist" / "izlaid" anywhere together with a meal word ("vakariņas vari izlaist").
  { re: /^(?=.*izlai[ds])(?=.*(maltīt|brokast|pusdien|vakariņ|ēdienreiz))/is, why: 'restriction' },
  { re: /mazkalorij|zemas kaloritātes|low.?cal|diētisk|bez vainas apziņas|grēcīg/i, why: 'diet framing' },
  { re: /jānopelna|jāatstrādā|par sodu/i, why: 'compensation' },
  { re: /figūr|ķermeņa form|izskat(ie)?s (labāk|tievāk)|vēder(a|u) (tauk|plakan)/i, why: 'body talk' },
];

/** In care mode no deficit or weight-loss content at all. */
const CARE_PATTERNS: RegExp = /deficīt|svara (zudum|samazin|kritum)|samazināt svaru|nomest svaru|tievē|mazāk kalorij|mazāk kcal|kcal (atlik|paliek)|atlikušās kcal|pārsniedz|virs mērķa|par daudz/i;

export interface SafetyContext {
  sex: Sex;
  /** Care mode active: stricter rules. */
  care?: boolean;
}

/**
 * Why `text` may not be shown, or null when it is fine.
 * `max` is the length limit for this piece of copy.
 */
export function copyIssue(text: string, max: number, ctx: SafetyContext): string | null {
  const t = text.trim();
  if (!t) return 'empty';
  if (t.length > max) return 'length';
  if (EMOJI.test(t)) return 'emoji';
  if (/[<>{}]/.test(t)) return 'markup';
  const shared = copyViolation(t);
  if (shared) return shared;
  if (mentionsKcalBelow(t, KCAL_FLOOR[ctx.sex])) return 'kcal below floor';
  const lower = ` ${t.toLowerCase()} `;
  for (const p of EXTRA_PATTERNS) if (p.re.test(lower)) return p.why;
  if (ctx.care && CARE_PATTERNS.test(lower)) return 'care mode';
  return null;
}

/** First issue among several texts (each with its own limit), or null. */
export function firstIssue(texts: [string, number][], ctx: SafetyContext): string | null {
  for (const [text, max] of texts) {
    const issue = copyIssue(text, max, ctx);
    if (issue) return issue;
  }
  return null;
}

/** Log a rejected AI output: route and reason only, never the text. */
export function logSafetyRejection(log: FastifyBaseLogger, route: string, reason: string): void {
  log.warn({ ai: { route, reason: `safety:${reason}` } }, 'ai call failed, using fallback copy');
}
