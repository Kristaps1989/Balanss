import { useEffect } from 'react';

/**
 * Background services that run while the user is signed in and onboarded:
 * health data sync and push registration (filled in by the native integrations).
 */
export function useAppServices(active: boolean) {
  useEffect(() => {
    if (!active) return;
  }, [active]);
}
