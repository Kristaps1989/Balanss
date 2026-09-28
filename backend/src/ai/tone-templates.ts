import { hmToMin, minToHm } from '../../../shared/dates';
import { fmtDec, fmtDuration, fmtInt, fmtLitres } from '../lib/format';
import type { PushCopy, PushKind, ToneInput, TrendsInput, TipAngle, TipResult, WeeklyQuestionResult } from './tone-types';

/**
 * Deterministic tone copy in Latvian, built from the day's numbers. Used by the
 * fake AI provider and as the fallback whenever a Claude call fails. The wording
 * follows prototype/Tone-Compare, Notif-* and Home.
 */

/** "1,2 no 2,3 l" (prototype wording). */
const litresOf = (p: { value: number; target: number }) => `${fmtDec(p.value / 1000)} no ${fmtLitres(p.target)}`;

const ratio = (p: { value: number; target: number }) => (p.target > 0 ? p.value / p.target : 1);

/**
 * Angles worth talking about today, most pressing first (share of target reached;
 * lower = more pressing). Water, steps and fibre get a small handicap because they
 * usually catch up during the day, while a protein gap needs a planned meal.
 */
export function rankAngles(input: ToneInput): TipAngle[] {
  const n = input.nutrition;
  const scored: [TipAngle, number][] = [
    ['protein', ratio(n.proteinG)],
    ['water', ratio(n.waterMl) + 0.15],
    ['steps', ratio(input.steps) + 0.1],
    ['fibre', ratio(n.fibreG) + 0.1],
  ];
  if (input.sleep) scored.push(['sleep', input.sleep.totalMin / Math.max(1, input.sleep.targetMin) + 0.05]);
  const open = scored.filter(([, r]) => r < 1).sort((a, b) => a[1] - b[1]);
  return [...open.map(([a]) => a), 'overall'];
}

function sleepShort(input: ToneInput): boolean {
  return !!input.sleep && input.sleep.totalMin < input.sleep.targetMin - 20;
}

function readyWord(input: ToneInput): string {
  return input.sex === 'm' ? 'kad jūties gatavs' : input.sex === 'f' ? 'kad jūties gatava' : 'kad sajūti, ka ir laiks';
}

