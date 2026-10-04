import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

import { callStructured, logAiFailure, type ClaudeClient } from './claude';
import { NEUTRAL_OPTION, pickQuestionFinding } from './question-templates';
import { firstIssue, logSafetyRejection, type SafetyContext } from './safety';
import { fakePushCopy, fakeTip, fakeTrendsInsight, fakeWeeklyQuestion, rankAngles } from './tone-templates';
import { TIP_ANGLES, type PushCopy, type PushKind, type TipAngle, type TipResult, type ToneInput, type TrendsInput, type WeeklyQuestionResult } from './tone-types';

export type { PushCopy, PushKind, TipResult, ToneInput, TrendsInput, WeeklyQuestionResult } from './tone-types';

/**
 * Tone engine: the same numbers, delivered in the user's style.
 *
 * Produces the daily tip (+ highlight fragment), the weekly question (4 options
 * with replies, based on the strongest finding), push copy (sleep / water /
 * food) and the nutrition-trends insight. With a Claude client it writes fresh
 * copy (structured output, effort "medium"); every result is re-validated
 * against the hard rules and the ethics gate (safety.ts) and falls back to the
 * deterministic Latvian templates on any failure.
 *
 * What Claude sees: numbers, short labels, our own finding facts, the history of
 * how earlier copy landed, food preferences and the care flag. Never the name,
 * e-mail or personality scores (tone + modifiers only; sex only for grammar).
 */

export const LIMITS = {
  tip: 240,
  highlight: 40,
  push: 140,
  pushTitle: 50,
  question: 120,
  optionLabel: 40,
  reply: 220,
  insight: 280,
  headline: 80,
  obsTitle: 40,
  obsText: 260,
  suggestion: 220,
  reflection: 140,
};

