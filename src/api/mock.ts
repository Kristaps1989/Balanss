import { Platform } from 'react-native';

import type { HealthSource, Today, User } from './types';

/** Device data comes from the platform health store. */
const source: HealthSource = Platform.OS === 'ios' ? 'apple_health' : 'health_connect';

/** Sample user from CLAUDE.md. */
export const mockUser: User = {
  id: 'user-ilze',
  firstName: 'Ilze',
  age: 34,
  heightCm: 168,
  weightKg: 71,
  goalWeightKg: 66,
  personality: {
    openness: 'medium',
    conscientiousness: 'high',
    extraversion: 'low',
    agreeableness: 'high',
    emotionalStability: 'low',
  },
  tone: 'gentle',
};

export function mockToday(date = new Date()): Today {
  return {
    date: date.toISOString().slice(0, 10),
    nutrition: {
      kcal: { value: 1480, target: 1750 },
      proteinG: { value: 68, target: 110 },
      carbsG: { value: 160, target: 190 },
      fatG: { value: 52, target: 60 },
      fibreG: { value: 18, target: 25 },
      waterMl: { value: 1200, target: 2300 },
    },
    movement: {
      steps: { value: 6430, target: 8000 },
      activeKcal: 310,
      restingHr: 61,
      hrvMs: 42,
      source,
    },
    sleep: {
      totalMin: 400,
      deepMin: 65,
      remMin: 80,
      lightMin: 255,
      bedtime: '23:48',
      wakeTime: '06:45',
      score: 74,
      windowStart: '23:00',
      windowEnd: '23:30',
      source,
    },
    // Generated server-side in production; this is the "gentle" tone variant.
    tip: {
      id: 'tip-protein-evening',
      tone: 'gentle',
      body: 'Līdz olbaltumvielu mērķim trūkst 42 g. Viens viegls solis: biezpiens vai jogurts vakariņās (+18 g). Miegs bija nedaudz īsāks — tāpēc šodien bez spiediena.',
      highlight: '42 g',
    },
    weeklyQuestion: {
      id: 'wq-helped-most',
      question: 'Kas šonedēļ tev palīdzēja visvairāk?',
      options: [
        { label: 'Plānotas maltītes', reply: 'Labi, turpinām to. Nākamnedēļ ieplānosim arī 2 vakariņas ar olbaltumvielām — tikai ja gribi.' },
        { label: 'Agrāka gulētiešana', reply: 'Šonedēļ 2 naktis biji miega logā. Paturēsim 22:15 brīdinājumu, lai nākamnedēļ būtu vairāk.' },
        { label: 'Pastaigas', reply: 'Vidēji 7 800 soļu dienā. Pastaigas paliks tavā nedēļas plānā.' },
        { label: 'Grūti pateikt', reply: 'Tas ir pilnīgi normāli. Nākamnedēļ pajautāšu vēlreiz — bez spiediena.' },
      ],
    },
    lastWeightKg: 71,
  };
}
