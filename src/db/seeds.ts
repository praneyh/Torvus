// ============================================================
// TORVUS — Database Seeds
// src/db/seeds.ts
//
// Idempotent seed functions — safe to call on every app launch.
// ============================================================

import type { SQLiteDatabase } from 'expo-sqlite';

// ─────────────────────────────────────────────────────────────
// EXERCISE LIBRARY SEED
// ─────────────────────────────────────────────────────────────

const SEED_EXERCISES: Array<{
  name: string;
  muscleGroup: string;
  equipment: string;
}> = [
  // Chest
  { name: 'Barbell Bench Press',     muscleGroup: 'chest',      equipment: 'barbell'    },
  { name: 'Incline Barbell Press',   muscleGroup: 'chest',      equipment: 'barbell'    },
  { name: 'Decline Barbell Press',   muscleGroup: 'chest',      equipment: 'barbell'    },
  { name: 'Dumbbell Bench Press',    muscleGroup: 'chest',      equipment: 'dumbbell'   },
  { name: 'Incline Dumbbell Press',  muscleGroup: 'chest',      equipment: 'dumbbell'   },
  { name: 'Dumbbell Flyes',          muscleGroup: 'chest',      equipment: 'dumbbell'   },
  { name: 'Cable Crossover',         muscleGroup: 'chest',      equipment: 'cable'      },
  { name: 'Cable Fly',               muscleGroup: 'chest',      equipment: 'cable'      },
  { name: 'Machine Chest Press',     muscleGroup: 'chest',      equipment: 'machine'    },
  { name: 'Pec Deck',                muscleGroup: 'chest',      equipment: 'machine'    },
  { name: 'Push-Up',                 muscleGroup: 'chest',      equipment: 'bodyweight' },
  { name: 'Chest Dip',               muscleGroup: 'chest',      equipment: 'bodyweight' },

  // Back
  { name: 'Barbell Row',             muscleGroup: 'back',       equipment: 'barbell'    },
  { name: 'T-Bar Row',               muscleGroup: 'back',       equipment: 'barbell'    },
  { name: 'Deadlift',                muscleGroup: 'back',       equipment: 'barbell'    },
  { name: 'Dumbbell Row',            muscleGroup: 'back',       equipment: 'dumbbell'   },
  { name: 'Lat Pulldown',            muscleGroup: 'back',       equipment: 'cable'      },
  { name: 'Seated Cable Row',        muscleGroup: 'back',       equipment: 'cable'      },
  { name: 'Straight-Arm Pulldown',   muscleGroup: 'back',       equipment: 'cable'      },
  { name: 'Face Pull',               muscleGroup: 'back',       equipment: 'cable'      },
  { name: 'Machine Row',             muscleGroup: 'back',       equipment: 'machine'    },
  { name: 'Pull-Up',                 muscleGroup: 'back',       equipment: 'bodyweight' },
  { name: 'Chin-Up',                 muscleGroup: 'back',       equipment: 'bodyweight' },

  // Shoulders
  { name: 'Overhead Press',          muscleGroup: 'shoulders',  equipment: 'barbell'    },
  { name: 'Upright Row',             muscleGroup: 'shoulders',  equipment: 'barbell'    },
  { name: 'Seated Dumbbell Press',   muscleGroup: 'shoulders',  equipment: 'dumbbell'   },
  { name: 'Arnold Press',            muscleGroup: 'shoulders',  equipment: 'dumbbell'   },
  { name: 'Dumbbell Lateral Raise',  muscleGroup: 'shoulders',  equipment: 'dumbbell'   },
  { name: 'Front Raise',             muscleGroup: 'shoulders',  equipment: 'dumbbell'   },
  { name: 'Rear Delt Fly',           muscleGroup: 'shoulders',  equipment: 'dumbbell'   },
  { name: 'Cable Lateral Raise',     muscleGroup: 'shoulders',  equipment: 'cable'      },
  { name: 'Machine Shoulder Press',  muscleGroup: 'shoulders',  equipment: 'machine'    },

  // Biceps
  { name: 'Barbell Curl',            muscleGroup: 'biceps',     equipment: 'barbell'    },
  { name: 'EZ Bar Curl',             muscleGroup: 'biceps',     equipment: 'barbell'    },
  { name: 'Dumbbell Curl',           muscleGroup: 'biceps',     equipment: 'dumbbell'   },
  { name: 'Hammer Curl',             muscleGroup: 'biceps',     equipment: 'dumbbell'   },
  { name: 'Incline Dumbbell Curl',   muscleGroup: 'biceps',     equipment: 'dumbbell'   },
  { name: 'Concentration Curl',      muscleGroup: 'biceps',     equipment: 'dumbbell'   },
  { name: 'Cable Curl',              muscleGroup: 'biceps',     equipment: 'cable'      },
  { name: 'Preacher Curl',           muscleGroup: 'biceps',     equipment: 'machine'    },

  // Triceps
  { name: 'Close-Grip Bench Press',  muscleGroup: 'triceps',    equipment: 'barbell'    },
  { name: 'Skull Crusher',           muscleGroup: 'triceps',    equipment: 'barbell'    },
  { name: 'Dumbbell Overhead Extension', muscleGroup: 'triceps', equipment: 'dumbbell'  },
  { name: 'Dumbbell Kickback',       muscleGroup: 'triceps',    equipment: 'dumbbell'   },
  { name: 'Tricep Pushdown',         muscleGroup: 'triceps',    equipment: 'cable'      },
  { name: 'Rope Pushdown',           muscleGroup: 'triceps',    equipment: 'cable'      },
  { name: 'Overhead Tricep Extension', muscleGroup: 'triceps',  equipment: 'cable'      },
  { name: 'Tricep Dip',              muscleGroup: 'triceps',    equipment: 'bodyweight' },
  { name: 'Diamond Push-Up',         muscleGroup: 'triceps',    equipment: 'bodyweight' },

  // Forearms
  { name: 'Wrist Curl',              muscleGroup: 'forearms',   equipment: 'barbell'    },
  { name: 'Reverse Wrist Curl',      muscleGroup: 'forearms',   equipment: 'barbell'    },
  { name: 'Reverse Curl',            muscleGroup: 'forearms',   equipment: 'barbell'    },
  { name: "Farmer's Carry",          muscleGroup: 'forearms',   equipment: 'dumbbell'   },
  { name: 'Wrist Roller',            muscleGroup: 'forearms',   equipment: 'other'      },

  // Quads
  { name: 'Barbell Squat',           muscleGroup: 'quads',      equipment: 'barbell'    },
  { name: 'Front Squat',             muscleGroup: 'quads',      equipment: 'barbell'    },
  { name: 'Bulgarian Split Squat',   muscleGroup: 'quads',      equipment: 'dumbbell'   },
  { name: 'Lunge',                   muscleGroup: 'quads',      equipment: 'dumbbell'   },
  { name: 'Goblet Squat',            muscleGroup: 'quads',      equipment: 'kettlebell' },
  { name: 'Hack Squat',              muscleGroup: 'quads',      equipment: 'machine'    },
  { name: 'Leg Press',               muscleGroup: 'quads',      equipment: 'machine'    },
  { name: 'Leg Extension',           muscleGroup: 'quads',      equipment: 'machine'    },

  // Hamstrings
  { name: 'Romanian Deadlift',       muscleGroup: 'hamstrings', equipment: 'barbell'    },
  { name: 'Stiff-Leg Deadlift',      muscleGroup: 'hamstrings', equipment: 'barbell'    },
  { name: 'Good Morning',            muscleGroup: 'hamstrings', equipment: 'barbell'    },
  { name: 'Lying Leg Curl',          muscleGroup: 'hamstrings', equipment: 'machine'    },
  { name: 'Seated Leg Curl',         muscleGroup: 'hamstrings', equipment: 'machine'    },
  { name: 'Nordic Curl',             muscleGroup: 'hamstrings', equipment: 'bodyweight' },

  // Glutes
  { name: 'Hip Thrust',              muscleGroup: 'glutes',     equipment: 'barbell'    },
  { name: 'Sumo Deadlift',           muscleGroup: 'glutes',     equipment: 'barbell'    },
  { name: 'Glute Bridge',            muscleGroup: 'glutes',     equipment: 'bodyweight' },
  { name: 'Donkey Kick',             muscleGroup: 'glutes',     equipment: 'bodyweight' },
  { name: 'Cable Kickback',          muscleGroup: 'glutes',     equipment: 'cable'      },

  // Calves
  { name: 'Standing Calf Raise',     muscleGroup: 'calves',     equipment: 'machine'    },
  { name: 'Seated Calf Raise',       muscleGroup: 'calves',     equipment: 'machine'    },
  { name: 'Donkey Calf Raise',       muscleGroup: 'calves',     equipment: 'machine'    },
  { name: 'Single-Leg Calf Raise',   muscleGroup: 'calves',     equipment: 'bodyweight' },

  // Adductors
  { name: 'Adductor Machine',        muscleGroup: 'adductors',  equipment: 'machine'    },
  { name: 'Cable Hip Adduction',     muscleGroup: 'adductors',  equipment: 'cable'      },
  { name: 'Sumo Squat',              muscleGroup: 'adductors',  equipment: 'barbell'    },
  { name: 'Copenhagen Plank',        muscleGroup: 'adductors',  equipment: 'bodyweight' },

  // Core
  { name: 'Plank',                   muscleGroup: 'core',       equipment: 'bodyweight' },
  { name: 'Crunch',                  muscleGroup: 'core',       equipment: 'bodyweight' },
  { name: 'Sit-Up',                  muscleGroup: 'core',       equipment: 'bodyweight' },
  { name: 'Leg Raise',               muscleGroup: 'core',       equipment: 'bodyweight' },
  { name: 'Hanging Leg Raise',       muscleGroup: 'core',       equipment: 'bodyweight' },
  { name: 'Russian Twist',           muscleGroup: 'core',       equipment: 'bodyweight' },
  { name: 'Dragon Flag',             muscleGroup: 'core',       equipment: 'bodyweight' },
  { name: 'Ab Wheel Rollout',        muscleGroup: 'core',       equipment: 'other'      },
  { name: 'Cable Crunch',            muscleGroup: 'core',       equipment: 'cable'      },
];