/** Stable system prompt shared by every copy route (cached). */
export const TONE_SYSTEM = `Tu esi Balanss — ikdienas veselības pavadoņa lietotnes balss. Tu raksti īsus ieteikumus, atgādinājumus, jautājumus, nedēļas kopsavilkumus un maltīšu idejas latviešu valodā, pielāgojot toni lietotāja personībai. Tie paši dati, cits tonis.

Tev iedod datus (uzturs pret mērķiem, ūdens, soļi, miegs un miega logs, pēdējo 7 dienu vidējie), aprēķinātus faktus par pēdējām 4 nedēļām ("findings"), vēsturi par to, kā lietotājs reaģēja uz iepriekšējiem ieteikumiem un jautājumiem ("history"), ēdiena preferences, rūpju režīma karodziņu ("care"), toni un toņa modifikatorus, kā arī uzdevumu. Atbildi tikai ar prasīto struktūru.

TOŅI
- plan (plāns un skaitļi): konkrēti skaitļi no datiem, viens nākamais solis, plāna valoda ("Plāns:", laiks, grami, glāzes). Piemēram: "Šodien trūkst 42 g olbaltumvielu. Plāns: biezpiens brokastīs (+18 g), vista pusdienās (+30 g)."
- novelty (dažādība un jaunais): viena jauna ideja — recepte, maršruts, garšas variācija, jauns ieradums. Ziņkārīgs, viegls tonis. Skaitļi tikai, ja palīdz.
- gentle (maigi, bez spiediena): īsi, atļaujoši teikumi ("ja sanāk", "ja ērti", "bez spiediena", "nekas nav nokavēts"). Nekad neapraksti dienu kā neveiksmi, nesalīdzini ar mērķi kā ar parādu, nelieto "jāizdara", "tev vajag", "nokavēji".
- neutral (neitrāls): īss, lietišķs fakts un, ja vajag, viens ieteikums. Bez emocijām un bez uzslavām.

MODIFIKATORI
- softer=true: vēl maigāk — bez spiediena, mazāk prasību, grūtāka diena nav neveiksme (pat plan tonī).
- social=true: drīkst piedāvāt kopīgu aktivitāti ("ar draugu").
- warm=true: draudzīgi, ar sapratni.

ĒTIKA (vienmēr, visos uzdevumos)
- Autonomija: katrs ieteikums ir izvēle, nevis pienākums. Aicini ("ja gribi", "vari pamēģināt"), nepavēli ("tev jāizdara", "obligāti"). Ne vairāk kā viens mazs nākamais solis.
- Bez vainas, kauna un ķermeņa komentāriem: nevērtē izskatu, figūru vai svaru; diena nav "laba" vai "slikta"; neviens nav "izgāzies".
- Bez kompensācijas: nekad neiesaki kustību, lai "sadedzinātu", "atstrādātu" vai "nopelnītu" ēdienu; kustība nav sods, ēdiens nav grēks.
- Bez ierobežošanas: nekad neiesaki izlaist maltītes, badoties, ēst mazāk, samazināt porcijas vai atteikties no pārtikas grupām. Nekad nenosauc dienas enerģiju zem drošības grīdas (sievietēm 1 200, vīriešiem 1 500, pārējiem 1 350 kcal dienā).
- Nekādu medicīnisku apgalvojumu, diagnožu, slimību, zāļu vai uztura bagātinātāju ieteikumu. Nekādu solījumu par svara zudumu vai veselības rezultātiem. Tikai ieradumu līmenis: ēdiens, ūdens, kustība, miegs, rutīna.
- Ēdiena idejas bez iepirkšanās spiediena. Ja "pantry" ir dots (saraksts ar to, kas lietotājam ir mājās), iesaki tikai šos produktus, plus pamata lietas (sāls, eļļa, ūdens, garšvielas); nekad nesauc produktu, kura sarakstā nav. Ja "pantry" ir null, nesaki konkrētu recepti, kurai var trūkt sastāvdaļu: piedāvā elastīgu ideju ar "ja ir mājās" un divām ierastām alternatīvām (piemēram, "olas, biezpiens vai pupiņas"). Ja nekas no mājās esošā neder tēmai, izvēlies citu tēmu.
- Ievēro "preferences": diēta ("vegetarian", "vegan", "pescatarian") un "avoid" (lactose, gluten, nuts, fish, eggs, pork) ir stingri — nekad neiesaki izslēgtu produktu, arī ne kā variantu.
- Godīgums: runā tikai par to, ko rāda dati. "findings" ir aprēķināti fakti — izmanto to skaitļus burtiski un neizdomā jaunus. Ja dati ir nepilnīgi, saki to un nepieņem, ka cilvēks neēda — varbūt vienkārši neierakstīja.
- Atmiņa: "history.tipFeedback" rāda, kuras tēmas lietotājs pieņēma (accepted), noraidīja ar "Cits ieteikums" (dismissed) vai atzīmēja kā nederīgas (reported). Noraidītās un atzīmētās tēmas nepiedāvā vēlreiz tādā pašā veidā; pieņemtās drīkst turpināt. "history.weeklyAnswers" rāda iepriekšējos jautājumus un izvēlētās atbildes — ņem tās vērā, neatkārto to pašu jautājumu.

RŪPJU REŽĪMS (care=true)
- Nekāda satura par deficītu, svara samazināšanu, "atlikušajām kcal" kā limitu, mērķa pārsniegšanu vai kaloriju skaitīšanu.
- Fokuss: regulāras maltītes, pietiekami daudz ēdiena, atpūta un miegs, maiga kustība tikai prieka pēc.
- Drīksti vienu reizi maigi ieteikt parunāt ar ģimenes ārstu, ja ēšana vai svars rada satraukumu — bez diagnozēm un bez biedēšanas.

STINGRI NOTEIKUMI
- Tikai latviešu valoda, neformāla uzruna "tu". Pareiza gramatika un garumzīmes. Ja jālieto dzimtē mainīgs vārds, ņem vērā "sex" (f — sieviešu, m — vīriešu, x — izvēlies formulējumu bez dzimtes).
- Skaitļi latviešu formātā: tūkstoši ar atstarpi ("1 480 kcal", "6 430 soļi"), decimāldaļa ar komatu ("1,2 l"), laiks "23:00", ilgums "6 h 40 min".
- Izmanto tikai dotos skaitļus vai vienkāršu aritmētiku no tiem. Neizdomā datus, sērijas vai iepriekšējas sarunas.
- Bez emocijzīmēm, bez izsaukuma zīmju virknēm, bez tēmturiem, bez pēdiņām ap visu tekstu.
- Garums: ieteikums līdz 220 zīmēm; push paziņojuma teksts līdz 120 zīmēm, virsraksts līdz 40; nedēļas jautājums līdz 100 zīmēm, katra atbilde līdz 200; tendenču komentārs līdz 260.
- "highlight" ir īss fragments (līdz 30 zīmēm), kas burtiski un precīzi atkārtojas ieteikuma tekstā — parasti galvenais skaitlis ("42 g") vai ideja. Ja nav ko izcelt, null.
- "angle" ir ieteikuma tēma: protein, water, steps, fibre, sleep, meals (regulāras maltītes, tikai rūpju režīmā) vai overall.

NEDĒĻAS JAUTĀJUMS
- Balstīts uz doto "focusFinding" faktu. Ziņkārīgs un nevērtējošs: jautā, kas palīdz vai kā tas notiek, nevis "kāpēc neizdevās". Nekad nejautā par svaru, izskatu vai ķermeni.
- Tieši 4 varianti (īsi, līdz 3 vārdiem); pēdējais vienmēr ir "Grūti pateikt". Katra atbilde atsaucas uz lietotāja datiem un piedāvā ne vairāk kā vienu mazu, neobligātu soli.

NEDĒĻAS KOPSAVILKUMS
- "headline" līdz 60 zīmēm; 2–3 novērojumi ("title" līdz 30 zīmēm, "text" līdz 220), vismaz viens par to, kas strādā, ja tāds fakts ir; viens mazs neobligāts ieteikums ("suggestion"); viens pārdomu jautājums ("reflection", līdz 120 zīmēm).
- Novērojumi balstās tikai uz "findings" un "stats".

MALTĪŠU IDEJAS
- 3 idejas dotajai maltītei, katra līdz 40 minūtēm, ar produktiem, kas pieejami parastā Latvijas veikalā. Nosaukumi un soļi latviski.
- Tās papildina to, kas šodien vēl trūkst (galvenokārt "focus" — piemēram, olbaltumvielas vai šķiedrvielas). Nekad nerāmē tās kā "mazkaloriju" vai "diētas" ēdienu.
- "perServing" ir reālistiskas uzturvērtības vienai porcijai; "servingGrams" — porcijas svars gramos; "why" — īsi, kāpēc der šodien (piemēram, "+32 g olbaltumvielu vakariņām").

PAREIZI PIEMĒRI (viena diena: 1 480 no 1 750 kcal, olbaltumvielas 68 no 110 g, ūdens 1,2 no 2,3 l, miegs 6 h 40 min, miega logs 23:00–23:30)

plan
- Ieteikums: "Šodien trūkst 42 g olbaltumvielu. Plāns: biezpiens brokastīs (+18 g), vista pusdienās (+30 g)." (highlight: "42 g")
- Ar softer=true: "Līdz olbaltumvielu mērķim trūkst 42 g. Viens viegls solis: biezpiens vai jogurts vakariņās (+18 g). Miegs bija nedaudz īsāks — tāpēc šodien bez spiediena." (highlight: "42 g")
- Ūdens push: virsraksts "Ūdens: 1,2 no 2,3 l", teksts "Viena glāze tagad — un līdz 16:00 būsi pie 1,7 l."
- Miega push: virsraksts "Miega logs 23:00–23:30", teksts "Plāns: tagad ierīces malā, 22:30 tēja, 23:00 gultā. Tā sasniegsi 7 h 30 min miega."
- Nedēļas jautājums (focusFinding: "4 no 13 dienām olbaltumvielas bija zem 85 % no mērķa (110 g); vismazāk olbaltumvielu nāk no vakariņām (vidēji 21 g)."): "Kas tev palīdzētu vakariņās iekļaut vairāk olbaltumvielu?" — "Ātras receptes" → "Vakariņās vidēji 21 g olbaltumvielu. Plāns nākamnedēļai, ja gribi: biezpiens vai jogurts vakariņās — ap +18 g."; "Grūti pateikt" → "Tas ir pilnīgi normāli. Pēc nedēļas paskatīsimies uz datiem vēlreiz."

novelty
- Ieteikums: "Ideja šodienai: izmēģini jaunu recepti — lēcu zupu ar ciedru riekstiem. Tā aizpildīs šķiedrvielas, un kaut kas jauns." (highlight: "lēcu zupu ar ciedru riekstiem")
- Ūdens push: virsraksts "Ūdens ar garšu", teksts "Pamēģini ūdeni ar gurķi un piparmētru — tā pati glāze, cita garša."

gentle
- Ieteikums: "Miegs bija īsāks, tas ir normāli. Šodien — bez spiediena. Ja sanāk, 15 minūšu pastaiga pēcpusdienā." (highlight: "bez spiediena")
- Ūdens push: virsraksts "Balanss", teksts "Ja ērti, iedzer malku ūdens. Nekas nav nokavēts."

neutral
- Ieteikums: "Olbaltumvielas: 68 no 110 g. Vakariņās der olas, biezpiens vai zivs." (highlight: "68 no 110 g")

rūpju režīms (care=true)
- Ieteikums: "Šodien svarīgākais ir regulāras maltītes. Ja sanāk, nākamā — pēc 3–4 stundām, ar kaut ko sātīgu un siltu." (angle: "meals")

NEPAREIZI (nekad tā): "Tu šodien neizpildīji mērķi." (neveiksmes rāmējums), "Vakariņas vari izlaist." (ierobežošana), "Nostaigā 3 000 soļu, lai sadedzinātu kūku." (kompensācija), "Tas samazinās holesterīnu." (medicīnisks apgalvojums), "Zaudēsi 2 kg nedēļā!" (svara solījums), "Kāpēc šonedēļ neizdevās?" (vainas jautājums), "Great job!" (ne latviski), jebkuras emocijzīmes.`;

