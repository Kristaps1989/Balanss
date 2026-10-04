/**
 * Latvian number/date formatting. Hand-rolled so output does not depend on
 * the Intl locale data shipped with the JS engine.
 * Examples: 1480 -> "1 480", 1.2 -> "1,2".
 */
const NBSP = ' ';

export function formatNumber(value: number, decimals = 0): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const sign = value < 0 ? '−' : '';
  return frac ? `${sign}${grouped},${frac}` : `${sign}${grouped}`;
}

/** 1480 -> "1 480 kcal" */
export function kcal(value: number): string {
  return `${formatNumber(value)}${NBSP}kcal`;
}

/** Millilitres -> "1,2 l", "1,45 l", "2 l" */
export function litres(ml: number): string {
  const s = formatNumber(ml / 1000, 2).replace(/,?0+$/, '');
  return `${s}${NBSP}l`;
}

/** Minutes -> "6 h 40 min" */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}${NBSP}min`;
  if (m === 0) return `${h}${NBSP}h`;
  return `${h}${NBSP}h ${m}${NBSP}min`;
}

/** Minutes -> "1h05" (compact, for sleep stages) */
export function durationCompact(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h${String(m).padStart(2, '0')}`;
}

const WEEKDAYS = [
  'Svētdiena',
  'Pirmdiena',
  'Otrdiena',
  'Trešdiena',
  'Ceturtdiena',
  'Piektdiena',
  'Sestdiena',
];

const MONTHS = [
  'janvāris',
  'februāris',
  'marts',
  'aprīlis',
  'maijs',
  'jūnijs',
  'jūlijs',
  'augusts',
  'septembris',
  'oktobris',
  'novembris',
  'decembris',
];

/** "Pirmdiena, 28. septembris" */
export function longDate(date: Date): string {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()}. ${MONTHS[date.getMonth()]}`;
}

export function greeting(date: Date): string {
  const h = date.getHours();
  if (h >= 4 && h < 11) return 'Labrīt';
  if (h >= 11 && h < 18) return 'Labdien';
  return 'Labvakar';
}

/** Latvian singular/plural: 1, 21, 31… take the singular (not 11). */
export function plural(n: number, one: string, many: string): string {
  return n % 10 === 1 && n % 100 !== 11 ? one : many;
}

/** ISO timestamp → local "HH:MM". */
export function timeOf(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Grams with one decimal only when needed: 68 → "68", 5.4 → "5,4". */
export function grams(g: number): string {
  return formatNumber(g, Number.isInteger(Math.round(g * 10) / 10) ? 0 : 1);
}

const WEEKDAYS_LOC = ['svētdien', 'pirmdien', 'otrdien', 'trešdien', 'ceturtdien', 'piektdien', 'sestdien'];

/** Relative day label: "Šodien", "Vakar", "Piektdien, 25.09." */
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Šodien';
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const [ty, tm, td] = today.split('-').map(Number);
  const diff = Math.round((new Date(ty, tm - 1, td).getTime() - dt.getTime()) / 86400000);
  if (diff === 1) return 'Vakar';
  const wd = WEEKDAYS_LOC[dt.getDay()];
  return `${wd[0].toUpperCase()}${wd.slice(1)}, ${d}.${String(m).padStart(2, '0')}.`;
}

/** Workout day label: "Šodien 09:30", "Piektdien", "Ceturtdien" */
export function workoutWhen(iso: string, today: string): string {
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (date === today) return `Šodien ${timeOf(iso)}`;
  const label = dayLabel(date, today);
  return label.split(',')[0];
}

/** Start of a screening or event: "Šodien 20:40", "Sestdien 18:00". */
export function startsWhen(iso: string, today: string): string {
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${dayLabel(date, today).split(',')[0]} ${timeOf(iso)}`;
}

const MONTHS_GEN = ['janvāra', 'februāra', 'marta', 'aprīļa', 'maija', 'jūnija', 'jūlija', 'augusta', 'septembra', 'oktobra', 'novembra', 'decembra'];

/** "2027. gada marta" */
export function monthYear(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}. gada ${MONTHS_GEN[d.getMonth()]}`;
}
