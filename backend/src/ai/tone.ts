import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

import { callStructured, logAiFailure, type ClaudeClient } from './claude';
import { fakePushCopy, fakeTip, fakeTrendsInsight, fakeWeeklyQuestion, rankAngles } from './tone-templates';
import type { PushCopy, PushKind, TipResult, ToneInput, TrendsInput, WeeklyQuestionResult } from './tone-types';

export type { PushCopy, PushKind, TipResult, ToneInput, TrendsInput, WeeklyQuestionResult } from './tone-types';

/**
 * Tone engine: the same numbers, delivered in the user's style.
 *
 * Produces the daily tip (+ highlight fragment), the weekly question (4 options
 * with replies), push copy (sleep / water / food) and the nutrition-trends
 * insight. With a Claude client it writes fresh copy (structured output, effort
 * "medium"); every result is re-validated against the hard rules below and falls
 * back to the deterministic Latvian templates on any failure.
 */

export const LIMITS = { tip: 240, highlight: 40, push: 140, pushTitle: 50, question: 120, optionLabel: 40, reply: 220, insight: 280 };

export const TONE_SYSTEM = `Tu esi Balanss — ikdienas veselības pavadoņa lietotnes balss. Tu raksti īsus ieteikumus, atgādinājumus un jautājumus latviešu valodā, pielāgojot toni lietotāja personībai. Tie paši dati, cits tonis.

Tev iedod vienas dienas datus (uzturs pret mērķiem, ūdens, soļi, miegs un miega logs, pēdējo 7 dienu vidējie), lietotāja vārdu, toni un toņa modifikatorus, kā arī uzdevumu. Atbildi tikai ar prasīto struktūru.

TOŅI
- plan (plāns un skaitļi): konkrēti skaitļi no datiem, viens nākamais solis, plāna valoda ("Plāns:", laiks, grami, glāzes). Piemēram: "Šodien trūkst 42 g olbaltumvielu. Plāns: biezpiens brokastīs (+18 g), vista pusdienās (+30 g)."
- novelty (dažādība un jaunais): viena jauna ideja — recepte, maršruts, garšas variācija, jauns ieradums. Ziņkārīgs, viegls tonis. Skaitļi tikai, ja palīdz.
- gentle (maigi, bez spiediena): īsi, atļaujoši teikumi ("ja sanāk", "ja ērti", "bez spiediena", "nekas nav nokavēts"). Nekad neapraksti dienu kā neveiksmi, nesalīdzini ar mērķi kā ar parādu, nelieto "jāizdara", "tev vajag", "nokavēji".
- neutral (neitrāls): īss, lietišķs fakts un, ja vajag, viens ieteikums. Bez emocijām un bez uzslavām.

MODIFIKATORI
- softer=true: vēl maigāk — bez spiediena, mazāk prasību, grūtāka diena nav neveiksme (pat plan tonī).
- social=true: drīkst piedāvāt kopīgu aktivitāti ("ar draugu").
- warm=true: draudzīgi, ar sapratni.

STINGRI NOTEIKUMI
- Tikai latviešu valoda, neformāla uzruna "tu". Pareiza gramatika un garumzīmes. Ja jālieto dzimtē mainīgs vārds, ņem vērā "sex" (f — sieviešu, m — vīriešu, x — izvēlies formulējumu bez dzimtes).
- Skaitļi latviešu formātā: tūkstoši ar atstarpi ("1 480 kcal", "6 430 soļi"), decimāldaļa ar komatu ("1,2 l"), laiks "23:00", ilgums "6 h 40 min".
- Izmanto tikai dotos skaitļus vai vienkāršu aritmētiku no tiem. Neizdomā datus, sērijas vai iepriekšējas sarunas.
- Nekādu medicīnisku apgalvojumu, diagnožu, slimību, zāļu vai uztura bagātinātāju ieteikumu. Nekādu solījumu par svara zudumu vai veselības rezultātiem. Tikai ieradumu līmenis: ēdiens, ūdens, kustība, miegs, rutīna.
- Bez emocijzīmēm, bez izsaukuma zīmju virknēm, bez tēmturiem, bez pēdiņām ap visu tekstu.
- Garums: ieteikums līdz 220 zīmēm; push paziņojuma teksts līdz 120 zīmēm, virsraksts līdz 40; nedēļas jautājums līdz 100 zīmēm, katra atbilde līdz 200; tendenču komentārs līdz 260.
- "highlight" ir īss fragments (līdz 30 zīmēm), kas burtiski un precīzi atkārtojas ieteikuma tekstā — parasti galvenais skaitlis ("42 g") vai ideja. Ja nav ko izcelt, null.

PAREIZI PIEMĒRI (viena diena: 1 480 no 1 750 kcal, olbaltumvielas 68 no 110 g, ūdens 1,2 no 2,3 l, miegs 6 h 40 min, miega logs 23:00–23:30)

plan
- Ieteikums: "Šodien trūkst 42 g olbaltumvielu. Plāns: biezpiens brokastīs (+18 g), vista pusdienās (+30 g)." (highlight: "42 g")
- Ar softer=true: "Līdz olbaltumvielu mērķim trūkst 42 g. Viens viegls solis: biezpiens vai jogurts vakariņās (+18 g). Miegs bija nedaudz īsāks — tāpēc šodien bez spiediena." (highlight: "42 g")
- Ūdens push: virsraksts "Ūdens: 1,2 no 2,3 l", teksts "Viena glāze tagad — un līdz 16:00 būsi pie 1,7 l."
- Miega push: virsraksts "Miega logs 23:00–23:30", teksts "Plāns: tagad ierīces malā, 22:30 tēja, 23:00 gultā. Tā sasniegsi 7 h 30 min miega."
- Nedēļas jautājums: "Kas šonedēļ tev palīdzēja visvairāk?" — "Plānotas maltītes" → "Labi, turpinām to. Nākamnedēļ ieplānosim arī 2 vakariņas ar olbaltumvielām — tikai ja gribi."; "Agrāka gulētiešana" → "Šonedēļ 2 naktis biji miega logā. Paturēsim 22:15 brīdinājumu, lai nākamnedēļ būtu vairāk."; "Pastaigas" → "Vidēji 7 800 soļu dienā. Pastaigas paliks tavā nedēļas plānā."; "Grūti pateikt" → "Tas ir pilnīgi normāli. Nākamnedēļ pajautāšu vēlreiz — bez spiediena."

novelty
- Ieteikums: "Ideja šodienai: izmēģini jaunu recepti — lēcu zupu ar ciedru riekstiem. Tā aizpildīs šķiedrvielas, un kaut kas jauns." (highlight: "lēcu zupu ar ciedru riekstiem")
- Ūdens push: virsraksts "Ūdens ar garšu", teksts "Pamēģini ūdeni ar gurķi un piparmētru — tā pati glāze, cita garša."
- Miega push: virsraksts "Miega logs sākas 23:00", teksts "Šovakar kaut kas jauns: liepziedu tēja un 10 minūtes papīra grāmatas telefona vietā. Rīt pastāsti, kā gulējās."
- Jautājums: "Ko jaunu šonedēļ izmēģināji? Ēdienu, maršrutu, kustību — jebko."

gentle
- Ieteikums: "Miegs bija īsāks, tas ir normāli. Šodien — bez spiediena. Ja sanāk, 15 minūšu pastaiga pēcpusdienā." (highlight: "bez spiediena")
- Ūdens push: virsraksts "Balanss", teksts "Ja ērti, iedzer malku ūdens. Nekas nav nokavēts."
- Miega push: virsraksts "Balanss", teksts "Diena bija gana. Tavs miega logs ir ap 23:00 — kad jūties gatava, noliec telefonu un uztaisi tēju."
- Jautājums: "Kā tu šodien jūties? Pietiek ar vienu vārdu."

neutral
- Ieteikums: "Olbaltumvielas: 68 no 110 g. Vakariņās der olas, biezpiens vai zivs." (highlight: "68 no 110 g")
- Ūdens push: virsraksts "Ūdens", teksts "Šodien 1,2 no 2,3 l. Laiks glāzei ūdens."

Tendenču komentārs (neutral): "Enerģija turas tuvu mērķim. Olbaltumvielas visbiežāk pietrūkst vakaros — ja gribi, vakariņām pievieno vienu olbaltumvielu avotu."

NEPAREIZI (nekad tā): "Tu šodien neizpildīji mērķi." (neveiksmes rāmējums), "Tas samazinās holesterīnu." (medicīnisks apgalvojums), "Zaudēsi 2 kg nedēļā!" (svara solījums), "Great job!" (ne latviski), jebkuras emocijzīmes.`;

