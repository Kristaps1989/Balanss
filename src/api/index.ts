/**
 * API client. Until the Railway backend exists, every call resolves with
 * mocked sample data. Swap the implementations to fetch from
 * `process.env.EXPO_PUBLIC_API_URL` in milestone 5.
 */
import { useEffect, useState } from 'react';

import { mockToday, mockUser } from './mock';
import type { Today, User } from './types';

export * from './types';

export const API_URL = process.env.EXPO_PUBLIC_API_URL;

export async function getMe(): Promise<User> {
  return mockUser;
}

export async function getToday(date = new Date()): Promise<Today> {
  return mockToday(date);
}

export function useAsync<T>(load: () => Promise<T>): T | undefined {
  const [data, setData] = useState<T>();
  useEffect(() => {
    let alive = true;
    load().then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return data;
}