// Muscle groups added after initial seed — inserted for existing installs
const SUPPLEMENTAL_EXERCISES: Array<{
  name: string;
  muscleGroup: string;
  equipment: string;
}> = SEED_EXERCISES.filter(e =>
  e.muscleGroup === 'forearms' || e.muscleGroup === 'adductors'
);

// ─────────────────────────────────────────────────────────────
// PUBLIC SEED FUNCTIONS
// ─────────────────────────────────────────────────────────────

/**
 * Seeds the exercise library if empty.
 * Also patches in forearms/adductors for existing installations.
 * Idempotent — safe to call on every launch.
 */
export async function seedExercises(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM exercises WHERE is_custom = 0`
  );

  if (!row || row.count === 0) {
    // Fresh install — insert everything
    await db.withExclusiveTransactionAsync(async () => {
      for (const ex of SEED_EXERCISES) {
        await db.runAsync(
          `INSERT OR IGNORE INTO exercises (name, muscle_group, equipment, is_custom)
           VALUES (?, ?, ?, 0)`,
          [ex.name, ex.muscleGroup, ex.equipment]
        );
      }
    });
    return;
  }

  // Existing install — patch missing muscle groups (forearms, adductors)
  for (const mg of ['forearms', 'adductors']) {
    const mgRow = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM exercises WHERE muscle_group = ? AND is_custom = 0`,
      [mg]
    );
    if (!mgRow || mgRow.count > 0) continue;

    const toInsert = SUPPLEMENTAL_EXERCISES.filter(e => e.muscleGroup === mg);
    await db.withExclusiveTransactionAsync(async () => {
      for (const ex of toInsert) {
        await db.runAsync(
          `INSERT OR IGNORE INTO exercises (name, muscle_group, equipment, is_custom)
           VALUES (?, ?, ?, 0)`,
          [ex.name, ex.muscleGroup, ex.equipment]
        );
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────
// FOOD LIBRARY SEED
// ─────────────────────────────────────────────────────────────

// All macros are per 100g. serving_size_g is optional reference serving.
const SEED_FOODS: Array<{
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  serving_size_g?: number;
  serving_label?: string;
}> = [
  // ── Proteins ──────────────────────────────────────────────
  { name: 'Chicken Breast (Cooked)',     calories: 165, protein_g: 31.0, carbs_g: 0.0, fat_g:  3.6, fiber_g: 0,   serving_size_g: 100, serving_label: '100g' },
  { name: 'Chicken Thigh (Cooked)',      calories: 209, protein_g: 26.0, carbs_g: 0.0, fat_g: 11.0, fiber_g: 0,   serving_size_g: 100, serving_label: '100g' },
  { name: 'Ground Beef 80/20 (Cooked)', calories: 254, protein_g: 26.0, carbs_g: 0.0, fat_g: 17.0, fiber_g: 0,   serving_size_g: 100, serving_label: '100g' },
  { name: 'Ground Beef 90/10 (Cooked)', calories: 218, protein_g: 28.0, carbs_g: 0.0, fat_g: 12.0, fiber_g: 0,   serving_size_g: 100, serving_label: '100g' },
  { name: 'Salmon (Cooked)',             calories: 208, protein_g: 20.0, carbs_g: 0.0, fat_g: 13.0, fiber_g: 0,   serving_size_g: 100, serving_label: '100g' },
  { name: 'Tuna (Canned in Water)',      calories: 116, protein_g: 26.0, carbs_g: 0.0, fat_g:  1.0, fiber_g: 0,   serving_size_g: 85,  serving_label: '1 can (85g)' },
  { name: 'Eggs (Whole)',                calories: 143, protein_g: 13.0, carbs_g: 1.0, fat_g: 10.0, fiber_g: 0,   serving_size_g: 50,  serving_label: '1 large egg' },
  { name: 'Egg Whites',                  calories:  52, protein_g: 11.0, carbs_g: 1.0, fat_g:  0.2, fiber_g: 0,   serving_size_g: 30,  serving_label: '1 egg white' },
  { name: 'Turkey Breast (Cooked)',      calories: 135, protein_g: 30.0, carbs_g: 0.0, fat_g:  1.0, fiber_g: 0,   serving_size_g: 100, serving_label: '100g' },
  { name: 'Pork Tenderloin (Cooked)',    calories: 166, protein_g: 29.0, carbs_g: 0.0, fat_g:  4.0, fiber_g: 0,   serving_size_g: 100, serving_label: '100g' },
  { name: 'Shrimp (Cooked)',             calories:  99, protein_g: 24.0, carbs_g: 0.0, fat_g:  1.0, fiber_g: 0,   serving_size_g: 100, serving_label: '100g' },
  { name: 'Tilapia (Cooked)',            calories: 128, protein_g: 26.0, carbs_g: 0.0, fat_g:  3.0, fiber_g: 0,   serving_size_g: 100, serving_label: '100g' },
  { name: 'Whey Protein Powder',         calories: 380, protein_g: 80.0, carbs_g: 8.0, fat_g:  4.0, fiber_g: 0,   serving_size_g: 30,  serving_label: '1 scoop (30g)' },

  // ── Dairy ─────────────────────────────────────────────────
  { name: 'Whole Milk',                  calories:  61, protein_g:  3.2, carbs_g: 4.8, fat_g:  3.3, fiber_g: 0,   serving_size_g: 240, serving_label: '1 cup' },
  { name: '2% Milk',                     calories:  50, protein_g:  3.3, carbs_g: 4.8, fat_g:  2.0, fiber_g: 0,   serving_size_g: 240, serving_label: '1 cup' },
  { name: 'Greek Yogurt (0% Plain)',     calories:  59, protein_g: 10.0, carbs_g: 3.6, fat_g:  0.4, fiber_g: 0,   serving_size_g: 170, serving_label: '6 oz' },
  { name: 'Cottage Cheese (1%)',         calories:  72, protein_g: 12.0, carbs_g: 2.7, fat_g:  1.0, fiber_g: 0,   serving_size_g: 113, serving_label: '½ cup' },
  { name: 'Cheddar Cheese',              calories: 403, protein_g: 25.0, carbs_g: 1.3, fat_g: 33.0, fiber_g: 0,   serving_size_g: 28,  serving_label: '1 oz' },
  { name: 'Mozzarella',                  calories: 280, protein_g: 28.0, carbs_g: 2.2, fat_g: 17.0, fiber_g: 0,   serving_size_g: 28,  serving_label: '1 oz' },

  // ── Grains & Starches ─────────────────────────────────────
  { name: 'White Rice (Cooked)',         calories: 130, protein_g:  2.7, carbs_g: 28.0, fat_g: 0.3, fiber_g: 0.4, serving_size_g: 186, serving_label: '1 cup cooked' },
  { name: 'Brown Rice (Cooked)',         calories: 123, protein_g:  2.7, carbs_g: 26.0, fat_g: 1.0, fiber_g: 1.8, serving_size_g: 195, serving_label: '1 cup cooked' },
  { name: 'Oats (Dry)',                  calories: 389, protein_g: 17.0, carbs_g: 66.0, fat_g: 7.0, fiber_g: 10.6,serving_size_g: 40,  serving_label: '½ cup dry' },
  { name: 'White Bread',                 calories: 265, protein_g:  9.0, carbs_g: 49.0, fat_g: 3.2, fiber_g: 2.7, serving_size_g: 28,  serving_label: '1 slice' },
  { name: 'Whole Wheat Bread',           calories: 247, protein_g: 13.0, carbs_g: 41.0, fat_g: 4.2, fiber_g: 6.0, serving_size_g: 28,  serving_label: '1 slice' },
  { name: 'Pasta (Cooked)',              calories: 158, protein_g:  5.8, carbs_g: 31.0, fat_g: 0.9, fiber_g: 1.8, serving_size_g: 140, serving_label: '1 cup cooked' },
  { name: 'White Potato (Boiled)',       calories:  87, protein_g:  1.9, carbs_g: 20.0, fat_g: 0.1, fiber_g: 1.8, serving_size_g: 150, serving_label: '1 medium' },
  { name: 'Sweet Potato (Baked)',        calories:  90, protein_g:  2.0, carbs_g: 21.0, fat_g: 0.1, fiber_g: 3.3, serving_size_g: 130, serving_label: '1 medium' },
  { name: 'Bagel (Plain)',               calories: 250, protein_g: 10.0, carbs_g: 49.0, fat_g: 1.5, fiber_g: 2.0, serving_size_g: 98,  serving_label: '1 bagel' },
  { name: 'Tortilla (Flour, 10")',       calories: 312, protein_g:  8.0, carbs_g: 54.0, fat_g: 7.3, fiber_g: 3.0, serving_size_g: 72,  serving_label: '1 tortilla' },

  // ── Fruits ────────────────────────────────────────────────
  { name: 'Banana',                      calories:  89, protein_g:  1.1, carbs_g: 23.0, fat_g: 0.3, fiber_g: 2.6, serving_size_g: 118, serving_label: '1 medium' },
  { name: 'Apple',                       calories:  52, protein_g:  0.3, carbs_g: 14.0, fat_g: 0.2, fiber_g: 2.4, serving_size_g: 182, serving_label: '1 medium' },
  { name: 'Orange',                      calories:  47, protein_g:  0.9, carbs_g: 12.0, fat_g: 0.1, fiber_g: 2.4, serving_size_g: 131, serving_label: '1 medium' },
  { name: 'Blueberries',                 calories:  57, protein_g:  0.7, carbs_g: 14.5, fat_g: 0.3, fiber_g: 2.4, serving_size_g: 148, serving_label: '1 cup' },
  { name: 'Strawberries',                calories:  32, protein_g:  0.7, carbs_g:  7.7, fat_g: 0.3, fiber_g: 2.0, serving_size_g: 152, serving_label: '1 cup' },
  { name: 'Grapes',                      calories:  67, protein_g:  0.6, carbs_g: 17.0, fat_g: 0.4, fiber_g: 0.9, serving_size_g: 92,  serving_label: '½ cup' },
  { name: 'Mango',                       calories:  60, protein_g:  0.8, carbs_g: 15.0, fat_g: 0.4, fiber_g: 1.6, serving_size_g: 165, serving_label: '1 cup' },

  // ── Vegetables ────────────────────────────────────────────
  { name: 'Broccoli',                    calories:  34, protein_g:  2.8, carbs_g:  7.0, fat_g: 0.4, fiber_g: 2.6, serving_size_g: 91,  serving_label: '1 cup' },
  { name: 'Spinach (Raw)',               calories:  23, protein_g:  2.9, carbs_g:  3.6, fat_g: 0.4, fiber_g: 2.2, serving_size_g: 30,  serving_label: '1 cup' },
  { name: 'Carrots',                     calories:  41, protein_g:  0.9, carbs_g: 10.0, fat_g: 0.2, fiber_g: 2.8, serving_size_g: 61,  serving_label: '1 medium' },
  { name: 'Green Beans',                 calories:  31, protein_g:  1.8, carbs_g:  7.0, fat_g: 0.2, fiber_g: 2.7, serving_size_g: 100, serving_label: '100g' },
  { name: 'Asparagus',                   calories:  20, protein_g:  2.2, carbs_g:  3.9, fat_g: 0.1, fiber_g: 2.1, serving_size_g: 134, serving_label: '5 spears' },
  { name: 'Bell Pepper',                 calories:  31, protein_g:  1.0, carbs_g:  6.0, fat_g: 0.3, fiber_g: 2.1, serving_size_g: 119, serving_label: '1 medium' },
  { name: 'Cucumber',                    calories:  15, protein_g:  0.6, carbs_g:  3.6, fat_g: 0.1, fiber_g: 0.5, serving_size_g: 52,  serving_label: '½ cup sliced' },
  { name: 'Tomato',                      calories:  18, protein_g:  0.9, carbs_g:  3.9, fat_g: 0.2, fiber_g: 1.2, serving_size_g: 123, serving_label: '1 medium' },
  { name: 'Avocado',                     calories: 160, protein_g:  2.0, carbs_g:  9.0, fat_g: 15.0, fiber_g: 6.7, serving_size_g: 50,  serving_label: '⅓ avocado' },

  // ── Fats & Nuts ───────────────────────────────────────────
  { name: 'Olive Oil',                   calories: 884, protein_g:  0.0, carbs_g:  0.0, fat_g: 100.0, fiber_g: 0, serving_size_g: 14,  serving_label: '1 tbsp' },
  { name: 'Butter',                      calories: 717, protein_g:  0.9, carbs_g:  0.1, fat_g: 81.0, fiber_g: 0,  serving_size_g: 14,  serving_label: '1 tbsp' },
  { name: 'Almonds',                     calories: 579, protein_g: 21.0, carbs_g: 22.0, fat_g: 50.0, fiber_g: 12.5,serving_size_g: 28, serving_label: '1 oz (~23 almonds)' },
  { name: 'Peanut Butter',               calories: 588, protein_g: 25.0, carbs_g: 20.0, fat_g: 50.0, fiber_g: 6.0, serving_size_g: 32, serving_label: '2 tbsp' },
  { name: 'Walnuts',                     calories: 654, protein_g: 15.0, carbs_g: 14.0, fat_g: 65.0, fiber_g: 6.7, serving_size_g: 28, serving_label: '1 oz' },
  { name: 'Cashews',                     calories: 553, protein_g: 18.0, carbs_g: 30.0, fat_g: 44.0, fiber_g: 3.3, serving_size_g: 28, serving_label: '1 oz' },

  // ── Other ─────────────────────────────────────────────────
  { name: 'Honey',                       calories: 304, protein_g:  0.3, carbs_g: 82.0, fat_g:  0.0, fiber_g: 0.2, serving_size_g: 21,  serving_label: '1 tbsp' },
  { name: 'Protein Bar (avg)',           calories: 350, protein_g: 20.0, carbs_g: 40.0, fat_g: 10.0, fiber_g: 5.0, serving_size_g: 60,  serving_label: '1 bar' },
  { name: 'Black Beans (Cooked)',        calories: 132, protein_g:  8.9, carbs_g: 24.0, fat_g:  0.5, fiber_g: 8.7, serving_size_g: 172, serving_label: '1 cup' },
  { name: 'Lentils (Cooked)',            calories: 116, protein_g:  9.0, carbs_g: 20.0, fat_g:  0.4, fiber_g: 7.9, serving_size_g: 198, serving_label: '1 cup' },
  { name: 'White Rice Cake',             calories: 387, protein_g:  8.0, carbs_g: 81.0, fat_g:  2.8, fiber_g: 2.2, serving_size_g: 9,   serving_label: '1 cake' },
  { name: 'Orange Juice',               calories:  45, protein_g:  0.7, carbs_g: 10.4, fat_g:  0.2, fiber_g: 0.2, serving_size_g: 240, serving_label: '1 cup' },
];

/**
 * Seeds the food library on first install.
 * Idempotent — checks for a known seeded food by name, so custom
 * user-added foods don't prevent the seed from running.
 */
export async function seedFoods(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM foods WHERE name = 'Chicken Breast (Cooked)' LIMIT 1`
  );
  if (row) return;

  // Plain sequential inserts — avoids exclusive transaction contention
  // with the exercise seed that may have just run.
  for (const f of SEED_FOODS) {
    await db.runAsync(
      `INSERT OR IGNORE INTO foods
         (name, calories, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, serving_label, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
      [f.name, f.calories, f.protein_g, f.carbs_g, f.fat_g,
       f.fiber_g ?? null, f.serving_size_g ?? null, f.serving_label ?? null]
    );
  }
}

// ─────────────────────────────────────────────────────────────
// CARDIO EXERCISE SEED
// ─────────────────────────────────────────────────────────────

interface CardioSeed {
  name: string;
  category: string;
  has_distance: number;
  has_speed: number;
  has_incline: number;
  has_resistance: number;
  has_rpm: number;
  has_pace: number;
  has_laps: number;
  has_rounds: number;
  met_value: number;
}

const SEED_CARDIO: CardioSeed[] = [
  // Machine
  { name: 'Treadmill',           category: 'machine',  has_distance:1, has_speed:1, has_incline:1, has_resistance:0, has_rpm:0, has_pace:1, has_laps:0, has_rounds:0, met_value:8.0 },
  { name: 'Stationary Bike',     category: 'machine',  has_distance:1, has_speed:1, has_incline:0, has_resistance:1, has_rpm:1, has_pace:0, has_laps:0, has_rounds:0, met_value:7.0 },
  { name: 'Elliptical',          category: 'machine',  has_distance:1, has_speed:0, has_incline:1, has_resistance:1, has_rpm:0, has_pace:0, has_laps:0, has_rounds:0, met_value:5.0 },
  { name: 'Rowing Machine',      category: 'machine',  has_distance:1, has_speed:1, has_incline:0, has_resistance:1, has_rpm:0, has_pace:1, has_laps:0, has_rounds:0, met_value:7.0 },
  { name: 'Stair Climber',       category: 'machine',  has_distance:0, has_speed:1, has_incline:0, has_resistance:1, has_rpm:0, has_pace:0, has_laps:0, has_rounds:0, met_value:9.0 },
  { name: 'Ski Erg',             category: 'machine',  has_distance:1, has_speed:0, has_incline:0, has_resistance:1, has_rpm:0, has_pace:1, has_laps:0, has_rounds:0, met_value:8.5 },
  // Outdoor
  { name: 'Running',             category: 'outdoor',  has_distance:1, has_speed:1, has_incline:0, has_resistance:0, has_rpm:0, has_pace:1, has_laps:0, has_rounds:0, met_value:9.8 },
  { name: 'Walking',             category: 'outdoor',  has_distance:1, has_speed:1, has_incline:0, has_resistance:0, has_rpm:0, has_pace:1, has_laps:0, has_rounds:0, met_value:3.5 },
  { name: 'Cycling',             category: 'outdoor',  has_distance:1, has_speed:1, has_incline:0, has_resistance:0, has_rpm:0, has_pace:0, has_laps:0, has_rounds:0, met_value:7.5 },
  { name: 'Hiking',              category: 'outdoor',  has_distance:1, has_speed:0, has_incline:0, has_resistance:0, has_rpm:0, has_pace:1, has_laps:0, has_rounds:0, met_value:5.3 },
  // Sport / Other
  { name: 'Swimming',            category: 'sport',    has_distance:1, has_speed:0, has_incline:0, has_resistance:0, has_rpm:0, has_pace:1, has_laps:1, has_rounds:0, met_value:7.0 },
  { name: 'Jump Rope',           category: 'sport',    has_distance:0, has_speed:0, has_incline:0, has_resistance:0, has_rpm:0, has_pace:0, has_laps:0, has_rounds:1, met_value:11.0 },
  { name: 'HIIT',                category: 'sport',    has_distance:0, has_speed:0, has_incline:0, has_resistance:0, has_rpm:0, has_pace:0, has_laps:0, has_rounds:1, met_value:10.0 },
];

/**
 * Seeds the preset cardio exercise library.
 * Idempotent — checks for a known preset before inserting.
 */
export async function seedCardioExercises(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM cardio_exercises WHERE name = 'Treadmill' AND is_preset = 1 LIMIT 1`
  );
  if (row) return;

  for (const ex of SEED_CARDIO) {
    await db.runAsync(
      `INSERT OR IGNORE INTO cardio_exercises
         (name, category, is_preset, is_custom,
          has_distance, has_speed, has_incline, has_resistance,
          has_rpm, has_pace, has_laps, has_rounds, met_value, created_at)
       VALUES (?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
      [ex.name, ex.category,
       ex.has_distance, ex.has_speed, ex.has_incline, ex.has_resistance,
       ex.has_rpm, ex.has_pace, ex.has_laps, ex.has_rounds, ex.met_value]
    );
  }
}

// ─────────────────────────────────────────────────────────────
// SPLIT PRESETS
// ─────────────────────────────────────────────────────────────

/**
 * Seeds default workout split presets if none exist.
 * Idempotent — checks for existing presets before inserting.
 */
export async function seedPresetSplits(db: SQLiteDatabase): Promise<void> {
  await seedExercises(db);

  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM workout_splits WHERE is_preset = 1`
  );
  if (row && row.count > 0) return;

  // Presets are visually shown in the Split Builder — they are not
  // auto-inserted into workout_splits; instead the SplitBuilderScreen
  // saves a user copy when they select one. This seed ensures the
  // exercise library is populated.
}
