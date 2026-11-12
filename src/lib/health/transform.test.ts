import { describe, expect, it } from 'vitest';

import { activeFromTotal, buildSyncPayload, dailyMaxByOrigin, deviceName, estimateRestingHr, hrZones, readResilient, sanitizeSyncPayload, sleepNight } from './transform';

const iso = (d: string, hm: string) => new Date(`${d}T${hm}:00`).toISOString();

describe('health transform', () => {
  it('maps a sleep session with stages', () => {
    const n = sleepNight({
      startTime: iso('2026-09-27', '23:48'),
      endTime: iso('2026-09-28', '06:45'),
      stages: [
        { startTime: iso('2026-09-27', '23:48'), endTime: iso('2026-09-28', '00:00'), stage: 1 },
        { startTime: iso('2026-09-28', '00:00'), endTime: iso('2026-09-28', '01:05'), stage: 5 },
        { startTime: iso('2026-09-28', '01:05'), endTime: iso('2026-09-28', '02:25'), stage: 6 },
        { startTime: iso('2026-09-28', '02:25'), endTime: iso('2026-09-28', '06:40'), stage: 4 },
        { startTime: iso('2026-09-28', '06:40'), endTime: iso('2026-09-28', '06:45'), stage: 1 },
      ],
    });
    expect(n).toEqual({ date: '2026-09-28', bedtime: '23:48', wakeTime: '06:45', totalMin: 400, deepMin: 65, remMin: 80, lightMin: 255, awakeMin: 17 });
  });

  it('names devices from metadata', () => {
    expect(deviceName({ device: { manufacturer: 'Polar', model: 'H10' } })).toBe('Polar H10');
    expect(deviceName({ dataOrigin: 'com.garmin.android.apps.connectmobile' })).toBe('Garmin');
    expect(deviceName({ dataOrigin: 'com.unknown' })).toBeNull();
  });

  it('computes HR zones', () => {
    const t = (m: number) => new Date(Date.UTC(2026, 8, 28, 9, m)).toISOString();
    const z = hrZones(
      [
        { time: t(0), beatsPerMinute: 100 },
        { time: t(1), beatsPerMinute: 130 },
        { time: t(2), beatsPerMinute: 170 },
        { time: t(3), beatsPerMinute: 170 },
      ],
      186,
    );
    expect(z).toEqual([1, 1, 0, 0, 1]);
  });

  it('builds the sync payload', () => {
    const p = buildSyncPayload({
      days: [{ date: '2026-09-28', steps: 6430.4, activeKcal: 310.2 }],
      restingHr: [{ time: iso('2026-09-28', '07:00'), value: 61 }],
      hrv: [
        { time: iso('2026-09-28', '03:00'), value: 40 },
        { time: iso('2026-09-28', '04:00'), value: 44 },
      ],
      sleep: [{ startTime: iso('2026-09-27', '23:48'), endTime: iso('2026-09-28', '06:45'), metadata: { device: { manufacturer: 'Apple', model: 'Watch' } } }],
      exercise: [
        { startTime: iso('2026-09-28', '09:30'), endTime: iso('2026-09-28', '10:12'), exerciseType: 79, metadata: { id: 'x1', device: { manufacturer: 'Polar', model: 'H10' } } },
      ],
      heartRate: [
        { samples: [{ time: iso('2026-09-28', '09:31'), beatsPerMinute: 110 }, { time: iso('2026-09-28', '09:32'), beatsPerMinute: 114 }] },
      ],
      weights: [{ time: iso('2026-09-28', '07:10'), value: 70.96 }],
      age: 34,
    });
    expect(p.days[0]).toEqual({ date: '2026-09-28', steps: 6430, activeKcal: 310, restingHr: 61, hrvMs: 42 });
    expect(p.nights[0].totalMin).toBe(417);
    expect(p.workouts[0]).toMatchObject({ externalId: 'x1', type: 'walk', durationMin: 42, avgHr: 112, device: 'Polar H10' });
    expect(p.weights).toEqual([{ date: '2026-09-28', kg: 71 }]);
    expect(p.devices.sort()).toEqual(['Apple Watch', 'Polar H10']);
  });
});

