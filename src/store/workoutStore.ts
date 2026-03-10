// ============================================================
// TORVUS — Workout Zustand Store
// src/store/workoutStore.ts
//
// SQLite is the source of truth. This store caches UI-facing
// state and manages the in-progress workout session (which
// needs fast, synchronous updates during logging).
// ============================================================

import { create } from 'zustand';
import type {
  WorkoutSplit,
  WorkoutDay,
  WorkoutSession,
  SetEntry,
  Exercise,
} from '@/types/models';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

/** Exercises grouped by their ExerciseLog within a session */
export interface SessionExercise {
  exercise: Exercise;
  sets: SetEntry[];
}

interface WorkoutState {
  // ── Active split ──────────────────────────────────────────
  activeSplit: WorkoutSplit | null;
  activeSplitDays: WorkoutDay[];
  /** The workout day that is next in rotation (pre-computed) */
  nextDay: WorkoutDay | null;

  // ── In-progress session ───────────────────────────────────
  activeSession: WorkoutSession | null;
  sessionExercises: SessionExercise[];
  /** Exercise currently being logged (expanded in UI) */
  focusedExerciseId: number | null;

  // ── UI state ──────────────────────────────────────────────
  isLoadingSplit: boolean;
}

interface WorkoutActions {
  // Split management
  setActiveSplit: (split: WorkoutSplit | null, days: WorkoutDay[]) => void;
  setNextDay: (day: WorkoutDay | null) => void;
  setLoadingSplit: (loading: boolean) => void;

  // Session lifecycle
  startSession: (session: WorkoutSession, exercises: Exercise[]) => void;
  completeSession: (completedAt: string, durationSeconds: number) => void;
  discardSession: () => void;

  // Set logging (called frequently — kept synchronous for instant UI feedback)
  addSet: (exerciseId: number, set: SetEntry) => void;
  updateSet: (exerciseId: number, setId: number, updates: Partial<SetEntry>) => void;
  removeSet: (exerciseId: number, setId: number) => void;

  // Exercise focus
  setFocusedExercise: (exerciseId: number | null) => void;

  // Add exercise to current session
  addExerciseToSession: (exercise: Exercise) => void;
}

// ─────────────────────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────────────────────

export const useWorkoutStore = create<WorkoutState & WorkoutActions>()((set) => ({
  // ── Initial state ─────────────────────────────────────────
  activeSplit: null,
  activeSplitDays: [],
  nextDay: null,
  activeSession: null,
  sessionExercises: [],
  focusedExerciseId: null,
  isLoadingSplit: true,
  
  // ── Split actions ─────────────────────────────────────────
  setActiveSplit: (split, days) =>
    set({ activeSplit: split, activeSplitDays: days }),

  setNextDay: (day) => set({ nextDay: day }),

  setLoadingSplit: (loading) => set({ isLoadingSplit: loading }),

  // ── Session lifecycle ─────────────────────────────────────

  startSession: (session, exercises) =>
    set({
      activeSession: session,
      sessionExercises: exercises.map((exercise) => ({ exercise, sets: [] })),
      focusedExerciseId: exercises[0]?.id ?? null,
    }),

  completeSession: (completedAt, durationSeconds) =>
    set((state) => ({
      activeSession: state.activeSession
        ? { ...state.activeSession, completedAt, durationSeconds }
        : null,
          })),

  discardSession: () =>
    set({
      activeSession: null,
      sessionExercises: [],
      focusedExerciseId: null,
          }),

  // ── Set logging ───────────────────────────────────────────

  addSet: (exerciseId, set_) =>
    set((state) => ({
      sessionExercises: state.sessionExercises.map((se) =>
        se.exercise.id === exerciseId
          ? { ...se, sets: [...se.sets, set_] }
          : se
      ),
    })),

  updateSet: (exerciseId, setId, updates) =>
    set((state) => ({
      sessionExercises: state.sessionExercises.map((se) =>
        se.exercise.id === exerciseId
          ? {
              ...se,
              sets: se.sets.map((s) =>
                s.id === setId ? { ...s, ...updates } : s
              ),
            }
          : se
      ),
    })),

  removeSet: (exerciseId, setId) =>
    set((state) => ({
      sessionExercises: state.sessionExercises.map((se) =>
        se.exercise.id === exerciseId
          ? { ...se, sets: se.sets.filter((s) => s.id !== setId) }
          : se
      ),
    })),

  // ── Exercise focus ────────────────────────────────────────

  setFocusedExercise: (exerciseId) => set({ focusedExerciseId: exerciseId }),

  addExerciseToSession: (exercise) =>
    set((state) => ({
      sessionExercises: [
        ...state.sessionExercises,
        { exercise, sets: [] },
      ],
      focusedExerciseId: exercise.id,
    })),
}));

// ─────────────────────────────────────────────────────────────
// SELECTORS
// ─────────────────────────────────────────────────────────────

/** Total working sets completed in the active session */
export const selectTotalSets = (state: WorkoutState) =>
  state.sessionExercises.reduce(
    (acc, se) => acc + se.sets.filter((s) => !s.isWarmup).length,
    0
  );

/** Total volume (kg × reps) for the active session */
export const selectTotalVolume = (state: WorkoutState) =>
  state.sessionExercises.reduce(
    (acc, se) =>
      acc +
      se.sets
        .filter((s) => !s.isWarmup)
        .reduce((setAcc, s) => setAcc + s.weightKg * s.reps, 0),
    0
  );