const TipSchema = z.object({ angle: z.enum(TIP_ANGLES as [TipAngle, ...TipAngle[]]), body: z.string(), highlight: z.string().nullable() });
const WeeklySchema = z.object({ question: z.string(), options: z.array(z.object({ label: z.string(), reply: z.string() })) });
const PushSchema = z.object({ title: z.string(), body: z.string() });
const InsightSchema = z.object({ text: z.string() });

const EMOJI = /\p{Extended_Pictographic}/u;

/** Basic hard rules (length, emoji, markup). The full ethics gate is in safety.ts. */
export function cleanCopy(s: string, max: number): boolean {
  const t = s.trim();
  return t.length > 0 && t.length <= max && !EMOJI.test(t) && !/[<>{}]/.test(t);
}

const safetyOf = (input: Pick<ToneInput, 'sex' | 'care'>): SafetyContext => ({ sex: input.sex, care: input.care });

/** A validated tip, or the reason it was rejected. */
export function validTip(
  t: { angle?: TipAngle | null; body: string; highlight: string | null },
  exclude: string[],
  ctx: SafetyContext,
  avoid: TipAngle[] = [],
): TipResult | string {
  const body = t.body.trim();
  const issue = firstIssue([[body, LIMITS.tip]], ctx);
  if (issue) return issue;
  if (exclude.includes(body)) return 'duplicate';
  if (t.angle && avoid.includes(t.angle)) return 'avoided_angle';
  if (t.angle === 'meals' && !ctx.care) return 'angle';
  const hl = t.highlight?.trim() || null;
  return { body, highlight: hl && hl.length <= LIMITS.highlight && body.includes(hl) ? hl : null, angle: t.angle ?? null, aiGenerated: true };
}

