import type { Profile } from '@shared/api';

/** What the reader needs from the profile: age for HR zones, the rest for resting energy. */
export type SyncProfile = Pick<Profile, 'age' | 'sex' | 'weightKg' | 'heightCm'>;

export type HealthAvailability = 'available' | 'needs_install' | 'unsupported';

export interface HealthConnector {
  /** Which store this platform reads from. */
  source: 'health_connect' | 'apple_health' | null;
  availability(): Promise<HealthAvailability>;
  /** Ask for read permissions; returns true if at least steps and sleep were granted. */
  connect(): Promise<boolean>;
  /** Read the last `days` days and upload them. Returns false if nothing could be read. */
  sync(days: number, profile: SyncProfile): Promise<boolean>;
  /** Opens the platform's store / settings to install or manage the provider. */
  openSettings(): void;
}