export function templateTip(input: ToneInput, angle: TipAngle): TipResult {
  const n = input.nutrition;
  const proteinGap = Math.max(0, Math.round(n.proteinG.target - n.proteinG.value));
  const waterGap = Math.max(0, n.waterMl.target - n.waterMl.value);
  const stepsGap = Math.max(0, Math.round(input.steps.target - input.steps.value));
  const fibreGap = Math.max(0, Math.round(n.fibreG.target - n.fibreG.value));
  const window = input.sleep?.window;
  const start = window?.start ?? '23:00';
  const soft = input.modifiers.softer && sleepShort(input) ? ' Miegs bija nedaudz īsāks — tāpēc šodien bez spiediena.' : '';

  const t = (body: string, highlight: string | null): TipResult => ({ body, highlight: highlight && body.includes(highlight) ? highlight : null, angle });

  switch (input.tone) {
    case 'plan':
      switch (angle) {
        case 'protein':
          return soft
            ? t(`Līdz olbaltumvielu mērķim trūkst ${proteinGap} g. Viens viegls solis: biezpiens vai jogurts vakariņās (+18 g).${soft}`, `${proteinGap} g`)
            : t(`Šodien trūkst ${proteinGap} g olbaltumvielu. Plāns: biezpiens vai jogurts vakariņās (+18 g) un sauja riekstu uzkodām (+6 g).`, `${proteinGap} g`);
        case 'water':
          return t(`Ūdens: ${litresOf(n.waterMl)}. Plāns: glāze tagad un pa glāzei pēc katras maltītes — tā pietrūkstošie ${fmtLitres(waterGap)} sanāks līdz vakaram.`, fmtLitres(waterGap));
        case 'steps':
          return t(`Līdz ${fmtInt(input.steps.target)} soļiem trūkst ${fmtInt(stepsGap)}. Plāns: 20 minūšu pastaiga pēc pusdienām — tas ir ap 2 000 soļu.${soft}`, `${fmtInt(stepsGap)}`);
        case 'fibre':
          return t(`Šķiedrvielas: ${fmtDec(n.fibreG.value)} no ${n.fibreG.target} g. Plāns: ābols uzkodām (+4 g) un rupjmaizes šķēle vakariņās (+3 g).`, `${fmtDec(n.fibreG.value)} no ${n.fibreG.target} g`);
        case 'sleep':
          return t(`Miegs: ${fmtDuration(input.sleep!.totalMin)} no ${fmtDuration(input.sleep!.targetMin)}. Plāns šovakar: ${minToHm(hmToMin(start) - 30)} ierīces malā, ${start} gultā.`, start);
        default:
          return t(`Šodienas mērķi ir izpildīti. Plāns rītdienai: tāds pats ritms un gulētiešana ap ${start}.`, start);
      }
    case 'novelty':
      switch (angle) {
        case 'protein':
          return t(`Ideja šodienai: vakariņās pamēģini lēcu salātus ar fetu — jauna garša un ${proteinGap} g olbaltumvielu tuvāk mērķim.`, 'lēcu salātus ar fetu');
        case 'water':
          return t('Pamēģini ūdeni ar gurķi un piparmētru — tā pati glāze, cita garša.', 'gurķi un piparmētru');
        case 'steps':
          return t(`Ideja: šodien izpēti jaunu maršrutu pa apkārtni — vēl ${fmtInt(stepsGap)} soļu, un varbūt atradīsi jaunu iecienītu vietu.`, 'jaunu maršrutu');
        case 'fibre':
          return t('Ideja šodienai: izmēģini jaunu recepti — lēcu zupu ar ciedru riekstiem. Tā aizpildīs šķiedrvielas, un kaut kas jauns.', 'lēcu zupu ar ciedru riekstiem');
        case 'sleep':
          return t(`Šovakar kaut kas jauns: liepziedu tēja un 10 minūtes papīra grāmatas telefona vietā. Miega logs sākas ${start}.`, 'liepziedu tēja');
        default:
          return t('Diena ir labā ritmā. Ideja rītdienai: pamēģini vienu jaunu dārzeni, ko sen neesi ēdis vai ēdusi.', 'vienu jaunu dārzeni');
      }
    case 'gentle':
      switch (angle) {
        case 'protein':
          return t('Ja sanāk, vakariņās pievieno jogurtu vai biezpienu — tas jau ir labs solis. Bez spiediena.', 'jogurtu vai biezpienu');
        case 'water':
          return t('Ja ērti, iedzer malku ūdens. Nekas nav nokavēts.', 'malku ūdens');
        case 'steps':
          return t(`${sleepShort(input) ? 'Miegs bija īsāks, tas ir normāli. Šodien — bez spiediena. ' : ''}Ja sanāk, 15 minūšu pastaiga pēcpusdienā.`, '15 minūšu pastaiga');
        case 'fibre':
          return t('Ja gribas uzkodu, ābols vai burkāns būs labs. Ja ne — arī labi.', 'ābols vai burkāns');
        case 'sleep':
          return t(`Miegs bija īsāks, tas ir normāli. Šodien — bez spiediena. Miega logs ir ap ${start}, ${readyWord(input)}.`, 'bez spiediena');
        default:
          return t('Diena rit savā ritmā. Nekas nav jāmaina — vari vienkārši turpināt.', 'savā ritmā');
      }
    default:
      switch (angle) {
        case 'protein':
          return t(`Olbaltumvielas: ${fmtDec(n.proteinG.value)} no ${n.proteinG.target} g. Vakariņās der olas, biezpiens vai zivs.`, `${fmtDec(n.proteinG.value)} no ${n.proteinG.target} g`);
        case 'water':
          return t(`Ūdens: ${litresOf(n.waterMl)}. Glāze tagad palīdzēs.`, litresOf(n.waterMl));
        case 'steps':
          return t(`Soļi: ${fmtInt(input.steps.value)} no ${fmtInt(input.steps.target)}. Īsa pastaiga pēc pusdienām aizpildīs starpību.`, `${fmtInt(input.steps.value)} no ${fmtInt(input.steps.target)}`);
        case 'fibre':
          return t(`Šķiedrvielas: ${fmtDec(n.fibreG.value)} no ${n.fibreG.target} g. Der dārzeņi, pākšaugi vai rupjmaize.`, `${fmtDec(n.fibreG.value)} no ${n.fibreG.target} g`);
        case 'sleep':
          return t(`Miegs: ${fmtDuration(input.sleep!.totalMin)}. Šovakar miega logs ${start}–${window?.end ?? minToHm(hmToMin(start) + 30)}.`, `${start}`);
        default:
          return t('Šodienas mērķi ir izpildīti.', null);
      }
  }
}