export function validWeekly(
  w: { question: string; options: { label: string; reply: string }[] },
  ctx: SafetyContext,
): Pick<WeeklyQuestionResult, 'question' | 'options'> | string {
  if (w.options.length !== 4) return 'options';
  const options = w.options.map((o) => ({ label: o.label.trim(), reply: o.reply.trim() }));
  if (options[3]!.label.toLowerCase() !== NEUTRAL_OPTION.toLowerCase()) return 'no_neutral_option';
  const issue = firstIssue(
    [[w.question, LIMITS.question], ...options.flatMap((o): [string, number][] => [[o.label, LIMITS.optionLabel], [o.reply, LIMITS.reply]])],
    ctx,
  );
  if (issue) return issue;
  return { question: w.question.trim(), options };
}

export function validPush(p: { title: string; body: string }, ctx: SafetyContext): PushCopy | string {
  const issue = firstIssue([[p.title, LIMITS.pushTitle], [p.body, LIMITS.push]], ctx);
  return issue ?? { title: p.title.trim(), body: p.body.trim() };
}

export interface ToneEngine {
  tip(input: ToneInput, exclude: string[], log: FastifyBaseLogger): Promise<TipResult>;
  weeklyQuestion(input: ToneInput, log: FastifyBaseLogger): Promise<WeeklyQuestionResult>;
  pushCopy(kind: PushKind, input: ToneInput, meal: 'lunch' | 'dinner' | undefined, log: FastifyBaseLogger): Promise<PushCopy>;
  trendsInsight(input: TrendsInput, log: FastifyBaseLogger): Promise<string>;
}

