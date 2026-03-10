// ============================================================
// TORVUS — Food Search + Log Screen
// app/nutrition/search.tsx
//
// Params (query string):
//   date — YYYY-MM-DD
//   meal — breakfast | lunch | dinner | snacks
// ============================================================

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, Platform, ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getDatabase } from '../../schema';
import { searchUsda, type UsdaFood } from '../../src/lib/usda';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks';
type Mode = 'search' | 'serving' | 'manual';

interface FoodResult {
  id: number;
  name: string;
  calories: number; // per 100g
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingSizeG: number | null;
  servingLabel: string | null;
  source: string;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks',
};

function computeTotals(food: FoodResult, grams: number) {
  const mult = grams / 100;
  return {
    calories: food.calories * mult,
    proteinG: food.proteinG * mult,
    carbsG:   food.carbsG   * mult,
    fatG:     food.fatG     * mult,
  };
}

// ─────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────

export default function FoodSearchScreen() {
  const params = useLocalSearchParams<{ date: string; meal: string }>();
  const date     = params.date ?? new Date().toISOString().slice(0, 10);
  const mealType = (params.meal ?? 'breakfast') as MealType;

  const [mode, setMode]               = useState<Mode>('search');
  const [query, setQuery]             = useState('');
  const [results, setResults]         = useState<FoodResult[]>([]);
  const [remoteResults, setRemoteResults] = useState<UsdaFood[]>([]);
  const [isSearching, setIsSearching] = useState(true);
  const [isSearchingRemote, setIsSearchingRemote] = useState(false);
  const [isLogging, setIsLogging]     = useState(false);

  // Serving panel state (for selecting an existing food)
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null);
  const [gramsInput, setGramsInput]     = useState('');

  // Manual entry state
  const [manualName, setManualName]       = useState('');
  const [manualGrams, setManualGrams]     = useState('100');
  const [manualCalories, setManualCalories] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualCarbs, setManualCarbs]     = useState('');
  const [manualFat, setManualFat]         = useState('');

  const searchTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteAbort  = useRef<AbortController | null>(null);

  // ── Search ─────────────────────────────────────────────

  useEffect(() => {
    if (mode !== 'search') return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(query), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, mode]);

  async function doSearch(q: string) {
    const trimmed = q.trim();

    // Cancel any in-flight remote search
    remoteAbort.current?.abort();

    setIsSearching(true);
    if (trimmed.length >= 2) setIsSearchingRemote(true);
    setRemoteResults([]);

    // ── Local search ──
    try {
      const db = await getDatabase();
      const rows = trimmed.length === 0
        ? await db.getAllAsync<{
            id: number; name: string; calories: number;
            protein_g: number; carbs_g: number; fat_g: number;
            serving_size_g: number | null; serving_label: string | null; source: string;
          }>(`SELECT id, name, calories, protein_g, carbs_g, fat_g, serving_size_g, serving_label, source
              FROM foods ORDER BY name ASC LIMIT 60`)
        : await db.getAllAsync<{
            id: number; name: string; calories: number;
            protein_g: number; carbs_g: number; fat_g: number;
            serving_size_g: number | null; serving_label: string | null; source: string;
          }>(`SELECT id, name, calories, protein_g, carbs_g, fat_g, serving_size_g, serving_label, source
              FROM foods
              WHERE name LIKE ?
              ORDER BY
                CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
                name ASC
              LIMIT 40`,
             [`%${trimmed}%`, `${trimmed}%`]);
      setResults(rows.map(r => ({
        id: r.id, name: r.name, calories: r.calories,
        proteinG: r.protein_g, carbsG: r.carbs_g, fatG: r.fat_g,
        servingSizeG: r.serving_size_g, servingLabel: r.serving_label, source: r.source,
      })));
    } catch (e) {
      console.error('local food search error:', e);
      setResults([]);
    } finally {
      setIsSearching(false);
    }

    // ── Remote USDA search (only for actual queries) ──
    if (trimmed.length < 2) {
      setIsSearchingRemote(false);
      return;
    }

    const controller = new AbortController();
    remoteAbort.current = controller;
    try {
      const db = await getDatabase();
      const usda = await searchUsda(trimmed, controller.signal);

      // Filter out foods already cached locally (matched by fdc_id)
      const cachedIds = new Set(
        (await db.getAllAsync<{ fdc_id: string }>(`SELECT fdc_id FROM foods WHERE fdc_id IS NOT NULL`))
          .map(r => String(r.fdc_id))
      );
      setRemoteResults(usda.filter(f => !cachedIds.has(String(f.fdcId))));
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.error('USDA search error:', e);
    } finally {
      setIsSearchingRemote(false);
    }
  }

  // ── Select local food ───────────────────────────────────

  function handleSelectFood(food: FoodResult) {
    setSelectedFood(food);
    setGramsInput(String(food.servingSizeG ?? 100));
    setMode('serving');
  }

  // ── Select remote (USDA) food — cache locally first ─────

  async function handleSelectRemoteFood(usda: UsdaFood) {
    try {
      const db = await getDatabase();
      const ins = await db.runAsync(
        `INSERT OR IGNORE INTO foods
           (fdc_id, name, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'usda')`,
        [
          String(usda.fdcId), usda.name,
          usda.calories, usda.proteinG, usda.carbsG, usda.fatG,
          usda.fiberG ?? null, usda.sodiumMg ?? null,
        ]
      );
      // Get the local id (either newly inserted or existing from a previous search)
      const localId = ins.changes > 0
        ? ins.lastInsertRowId
        : (await db.getFirstAsync<{ id: number }>(
            `SELECT id FROM foods WHERE fdc_id = ?`, [String(usda.fdcId)]
          ))?.id ?? ins.lastInsertRowId;

      handleSelectFood({
        id: localId, name: usda.name,
        calories: usda.calories, proteinG: usda.proteinG,
        carbsG: usda.carbsG, fatG: usda.fatG,
        servingSizeG: null, servingLabel: null, source: 'usda',
      });
    } catch (e) {
      console.error('cache remote food error:', e);
    }
  }

  // ── Log existing food ───────────────────────────────────

  async function logExistingFood() {
    if (!selectedFood) return;
    const grams = parseFloat(gramsInput);
    if (!grams || grams <= 0) return;

    setIsLogging(true);
    try {
      const db = await getDatabase();
      const mult = grams / 100;
      await db.runAsync(
        `INSERT INTO meals (date, meal_type, food_id, serving_multiplier) VALUES (?, ?, ?, ?)`,
        [date, mealType, selectedFood.id, mult]
      );
      router.back();
    } catch (e) {
      console.error('log food error:', e);
    } finally {
      setIsLogging(false);
    }
  }

  // ── Log manual entry ────────────────────────────────────

  async function logManualFood() {
    const name = manualName.trim();
    const grams = parseFloat(manualGrams) || 100;
    const cal   = parseFloat(manualCalories) || 0;
    const pro   = parseFloat(manualProtein)  || 0;
    const carb  = parseFloat(manualCarbs)    || 0;
    const fat   = parseFloat(manualFat)      || 0;

    if (!name || cal === 0) return;

    // Normalise to per-100g
    const factor   = 100 / grams;
    const calPer100 = cal  * factor;
    const proPer100 = pro  * factor;
    const carbPer100= carb * factor;
    const fatPer100 = fat  * factor;

    setIsLogging(true);
    try {
      const db = await getDatabase();
      const result = await db.runAsync(
        `INSERT INTO foods (name, calories, protein_g, carbs_g, fat_g, serving_size_g, source)
         VALUES (?, ?, ?, ?, ?, ?, 'manual')`,
        [name, calPer100, proPer100, carbPer100, fatPer100, grams]
      );
      const foodId = result.lastInsertRowId;
      const mult   = grams / 100;
      await db.runAsync(
        `INSERT INTO meals (date, meal_type, food_id, serving_multiplier) VALUES (?, ?, ?, ?)`,
        [date, mealType, foodId, mult]
      );
      router.back();
    } catch (e) {
      console.error('log manual food error:', e);
    } finally {
      setIsLogging(false);
    }
  }

  // ── Derived (serving panel) ─────────────────────────────

  const servingGrams = parseFloat(gramsInput) || 0;
  const servingTotals = selectedFood && servingGrams > 0
    ? computeTotals(selectedFood, servingGrams)
    : null;

  // ── Render ──────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>
              {mode === 'manual' ? 'Add Food' : 'Search Food'}
            </Text>
            <Text style={styles.headerSub}>{MEAL_LABELS[mealType]}</Text>
          </View>
          <TouchableOpacity
            style={styles.modeToggle}
            onPress={() => {
              setMode(m => m === 'manual' ? 'search' : 'manual');
              setSelectedFood(null);
            }}
          >
            <Text style={styles.modeToggleText}>{mode === 'manual' ? 'SEARCH' : 'MANUAL'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── SEARCH MODE ── */}
        {mode === 'search' && (
          <View style={{ flex: 1 }}>
            <View style={styles.searchBar}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search foods…"
                placeholderTextColor="#444"
                value={query}
                onChangeText={setQuery}
                autoFocus
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')}>
                  <Text style={styles.searchClear}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              {isSearching ? (
                <ActivityIndicator color="#EF6C3E" style={{ marginTop: 32 }} />
              ) : (
                <>
                  {/* ── Local results ── */}
                  {results.length === 0 && !isSearchingRemote && remoteResults.length === 0 ? (
                    <View style={styles.noResults}>
                      <Text style={styles.noResultsText}>
                        {query.length > 0 ? `No results for "${query}"` : 'No foods found'}
                      </Text>
                      <TouchableOpacity style={styles.manualBtn} onPress={() => setMode('manual')}>
                        <Text style={styles.manualBtnText}>+ ADD MANUALLY</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      {results.length > 0 && (
                        <>
                          {query.trim().length >= 2 && (
                            <Text style={styles.sectionHeader}>YOUR LIBRARY</Text>
                          )}
                          {results.map(food => (
                            <TouchableOpacity
                              key={food.id}
                              style={styles.resultRow}
                              onPress={() => handleSelectFood(food)}
                              activeOpacity={0.7}
                            >
                              <View style={styles.resultInfo}>
                                <Text style={styles.resultName} numberOfLines={1}>{food.name}</Text>
                                <Text style={styles.resultMacros}>
                                  {Math.round(food.calories)} kcal / 100g · {Math.round(food.proteinG)}P {Math.round(food.carbsG)}C {Math.round(food.fatG)}F
                                </Text>
                              </View>
                              <Text style={styles.resultChevron}>›</Text>
                            </TouchableOpacity>
                          ))}
                        </>
                      )}

                      {/* ── Remote USDA results ── */}
                      {query.trim().length >= 2 && (
                        <>
                          <View style={styles.sectionHeaderRow}>
                            <Text style={styles.sectionHeader}>USDA DATABASE</Text>
                            {isSearchingRemote && (
                              <ActivityIndicator color="#555" size="small" />
                            )}
                          </View>
                          {remoteResults.map(food => (
                            <TouchableOpacity
                              key={food.fdcId}
                              style={styles.resultRow}
                              onPress={() => handleSelectRemoteFood(food)}
                              activeOpacity={0.7}
                            >
                              <View style={styles.resultInfo}>
                                <Text style={styles.resultName} numberOfLines={1}>{food.name}</Text>
                                <Text style={styles.resultMacros}>
                                  {Math.round(food.calories)} kcal / 100g · {Math.round(food.proteinG)}P {Math.round(food.carbsG)}C {Math.round(food.fatG)}F
                                </Text>
                              </View>
                              <Text style={styles.resultChevron}>›</Text>
                            </TouchableOpacity>
                          ))}
                          {!isSearchingRemote && remoteResults.length === 0 && query.trim().length >= 2 && (
                            <Text style={styles.remoteEmpty}>No database results</Text>
                          )}
                        </>
                      )}

                      <TouchableOpacity style={styles.manualBtnRow} onPress={() => setMode('manual')}>
                        <Text style={styles.manualBtnText}>+ ADD NEW FOOD MANUALLY</Text>
                      </TouchableOpacity>
                      <View style={{ height: 40 }} />
                    </>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        )}

        {/* ── SERVING PANEL (existing food selected) ── */}
        {mode === 'serving' && selectedFood && (
          <ScrollView contentContainerStyle={styles.servingContent} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={styles.backToSearch} onPress={() => { setMode('search'); setSelectedFood(null); }}>
              <Text style={styles.backToSearchText}>‹ Back to results</Text>
            </TouchableOpacity>

            <View style={styles.servingCard}>
              <Text style={styles.servingFoodName}>{selectedFood.name}</Text>
              <Text style={styles.servingPer100}>
                Per 100g: {Math.round(selectedFood.calories)} kcal · {Math.round(selectedFood.proteinG)}P {Math.round(selectedFood.carbsG)}C {Math.round(selectedFood.fatG)}F
              </Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>HOW MUCH? (grams)</Text>
              <View style={styles.gramRow}>
                <TextInput
                  style={styles.gramInput}
                  value={gramsInput}
                  onChangeText={setGramsInput}
                  keyboardType="decimal-pad"
                  placeholder="100"
                  placeholderTextColor="#444"
                  selectTextOnFocus
                />
                <Text style={styles.gramUnit}>g</Text>
              </View>
              {selectedFood.servingSizeG && (
                <TouchableOpacity onPress={() => setGramsInput(String(selectedFood.servingSizeG))}>
                  <Text style={styles.servingPreset}>
                    Use 1 serving ({selectedFood.servingLabel ?? `${selectedFood.servingSizeG}g`})
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {servingTotals && (
              <View style={styles.totalsCard}>
                <Text style={styles.totalsTitle}>FOR {Math.round(servingGrams)}G</Text>
                <View style={styles.totalsRow}>
                  <MacroStat label="KCAL"    val={Math.round(servingTotals.calories)} color="#EF6C3E" />
                  <MacroStat label="PROTEIN" val={Math.round(servingTotals.proteinG)} unit="g" color="#EF3E7A" />
                  <MacroStat label="CARBS"   val={Math.round(servingTotals.carbsG)}   unit="g" color="#3E8CEF" />
                  <MacroStat label="FAT"     val={Math.round(servingTotals.fatG)}      unit="g" color="#EF9B3E" />
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.logBtn, (!servingGrams || isLogging) && styles.logBtnDisabled]}
              onPress={logExistingFood}
              disabled={!servingGrams || isLogging}
            >
              {isLogging
                ? <ActivityIndicator color="#0E0D0B" />
                : <Text style={styles.logBtnText}>LOG TO {MEAL_LABELS[mealType].toUpperCase()}</Text>
              }
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        )}

        {/* ── MANUAL ENTRY MODE ── */}
        {mode === 'manual' && (
          <ScrollView contentContainerStyle={styles.servingContent} keyboardShouldPersistTaps="handled">
            {/* AI photo scan shortcut */}
            <TouchableOpacity
              style={styles.aiScanBtn}
              onPress={() => router.push(`/nutrition/ai-estimate?date=${date}&meal=${mealType}`)}
            >
              <Text style={styles.aiScanIcon}>📷</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.aiScanLabel}>Scan with AI</Text>
                <Text style={styles.aiScanSub}>Photo your meal — Claude estimates the macros</Text>
              </View>
              <Text style={styles.aiScanChevron}>›</Text>
            </TouchableOpacity>

            <Text style={styles.manualHint}>
              Or enter the nutrition manually for the amount you're eating.
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>FOOD NAME</Text>
              <TextInput
                style={styles.textField}
                value={manualName}
                onChangeText={setManualName}
                placeholder="e.g. Grilled Chicken Breast"
                placeholderTextColor="#444"
                autoFocus
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>AMOUNT (grams)</Text>
              <TextInput
                style={styles.textField}
                value={manualGrams}
                onChangeText={setManualGrams}
                keyboardType="decimal-pad"
                placeholder="100"
                placeholderTextColor="#444"
                selectTextOnFocus
              />
            </View>

            <View style={styles.macroFieldRow}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>CALORIES</Text>
                <TextInput
                  style={styles.textField}
                  value={manualCalories}
                  onChangeText={setManualCalories}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#444"
                  selectTextOnFocus
                />
              </View>
            </View>

            <View style={styles.macroFieldRow}>
              {[
                { label: 'PROTEIN (g)', val: manualProtein, set: setManualProtein },
                { label: 'CARBS (g)',   val: manualCarbs,   set: setManualCarbs   },
                { label: 'FAT (g)',     val: manualFat,     set: setManualFat     },
              ].map(f => (
                <View key={f.label} style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>{f.label}</Text>
                  <TextInput
                    style={styles.textField}
                    value={f.val}
                    onChangeText={f.set}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#444"
                    selectTextOnFocus
                  />
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.logBtn, (!manualName.trim() || !manualCalories || isLogging) && styles.logBtnDisabled]}
              onPress={logManualFood}
              disabled={!manualName.trim() || !manualCalories || isLogging}
            >
              {isLogging
                ? <ActivityIndicator color="#0E0D0B" />
                : <Text style={styles.logBtnText}>LOG TO {MEAL_LABELS[mealType].toUpperCase()}</Text>
              }
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// MACRO STAT
// ─────────────────────────────────────────────────────────────

function MacroStat({ label, val, unit, color }: { label: string; val: number; unit?: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color }}>
        {val}{unit ?? ''}
      </Text>
      <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 1, color: '#555', marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0E0D0B' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1E1D1A',
  },
  backBtn: { padding: 4, marginRight: 8 },
  backBtnText: { fontSize: 26, color: '#EF6C3E', lineHeight: 30 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#F2F0EB' },
  headerSub: { fontSize: 11, color: '#555' },
  modeToggle: {
    backgroundColor: '#1A1714', borderWidth: 1, borderColor: '#2A2926',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  modeToggleText: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: '#EF6C3E' },

  // ── Search ──
  searchBar: {
    flexDirection: 'row', alignItems: 'center', margin: 14,
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, gap: 8,
  },
  searchIcon: { fontSize: 18, color: '#444' },
  searchInput: { flex: 1, fontSize: 15, color: '#F2F0EB' },
  searchClear: { fontSize: 12, color: '#444', padding: 4 },
  searchHint: { textAlign: 'center', color: '#333', fontSize: 13, marginTop: 32 },

  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, gap: 8,
  },
  sectionHeader: {
    fontSize: 9, fontWeight: '700', letterSpacing: 2, color: '#444',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6,
  },
  remoteEmpty: { fontSize: 12, color: '#333', paddingHorizontal: 16, paddingBottom: 8 },

  noResults: { alignItems: 'center', marginTop: 40, gap: 16 },
  noResultsText: { color: '#555', fontSize: 14 },

  resultRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#141311',
  },
  resultInfo: { flex: 1 },
  resultName: { fontSize: 14, fontWeight: '600', color: '#E0DED9', marginBottom: 2 },
  resultMacros: { fontSize: 11, color: '#555' },
  resultChevron: { fontSize: 18, color: '#3A3835', marginLeft: 8 },

  manualBtn: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#EF6C3E33',
    borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12,
  },
  manualBtnRow: {
    margin: 16, backgroundColor: '#141311', borderWidth: 1,
    borderColor: '#252320', borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  manualBtnText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: '#EF6C3E' },

  // ── Serving / Manual shared ──
  servingContent: { paddingHorizontal: 16, paddingTop: 16 },

  backToSearch: { marginBottom: 16 },
  backToSearchText: { fontSize: 13, color: '#EF6C3E' },

  servingCard: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 12, padding: 16, marginBottom: 20,
  },
  servingFoodName: { fontSize: 16, fontWeight: '700', color: '#F2F0EB', marginBottom: 4 },
  servingPer100: { fontSize: 12, color: '#555' },

  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: '#555', marginBottom: 6 },
  textField: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: '#F2F0EB',
  },
  gramRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gramInput: {
    flex: 1, backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 20, fontWeight: '700', color: '#F2F0EB',
  },
  gramUnit: { fontSize: 15, color: '#555', fontWeight: '600' },
  servingPreset: { fontSize: 12, color: '#EF6C3E', marginTop: 6 },

  totalsCard: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 12, padding: 16, marginBottom: 20,
  },
  totalsTitle: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: '#555', marginBottom: 12, textAlign: 'center' },
  totalsRow: { flexDirection: 'row' },

  macroFieldRow: { flexDirection: 'row', gap: 10 },

  aiScanBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#EF6C3E55',
    borderRadius: 12, padding: 14, marginBottom: 16,
  },
  aiScanIcon: { fontSize: 24 },
  aiScanLabel: { fontSize: 14, fontWeight: '700', color: '#EF6C3E' },
  aiScanSub: { fontSize: 11, color: '#555', marginTop: 2 },
  aiScanChevron: { fontSize: 20, color: '#EF6C3E55' },

  manualHint: { fontSize: 13, color: '#555', marginBottom: 20, lineHeight: 18 },

  logBtn: {
    backgroundColor: '#EF6C3E', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  logBtnDisabled: { opacity: 0.4 },
  logBtnText: { color: '#0E0D0B', fontWeight: '800', fontSize: 14, letterSpacing: 1 },
});
