import { useSyncExternalStore } from 'react';

/**
 * Today's water intake, shared by Home and the global "+" sheet.
 * Local only for now; milestone 5 persists it through the API.
 */
export const GLASS_ML = 250;
const MAX_ML = 5000;

let waterMl: number | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function initWater(ml: number) {
  if (waterMl === null) {
    waterMl = ml;
    emit();
  }
}

export function addWater(ml = GLASS_ML) {
  waterMl = Math.min((waterMl ?? 0) + ml, MAX_ML);
  emit();
}

export function useWater(): number | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => waterMl,
  );
}
