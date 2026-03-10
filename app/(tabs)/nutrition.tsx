// ============================================================
// TORVUS — Nutrition Home Screen
// app/(tabs)/nutrition.tsx
// ============================================================

import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Platform, ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { getDatabase } from '../../schema';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

interface FoodEntry {
  mealId: number;
  mealType: MealType;
  name: string;
  servingMultiplier: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface DailyTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface Goals {
  targetCalories: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
}

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks'];

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateLabel(dateStr: string): string {
  const today = todayString();
  if (dateStr === today) return 'Today';
  if (dateStr === addDays(today, -1)) return 'Yesterday';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatGrams(servingMultiplier: number): string {
  return `${Math.round(servingMultiplier * 100)}g`;
}

// ─────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────

const EMPTY_ENTRIES: Record<MealType, FoodEntry[]> = {
  breakfast: [], lunch: [], dinner: [], snacks: [],
};

export default function NutritionHomeScreen() {
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [entries, setEntries] = useState<Record<MealType, FoodEntry[]>>(EMPTY_ENTRIES);
  const [totals, setTotals] = useState<DailyTotals>({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  const [goals, setGoals] = useState<Goals>({ targetCalories: 2000, targetProteinG: 150, targetCarbsG: 200, targetFatG: 65 });
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      load(selectedDate);
    }, [selectedDate])
  );

  async function load(date: string) {
    setIsLoading(true);
    try {
      const db = await getDatabase();

      const g = await db.getFirstAsync<{
        target_calories: number; target_protein_g: number;
        target_carbs_g: number; target_fat_g: number;
      }>(`SELECT target_calories, target_protein_g, target_carbs_g, target_fat_g FROM nutrition_goals WHERE id = 1`);

      if (g) {
        setGoals({
          targetCalories: g.target_calories,
          targetProteinG: g.target_protein_g,
          targetCarbsG: g.target_carbs_g,
          targetFatG: g.target_fat_g,
        });
      }

      const rows = await db.getAllAsync<{
        meal_id: number; meal_type: string; name: string;
        serving_multiplier: number;
        calories: number; protein_g: number; carbs_g: number; fat_g: number;
      }>(`
        SELECT m.id AS meal_id, m.meal_type, f.name, m.serving_multiplier,
          f.calories * m.serving_multiplier AS calories,
          f.protein_g * m.serving_multiplier AS protein_g,
          f.carbs_g  * m.serving_multiplier AS carbs_g,
          f.fat_g    * m.serving_multiplier AS fat_g
        FROM meals m
        JOIN foods f ON f.id = m.food_id
        WHERE m.date = ?
        ORDER BY m.logged_at ASC
      `, [date]);

      const grouped: Record<MealType, FoodEntry[]> = { breakfast: [], lunch: [], dinner: [], snacks: [] };
      let totCal = 0, totPro = 0, totCarb = 0, totFat = 0;

      for (const r of rows) {
        grouped[r.meal_type as MealType].push({
          mealId: r.meal_id,
          mealType: r.meal_type as MealType,
          name: r.name,
          servingMultiplier: r.serving_multiplier,
          calories: r.calories,
          proteinG: r.protein_g,
          carbsG: r.carbs_g,
          fatG: r.fat_g,
        });
        totCal  += r.calories;
        totPro  += r.protein_g;
        totCarb += r.carbs_g;
        totFat  += r.fat_g;
      }

      setEntries(grouped);
      setTotals({ calories: totCal, proteinG: totPro, carbsG: totCarb, fatG: totFat });
    } catch (e) {
      console.error('nutrition load error:', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteMeal(mealId: number) {
    try {
      const db = await getDatabase();
      await db.runAsync(`DELETE FROM meals WHERE id = ?`, [mealId]);
      load(selectedDate);
    } catch (e) {
      console.error('delete meal error:', e);
    }
  }

  function changeDate(delta: number) {
    const next = addDays(selectedDate, delta);
    if (next > todayString()) return;
    setSelectedDate(next);
  }

  // ── Derived ──────────────────────────────────────────────

  const caloriesRemaining = goals.targetCalories - totals.calories;
  const isOver = caloriesRemaining < 0;
  const calFrac  = Math.min(totals.calories   / goals.targetCalories,  1);
  const proFrac  = Math.min(totals.proteinG   / goals.targetProteinG,  1);
  const carbFrac = Math.min(totals.carbsG     / goals.targetCarbsG,    1);
  const fatFrac  = Math.min(totals.fatG       / goals.targetFatG,      1);
  const isToday  = selectedDate === todayString();
  const totalEntries = Object.values(entries).flat().length;

  // ── Render ───────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>TORVUS</Text>
          <Text style={styles.title}>Nutrition</Text>
        </View>
        <TouchableOpacity style={styles.headerAction} onPress={() => router.push('/nutrition/goals')}>
          <Text style={styles.headerActionText}>GOALS</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Date nav ── */}
        <View style={styles.dateNav}>
          <TouchableOpacity style={styles.dateArrow} onPress={() => changeDate(-1)}>
            <Text style={styles.dateArrowText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.dateLabel}>{formatDateLabel(selectedDate)}</Text>
          <TouchableOpacity
            style={[styles.dateArrow, isToday && styles.dateArrowDisabled]}
            onPress={() => changeDate(1)}
            disabled={isToday}
          >
            <Text style={[styles.dateArrowText, isToday && styles.dateArrowTextDisabled]}>›</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator color="#EF6C3E" style={{ marginTop: 48 }} />
        ) : (
          <>
            {/* ── Calorie summary card ── */}
            <View style={styles.summaryCard}>
              <View style={styles.calorieRow}>
                <View style={styles.calorieStat}>
                  <Text style={styles.calorieStatNum}>{Math.round(totals.calories)}</Text>
                  <Text style={styles.calorieStatLabel}>EATEN</Text>
                </View>

                <View style={styles.calorieCenter}>
                  <Text style={[styles.calorieRemaining, isOver && styles.calorieOver]}>
                    {Math.abs(Math.round(caloriesRemaining))}
                  </Text>
                  <Text style={styles.calorieRemainingLabel}>
                    {isOver ? 'OVER' : 'REMAINING'}
                  </Text>
                </View>

                <View style={styles.calorieStat}>
                  <Text style={styles.calorieStatNum}>{Math.round(goals.targetCalories)}</Text>
                  <Text style={styles.calorieStatLabel}>GOAL</Text>
                </View>
              </View>

              {/* Calorie bar */}
              <View style={styles.calorieBar}>
                <View style={[
                  styles.calorieBarFill,
                  { width: `${calFrac * 100}%`, backgroundColor: isOver ? '#EF3E3E' : '#EF6C3E' },
                ]} />
              </View>

              {/* Macro bars */}
              <View style={styles.macroRow}>
                {[
                  { label: 'PROTEIN', val: totals.proteinG,  goal: goals.targetProteinG, frac: proFrac,  color: '#EF3E7A' },
                  { label: 'CARBS',   val: totals.carbsG,    goal: goals.targetCarbsG,   frac: carbFrac, color: '#3E8CEF' },
                  { label: 'FAT',     val: totals.fatG,       goal: goals.targetFatG,    frac: fatFrac,  color: '#EF9B3E' },
                ].map(m => (
                  <View key={m.label} style={styles.macroCol}>
                    <Text style={styles.macroVal}>
                      {Math.round(m.val)}<Text style={styles.macroUnit}>g</Text>
                    </Text>
                    <View style={styles.macroBar}>
                      <View style={[styles.macroBarFill, { width: `${m.frac * 100}%`, backgroundColor: m.color }]} />
                    </View>
                    <Text style={styles.macroLabel}>{m.label}</Text>
                    <Text style={styles.macroGoal}>/ {Math.round(m.goal)}g</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* ── Meal sections ── */}
            {MEAL_ORDER.map(mt => {
              const sectionCals = entries[mt].reduce((s, e) => s + e.calories, 0);
              return (
                <View key={mt} style={styles.mealSection}>
                  <View style={styles.mealHeader}>
                    <Text style={styles.mealTitle}>{MEAL_LABELS[mt]}</Text>
                    <View style={styles.mealHeaderRight}>
                      {entries[mt].length > 0 && (
                        <Text style={styles.mealCals}>{Math.round(sectionCals)} kcal</Text>
                      )}
                      <TouchableOpacity
                        style={styles.addBtn}
                        onPress={() => router.push(`/nutrition/search?date=${selectedDate}&meal=${mt}`)}
                      >
                        <Text style={styles.addBtnText}>+ ADD</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {entries[mt].length === 0 ? (
                    <Text style={styles.mealEmpty}>Nothing logged</Text>
                  ) : (
                    entries[mt].map(entry => (
                      <View key={entry.mealId} style={styles.foodEntry}>
                        <View style={styles.foodEntryInfo}>
                          <Text style={styles.foodName} numberOfLines={1}>{entry.name}</Text>
                          <Text style={styles.foodDetail}>
                            {formatGrams(entry.servingMultiplier)} · {Math.round(entry.proteinG)}P {Math.round(entry.carbsG)}C {Math.round(entry.fatG)}F
                          </Text>
                        </View>
                        <View style={styles.foodEntryRight}>
                          <Text style={styles.foodCals}>{Math.round(entry.calories)}</Text>
                          <TouchableOpacity
                            onPress={() => deleteMeal(entry.mealId)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Text style={styles.deleteBtn}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              );
            })}

            {/* Empty state CTA */}
            {totalEntries === 0 && (
              <TouchableOpacity
                style={styles.emptyAddBtn}
                onPress={() => router.push(`/nutrition/search?date=${selectedDate}&meal=breakfast`)}
              >
                <Text style={styles.emptyAddBtnText}>+ LOG YOUR FIRST MEAL</Text>
              </TouchableOpacity>
            )}

            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0E0D0B' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1E1D1A',
  },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 3, color: '#EF6C3E' },
  title: { fontSize: 24, fontWeight: '800', color: '#F2F0EB' },
  headerAction: {
    backgroundColor: '#1A1714', borderWidth: 1, borderColor: '#2A2926',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
  },
  headerActionText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: '#EF6C3E' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12 },

  // ── Date nav ──
  dateNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 16, marginBottom: 16,
  },
  dateArrow: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320', borderRadius: 8,
  },
  dateArrowDisabled: { opacity: 0.3 },
  dateArrowText: { fontSize: 22, color: '#EF6C3E', lineHeight: 26 },
  dateArrowTextDisabled: { color: '#555' },
  dateLabel: { fontSize: 15, fontWeight: '700', color: '#F2F0EB', minWidth: 120, textAlign: 'center' },

  // ── Summary card ──
  summaryCard: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 16, padding: 20, marginBottom: 16,
  },
  calorieRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
  },
  calorieStat: { alignItems: 'center', flex: 1 },
  calorieStatNum: { fontSize: 18, fontWeight: '700', color: '#F2F0EB' },
  calorieStatLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: '#555', marginTop: 2 },
  calorieCenter: { alignItems: 'center', flex: 1.4 },
  calorieRemaining: { fontSize: 34, fontWeight: '800', color: '#EF6C3E' },
  calorieOver: { color: '#EF3E3E' },
  calorieRemainingLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: '#555', marginTop: 2 },

  calorieBar: {
    height: 4, backgroundColor: '#1E1D1A', borderRadius: 2, overflow: 'hidden', marginBottom: 20,
  },
  calorieBarFill: { height: '100%', borderRadius: 2 },

  macroRow: { flexDirection: 'row', gap: 8 },
  macroCol: { flex: 1, alignItems: 'center' },
  macroVal: { fontSize: 15, fontWeight: '700', color: '#F2F0EB' },
  macroUnit: { fontSize: 11, fontWeight: '400', color: '#888' },
  macroBar: {
    width: '100%', height: 3, backgroundColor: '#1E1D1A',
    borderRadius: 2, overflow: 'hidden', marginVertical: 5,
  },
  macroBarFill: { height: '100%', borderRadius: 2 },
  macroLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, color: '#555' },
  macroGoal: { fontSize: 10, color: '#3A3835', marginTop: 1 },

