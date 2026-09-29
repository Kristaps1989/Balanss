import { create } from 'zustand';

import type { AnalyzeMealResponse, FoodItemDraft, MealSource, MealType } from '@shared/api';
import { mealTypeForTime } from '@shared/nutrition';

import type { PreparedPhoto } from './photo';

/** One editable row on the result screen. */
export interface DraftItem extends FoodItemDraft {
  key: string;
  /** Label of the alternative the user picked for a low-confidence item. */
  picked?: string;
}

interface MealDraftState {
  photo: PreparedPhoto | null;
  takenAt: string | null;
  source: MealSource;
  type: MealType;
  photoUrl: string | null;
  items: DraftItem[];
  analysis: AnalyzeMealResponse | null;
  /** Start a new draft from a photo (camera or gallery). */
  startPhoto(photo: PreparedPhoto): void;
  /** Start a draft from barcode / text items. */
  startItems(items: FoodItemDraft[], source: MealSource): void;
  setAnalysis(a: AnalyzeMealResponse): void;
  addItems(items: FoodItemDraft[]): void;
  updateItem(key: string, patch: Partial<DraftItem>): void;
  removeItem(key: string): void;
  setType(t: MealType): void;
  reset(): void;
}

let n = 0;
const withKeys = (items: FoodItemDraft[]): DraftItem[] => items.map((i) => ({ ...i, key: `i${n++}` }));

const initial = {
  photo: null,
  takenAt: null,
  source: 'photo' as MealSource,
  type: 'lunch' as MealType,
  photoUrl: null,
  items: [] as DraftItem[],
  analysis: null,
};

export const useMealDraft = create<MealDraftState>((set) => ({
  ...initial,
  startPhoto: (photo) =>
    set({ ...initial, photo, takenAt: new Date().toISOString(), source: 'photo', type: mealTypeForTime(new Date()) }),
  startItems: (items, source) =>
    set({ ...initial, takenAt: new Date().toISOString(), source, type: mealTypeForTime(new Date()), items: withKeys(items) }),
  setAnalysis: (a) => set({ analysis: a, items: withKeys(a.items), type: a.suggestedType, photoUrl: a.photoUrl }),
  addItems: (items) => set((s) => ({ items: [...s.items, ...withKeys(items)] })),
  updateItem: (key, patch) => set((s) => ({ items: s.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) })),
  removeItem: (key) => set((s) => ({ items: s.items.filter((i) => i.key !== key) })),
  setType: (type) => set({ type }),
  reset: () => set(initial),
}));