describe('Samsung Health and multi-source data', () => {
  const rec = (d: string, hm: string, value: number, origin: string) => ({
    startTime: iso(d, hm),
    endTime: iso(d, hm),
    value,
    metadata: { dataOrigin: origin },
  });

  it('takes the largest per-app daily total instead of summing apps', () => {
    const totals = dailyMaxByOrigin([
      // Phone-only counter (what Health Connect often prioritises): 3 323
      rec('2026-10-04', '08:00', 1200, 'android'),
      rec('2026-10-04', '09:30', 2123, 'android'),
      // Samsung Health, phone + watch merged: 7 815
      rec('2026-10-04', '08:39', 6100, 'com.sec.android.app.shealth'),
      rec('2026-10-04', '09:45', 1715, 'com.sec.android.app.shealth'),
      rec('2026-10-03', '12:00', 4000, 'com.sec.android.app.shealth'),
    ]);
    expect(totals.get('2026-10-04')).toBe(7815);
    expect(totals.get('2026-10-03')).toBe(4000);
  });

  it('derives active energy from total minus resting energy', () => {
    expect(activeFromTotal(2077, 1600, 1)).toBe(477);
    expect(activeFromTotal(1000, 1600, 0.5)).toBe(200);
    expect(activeFromTotal(500, 1600, 0.5)).toBe(0); // never negative
    expect(activeFromTotal(0, 1600, 1)).toBe(0);
  });

  it('estimates resting HR from a day of samples, but not from a few readings', () => {
    const samples = Array.from({ length: 24 }, (_, h) => ({
      time: iso('2026-10-04', `${String(h).padStart(2, '0')}:10`),
      beatsPerMinute: h >= 1 && h <= 3 ? 58 + h : 80,
    }));
    expect(estimateRestingHr(samples).get('2026-10-04')).toBe(60); // (59+60+61)/3
    expect(estimateRestingHr(samples.slice(0, 5)).size).toBe(0);
  });

  it('uses the estimate only when the device wrote no resting HR record', () => {
    const heartRate = [
      {
        samples: Array.from({ length: 20 }, (_, h) => ({ time: iso('2026-10-04', `${String(h).padStart(2, '0')}:05`), beatsPerMinute: 64 })),
        metadata: { dataOrigin: 'com.sec.android.app.shealth' },
      },
    ];
    const base = { days: [{ date: '2026-10-04', steps: 7815, activeKcal: 477 }], hrv: [], sleep: [], exercise: [], heartRate, weights: [], age: 34 };
    expect(buildSyncPayload({ ...base, restingHr: [] }).days[0].restingHr).toBe(64);
    const withRecord = buildSyncPayload({ ...base, restingHr: [{ time: iso('2026-10-04', '07:00'), value: 58 }] });
    expect(withRecord.days[0].restingHr).toBe(58);
    expect(withRecord.days[0].hrvMs).toBeNull();
  });
});

