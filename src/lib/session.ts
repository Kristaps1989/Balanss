import { useEffect, useState } from 'react';

import { tokenStore } from '@/api';

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

/** Tracks whether auth tokens exist; updates on sign-in / sign-out. */
export function useSession(): SessionStatus {
  const [status, setStatus] = useState<SessionStatus>('loading');
  useEffect(() => {
    let alive = true;
    tokenStore.load().then((t) => alive && setStatus(t ? 'signedIn' : 'signedOut'));
    const unsub = tokenStore.subscribe((signedIn) => setStatus(signedIn ? 'signedIn' : 'signedOut'));
    return () => {
      alive = false;
      unsub();
    };
  }, []);
  return status;
}
