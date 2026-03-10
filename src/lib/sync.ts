// ============================================================
// TORVUS — Cloud Sync
// src/lib/sync.ts
//
// Strategy: serialize all user-owned SQLite tables to a single
// JSONB blob in Supabase `user_data`.  Simple, offline-first,
// no per-table sync conflicts.
// ============================================================

import { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────
// PUSH  (local → cloud)
// ─────────────────────────────────────────────────────────────

export async function pushAllData(db: SQLiteDatabase, userId: string): Promise<void> {
  const [
    meals,
    foods,
    nutritionGoals,
    workoutSplits,
    workoutDays,
    workoutDayExercises,
    workoutSessions,
    setEntries,
    userPreferences,
    customExercises,
    cardioSessions,
    customCardioExercises,
    bodyWeightLog,
  ] = await Promise.all([
    db.getAllAsync(`SELECT * FROM meals`),
    db.getAllAsync(`SELECT * FROM foods WHERE source = 'manual' OR source = 'ai'`),
    db.getAllAsync(`SELECT * FROM nutrition_goals`),
    db.getAllAsync(`SELECT * FROM workout_splits WHERE is_preset = 0`),
    db.getAllAsync(`SELECT * FROM workout_days`),
    db.getAllAsync(`SELECT * FROM workout_day_exercises`),
    db.getAllAsync(`SELECT * FROM workout_sessions`),
    db.getAllAsync(`SELECT * FROM set_entries`),
    db.getAllAsync(`SELECT * FROM user_preferences`),
    db.getAllAsync(`SELECT * FROM exercises WHERE is_custom = 1`),
    db.getAllAsync(`SELECT * FROM cardio_sessions`),
    db.getAllAsync(`SELECT * FROM cardio_exercises WHERE is_custom = 1`),
    db.getAllAsync(`SELECT * FROM body_weight_log`),
  ]);

  const blob = {
    meals,
    foods,
    nutrition_goals: nutritionGoals,
    workout_splits: workoutSplits,
    workout_days: workoutDays,
    workout_day_exercises: workoutDayExercises,
    workout_sessions: workoutSessions,
    set_entries: setEntries,
    user_preferences: userPreferences,
    custom_exercises: customExercises,
    cardio_sessions: cardioSessions,
    custom_cardio_exercises: customCardioExercises,
    body_weight_log: bodyWeightLog,
    synced_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('user_data')
    .upsert({ user_id: userId, data: blob, updated_at: new Date().toISOString() });

  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────
// PULL  (cloud → local)
// Called on first login or when a different account logs in.
// Clears all user data tables then repopulates from cloud.
// ─────────────────────────────────────────────────────────────

export async function pullAllData(db: SQLiteDatabase, userId: string): Promise<void> {
  const { data } = await supabase
    .from('user_data')
    .select('data')
    .eq('user_id', userId)
    .single();

  // Always clear local user data when switching accounts,
  // even if the new account has nothing in the cloud yet.
  await db.withExclusiveTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM set_entries;
      DELETE FROM workout_sessions;
      DELETE FROM workout_day_exercises;
      DELETE FROM workout_days;
      DELETE FROM workout_splits WHERE is_preset = 0;
      DELETE FROM meals;
      DELETE FROM foods WHERE source = 'manual' OR source = 'ai';
      DELETE FROM nutrition_goals;
      DELETE FROM exercises WHERE is_custom = 1;
      DELETE FROM cardio_sessions;
      DELETE FROM cardio_exercises WHERE is_custom = 1;
      DELETE FROM body_weight_log;
    `);

    // Reset user preferences to defaults for the new account
    await db.runAsync(
      `UPDATE user_preferences SET
         fitness_goal = 'maintaining', body_weight_kg = NULL, weight_unit = 'kg',
         height_cm = NULL,
         ai_estimation_bias = '{"calories":"neutral","protein":"neutral","carbs":"neutral","fat":"neutral","fiber":"neutral","sodium":"neutral"}',
         anthropic_api_key = NULL, onboarding_complete = 0, active_split_id = NULL
       WHERE id = 1`
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO nutrition_goals (id, target_calories, target_protein_g, target_carbs_g, target_fat_g, target_fiber_g, target_sodium_mg)
       VALUES (1, 2000, 150, 200, 65, 30, 2300)`
    );

    // If the new account has no cloud data, we're done — stop here
    if (!data?.data) return;

    const blob = data.data as any;

    // Restore custom exercises
    for (const row of blob.custom_exercises ?? []) {
      await db.runAsync(
        `INSERT OR IGNORE INTO exercises (id, name, muscle_group, equipment, is_custom, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.name, row.muscle_group, row.equipment, 1, row.notes ?? null, row.created_at]
      );
    }

    // Restore foods (manual/ai)
    for (const row of blob.foods ?? []) {
      await db.runAsync(
        `INSERT OR IGNORE INTO foods (id, fdc_id, name, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, serving_size_g, serving_label, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.fdc_id ?? null, row.name, row.calories, row.protein_g, row.carbs_g, row.fat_g, row.fiber_g ?? null, row.sodium_mg ?? null, row.serving_size_g ?? null, row.serving_label ?? null, row.source, row.created_at]
      );
    }

    // Restore meals
    for (const row of blob.meals ?? []) {
      await db.runAsync(
        `INSERT OR IGNORE INTO meals (id, date, meal_type, food_id, serving_multiplier, logged_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.date, row.meal_type, row.food_id, row.serving_multiplier, row.logged_at, row.notes ?? null]
      );
    }

    // Restore nutrition goals
    for (const row of blob.nutrition_goals ?? []) {
      await db.runAsync(
        `INSERT OR REPLACE INTO nutrition_goals (id, target_calories, target_protein_g, target_carbs_g, target_fat_g, target_fiber_g, target_sodium_mg, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.target_calories, row.target_protein_g, row.target_carbs_g, row.target_fat_g, row.target_fiber_g, row.target_sodium_mg, row.updated_at]
      );
    }

    // Restore custom workout splits + days + exercises
    for (const row of blob.workout_splits ?? []) {
      await db.runAsync(
        `INSERT OR IGNORE INTO workout_splits (id, name, days_per_week, is_preset, preset_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.name, row.days_per_week, 0, row.preset_type ?? null, row.created_at, row.updated_at]
      );
    }
    for (const row of blob.workout_days ?? []) {
      await db.runAsync(
        `INSERT OR IGNORE INTO workout_days (id, split_id, day_number, label, muscle_groups)
         VALUES (?, ?, ?, ?, ?)`,
        [row.id, row.split_id, row.day_number, row.label, row.muscle_groups]
      );
    }
    for (const row of blob.workout_day_exercises ?? []) {
      await db.runAsync(
        `INSERT OR IGNORE INTO workout_day_exercises (id, day_id, exercise_id, display_order)
         VALUES (?, ?, ?, ?)`,
        [row.id, row.day_id, row.exercise_id, row.display_order]
      );
    }

    // Restore sessions + sets
    for (const row of blob.workout_sessions ?? []) {
      await db.runAsync(
        `INSERT OR IGNORE INTO workout_sessions (id, split_id, day_id, date, started_at, completed_at, duration_seconds, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.split_id, row.day_id, row.date, row.started_at, row.completed_at ?? null, row.duration_seconds ?? null, row.notes ?? null]
      );
    }
    for (const row of blob.set_entries ?? []) {
      await db.runAsync(
        `INSERT OR IGNORE INTO set_entries (id, session_id, exercise_id, set_number, reps, weight_kg, rpe, is_warmup, plates_count, logged_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.session_id, row.exercise_id, row.set_number, row.reps, row.weight_kg, row.rpe ?? null, row.is_warmup, row.plates_count ?? null, row.logged_at]
      );
    }

    // Restore custom cardio exercises
    for (const row of blob.custom_cardio_exercises ?? []) {
      await db.runAsync(
        `INSERT OR IGNORE INTO cardio_exercises
           (id, name, category, is_preset, is_custom,
            has_distance, has_speed, has_incline, has_resistance,
            has_rpm, has_pace, has_laps, has_rounds,
            custom_metric_1_name, custom_metric_2_name, met_value, created_at)
         VALUES (?,?,?,0,1,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [row.id, row.name, row.category ?? 'custom',
         row.has_distance ?? 0, row.has_speed ?? 0, row.has_incline ?? 0, row.has_resistance ?? 0,
         row.has_rpm ?? 0, row.has_pace ?? 0, row.has_laps ?? 0, row.has_rounds ?? 0,
         row.custom_metric_1_name ?? null, row.custom_metric_2_name ?? null,
         row.met_value ?? 6.0, row.created_at]
      );
    }

    // Restore cardio sessions
    for (const row of blob.cardio_sessions ?? []) {
      await db.runAsync(
        `INSERT OR IGNORE INTO cardio_sessions
           (id, cardio_exercise_id, date, started_at, duration_seconds,
            distance_km, avg_speed_kmh, avg_incline_pct, resistance_level,
            avg_rpm, avg_pace_sec_per_km, laps, rounds,
            custom_metric_1_val, custom_metric_2_val,
            hr_type, hr_avg, hr_min, hr_max,
            calories_burned, calories_confidence, notes, logged_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [row.id, row.cardio_exercise_id, row.date, row.started_at ?? null, row.duration_seconds,
         row.distance_km ?? null, row.avg_speed_kmh ?? null, row.avg_incline_pct ?? null,
         row.resistance_level ?? null, row.avg_rpm ?? null, row.avg_pace_sec_per_km ?? null,
         row.laps ?? null, row.rounds ?? null,
         row.custom_metric_1_val ?? null, row.custom_metric_2_val ?? null,
         row.hr_type ?? null, row.hr_avg ?? null, row.hr_min ?? null, row.hr_max ?? null,
         row.calories_burned ?? null, row.calories_confidence ?? null,
         row.notes ?? null, row.logged_at]
      );
    }

    // Restore body weight log
    for (const row of blob.body_weight_log ?? []) {
      await db.runAsync(
        `INSERT OR IGNORE INTO body_weight_log (id, date, weight_kg, notes, logged_at)
         VALUES (?, ?, ?, ?, ?)`,
        [row.id, row.date, row.weight_kg, row.notes ?? null, row.logged_at]
      );
    }

    // Restore user preferences (keep id=1)
    for (const row of blob.user_preferences ?? []) {
      await db.runAsync(
        `UPDATE user_preferences SET
           fitness_goal = ?, body_weight_kg = ?, weight_unit = ?,
           height_cm = ?,
           ai_estimation_bias = ?, anthropic_api_key = ?,
           onboarding_complete = ?, active_split_id = ?, updated_at = ?
         WHERE id = 1`,
        [
          row.fitness_goal, row.body_weight_kg ?? null, row.weight_unit ?? 'kg',
          row.height_cm ?? null,
          row.ai_estimation_bias, row.anthropic_api_key ?? null,
          row.onboarding_complete ?? 1, row.active_split_id ?? null, row.updated_at,
        ]
      );
    }
  });
}
