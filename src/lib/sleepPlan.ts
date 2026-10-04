import { eveningMinutes, fromEveningMinutes } from '@shared/sleep';

export interface WindDownStep {
  time: string;
  title: string;
  text: string;
  kind: 'nudge' | 'calm' | 'window';
}

/**
 * Evening wind-down timeline before the sleep window (prototype: Sleep).
 * The nudge and the window start are always shown; the intermediate steps
 * only when they fall after the nudge.
 */
export function windDownSteps(windowStart: string, windowEnd: string, leadMin: number): WindDownStep[] {
  const w = eveningMinutes(windowStart);
  const all: (WindDownStep & { at: number; always: boolean })[] = [
    { at: w - leadMin, always: true, kind: 'nudge', title: 'Hei, miega logs tuvojas', text: 'Ekrāni un ierīces malā — telefons var palikt citā istabā.', time: '' },
    { at: w - 30, always: false, kind: 'calm', title: 'Tēja bez kofeīna', text: 'Kumelīšu vai piparmētru tēja, gaismas nedaudz blāvākas.', time: '' },
    { at: w - 15, always: false, kind: 'calm', title: 'Nomierināšanās', text: 'Grāmata papīrā vai 5 minūtes mierīgas elpošanas.', time: '' },
    { at: w, always: true, kind: 'window', title: 'Miega logs sākas', text: `Labākais brīdis iet gulēt: ${windowStart}–${windowEnd}.`, time: '' },
  ];
  return all
    .filter((s) => s.always || s.at > w - leadMin)
    .map(({ at, kind, title, text }) => ({ time: fromEveningMinutes(at), kind, title, text }));
}

/** Position (0..1) of a time on the 21:00–01:00 evening axis. */
export function eveningAxisPos(hm: string): number {
  const start = eveningMinutes('21:00');
  return Math.max(0, Math.min(1, (eveningMinutes(hm) - start) / 240));
}

/** Short Latvian trend label for resting HR over 7 days. */
/** No value in the whole window: the device doesn't send this metric to Health Connect / Apple Health. */
const NO_DEVICE_DATA = 'ierīce šos datus nenodod';

export function hrTrend(series: (number | null)[]): string {
  const v = series.filter((x): x is number => x !== null);
  if (v.length === 0) return NO_DEVICE_DATA;
  if (v.length < 3) return 'vēl maz datu';
  const range = Math.max(...v) - Math.min(...v);
  const today = v[v.length - 1];
  const avg = v.reduce((a, b) => a + b, 0) / v.length;
  if (today > avg + 4) return 'šodien nedaudz augstāks';
  return range <= 5 ? 'stabils' : 'nedaudz svārstās';
}

export function hrvTrend(series: (number | null)[]): string {
  const v = series.filter((x): x is number => x !== null);
  if (v.length === 0) return NO_DEVICE_DATA;
  if (v.length < 3) return 'vēl maz datu';
  const avg = v.reduce((a, b) => a + b, 0) / v.length;
  const today = v[v.length - 1];
  return Math.abs(today - avg) <= avg * 0.15 ? 'tavā ierastajā robežā' : today < avg ? 'zemāka nekā parasti' : 'augstāka nekā parasti';
}