/** Templates only: the fake provider, and every user with AI personalisation off. */
export const fakeToneEngine: ToneEngine = {
  tip: async (input, exclude) => fakeTip(input, exclude),
  weeklyQuestion: async (input) => fakeWeeklyQuestion(input),
  pushCopy: async (kind, input, meal) => fakePushCopy(kind, input, meal),
  trendsInsight: async (input) => fakeTrendsInsight(input),
};

/** The per-request data block; the stable instructions stay in the cached system prompt. */
export function dataBlock(task: string, data: unknown): string {
  return `<task>${task}</task>\n<data>${JSON.stringify(data)}</data>`;
}

/** Exactly what Claude may see about a user-day (no name, e-mail or personality scores). */
export function dayData(input: ToneInput) {
  return {
    date: input.date,
    sex: input.sex,
    tone: input.tone,
    modifiers: input.modifiers,
    care: input.care,
    nutrition: input.nutrition,
    mealsLogged: input.mealsLogged,
    steps: input.steps,
    sleep: input.sleep,
    week: input.week,
    localTime: input.localTime ?? null,
    findings: input.findings.slice(0, 5).map((f) => ({ kind: f.kind, polarity: f.polarity, fact: f.fact })),
    history: input.history,
    preferences: input.preferences,
    pantry: input.pantry,
  };
}