  // ── Meal sections ──
  mealSection: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 14, marginBottom: 10, overflow: 'hidden',
  },
  mealHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1E1D1A',
  },
  mealTitle: { fontSize: 13, fontWeight: '700', color: '#F2F0EB' },
  mealHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mealCals: { fontSize: 12, color: '#555' },
  addBtn: {
    backgroundColor: '#1E1D1A', borderWidth: 1, borderColor: '#2A2926',
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4,
  },
  addBtnText: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: '#EF6C3E' },
  mealEmpty: { fontSize: 12, color: '#333', paddingHorizontal: 16, paddingVertical: 12 },

  foodEntry: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: '#1A1917',
  },
  foodEntryInfo: { flex: 1, marginRight: 12 },
  foodName: { fontSize: 13, fontWeight: '600', color: '#E0DED9', marginBottom: 2 },
  foodDetail: { fontSize: 11, color: '#555' },
  foodEntryRight: { alignItems: 'flex-end', gap: 6 },
  foodCals: { fontSize: 14, fontWeight: '700', color: '#F2F0EB' },
  deleteBtn: { fontSize: 11, color: '#3A3835' },

  // ── Empty state ──
  emptyAddBtn: {
    marginTop: 8, backgroundColor: '#141311', borderWidth: 1,
    borderColor: '#EF6C3E33', borderRadius: 12, paddingVertical: 18, alignItems: 'center',
  },
  emptyAddBtnText: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5, color: '#EF6C3E' },
});
