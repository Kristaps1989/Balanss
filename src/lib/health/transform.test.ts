import { describe, expect, it } from 'vitest';

import { activeFromTotal, buildSyncPayload, dailyMaxByOrigin, deviceName, estimateRestingHr, hrZones, sleepNight } from './transform';

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