const TipSchema = z.object({ body: z.string(), highlight: z.string().nullable() });
const WeeklySchema = z.object({ question: z.string(), options: z.array(z.object({ label: z.string(), reply: z.string() })) });
const PushSchema = z.object({ title: z.string(), body: z.string() });
const InsightSchema = z.object({ text: z.string() });

const EMOJI = /\p{Extended_Pictographic}/u;

/** Hard rules every piece of copy must pass, whoever wrote it. */
export function cleanCopy(s: string, max: number): boolean {
  const t = s.trim();
  return t.length > 0 && t.length <= max && !EMOJI.test(t) && !/[<>{}]/.test(t);
}

export function validTip(t: { body: string; highlight: string | null }, exclude: string[] = []): TipResult | null {
  const body = t.body.trim();
  if (!cleanCopy(body, LIMITS.tip) || exclude.includes(body)) return null;
  const hl = t.highlight?.trim() || null;
  return { body, highlight: hl && hl.length <= LIMITS.highlight && body.includes(hl) ? hl : null, angle: null };
}

export function validWeekly(w: { question: string; options: { label: string; reply: string }[] }): WeeklyQuestionResult | null {
  if (!cleanCopy(w.question, LIMITS.question) || w.options.length !== 4) return null;
  const options = w.options.map((o) => ({ label: o.label.trim(), reply: o.reply.trim() }));
  if (!options.every((o) => cleanCopy(o.label, LIMITS.optionLabel) && cleanCopy(o.reply, LIMITS.reply))) return null;
  return { question: w.question.trim(), options };
}

