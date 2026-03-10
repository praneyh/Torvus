// ============================================================
// TORVUS — TypeScript Data Models
// Phase 2: All interfaces for Gym + Nutrition + User layers
// ============================================================

// ─────────────────────────────────────────────────────────────
// SHARED / UTILITY TYPES
// ─────────────────────────────────────────────────────────────

export type FitnessGoal = 'bulking' | 'cutting' | 'maintaining';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export type EquipmentType =
  | 'barbell'
  | 'dumbbell'
  | 'cable'
  | 'machine'
  | 'bodyweight'
  | 'kettlebell'
  | 'resistance_band'
  | 'other';

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'adductors'
  | 'core';

export type PresetSplitType = 'PPL' | 'UpperLower' | 'BroSplit' | 'FullBody';

/** Bias direction for AI macro estimation */
export type EstimationBias = 'overestimate' | 'neutral' | 'underestimate';

// ─────────────────────────────────────────────────────────────
// GYM — WORKOUT MODELS
// ─────────────────────────────────────────────────────────────

/**
 * A named workout program (e.g. "My PPL", "Summer Cut").
 * Can be a preset or fully custom.
 */
export interface WorkoutSplit {
  id: number;
  name: string;
  /** Number of training days per week */
  daysPerWeek: number;
  /** If true, this is a built-in preset — user cannot delete it */
  isPreset: boolean;
  /** Which preset template this was derived from, if any */
  presetType: PresetSplitType | null;
  /** ISO 8601 timestamp */
  createdAt: string;
  /** ISO 8601 timestamp */
  updatedAt: string;
}

/**
 * A single day within a WorkoutSplit.
 * e.g. Day 1 = Push (chest, shoulders, triceps)
 */
export interface WorkoutDay {
  id: number;
  splitId: number;
  /** 1-based index within the split (Day 1, Day 2, …) */
  dayNumber: number;
  /** User-facing label, e.g. "Push", "Pull", "Legs" */
  label: string;
  /** Primary muscle groups targeted this day */
  muscleGroups: MuscleGroup[];
}

/**
 * A single exercise in the library.
 * Shared across all splits — referenced by ID at session time.
 */
export interface Exercise {
  id: number;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: EquipmentType;
  /** True for user-created exercises; false for pre-populated library entries */
  isCustom: boolean;
  /** Optional notes / coaching cues */
  notes: string | null;
  /** ISO 8601 timestamp */
  createdAt: string;
}

/**
 * A single training session — the top-level record created
 * when the user starts a workout.
 */
export interface WorkoutSession {
  id: number;
  splitId: number;
  dayId: number;
  /** YYYY-MM-DD local date */
  date: string;
  /** ISO 8601 timestamp — set when user taps "Start" */
  startedAt: string;
  /** ISO 8601 timestamp — set when user taps "Finish". Null if in progress. */
  completedAt: string | null;
  /** Total elapsed time in seconds (populated on completion) */
  durationSeconds: number | null;
  notes: string | null;
}

/**
 * A single logged set within a WorkoutSession.
 * RPE (Rate of Perceived Exertion) is optional, scale 1–10.
 */
export interface SetEntry {
  id: number;
  sessionId: number;
  exerciseId: number;
  /** 1-based index within this exercise for this session */
  setNumber: number;
  reps: number;
  /** Weight in kg */
  weightKg: number;
  /** Rate of Perceived Exertion, 1–10 */
  rpe: number | null;
  /** True if the user marked this set as a warm-up */
  isWarmup: boolean;
  /** ISO 8601 timestamp — when this set was logged */
  loggedAt: string;
}

// ─────────────────────────────────────────────────────────────
// NUTRITION — FOOD MODELS
// ─────────────────────────────────────────────────────────────

/**
 * A food item — sourced from USDA FoodData Central, barcode scan,
 * AI photo analysis, or created manually.
 */
export interface Food {
  id: number;
  /** USDA FoodData Central ID — null for custom / AI-generated foods */
  fdcId: string | null;
  name: string;
  /** kcal per 100g (or per serving if servingSizeG is null) */
  calories: number;
  /** grams per 100g */
  proteinG: number;
  /** grams per 100g */
  carbsG: number;
  /** grams per 100g */
  fatG: number;
  /** grams per 100g — may be null if unavailable */
  fiberG: number | null;
  /** mg per 100g — may be null if unavailable */
  sodiumMg: number | null;
  /** Reference serving size in grams, e.g. 28 for "1 oz" */
  servingSizeG: number | null;
  /** Human-readable serving label, e.g. "1 slice", "1 cup" */
  servingLabel: string | null;
  /** 'usda' | 'barcode' | 'ai' | 'manual' */
  source: 'usda' | 'barcode' | 'ai' | 'manual';
  /** ISO 8601 timestamp */
  createdAt: string;
}

/**
 * A food entry within a specific day and meal.
 * servingMultiplier scales the Food's per-100g macros.
 * e.g. servingMultiplier = 1.5 means 150g of that food.
 */
export interface Meal {
  id: number;
  /** YYYY-MM-DD local date */
  date: string;
  mealType: MealType;
  foodId: number;
  /** Multiplier against the Food's per-100g values (grams / 100) */
  servingMultiplier: number;
  /** ISO 8601 timestamp */
  loggedAt: string;
  /** Optional user note for this entry */
  notes: string | null;
}

/**
 * Aggregated nutrition totals for a single calendar day.
 * Computed and cached — recalculated whenever Meal rows change for that date.
 */
export interface DailyNutritionLog {
  id: number;
  /** YYYY-MM-DD local date — unique per row */
  date: string;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  totalFiberG: number;
  totalSodiumMg: number;
  /** ISO 8601 timestamp — when this aggregate was last recalculated */
  updatedAt: string;
}

/**
 * The user's daily macro/calorie targets.
 * Only one active record is expected at a time (id = 1).
 */
export interface NutritionGoal {
  id: number;
  targetCalories: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  targetFiberG: number;
  targetSodiumMg: number;
  /** ISO 8601 timestamp */
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
// USER PREFERENCES
// ─────────────────────────────────────────────────────────────

/**
 * Per-nutrient bias injected into the Claude system prompt
 * when analysing food photos.
 *
 * overestimate → safe for cutting (don't undercount calories/macros)
 * neutral       → best-guess estimate
 * underestimate → safe for bulking (don't overcount)
 */
export interface AIEstimationBias {
  calories: EstimationBias;
  protein: EstimationBias;
  carbs: EstimationBias;
  fat: EstimationBias;
  fiber: EstimationBias;
  sodium: EstimationBias;
}

/**
 * Structured response shape returned by the Anthropic API
 * for food photo analysis.
 */
export interface AIFoodAnalysisResult {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number;
  /** 0.0 – 1.0 */
  confidence_score: number;
  notes: string;
}

/**
 * Global user preferences — single row (id = 1) in the database.
 */
export interface UserPreferences {
  id: number;
  fitnessGoal: FitnessGoal;
  aiEstimationBias: AIEstimationBias;
  /** Weight in kg */
  bodyWeightKg: number | null;
  /** Whether onboarding has been completed */
  onboardingComplete: boolean;
  /** The split currently selected as "active" */
  activeSplitId: number | null;
  /** ISO 8601 timestamp */
  updatedAt: string;
}
