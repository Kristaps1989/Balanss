import type { HealthConnector } from './types';

export * from './types';

/**
 * Apple Health (HealthKit) arrives with the iOS build (react-native-health,
 * milestone 7.5). Until then iOS reports it as unsupported so onboarding
 * offers "Vēlāk — ievadīšu pati".
 */
export const health: HealthConnector = {
  source: 'apple_health',
  availability: async () => 'unsupported',
  connect: async () => false,
  sync: async () => false,
  openSettings: () => undefined,
};
