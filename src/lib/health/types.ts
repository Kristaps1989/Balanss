export type HealthAvailability = 'available' | 'needs_install' | 'unsupported';

export interface HealthConnector {
  /** Which store this platform reads from. */
  source: 'health_connect' | 'apple_health' | null;
  availability(): Promise<HealthAvailability>;
  /** Ask for read permissions; returns true if at least steps and sleep were granted. */
  connect(): Promise<boolean>;
  /** Read the last `days` days and upload them. Returns false if nothing could be read. */
  sync(days: number, age: number): Promise<boolean>;
  /** Opens the platform's store / settings to install or manage the provider. */
  openSettings(): void;
}
