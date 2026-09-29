import type { HealthConnector } from './types';

export * from './types';

/** Web (and any platform without a health store): nothing to connect. */
export const health: HealthConnector = {
  source: null,
  availability: async () => 'unsupported',
  connect: async () => false,
  sync: async () => false,
  openSettings: () => undefined,
};
