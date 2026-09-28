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
