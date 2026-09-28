/** Time-zone helpers built on Intl (no dependency). */

export interface LocalNow {
  /** YYYY-MM-DD in the zone. */
  date: string;
  /** HH:MM in the zone. */
  hm: string;
  /** Minutes since local midnight. */
  minutes: number;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function localNow(tz: string, now: Date = new Date()): LocalNow {
  const parts = Object.fromEntries(formatter(isValidTimezone(tz) ? tz : 'UTC').formatToParts(now).map((p) => [p.type, p.value]));
  const hm = `${parts.hour}:${parts.minute}`;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hm,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? 'Mon'),
  };
}

/** Weekday (0 = Monday) of a calendar date string. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7;
}

/** Offset (ms) of `tz` from UTC at instant `at`. */
function tzOffsetMs(tz: string, at: Date): number {
  const p = Object.fromEntries(formatter(tz).formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return asUtc - Math.floor(at.getTime() / 60000) * 60000;
}

/** The UTC instant of local wall time `date` + `hm` in `tz`. */
export function zonedTime(date: string, hm: string, tz: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  const guess = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  const offset = tzOffsetMs(tz, new Date(guess));
  const second = tzOffsetMs(tz, new Date(guess - offset));
  return new Date(guess - second);
}

/** Local "HH:MM" of an ISO timestamp: wall-clock time if it carries an offset or none, zone-converted if it is UTC ("Z"). */
export function localClockOf(iso: string, tz: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (m && !/Z$/i.test(iso)) return `${m[1]}:${m[2]}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '12:00' : localNow(tz, d).hm;
}