/** A tip for the first angle whose copy is not in `exclude`; cycles tones' variants if all are used. */
export function fakeTip(input: ToneInput, exclude: string[] = []): TipResult {
  const angles = rankAngles(input);
  const all: TipAngle[] = [...angles, ...(['protein', 'water', 'steps', 'fibre', 'overall'] as TipAngle[]).filter((a) => !angles.includes(a))];
  for (const a of all) {
    if (a === 'sleep' && !input.sleep) continue;
    const tip = templateTip(input, a);
    if (!exclude.includes(tip.body)) return tip;
  }
  return templateTip(input, angles[0]!);
}

export function fakeWeeklyQuestion(input: ToneInput): WeeklyQuestionResult {
  const w = input.week;
  const nights = w?.nightsInWindow;
  const steps = w?.avgSteps;
  switch (input.tone) {
    case 'plan':
      return {
        question: 'Kas šonedēļ tev palīdzēja visvairāk?',
        options: [
          { label: 'Plānotas maltītes', reply: 'Labi, turpinām to. Nākamnedēļ ieplānosim arī 2 vakariņas ar olbaltumvielām — tikai ja gribi.' },
          {
            label: 'Agrāka gulētiešana',
            reply:
              nights != null
                ? `Šonedēļ ${nights} ${nights === 1 ? 'nakti' : 'naktis'} biji miega logā. Paturēsim vakara brīdinājumu, lai nākamnedēļ būtu vairāk.`
                : 'Paturēsim vakara brīdinājumu, lai nākamnedēļ miega logā būtu vairāk nakšu.',
          },
          {
            label: 'Pastaigas',
            reply: steps != null ? `Vidēji ${fmtInt(steps)} soļu dienā. Pastaigas paliks tavā nedēļas plānā.` : 'Pastaigas paliks tavā nedēļas plānā.',
          },
          { label: 'Grūti pateikt', reply: 'Tas ir pilnīgi normāli. Nākamnedēļ pajautāšu vēlreiz — bez spiediena.' },
        ],
      };
    case 'novelty':
      return {
        question: 'Ko jaunu šonedēļ izmēģināji?',
        options: [
          { label: 'Jaunu recepti', reply: 'Lieliski! Nākamnedēļ ieteikšu vēl vienu — šoreiz ar pākšaugiem.' },
          { label: 'Jaunu maršrutu', reply: 'Jauns maršruts ir labākais iemesls iziet ārā. Nākamnedēļ — vēl viens virziens?' },
          { label: 'Jaunu kustību', reply: 'Forši! Varbūt nākamnedēļ pamēģini to vēlreiz vai kaut ko pavisam citu.' },
          { label: 'Neko', reply: 'Arī tā gadās. Nākamnedēļ atsūtīšu vienu mazu ideju, ko pamēģināt.' },
        ],
      };
    case 'gentle':
      return {
        question: 'Kā tu šonedēļ jūties?',
        options: [
          { label: 'Labi', reply: 'Prieks dzirdēt. Turpinām tādā pašā mierīgā ritmā.' },
          { label: 'Tā neko', reply: 'Tas ir pilnīgi normāli. Nekas nav jāmaina — solis pa solim.' },
          { label: 'Grūti', reply: 'Paldies, ka pastāstīji. Nākamnedēļ būs mazāk atgādinājumu un vairāk miera.' },
          { label: 'Negribu teikt', reply: 'Tas ir labi. Esmu šeit, kad būs vēlme.' },
        ],
      };
    default:
      return {
        question: 'Kas šonedēļ palīdzēja visvairāk?',
        options: [
          { label: 'Maltītes', reply: 'Labi. Maltīšu ritms paliek tāds pats.' },
          { label: 'Miegs', reply: nights != null ? `Šonedēļ ${nights} ${nights === 1 ? 'nakts' : 'naktis'} miega logā.` : 'Miega logs paliek tāds pats.' },
          { label: 'Kustība', reply: steps != null ? `Vidēji ${fmtInt(steps)} soļu dienā.` : 'Kustības mērķis paliek tāds pats.' },
          { label: 'Grūti pateikt', reply: 'Labi. Pajautāšu nākamnedēļ.' },
        ],
      };
  }
}

