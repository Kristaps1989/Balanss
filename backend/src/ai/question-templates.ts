import type { FindingKind, FoodPreferences, MealType, Sex, ToneStyle, WeeklyQuestionOption } from '../../../shared/api';
import { mondayOf } from '../../../shared/dates';
import { fmtInt, fmtLitres } from '../lib/format';
import type { AnalysisFinding } from './analysis';
import { foodIdeas } from './food-ideas';
import type { ToneHistory } from './tone-types';

/**
 * Template weekly questions, summary titles and suggestions built from a
 * finding. Rules (same as for Claude):
 * - curious and non-judgemental; never about weight, body image or "why it failed";
 * - 4 options, the last one is always the neutral way out "Grūti pateikt";
 * - replies reference the user's own numbers and offer at most one small,
 *   optional next step ("ja gribi"), never a command;
 * - care mode: regular meals, rest and gentle movement only.
 */

export interface QuestionContext {
  date: string;
  sex: Sex;
  tone: ToneStyle;
  care: boolean;
  preferences: FoodPreferences;
  history: ToneHistory;
  findings: AnalysisFinding[];
}

export const NEUTRAL_OPTION = 'Grūti pateikt';

/** Locative of a meal slot: "vakariņās". */
const SLOT_IN: Record<MealType, string> = { breakfast: 'brokastīs', lunch: 'pusdienās', snack: 'uzkodās', dinner: 'vakariņās' };

/** One optional next step in the user's tone (lower-case `step`, no final period). */
export function offer(tone: ToneStyle, step: string): string {
  switch (tone) {
    case 'plan':
      return `Plāns nākamnedēļai, ja gribi: ${step}.`;
    case 'novelty':
      return `Ideja nākamnedēļai: ${step}. Ja negribas — arī labi.`;
    case 'gentle':
      return `Ja sanāk, ${step}. Bez spiediena.`;
    default:
      return `Ja gribi: ${step}.`;
  }
}

const NEUTRAL_REPLY: Record<ToneStyle, string> = {
  plan: 'Tas ir pilnīgi normāli. Pēc nedēļas paskatīsimies uz datiem vēlreiz.',
  novelty: 'Arī tā gadās. Nākamnedēļ paskatīsimies no cita skatpunkta.',
  gentle: 'Tas ir pilnīgi normāli. Nekas nav jāatbild — esmu šeit, kad būs vēlme.',
  neutral: 'Labi. Pajautāšu vēlreiz vēlāk.',
};

const opt = (label: string, reply: string): WeeklyQuestionOption => ({ label, reply });

/** The strongest finding whose topic was not asked about last week. */
export function pickQuestionFinding(ctx: Pick<QuestionContext, 'date' | 'history' | 'findings'>): AnalysisFinding | null {
  if (!ctx.findings.length) return null;
  const week = mondayOf(ctx.date);
  const lastTopic = ctx.history.weeklyAnswers.find((w) => w.week < week)?.topic ?? null;
  return ctx.findings.find((f) => f.kind !== lastTopic) ?? ctx.findings[0]!;
}

const num = (v: number | string | null | undefined) => (typeof v === 'number' ? v : Number(v ?? 0));

