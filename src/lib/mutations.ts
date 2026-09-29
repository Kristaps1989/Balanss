import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, type Day } from '@/api';
import { invalidateDay, keys } from '@/api/hooks';

export const GLASS_ML = 250;

/** Add (or undo with negative ml) water with an optimistic update of the day. */
export function useAddWater(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ml: number) => api.addWater(date, ml),
    onMutate: async (ml) => {
      await qc.cancelQueries({ queryKey: keys.day(date) });
      const prev = qc.getQueryData<Day>(keys.day(date));
      if (prev) {
        qc.setQueryData<Day>(keys.day(date), {
          ...prev,
          nutrition: { ...prev.nutrition, waterMl: { ...prev.nutrition.waterMl, value: Math.max(0, prev.nutrition.waterMl.value + ml) } },
        });
      }
      return { prev };
    },
    onError: (_e, _ml, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.day(date), ctx.prev);
    },
    onSuccess: (res) => {
      const cur = qc.getQueryData<Day>(keys.day(date));
      if (cur) {
        qc.setQueryData<Day>(keys.day(date), {
          ...cur,
          nutrition: { ...cur.nutrition, waterMl: { ...cur.nutrition.waterMl, value: res.waterMl } },
        });
      }
    },
  });
}

export function useInvalidateDay() {
  const qc = useQueryClient();
  return (date: string) => invalidateDay(qc, date);
}
