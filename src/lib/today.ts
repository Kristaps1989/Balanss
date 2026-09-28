import { useEffect, useState } from 'react';

import { toISODate } from '@shared/dates';

/** Today's local date; re-renders after midnight. */
export function useToday(): string {
  const [d, setD] = useState(() => toISODate(new Date()));
  useEffect(() => {
    const t = setInterval(() => {
      const now = toISODate(new Date());
      setD((prev) => (prev === now ? prev : now));
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  return d;
}