export function findingQuestion(f: AnalysisFinding, ctx: Pick<QuestionContext, 'tone' | 'care' | 'preferences'>): { question: string; options: WeeklyQuestionOption[] } {
  const d = f.data;
  const tone = ctx.tone;
  const food = foodIdeas(ctx.preferences);
  const neutral = opt(NEUTRAL_OPTION, NEUTRAL_REPLY[tone]);

  switch (f.kind) {
    case 'protein_gap': {
      const slot = (d.slot as MealType | null) ?? null;
      const where = slot ? SLOT_IN[slot] : 'maltītēs';
      const slotFact =
        slot && d.slotAvg != null && d.slotOther != null
          ? `Dienās zem mērķa ${where} bija vidēji ${fmtInt(num(d.slotAvg))} g olbaltumvielu, citās — ${fmtInt(num(d.slotOther))} g.`
          : slot && d.slotAvg != null
            ? `${where.charAt(0).toUpperCase()}${where.slice(1)} vidēji ${fmtInt(num(d.slotAvg))} g olbaltumvielu.`
            : `Vidēji ${fmtInt(num(d.avg))} g olbaltumvielu dienā.`;
      return {
        question: `Kas tev palīdzētu ${where} iekļaut vairāk olbaltumvielu?`,
        options: [
          opt('Ātras receptes', `${slotFact} ${offer(tone, `${food.proteinEvening} ${where} — ap +${food.proteinEveningGrams} g`)}`),
          opt('Iepirkumu saraksts', `Olbaltumvielas bija zem mērķa ${num(d.low)} no ${num(d.of)} dienām. ${offer(tone, `iepērc olbaltumvielu produktus visai nedēļai vienā reizē`)}`),
          opt('Viss ir kārtībā', 'Labi, tad nekas nav jāmaina. Tu savu ritmu zini vislabāk.'),
          neutral,
        ],
      };
    }
    case 'fibre_low':
      return {
        question: 'Kas no dārzeņiem, pākšaugiem vai graudaugiem tev garšo visvairāk?',
        options: [
          opt('Dārzeņi', `Šķiedrvielas vidēji ${fmtInt(num(d.avg))} g dienā. ${offer(tone, 'sauja dārzeņu vienā maltītē dienā')}`),
          opt('Pākšaugi', `Pākšaugos ir daudz šķiedrvielu. ${offer(tone, `${food.fibreNovelty} vienu reizi nedēļā`)}`),
          opt('Graudaugi', `Labi. ${offer(tone, ctx.preferences.avoid.includes('gluten') ? 'griķi vai brūnie rīsi vienā maltītē' : 'griķi vai pilngraudu maize vienā maltītē')}`),
          neutral,
        ],
      };
    case 'water_low':
      return {
        question: 'Kas tev palīdz atcerēties par ūdeni?',
        options: [
          opt('Pudele pie rokas', `Vidēji ${fmtLitres(num(d.avgMl))} dienā. ${offer(tone, 'ūdens pudele uz galda darba laikā')}`),
          opt('Atgādinājumi', `Labi. ${offer(tone, 'ūdens atgādinājumi sadaļā Es')}`),
          opt('Garša ūdenim', `Garša palīdz. ${offer(tone, 'ūdens ar citronu, gurķi vai piparmētru')}`),
          neutral,
        ],
      };
    case 'weekend_shift':
      return {
        question: 'Kā tev parasti paiet brīvdienu maltītes?',
        options: [
          opt('Ciemos vai ārpus mājas', `Tas ir normāli — brīvdienas ir citādākas. ${offer(tone, 'brīvdienās tāds pats maltīšu ritms kā darba dienās')}`),
          opt('Vairāk laika gatavot', `Brīvdienas ir labs laiks gatavot. ${offer(tone, 'pagatavo vienu ēdienu ar dārzeņiem arī pirmdienai')}`),
          opt('Cits dienas ritms', 'Saprotams — cits ritms brīvdienās ir pilnīgi normāls. Nekas nav jāmaina.'),
          neutral,
        ],
      };
    case 'breakfast_skipped':
      return {
        question: 'Kā tev parasti sākas rīts?',
        options: [
          opt('Nav laika', `${num(d.days)} no ${num(d.of)} dienām brokastis nebija ierakstītas. ${offer(tone, `vakarā sagatavo ${food.breakfastToGo} līdzi`)}`),
          opt('Nav izsalkuma', `Tas ir normāli — arī vēlākas brokastis skaitās. ${offer(tone, 'neliela uzkoda līdz 11:00')}`),
          opt('Aizmirstu ierakstīt', 'Paldies, tas ir labi zināt — tad šo dienu dati vienkārši ir nepilnīgi. Nekas nav jāmaina.'),
          neutral,
        ],
      };
    case 'short_sleep_low_steps':
      return {
        question: 'Kas tev palīdz justies možāk pēc īsākas nakts?',
        options: [
          opt('Pastaiga ārā', `Pēc īsākām naktīm soļu bija par ${fmtInt(num(d.diffPct))} % mazāk. ${offer(tone, 'īsa pastaiga pēc pusdienām')}`),
          opt('Agrāka gulētiešana', `Labi. ${offer(tone, 'vakara atgādinājums pirms miega loga')}`),
          opt('Atpūta', 'Atpūta pēc īsas nakts ir pilnīgi normāla. Nekas nav jāatgūst.'),
          neutral,
        ],
      };
    case 'bedtime_in_window':
      if (f.polarity === 'positive') {
        return {
          question: 'Kas tev palīdzēja iet gulēt miega logā?',
          options: [
            opt('Vakara rutīna', `${num(d.inWindow)} no ${num(d.of)} naktīm biji miega logā — tas strādā. ${offer(tone, 'paturi to pašu vakara rutīnu')}`),
            opt('Atgādinājums', `Labi, atgādinājums paliek. ${num(d.inWindow)} no ${num(d.of)} naktīm miega logā ir stabils ritms.`),
            opt('Mazāk ekrānu', `Tas palīdz. ${offer(tone, 'telefons malā 30 minūtes pirms miega loga')}`),
            neutral,
          ],
        };
      }
      return {
        question: 'Kas vakaros visbiežāk aizkavē gulētiešanu?',
        options: [
          opt('Darbs vai mācības', `Šonedēļ ${num(d.inWindow)} no ${num(d.of)} naktīm biji miega logā (${d.start}–${d.end}). ${offer(tone, 'vienu vakaru beidz darbus 30 minūtes agrāk')}`),
          opt('Telefons vai seriāli', `Saprotams. ${offer(tone, 'telefons ārpus guļamistabas vienu vakaru nedēļā')}`),
          opt('Mājas darbi', `Tā gadās. ${offer(tone, 'atstāj vienu mājas darbu rītam')}`),
          neutral,
        ],
      };
    case 'bedtime_irregular':
      return {
        question: 'Kas ietekmē tavu gulētiešanas laiku?',
        options: [
          opt('Darba grafiks', `Gulētiešanas laiks svārstījās vidēji par ${fmtInt(num(d.sdMin))} min. ${offer(tone, 'viens nemainīgs vakara rituāls, arī ja laiks mainās')}`),
          opt('Vakara plāni', `Tas ir normāli. ${offer(tone, 'pēc vēla vakara nākamajā vakarā — ierastajā laikā')}`),
          opt('Nevaru aizmigt', 'Paldies, ka pastāstīji. Mierīgs vakars bez ekrāniem var palīdzēt; ja miegs ilgstoši traucē, par to vērts parunāt ar ģimenes ārstu.'),
          neutral,
        ],
      };
    case 'steps_trend':
      if (f.polarity === 'positive') {
        return {
          question: 'Kas šonedēļ palīdzēja vairāk kustēties?',
          options: [
            opt('Pastaigas', `Vidēji ${fmtInt(num(d.avg))} soļu dienā — par ${fmtInt(num(d.diffPct))} % vairāk nekā iepriekš. ${offer(tone, 'paturi pastaigas savā nedēļas ritmā')}`),
            opt('Treniņš', `Labi. Vidēji ${fmtInt(num(d.avg))} soļu dienā. ${offer(tone, 'viens treniņš arī nākamnedēļ')}`),
            opt('Ikdienas gaitas', 'Arī ikdienas gaitas skaitās. Nekas nav jāmaina.'),
            neutral,
          ],
        };
      }
      return {
        question: 'Kā tev šonedēļ gāja ar kustību?',
        options: [
          opt('Laikapstākļi', `Vidēji ${fmtInt(num(d.avg))} soļu dienā. ${offer(tone, ctx.care ? 'mierīga pastaiga, kad laiks atļauj' : 'īsa pastaiga iekštelpās vai pa kāpnēm')}`),
          opt('Daudz darba', `Saprotams. ${offer(tone, '10 minūšu pastaiga pusdienu pārtraukumā')}`),
          opt('Nogurums', 'Atpūta ir tikpat svarīga kā kustība. Nekas nav jāatgūst.'),
          neutral,
        ],
      };
    case 'logging_gaps':
      return {
        question: 'Kas padarītu ēdiena ierakstīšanu vieglāku?',
        options: [
          opt('Foto', `${num(d.gaps)} dienās bija mazāk par 2 maltītēm. ${offer(tone, 'viens foto uzreiz pie galda')}`),
          opt('Izlase', `Labi. ${offer(tone, 'saglabā biežākās maltītes izlasē')}`),
          opt('Mazāk ierakstu', 'Tas ir labi — ieraksti nav obligāti katru dienu. Nekas nav jāmaina.'),
          neutral,
        ],
      };
    case 'consistency':
    default: {
      const metric = String(d.metric ?? '');
      const what: Record<string, string> = {
        water: 'dzert pietiekami daudz ūdens',
        steps: 'sasniegt soļu mērķi',
        protein: 'iekļaut pietiekami daudz olbaltumvielu',
        fibre: 'iekļaut pietiekami daudz šķiedrvielu',
        sleep: 'izgulēties',
      };
      return {
        question: `Kas tev šonedēļ palīdzēja ${what[metric] ?? 'noturēt ritmu'}?`,
        options: [
          opt('Plānošana', `${num(d.hits)} no ${num(d.of)} dienām — stabils ritms. ${offer(tone, 'tāds pats ritms')}`),
          opt('Atgādinājumi', `Labi, atgādinājumi paliek. ${num(d.hits)} no ${num(d.of)} dienām ir labs rezultāts.`),
          opt('Ieradums', 'Ieradums ir spēcīgākais palīgs. Nekas nav jāmaina.'),
          neutral,
        ],
      };
    }
  }
}