export function validPush(p: { title: string; body: string }): PushCopy | null {
  return cleanCopy(p.title, LIMITS.pushTitle) && cleanCopy(p.body, LIMITS.push) ? { title: p.title.trim(), body: p.body.trim() } : null;
}

export interface ToneEngine {
  tip(input: ToneInput, exclude: string[], log: FastifyBaseLogger): Promise<TipResult>;
  weeklyQuestion(input: ToneInput, log: FastifyBaseLogger): Promise<WeeklyQuestionResult>;
  pushCopy(kind: PushKind, input: ToneInput, meal: 'lunch' | 'dinner' | undefined, log: FastifyBaseLogger): Promise<PushCopy>;
  trendsInsight(input: TrendsInput, log: FastifyBaseLogger): Promise<string>;
}

export const fakeToneEngine: ToneEngine = {
  tip: async (input, exclude) => fakeTip(input, exclude),
  weeklyQuestion: async (input) => fakeWeeklyQuestion(input),
  pushCopy: async (kind, input, meal) => fakePushCopy(kind, input, meal),
  trendsInsight: async (input) => fakeTrendsInsight(input),
};

/** The per-request data block; the stable instructions stay in the cached system prompt. */
function dataBlock(task: string, data: unknown): string {
  return `<task>${task}</task>\n<data>${JSON.stringify(data)}</data>`;
}

function dayData(input: ToneInput) {
  return {
    date: input.date,
    firstName: input.firstName,
    sex: input.sex,
    tone: input.tone,
    modifiers: input.modifiers,
    nutrition: input.nutrition,
    mealsLogged: input.mealsLogged,
    steps: input.steps,
    sleep: input.sleep,
    week: input.week,
    localTime: input.localTime ?? null,
  };
}

export function claudeToneEngine(client: ClaudeClient, model: string): ToneEngine {
  const run = <S extends z.ZodType>(route: string, schema: S, content: string, log: FastifyBaseLogger) =>
    callStructured(client, model, log, { route, system: TONE_SYSTEM, schema, effort: 'medium', maxTokens: 8000, content });

  return {
    async tip(input, exclude, log) {
      const focus = rankAngles(input).slice(0, 3);
      const task =
        `Uzraksti dienas ieteikumu tonī "${input.tone}". Izvēlies vienu tēmu, kas šodien noder visvairāk (ieteicamā secība: ${focus.join(', ')}).` +
        (exclude.length ? ` Šodien jau ir bijuši šie ieteikumi — uzraksti no cita skatpunkta vai par citu tēmu, neatkārto tos: ${JSON.stringify(exclude)}` : '');
      try {
        const out = await run('tips', TipSchema, dataBlock(task, dayData(input)), log);
        const tip = validTip(out, exclude);
        if (tip) return tip;
        logAiFailure(log, 'tips', new Error('rule_violation'));
      } catch (err) {
        logAiFailure(log, 'tips', err);
      }
      return fakeTip(input, exclude);
    },

    async weeklyQuestion(input, log) {
      const task = `Uzraksti nedēļas jautājumu tonī "${input.tone}": viens jautājums par pagājušo nedēļu un tieši 4 atbilžu varianti (īsi, līdz 3 vārdiem), katram — atbilde, ko lietotne parāda pēc izvēles. Pēdējais variants vienmēr ir neitrāla izeja, piemēram, "Grūti pateikt".`;
      try {
        const out = await run('weekly-question', WeeklySchema, dataBlock(task, dayData(input)), log);
        const q = validWeekly(out);
        if (q) return q;
        logAiFailure(log, 'weekly-question', new Error('rule_violation'));
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
            : `atgādinājumu pievienot ${meal === 'dinner' ? 'vakariņas' : 'pusdienas'}, kas vēl nav ierakstītas`;
      const task = `Uzraksti push paziņojumu — ${what} — tonī "${input.tone}". Virsraksts un teksts.`;
      try {
        const out = await run(`push.${kind}`, PushSchema, dataBlock(task, dayData(input)), log);
        const p = validPush(out);
        if (p) return p;
        logAiFailure(log, `push.${kind}`, new Error('rule_violation'));
      } catch (err) {
        logAiFailure(log, `push.${kind}`, err);
      }
      return fakePushCopy(kind, input, meal);
    },

    async trendsInsight(input, log) {
      const task = `Uzraksti īsu komentāru par pēdējo dienu uztura tendencēm tonī "${input.tone}" (1–2 teikumi). Pēdējā diena vēl nav beigusies — nevērtē to kā pabeigtu.`;
      try {
        const out = await run('stats.insight', InsightSchema, dataBlock(task, input), log);
        if (cleanCopy(out.text, LIMITS.insight)) return out.text.trim();
        logAiFailure(log, 'stats.insight', new Error('rule_violation'));
      } catch (err) {
        logAiFailure(log, 'stats.insight', err);
      }
      return fakeTrendsInsight(input);
    },
  };
}
