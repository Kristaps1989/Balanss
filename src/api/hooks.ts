import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Me } from '@shared/api';

import { api } from './index';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

export const keys = {
  me: ['me'] as const,
  day: (date: string) => ['day', date] as const,
  quota: ['quota'] as const,
  favourites: ['favourites'] as const,
  stats: (date: string) => ['stats', date] as const,
  movement: (date: string) => ['movement', date] as const,
  sleep: (date: string) => ['sleep', date] as const,
  tip: (date: string) => ['tip', date] as const,
  weekly: (date: string) => ['weekly', date] as const,
};

export const useMe = (enabled = true) => useQuery({ queryKey: keys.me, queryFn: api.me, enabled });
export const useDay = (date: string) => useQuery({ queryKey: keys.day(date), queryFn: () => api.day(date) });
export const useQuota = () => useQuery({ queryKey: keys.quota, queryFn: api.quota });
export const useFavourites = () => useQuery({ queryKey: keys.favourites, queryFn: api.favourites });
export const useNutritionStats = (date: string) =>
  useQuery({ queryKey: keys.stats(date), queryFn: () => api.nutritionStats(date, 7) });
export const useMovement = (date: string) => useQuery({ queryKey: keys.movement(date), queryFn: () => api.movement(date, 7) });
export const useSleep = (date: string) => useQuery({ queryKey: keys.sleep(date), queryFn: () => api.sleep(date) });
export const useTip = (date: string) => useQuery({ queryKey: keys.tip(date), queryFn: () => api.tipToday(date), staleTime: Infinity });
export const useWeeklyQuestion = (date: string) =>
  useQuery({ queryKey: keys.weekly(date), queryFn: () => api.weeklyQuestion(date), staleTime: Infinity });

/** Mutation that returns the updated Me and writes it into the cache. */
export function useMeMutation<A>(fn: (arg: A) => Promise<Me>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (me) => {
      qc.setQueryData(keys.me, me);
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    },
  });
}

/** Invalidate everything that depends on the day's logged data. */
export function invalidateDay(qc: ReturnType<typeof useQueryClient>, date: string) {
  qc.invalidateQueries({ queryKey: keys.day(date) });
  qc.invalidateQueries({ queryKey: ['stats'] });
  qc.invalidateQueries({ queryKey: keys.quota });
}