// ---------------------------------------------------------------- summary pieces

export const FINDING_TITLE: Record<FindingKind, string> = {
  protein_gap: 'Olbaltumvielas',
  fibre_low: 'Šķiedrvielas',
  water_low: 'Ūdens',
  weekend_shift: 'Brīvdienas',
  breakfast_skipped: 'Brokastis',
  short_sleep_low_steps: 'Miegs un kustība',
  bedtime_irregular: 'Gulētiešanas laiks',
  bedtime_in_window: 'Miega logs',
  steps_trend: 'Soļi',
  logging_gaps: 'Ieraksti',
  consistency: 'Stabils ritms',
};

/** Headline when this finding leads the summary. */
export function findingHeadline(f: AnalysisFinding): string {
  if (f.polarity === 'positive') {
    switch (f.kind) {
      case 'steps_trend':
        return 'Šonedēļ vairāk kustības';
      case 'bedtime_in_window':
        return 'Miega logs sāk strādāt';
      default:
        return 'Nedēļa ar stabilu ritmu';
    }
  }
  return 'Nedēļa ar vienu skaidru iespēju';
}

/** One small, optional suggestion for an opportunity finding. */
export function findingSuggestion(f: AnalysisFinding, ctx: Pick<QuestionContext, 'tone' | 'care' | 'preferences'>): string {
  const food = foodIdeas(ctx.preferences);
  const d = f.data;
  switch (f.kind) {
    case 'protein_gap': {
      const slot = (d.slot as MealType | null) ?? 'dinner';
      return offer(ctx.tone, `${food.proteinEvening} ${SLOT_IN[slot]} divas reizes nedēļā`);
    }
    case 'fibre_low':
      return offer(ctx.tone, 'sauja dārzeņu vai pākšaugu vienā maltītē dienā');
    case 'water_low':
      return offer(ctx.tone, 'glāze ūdens pie katras maltītes');
    case 'weekend_shift':
      return offer(ctx.tone, 'brīvdienās tāds pats maltīšu ritms kā darba dienās');
    case 'breakfast_skipped':
      return offer(ctx.tone, `vakarā sagatavo ${food.breakfastToGo} nākamajam rītam`);
    case 'short_sleep_low_steps':
      return offer(ctx.tone, ctx.care ? 'pēc īsākas nakts — mierīga pastaiga svaigā gaisā' : 'pēc īsākas nakts — īsa pastaiga pēc pusdienām');
    case 'bedtime_in_window':
    case 'bedtime_irregular':
      return offer(ctx.tone, 'telefons malā 30 minūtes pirms miega loga');
    case 'steps_trend':
      return offer(ctx.tone, ctx.care ? 'mierīga pastaiga, kad ir vēlme' : '10 minūšu pastaiga pusdienu pārtraukumā');
    case 'logging_gaps':
      return offer(ctx.tone, 'saglabā biežākās maltītes izlasē, lai ierakstīt būtu ātrāk');
    default:
      return offer(ctx.tone, 'turpini tāpat — tas strādā');
  }
}