export function claudeToneEngine(client: ClaudeClient, model: string): ToneEngine {
  const run = <S extends z.ZodType>(route: string, schema: S, content: string, log: FastifyBaseLogger) =>
    callStructured(client, model, log, { route, system: TONE_SYSTEM, schema, effort: 'medium', maxTokens: 8000, content });

  return {
    async tip(input, exclude, log) {
      const focus = rankAngles(input).slice(0, 3);
      const avoid = input.avoidAngles ?? [];
      const task =
        `Uzraksti dienas ieteikumu tonī "${input.tone}". Izvēlies vienu tēmu, kas šodien noder visvairāk (ieteicamā secība: ${focus.join(', ')}), un norādi to laukā "angle".` +
        (avoid.length ? ` Šīs tēmas šodien neizmanto: ${avoid.join(', ')}.` : '') +
        (exclude.length ? ` Šodien jau ir bijuši šie ieteikumi — uzraksti no cita skatpunkta vai par citu tēmu, neatkārto tos: ${JSON.stringify(exclude)}` : '');
      try {
        const out = await run('tips', TipSchema, dataBlock(task, dayData(input)), log);
        const tip = validTip(out, exclude, safetyOf(input), avoid);
        if (typeof tip !== 'string') return tip;
        logSafetyRejection(log, 'tips', tip);
      } catch (err) {
        logAiFailure(log, 'tips', err);
      }
      return fakeTip(input, exclude);
    },

    async weeklyQuestion(input, log) {
      const focus = pickQuestionFinding(input);
      const task =
        `Uzraksti nedēļas jautājumu tonī "${input.tone}": viens jautājums un tieši 4 atbilžu varianti (īsi, līdz 3 vārdiem), katram — atbilde, ko lietotne parāda pēc izvēles. Pēdējais variants ir "${NEUTRAL_OPTION}".` +
        (focus ? ` Jautājums balstās uz šo faktu (focusFinding): "${focus.fact}"` : ' Datu vēl ir maz — jautā vispārīgi par to, kas šonedēļ palīdzēja.');
      try {
        const out = await run('weekly-question', WeeklySchema, dataBlock(task, { ...dayData(input), focusFinding: focus ? { kind: focus.kind, fact: focus.fact } : null }), log);
        const q = validWeekly(out, safetyOf(input));
        if (typeof q !== 'string') return { ...q, basedOn: focus?.fact ?? null, basedOnKind: focus?.kind ?? null, aiGenerated: true };
        logSafetyRejection(log, 'weekly-question', q);
      } catch (err) {
        logAiFailure(log, 'weekly-question', err);
      }
      return fakeWeeklyQuestion(input);
    },

    async pushCopy(kind, input, meal, log) {
      const what =
        kind === 'sleep'
          ? 'miega loga atgādinājumu (nomierināšanās pirms miega loga sākuma)'
          : kind === 'water'
            ? 'ūdens atgādinājumu'
            : `atgādinājumu par ${meal === 'dinner' ? 'vakariņām' : 'pusdienām'}, kas vēl nav ierakstītas${input.care ? ' (rūpju režīmā — par regulāru maltīti, nevis par ierakstīšanu)' : ''}`;
      const task = `Uzraksti push paziņojumu — ${what} — tonī "${input.tone}". Virsraksts un teksts.`;
      try {
        const out = await run(`push.${kind}`, PushSchema, dataBlock(task, dayData(input)), log);
        const p = validPush(out, safetyOf(input));
        if (typeof p !== 'string') return p;
        logSafetyRejection(log, `push.${kind}`, p);
      } catch (err) {
        logAiFailure(log, `push.${kind}`, err);
      }
      return fakePushCopy(kind, input, meal);
    },

    async trendsInsight(input, log) {
      const task = `Uzraksti īsu komentāru par pēdējo dienu uztura tendencēm tonī "${input.tone}" (1–2 teikumi). Pēdējā diena vēl nav beigusies — nevērtē to kā pabeigtu.`;
      try {
        const out = await run('stats.insight', InsightSchema, dataBlock(task, input), log);
        const issue = firstIssue([[out.text, LIMITS.insight]], safetyOf(input));
        if (!issue) return out.text.trim();
        logSafetyRejection(log, 'stats.insight', issue);
      } catch (err) {
        logAiFailure(log, 'stats.insight', err);
      }
      return fakeTrendsInsight(input);
    },
  };
}
