import { describe, expect, it } from 'vitest';

import { eveningAxisPos, hrTrend, hrvTrend, windDownSteps } from './sleepPlan';

describe('wind-down', () => {
  it('shows all steps with a 45 min lead', () => {
    expect(windDownSteps('23:00', '23:30', 45).map((s) => s.time)).toEqual(['22:15', '22:30', '22:45', '23:00']);
  });
  it('drops steps before a 30 min nudge', () => {
    expect(windDownSteps('23:00', '23:30', 30).map((s) => s.time)).toEqual(['22:30', '22:45', '23:00']);
  });
  it('wraps past midnight', () => {
    expect(windDownSteps('00:00', '00:30', 60)[0].time).toBe('23:00');
  });
  it('places times on the evening axis', () => {
    expect(eveningAxisPos('23:00')).toBe(0.5);
    expect(eveningAxisPos('20:00')).toBe(0);
  });
  it('labels trends', () => {
    expect(hrTrend([63, 62, 62, 60, 61, 62, 61])).toBe('stabils');
    expect(hrvTrend([38, 41, 40, 44, 39, 43, 42])).toBe('tavā ierastajā robežā');
  });
});
