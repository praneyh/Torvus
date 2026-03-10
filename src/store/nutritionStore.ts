// ============================================================
// TORVUS — Nutrition Zustand Store
// src/store/nutritionStore.ts
//
// Caches the current day's nutrition data for fast UI reads.
// SQLite is the source of truth — this store is refreshed
// after every meal add/remove via refreshTodayLog().
// ============================================================

import { create } from 'zustand';
import type {
  Meal,
  MealType,
  DailyNutritionLog,
  NutritionGoal,
  Food,
} from '@/types/models';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

/** A meal entry joined with its food details (for display) */
export interface MealEntry {
  meal: Meal;
  food: Food;
  /** Computed calories for this entry (food.calories × serving_multiplier) */
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sodiumMg: number;
}

/** All meals for a given day, grouped by meal type */
export type MealsByType = Record<MealType, MealEntry[]>;

interface NutritionState {
  selectedDate: string; // YYYY-MM-DD

  todayLog: DailyNutritionLog | null;
  mealsByType: MealsByType;
  goals: NutritionGoal | null;

  isLoading: boolean;
}

interface NutritionActions {
  setSelectedDate: (date: string) => void;
  setTodayLog: (log: DailyNutritionLog | null) => void;
  setMealsByType: (meals: MealsByType) => void;
  setGoals: (goals: NutritionGoal) => void;
  setLoading: (loading: boolean) => void;

  /** Optimistic add — replaces with DB-sourced data after write */
  addMealEntry: (entry: MealEntry) => void;
  /** Optimistic remove */
  removeMealEntry: (mealId: number, mealType: MealType) => void;
}

const EMPTY_MEALS: MealsByType = {
  breakfast: [],
  lunch: [],
  dinner: [],
  snacks: [],
};

// ─────────────────────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────────────────────

export const useNutritionStore = create<NutritionState & NutritionActions>()((set) => ({
  // ── Initial state ─────────────────────────────────────────
  selectedDate: todayDateString(),
  todayLog: null,
  mealsByType: EMPTY_MEALS,
  goals: null,
  isLoading: true,

  // ── Actions ───────────────────────────────────────────────
  setSelectedDate: (date) => set({ selectedDate: date }),
  setTodayLog: (log) => set({ todayLog: log }),
  setMealsByType: (meals) => set({ mealsByType: meals }),
  setGoals: (goals) => set({ goals }),
  setLoading: (loading) => set({ isLoading: loading }),

  addMealEntry: (entry) =>
    set((state) => ({
      mealsByType: {
        ...state.mealsByType,
        [entry.meal.mealType]: [
          ...state.mealsByType[entry.meal.mealType],
          entry,
        ],
      },
    })),

  removeMealEntry: (mealId, mealType) =>
    set((state) => ({
      mealsByType: {
        ...state.mealsByType,
        [mealType]: state.mealsByType[mealType].filter(
          (e) => e.meal.id !== mealId
        ),
      },
    })),
}));

// ─────────────────────────────────────────────────────────────
// SELECTORS
// ─────────────────────────────────────────────────────────────

/** Remaining calories vs goal for the selected day */
export const selectCaloriesRemaining = (
  state: NutritionState
): number | null => {
  if (!state.todayLog || !state.goals) return null;
  return state.goals.targetCalories - state.todayLog.totalCalories;
};

/** 0.0–1.0 progress fraction for each macro vs its goal */
export const selectMacroProgress = (state: NutritionState) => {
  const log = state.todayLog;
  const goals = state.goals;
  if (!log || !goals) return null;
  return {
    calories: clamp(log.totalCalories / goals.targetCalories),
    protein: clamp(log.totalProteinG / goals.targetProteinG),
    carbs: clamp(log.totalCarbsG / goals.targetCarbsG),
    fat: clamp(log.totalFatG / goals.targetFatG),
    fiber: clamp(log.totalFiberG / goals.targetFiberG),
  };
};

/** All meal entries as a flat list, sorted by loggedAt */
export const selectAllMeals = (state: NutritionState): MealEntry[] =>
  (Object.values(state.mealsByType) as MealEntry[][])
    .flat()
    .sort((a, b) => a.meal.loggedAt.localeCompare(b.meal.loggedAt));

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(Math.max(value, min), max);
}