export function fakePushCopy(kind: PushKind, input: ToneInput, meal: 'lunch' | 'dinner' = 'lunch'): PushCopy {
  const start = input.sleep?.window?.start ?? '23:00';
  const end = input.sleep?.window?.end ?? minToHm(hmToMin(start) + 30);
  const water = input.nutrition.waterMl;
  const mealWord = meal === 'lunch' ? 'Pusdienas' : 'Vakariņas';
  if (kind === 'sleep') {
    switch (input.tone) {
      case 'plan':
        return {
          title: `Miega logs ${start}–${end}`,
          body: `Plāns: tagad ierīces malā, ${minToHm(hmToMin(start) - 30)} tēja, ${start} gultā. Tā sasniegsi ${fmtDuration(input.sleep?.targetMin ?? 450)} miega.`,
        };
      case 'novelty':
        return { title: `Miega logs sākas ${start}`, body: 'Šovakar kaut kas jauns: liepziedu tēja un 10 minūtes papīra grāmatas telefona vietā. Rīt pastāsti, kā gulējās.' };
      case 'gentle':
        return { title: 'Balanss', body: `Diena bija gana. Tavs miega logs ir ap ${start} — ${readyWord(input)}, noliec telefonu un uztaisi tēju.` };
      default:
        return { title: `Miega logs ${start}–${end}`, body: `Drīz sākas tavs miega logs. Laiks nolikt ierīces malā.` };
    }
  }
  if (kind === 'water') {
    switch (input.tone) {
      case 'plan': {
        const hour = Math.min(21, Math.floor(hmToMin(input.localTime ?? '15:00') / 60) + 1);
        return {
          title: `Ūdens: ${litresOf(water)}`,
          body: `Viena glāze tagad — un līdz ${hour}:00 būsi pie ${fmtLitres(Math.min(water.target, water.value + 500))}.`,
        };
      }
      case 'novelty':
        return { title: 'Ūdens ar garšu', body: 'Pamēģini ūdeni ar gurķi un piparmētru — tā pati glāze, cita garša.' };
      case 'gentle':
        return { title: 'Balanss', body: 'Ja ērti, iedzer malku ūdens. Nekas nav nokavēts.' };
      default:
        return { title: 'Ūdens', body: `Šodien ${litresOf(water)}. Laiks glāzei ūdens.` };
    }
  }
  switch (input.tone) {
    case 'plan':
      return { title: mealWord, body: `${mealWord} vēl nav ierakstītas. Viens foto — un dienas plāns būs pilns.` };
    case 'novelty':
      return { title: `Kas šodien uz šķīvja?`, body: `Nofotografē ${meal === 'lunch' ? 'pusdienas' : 'vakariņas'} — varbūt tur ir kaut kas jauns.` };
    case 'gentle':
      return { title: 'Balanss', body: `Ja sanāk, pievieno ${meal === 'lunch' ? 'pusdienas' : 'vakariņas'}. Arī aptuveni ir labi.` };
    default:
      return { title: mealWord, body: `${mealWord} vēl nav pievienotas.` };
  }
}

export function fakeTrendsInsight(input: TrendsInput): string {
  const kcalClose = input.targetKcal > 0 && Math.abs(input.avgKcal - input.targetKcal) / input.targetKcal <= 0.08;
  const proteinLow = input.avgProteinG < input.targetProteinG * 0.9;
  switch (input.tone) {
    case 'plan':
      return `Vidēji ${fmtInt(input.avgKcal)} kcal pret mērķi ${fmtInt(input.targetKcal)}. Olbaltumvielas vidēji ${fmtInt(input.avgProteinG)} g no ${fmtInt(input.targetProteinG)} g${proteinLow ? ' — plāns: vakariņās viens olbaltumvielu avots (+18 g).' : ' — plāns strādā, turpinām.'}`;
    case 'novelty':
      return proteinLow
        ? 'Olbaltumvielas visbiežāk pietrūkst vakaros. Ideja: šonedēļ pamēģini vienu jaunu vakariņu recepti ar pākšaugiem vai zivi.'
        : 'Nedēļa bija līdzsvarota. Ideja: pamēģini vienu jaunu ēdienu, ko vēl neesi gatavojis vai gatavojusi.';
    case 'gentle':
      return `${kcalClose ? 'Enerģija turas tuvu mērķim.' : 'Nedēļa bija sava ritma.'} ${proteinLow ? 'Ja gribi, vakariņām pievieno vienu olbaltumvielu avotu — bez spiediena.' : 'Nekas nav jāmaina.'}`;
    default:
      return `${kcalClose ? 'Enerģija turas tuvu mērķim.' : `Vidēji ${fmtInt(input.avgKcal)} kcal dienā.`} ${proteinLow ? 'Olbaltumvielas visbiežāk pietrūkst vakaros — ja gribi, vakariņām pievieno vienu olbaltumvielu avotu.' : 'Olbaltumvielas ir tuvu mērķim.'}`;
  }
}
