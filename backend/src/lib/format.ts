/** Latvian number formatting: "1 480", "1,2 l", "6 h 40 min". */

export function fmtInt(n: number): string {
  const s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return n < 0 ? `−${s}` : s;
}

export function fmtDec(n: number, digits = 1): string {
  const fixed = n.toFixed(digits).replace(/\.?0+$/, '');
  const [int, frac] = fixed.split('.');
  return frac ? `${fmtInt(Number(int))},${frac}` : fmtInt(Number(int));
}

/** Millilitres as litres: 1200 → "1,2 l". */
export function fmtLitres(ml: number): string {
  return `${fmtDec(ml / 1000, 1)} l`;
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
