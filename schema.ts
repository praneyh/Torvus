// ============================================================
// TORVUS — SQLite Schema
// Phase 2: All CREATE TABLE statements + indexes
// expo-sqlite v2 (async/await API — no callbacks)
// ============================================================
//
// Usage pattern (expo-sqlite v2):
//
//   import * as SQLite from 'expo-sqlite';
//   const db = await SQLite.openDatabaseAsync('torvus.db');
//   await db.execAsync(SCHEMA_SQL);
//
// The constant SCHEMA_SQL below contains every DDL statement
// needed to initialise a fresh database.  Run it once on first
// launch (or on every launch — all tables use IF NOT EXISTS).
// ============================================================

export const SCHEMA_SQL = /* sql */ `

-- ──────────────────────────────────────────────────────────────
-- PRAGMAS
-- ──────────────────────────────────────────────────────────────

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ──────────────────────────────────────────────────────────────
-- GYM — WORKOUT TABLES
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workout_splits (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  days_per_week INTEGER NOT NULL CHECK (days_per_week BETWEEN 1 AND 7),
  is_preset    INTEGER NOT NULL DEFAULT 0 CHECK (is_preset IN (0, 1)),
  preset_type  TEXT    CHECK (preset_type IN ('PPL', 'UpperLower', 'BroSplit', 'FullBody')),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Trigger: keep updated_at fresh on every UPDATE
CREATE TRIGGER IF NOT EXISTS trg_workout_splits_updated_at
AFTER UPDATE ON workout_splits
FOR EACH ROW
BEGIN
  UPDATE workout_splits SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = OLD.id;
END;

-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workout_days (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  split_id      INTEGER NOT NULL REFERENCES workout_splits(id) ON DELETE CASCADE,
  day_number    INTEGER NOT NULL CHECK (day_number >= 1),
  label         TEXT    NOT NULL,
  -- Comma-separated MuscleGroup values stored as TEXT.
  -- Deserialise to string[] / MuscleGroup[] in the data layer.
  muscle_groups TEXT    NOT NULL DEFAULT '',
  UNIQUE (split_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_workout_days_split_id
  ON workout_days (split_id);

-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exercises (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  muscle_group TEXT    NOT NULL CHECK (muscle_group IN (
                 'chest','back','shoulders','biceps','triceps','forearms',
                 'quads','hamstrings','glutes','calves','adductors','core')),
  equipment    TEXT    NOT NULL CHECK (equipment IN (
                 'barbell','dumbbell','cable','machine',
                 'bodyweight','kettlebell','resistance_band','other')),
  is_custom    INTEGER NOT NULL DEFAULT 0 CHECK (is_custom IN (0, 1)),
  notes        TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_exercises_muscle_group
  ON exercises (muscle_group);

CREATE INDEX IF NOT EXISTS idx_exercises_is_custom
  ON exercises (is_custom);

-- ──────────────────────────────────────────────────────────────

-- Junction table: which exercises belong to a workout day.
-- Ordered by display_order for consistent UI rendering.
CREATE TABLE IF NOT EXISTS workout_day_exercises (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id        INTEGER NOT NULL REFERENCES workout_days(id) ON DELETE CASCADE,
  exercise_id   INTEGER NOT NULL REFERENCES exercises(id)    ON DELETE RESTRICT,
  display_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (day_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS idx_wde_day_id
  ON workout_day_exercises (day_id);

-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workout_sessions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  split_id         INTEGER NOT NULL REFERENCES workout_splits(id) ON DELETE CASCADE,
  day_id           INTEGER NOT NULL REFERENCES workout_days(id)   ON DELETE CASCADE,
  date             TEXT    NOT NULL,                -- YYYY-MM-DD
  started_at       TEXT    NOT NULL,                -- ISO 8601
  completed_at     TEXT,                            -- ISO 8601, NULL while in progress
  duration_seconds INTEGER,
  notes            TEXT
);

CREATE INDEX IF NOT EXISTS idx_workout_sessions_date
  ON workout_sessions (date);

CREATE INDEX IF NOT EXISTS idx_workout_sessions_split_id
  ON workout_sessions (split_id);

CREATE INDEX IF NOT EXISTS idx_workout_sessions_day_id
  ON workout_sessions (day_id);

-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS set_entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id  INTEGER NOT NULL REFERENCES exercises(id)        ON DELETE RESTRICT,
  set_number   INTEGER NOT NULL CHECK (set_number >= 1),
  reps         INTEGER NOT NULL CHECK (reps >= 0),
  weight_kg    REAL    NOT NULL CHECK (weight_kg >= 0),
  rpe          REAL    CHECK (rpe BETWEEN 1 AND 10),
  is_warmup    INTEGER NOT NULL DEFAULT 0 CHECK (is_warmup IN (0, 1)),
  -- NULL = weight mode; integer = plates per side (plates input mode)
  plates_count INTEGER CHECK (plates_count >= 0),
  logged_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (session_id, exercise_id, set_number)
);

CREATE INDEX IF NOT EXISTS idx_set_entries_session_id
  ON set_entries (session_id);

CREATE INDEX IF NOT EXISTS idx_set_entries_exercise_id
  ON set_entries (exercise_id);

-- Composite index used by the progress-chart queries (exercise over time)
CREATE INDEX IF NOT EXISTS idx_set_entries_exercise_session
  ON set_entries (exercise_id, session_id);

-- ──────────────────────────────────────────────────────────────
-- NUTRITION — FOOD TABLES
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS foods (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  fdc_id         TEXT    UNIQUE,             -- NULL for custom/AI foods
  name           TEXT    NOT NULL,
  calories       REAL    NOT NULL CHECK (calories >= 0),
  protein_g      REAL    NOT NULL CHECK (protein_g >= 0),
  carbs_g        REAL    NOT NULL CHECK (carbs_g >= 0),
  fat_g          REAL    NOT NULL CHECK (fat_g >= 0),
  fiber_g        REAL    CHECK (fiber_g >= 0),
  sodium_mg      REAL    CHECK (sodium_mg >= 0),
  serving_size_g REAL    CHECK (serving_size_g > 0),
  serving_label  TEXT,
  source         TEXT    NOT NULL DEFAULT 'manual'
                         CHECK (source IN ('usda','barcode','ai','manual')),
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_foods_fdc_id
  ON foods (fdc_id)
  WHERE fdc_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_foods_name
  ON foods (name COLLATE NOCASE);

-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meals (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  date                TEXT    NOT NULL,     -- YYYY-MM-DD
  meal_type           TEXT    NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snacks')),
  food_id             INTEGER NOT NULL REFERENCES foods(id) ON DELETE RESTRICT,
  serving_multiplier  REAL    NOT NULL DEFAULT 1.0 CHECK (serving_multiplier > 0),
  logged_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_meals_date
  ON meals (date);

CREATE INDEX IF NOT EXISTS idx_meals_date_meal_type
  ON meals (date, meal_type);

CREATE INDEX IF NOT EXISTS idx_meals_food_id
  ON meals (food_id);

-- ──────────────────────────────────────────────────────────────

-- Cached daily aggregates — recalculate via trigger or app logic
-- whenever meals for a given date change.
CREATE TABLE IF NOT EXISTS daily_nutrition_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  date            TEXT    NOT NULL UNIQUE,  -- YYYY-MM-DD
  total_calories  REAL    NOT NULL DEFAULT 0,
  total_protein_g REAL    NOT NULL DEFAULT 0,
  total_carbs_g   REAL    NOT NULL DEFAULT 0,
  total_fat_g     REAL    NOT NULL DEFAULT 0,
  total_fiber_g   REAL    NOT NULL DEFAULT 0,
  total_sodium_mg REAL    NOT NULL DEFAULT 0,
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_daily_nutrition_logs_date
  ON daily_nutrition_logs (date);

-- ──────────────────────────────────────────────────────────────
-- NUTRITION GOALS
-- ──────────────────────────────────────────────────────────────

-- Single-row table (id = 1).  INSERT OR REPLACE to update.
CREATE TABLE IF NOT EXISTS nutrition_goals (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  target_calories   REAL    NOT NULL DEFAULT 2000,
  target_protein_g  REAL    NOT NULL DEFAULT 150,
  target_carbs_g    REAL    NOT NULL DEFAULT 200,
  target_fat_g      REAL    NOT NULL DEFAULT 65,
  target_fiber_g    REAL    NOT NULL DEFAULT 30,
  target_sodium_mg  REAL    NOT NULL DEFAULT 2300,
  updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ──────────────────────────────────────────────────────────────
-- USER PREFERENCES
-- ──────────────────────────────────────────────────────────────

-- Single-row table (id = 1).
-- ai_estimation_bias is stored as a JSON string and parsed in the data layer:
-- { calories, protein, carbs, fat, fiber, sodium } → each 'overestimate'|'neutral'|'underestimate'
CREATE TABLE IF NOT EXISTS user_preferences (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  fitness_goal         TEXT    NOT NULL DEFAULT 'maintaining'
                               CHECK (fitness_goal IN ('bulking','cutting','maintaining')),
  ai_estimation_bias   TEXT    NOT NULL DEFAULT
                               '{"calories":"neutral","protein":"neutral","carbs":"neutral","fat":"neutral","fiber":"neutral","sodium":"neutral"}',
  body_weight_kg       REAL    CHECK (body_weight_kg > 0),
  height_cm            REAL    CHECK (height_cm > 0),
  onboarding_complete  INTEGER NOT NULL DEFAULT 0 CHECK (onboarding_complete IN (0, 1)),
  active_split_id      INTEGER REFERENCES workout_splits(id) ON DELETE SET NULL,
  updated_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ──────────────────────────────────────────────────────────────
-- CARDIO
-- ──────────────────────────────────────────────────────────────

-- Preset + custom cardio exercise types with metric flags
CREATE TABLE IF NOT EXISTS cardio_exercises (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT    NOT NULL,
  category              TEXT    NOT NULL DEFAULT 'machine'
                                CHECK (category IN ('machine','outdoor','sport','custom')),
  is_preset             INTEGER NOT NULL DEFAULT 0 CHECK (is_preset IN (0,1)),
  is_custom             INTEGER NOT NULL DEFAULT 0 CHECK (is_custom IN (0,1)),
  -- Metric availability flags
  has_distance          INTEGER NOT NULL DEFAULT 0,
  has_speed             INTEGER NOT NULL DEFAULT 0,
  has_incline           INTEGER NOT NULL DEFAULT 0,
  has_resistance        INTEGER NOT NULL DEFAULT 0,
  has_rpm               INTEGER NOT NULL DEFAULT 0,
  has_pace              INTEGER NOT NULL DEFAULT 0,
  has_laps              INTEGER NOT NULL DEFAULT 0,
  has_rounds            INTEGER NOT NULL DEFAULT 0,
  -- For fully custom exercises (up to 2 extra metrics)
  custom_metric_1_name  TEXT,
  custom_metric_2_name  TEXT,
  -- Approximate MET value (for calorie estimation without HR)
  met_value             REAL    NOT NULL DEFAULT 6.0,
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_cardio_exercises_is_preset ON cardio_exercises (is_preset);

-- Individual logged cardio sessions
CREATE TABLE IF NOT EXISTS cardio_sessions (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  cardio_exercise_id   INTEGER NOT NULL REFERENCES cardio_exercises(id) ON DELETE RESTRICT,
  date                 TEXT    NOT NULL,          -- YYYY-MM-DD
  started_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  duration_seconds     INTEGER NOT NULL,
  -- Exercise metrics (NULL if not applicable)
  distance_km          REAL,
  avg_speed_kmh        REAL,
  avg_incline_pct      REAL,
  resistance_level     INTEGER,
  avg_rpm              REAL,
  avg_pace_sec_per_km  REAL,
  laps                 INTEGER,
  rounds               INTEGER,
  custom_metric_1_val  REAL,
  custom_metric_2_val  REAL,
  -- Heart rate (all optional)
  hr_type              TEXT    CHECK (hr_type IN ('avg','range')),  -- NULL = not recorded
  hr_avg               INTEGER,                   -- bpm
  hr_min               INTEGER,                   -- bpm (range input)
  hr_max               INTEGER,                   -- bpm (range input)
  -- Calculated outputs
  calories_burned      REAL,
  calories_confidence  REAL,                      -- 0.0–1.0
  notes                TEXT,
  logged_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_cardio_sessions_date             ON cardio_sessions (date);
CREATE INDEX IF NOT EXISTS idx_cardio_sessions_exercise_date    ON cardio_sessions (cardio_exercise_id, date);

-- Optional: planned cardio on a specific split day
CREATE TABLE IF NOT EXISTS workout_day_cardio (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id               INTEGER NOT NULL REFERENCES workout_days(id) ON DELETE CASCADE,
  cardio_exercise_id   INTEGER NOT NULL REFERENCES cardio_exercises(id) ON DELETE CASCADE,
  planned_duration_min INTEGER,
  display_order        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_workout_day_cardio_day_id ON workout_day_cardio (day_id);

-- ──────────────────────────────────────────────────────────────
-- BODY METRICS LOG
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS body_weight_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT    NOT NULL,      -- YYYY-MM-DD
  weight_kg  REAL    NOT NULL CHECK (weight_kg > 0),
  notes      TEXT,
  logged_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_body_weight_log_date ON body_weight_log (date);

`;

