import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

import type { FoodPreferences, Sex, ToneStyle, WeeklySummary } from '../../../shared/api';
import type { ToneModifiers } from '../../../shared/personality';
import { fmtDuration, fmtInt } from '../lib/format';
import type { AnalysisFinding } from './analysis';
import { callStructured, logAiFailure, type ClaudeClient } from './claude';
import { FINDING_TITLE, findingHeadline, findingQuestion, findingSuggestion, pickQuestionFinding } from './question-templates';
import { firstIssue, logSafetyRejection } from './safety';
import { dataBlock, LIMITS, TONE_SYSTEM } from './tone';
import type { ToneHistory } from './tone-types';

/**
 * Weekly summary (Pro): headline, 2–3 observations, one small optional
 * suggestion and one reflection question, built from the deterministic findings
 * and the user's history. Claude only phrases it; the template version below is
 * the fallback (and the only version with AI personalisation off).
 */

export interface SummaryInput {
  date: string;
  sex: Sex;
  tone: ToneStyle;
  modifiers: ToneModifiers;
  care: boolean;
  preferences: FoodPreferences;
  findings: AnalysisFinding[];
  stats: WeeklySummary['stats'];
  history: ToneHistory;
  periodStart: string;
  periodEnd: string;
}

export type SummaryCopy = Pick<WeeklySummary, 'headline' | 'observations' | 'suggestion' | 'reflection' | 'aiGenerated'>;

/** Said at most once, and only in care mode. */
export const CARE_DOCTOR_LINE = 'Ja ēšana vai svars rada satraukumu, par to vērts parunāt ar ģimenes ārstu.';

export function templateSummary(input: SummaryInput): SummaryCopy {
  const ctx = { tone: input.tone, care: input.care, preferences: input.preferences };
  const s = input.stats;
  const positives = input.findings.filter((f) => f.polarity === 'positive');
  const opportunities = input.findings.filter((f) => f.polarity === 'opportunity');

  // 2–3 observations: at least one positive when there is one, strongest first.
  const picked: AnalysisFinding[] = [];
  if (positives[0]) picked.push(positives[0]);
  for (const f of input.findings) if (picked.length < 3 && !picked.includes(f)) picked.push(f);
  const observations = picked.map((f) => ({ title: FINDING_TITLE[f.kind], text: f.fact }));

  // Top up from plain stats when there are fewer than 2 findings.
  const statObs: { title: string; text: string }[] = [
    { title: 'Ieraksti', text: `Šonedēļ ${s.daysLogged} ${s.daysLogged === 1 ? 'diena' : 'dienas'} ar vismaz 2 ierakstītām maltītēm.` },
    ...(s.avgSteps != null ? [{ title: 'Kustība', text: `Vidēji ${fmtInt(s.avgSteps)} soļu dienā.` }] : []),
    ...(s.avgSleepMin != null ? [{ title: 'Miegs', text: `Vidēji ${fmtDuration(s.avgSleepMin)} miega naktī.` }] : []),
  ];
  for (const o of statObs) if (observations.length < 2) observations.push(o);
  if (observations.length < 2) observations.push({ title: 'Nākamā nedēļa', text: 'Jo vairāk dienu būs ierakstītas, jo precīzāk varēsim pamanīt, kas tev palīdz.' });

  const lead = positives[0] ?? input.findings[0] ?? null;
  const focus = opportunities[0] ?? null;
  const reflectFinding = pickQuestionFinding({ date: input.date, history: input.history, findings: input.findings });

  let headline = lead ? findingHeadline(lead) : 'Datu vēl ir maz — sāksim ar to, kas ir';
  let suggestion = focus ? findingSuggestion(focus, ctx) : 'Ja gribi, turpini tāpat — tas, kas strādā, lai paliek.';
  if (input.care) {
    headline = 'Šonedēļ svarīgākais — regulāras maltītes un atpūta';
    suggestion = `Ja gribi, nākamnedēļ pamēģini ēst ik 3–4 stundas un atrast brīdi atpūtai. ${CARE_DOCTOR_LINE}`;
  }
  const reflection = reflectFinding ? findingQuestion(reflectFinding, ctx).question : input.care ? 'Kas tev šonedēļ palīdzēja justies labi?' : 'Kas šonedēļ tev palīdzēja visvairāk?';

  return { headline, observations: observations.slice(0, 3), suggestion, reflection, aiGenerated: false };
}

const SummarySchema = z.object({
  headline: z.string(),
  observations: z.array(z.object({ title: z.string(), text: z.string() })),
  suggestion: z.string(),
  reflection: z.string(),
});

export function validSummary(out: z.infer<typeof SummarySchema>, input: SummaryInput): SummaryCopy | string {
  if (out.observations.length < 2 || out.observations.length > 3) return 'observations';
  const issue = firstIssue(
    [
      [out.headline, LIMITS.headline],
      ...out.observations.flatMap((o): [string, number][] => [[o.title, LIMITS.obsTitle], [o.text, LIMITS.obsText]]),
      [out.suggestion, LIMITS.suggestion],
      [out.reflection, LIMITS.reflection],
    ],
    { sex: input.sex, care: input.care },
  );
  if (issue) return issue;
  // The doctor line is allowed once, in care mode only.
  const all = [out.headline, ...out.observations.map((o) => o.text), out.suggestion, out.reflection].join(' ');
  const doctor = (all.match(/ārst/gi) ?? []).length;
  if (doctor > (input.care ? 1 : 0)) return 'doctor_mention';
  return {
    headline: out.headline.trim(),
    observations: out.observations.map((o) => ({ title: o.title.trim(), text: o.text.trim() })),
    suggestion: out.suggestion.trim(),
    reflection: out.reflection.trim(),
    aiGenerated: true,
  };
}

export interface SummaryEngine {
  weeklySummary(input: SummaryInput, log: FastifyBaseLogger): Promise<SummaryCopy>;
}

export const fakeSummaryEngine: SummaryEngine = { weeklySummary: async (input) => templateSummary(input) };

export function claudeSummaryEngine(client: ClaudeClient, model: string): SummaryEngine {
  return {
    async weeklySummary(input, log) {
      const task = `Uzraksti nedēļas kopsavilkumu tonī "${input.tone}" par periodu ${input.periodStart}–${input.periodEnd}: virsraksts, 2–3 novērojumi, viens mazs neobligāts ieteikums un viens pārdomu jautājums.`;
      const data = {
        sex: input.sex,
        tone: input.tone,
        modifiers: input.modifiers,
        care: input.care,
        preferences: input.preferences,
        findings: input.findings.slice(0, 6).map((f) => ({ kind: f.kind, polarity: f.polarity, fact: f.fact })),
        stats: input.stats,
        history: input.history,
      };
      try {
        const out = await callStructured(client, model, log, {
          route: 'insights.weekly',
          system: TONE_SYSTEM,
          schema: SummarySchema,
          effort: 'medium',
          maxTokens: 8000,
          content: dataBlock(task, data),
        });
        const s = validSummary(out, input);
        if (typeof s !== 'string') return s;
        logSafetyRejection(log, 'insights.weekly', s);
      } catch (err) {
        logAiFailure(log, 'insights.weekly', err);
      }
      return templateSummary(input);
    },
  };
}