describe('sanitizeSyncPayload', () => {
  const day = { date: '2026-11-12', steps: 17_204, activeKcal: 512, restingHr: 61, hrvMs: 42 };
  const night = { date: '2026-11-12', bedtime: '23:10', wakeTime: '06:40', totalMin: 450, deepMin: 70, remMin: 90, lightMin: 290, awakeMin: 12 };
  const workout = { externalId: 'w1', type: 'walk' as const, startedAt: '2026-11-12T08:00:00.000Z', durationMin: 40, kcal: null, avgHr: 104, zones: null, device: 'Galaxy Watch7' };
  const base = { source: 'health_connect' as const, devices: ['Galaxy Watch7'], days: [day], nights: [night], workouts: [workout], weights: [{ date: '2026-11-12', kg: 82.4 }] };

  it('leaves a normal upload unchanged', () => {
    expect(sanitizeSyncPayload(base)).toEqual(base);
  });

  it('one odd record no longer blocks the steps: out-of-range values are dropped or clamped', () => {
    const out = sanitizeSyncPayload({
      ...base,
      devices: ['Galaxy Watch7', '  ', 'x'.repeat(80), ...Array.from({ length: 12 }, (_, i) => `Ierīce ${i}`)],
      days: [{ ...day, restingHr: 12, hrvMs: 740 }, { date: '2026-11-11', steps: 950_000, activeKcal: Number.NaN, restingHr: null, hrvMs: null }],
      nights: [night, { ...night, date: '2026-11-11', totalMin: 4000 }, { ...night, date: '2026-11-10', totalMin: 0 }],
      workouts: [workout, { ...workout, externalId: 'w2', durationMin: 4320 }, { ...workout, externalId: 'w3', avgHr: 400, zones: { minutes: [5, 5, 2000, 0, -3] }, device: 'y'.repeat(90) }],
      weights: [{ date: '2026-11-12', kg: 82.4 }, { date: '2026-11-11', kg: 4 }],
    });
    expect(out.devices).toHaveLength(10);
    expect(out.devices.every((d) => d.length >= 1 && d.length <= 60)).toBe(true);
    expect(out.days).toEqual([
      { ...day, restingHr: null, hrvMs: null },
      { date: '2026-11-11', steps: 200_000, activeKcal: 0, restingHr: null, hrvMs: null },
    ]);
    expect(out.nights.map((n) => n.date)).toEqual(['2026-11-12']);
    expect(out.workouts.map((w) => w.externalId)).toEqual(['w1', 'w3']);
    expect(out.workouts[1]).toMatchObject({ avgHr: null, zones: { minutes: [5, 5, 1440, 0, 0] } });
    expect(out.workouts[1]!.device).toHaveLength(60);
    expect(out.weights).toEqual([{ date: '2026-11-12', kg: 82.4 }]);
  });
});

describe('readResilient', () => {
  const H = 3_600_000;
  const t0 = Date.parse('2026-11-01T00:00:00.000Z');
  const iso = (h: number) => new Date(t0 + h * H).toISOString();
  // One record every 6 hours over 14 days; the store cannot return anything from a window that contains the bad one.
  const all = Array.from({ length: 56 }, (_, i) => ({ at: t0 + i * 6 * H + H / 2, metadata: { id: `r${i}` } }));
  const BAD = t0 + 100 * H + H / 2;
  const store = (failing: boolean) => async (s: string, e: string) => {
    const [from, to] = [Date.parse(s), Date.parse(e)];
    if (failing && BAD >= from && BAD < to) throw new Error('startTime must be before endTime.');
    return all.filter((r) => r.at >= from && r.at < to);
  };

  it('returns everything in one read when nothing is wrong', async () => {
    const out = await readResilient(store(false), iso(0), iso(336));
    expect(out.records).toHaveLength(56);
    expect(out.skipped).toEqual([]);
  });

  it('one unreadable record costs at most an hour of data, not the whole sync', async () => {
    const out = await readResilient(store(true), iso(0), iso(336));
    expect(out.skipped).toHaveLength(1);
    const k = out.skipped[0]!;
    expect(Date.parse(k.endTime) - Date.parse(k.startTime)).toBeLessThanOrEqual(H);
    expect(Date.parse(k.startTime)).toBeLessThanOrEqual(BAD);
    expect(Date.parse(k.endTime)).toBeGreaterThan(BAD);
    expect(k.reason).toContain('startTime must be before endTime');
    // Every record outside the skipped hour is there, once.
    const lost = all.filter((r) => r.at >= Date.parse(k.startTime) && r.at < Date.parse(k.endTime)).length;
    expect(out.records).toHaveLength(56 - lost);
    expect(new Set(out.records.map((r) => r.metadata.id)).size).toBe(out.records.length);
  });

  it('does not return a record twice when both halves of a split contain it', async () => {
    const spanning = { metadata: { id: 'day-block' } };
    let calls = 0;
    const out = await readResilient(
      async () => {
        if (calls++ === 0) throw new Error('boom');
        return [spanning];
      },
      iso(0),
      iso(48),
    );
    expect(out.records).toEqual([spanning]);
  });
});