// ──────────────────────────────────────────────────────────────
// DATABASE INITIALISATION HELPER
// ──────────────────────────────────────────────────────────────

import * as SQLite from 'expo-sqlite';

// Cache the Promise so concurrent callers all await the same init sequence.
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Returns a singleton database instance.
 * Runs the full schema on first call (all tables use IF NOT EXISTS
 * so this is safe to call on every app launch).
 */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!_dbPromise) {
    _dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('torvus.db');

      // expo-sqlite v2: execAsync runs a batch of semicolon-separated statements
      await db.execAsync(SCHEMA_SQL);

      // Seed a default UserPreferences row if the table is empty
      await db.runAsync(`INSERT OR IGNORE INTO user_preferences (id) VALUES (1);`);

      // Seed default NutritionGoal row
      await db.runAsync(`INSERT OR IGNORE INTO nutrition_goals (id) VALUES (1);`);

      // Migrations — ALTER TABLE does not support IF NOT EXISTS; catch on re-run
      try {
        await db.execAsync(
          `ALTER TABLE user_preferences ADD COLUMN weight_unit TEXT NOT NULL DEFAULT 'kg'`
        );
      } catch { /* column already exists on subsequent launches */ }

      try {
        await db.execAsync(`ALTER TABLE set_entries ADD COLUMN plates_count INTEGER`);
      } catch { /* column already exists */ }

      try {
        await db.execAsync(`ALTER TABLE exercises ADD COLUMN base_weight_kg REAL`);
      } catch { /* column already exists */ }

      try {
        await db.execAsync(`ALTER TABLE user_preferences ADD COLUMN anthropic_api_key TEXT`);
      } catch { /* column already exists */ }

      try {
        await db.execAsync(`ALTER TABLE user_preferences ADD COLUMN supabase_user_id TEXT`);
      } catch { /* column already exists */ }

      try {
        await db.execAsync(`ALTER TABLE user_preferences ADD COLUMN height_cm REAL`);
      } catch { /* column already exists */ }

      // Migration: rebuild exercises table to add forearms + adductors to CHECK constraint.
      // Detect by checking whether the current DDL already contains 'forearms'.
      const exDdl = await db.getFirstAsync<{ sql: string }>(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name='exercises'`
      );
      if (exDdl && !exDdl.sql.includes("'forearms'")) {
        await db.withExclusiveTransactionAsync(async () => {
          await db.execAsync(`
            CREATE TABLE exercises_new (
              id           INTEGER PRIMARY KEY AUTOINCREMENT,
              name         TEXT    NOT NULL,
              muscle_group TEXT    NOT NULL CHECK (muscle_group IN (
                             'chest','back','shoulders','biceps','triceps','forearms',
                             'quads','hamstrings','glutes','calves','adductors','core')),
              equipment    TEXT    NOT NULL CHECK (equipment IN (
                             'barbell','dumbbell','cable','machine',
                             'bodyweight','kettlebell','resistance_band','other')),
              is_custom    INTEGER NOT NULL DEFAULT 0 CHECK (is_custom IN (0, 1)),
              notes        TEXT,
              created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
            INSERT INTO exercises_new SELECT * FROM exercises;
            DROP TABLE exercises;
            ALTER TABLE exercises_new RENAME TO exercises;
            CREATE INDEX IF NOT EXISTS idx_exercises_muscle_group ON exercises (muscle_group);
            CREATE INDEX IF NOT EXISTS idx_exercises_is_custom    ON exercises (is_custom);
          `);
        });
      }

      return db;
    })();
  }
  return _dbPromise;
}
