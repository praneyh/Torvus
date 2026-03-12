// ============================================================
// TORVUS — Progress / History + Charts Screen
// app/(tabs)/progress.tsx
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Platform, ActivityIndicator, TextInput,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { getDatabase } from '../../schema';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type WeightUnit = 'kg' | 'lbs';
type FilterMode = 'muscle' | 'day';
type TimeRange = '1m' | '3m' | '6m' | 'all';

interface SessionSummary {
  id: number;
  date: string;
  completedAt: string;
  durationSeconds: number | null;
  dayLabel: string;
  muscleGroups: string[];
  splitName: string;
  totalSets: number;
  totalVolumeKg: number;
}

interface SessionSet {
  setNumber: number;
  reps: number;
  weightKg: number;
  platesCount: number | null;
}

interface SessionExercise {
  exerciseId: number;
  name: string;
  muscleGroup: string;
  sets: SessionSet[];
}

interface ExerciseOption {
  id: number;
  name: string;
  muscleGroup: string;
  baseWeightKg: number | null;
}

interface SplitDay {
  id: number;
  dayNumber: number;
  label: string;
}

interface ChartPoint {
  date: string;
  maxWeightKg: number; // includes base weight
  totalSets: number;
}

interface CardioSessionSummary {
  id: number;
  date: string;
  exerciseName: string;
  category: string;
  durationSeconds: number;
  caloriesBurned: number | null;
  caloriesConfidence: number | null;
  hrAvg: number | null;
  hrMin: number | null;
  hrMax: number | null;
  hrType: string | null;
  distanceKm: number | null;
}

interface CardioExerciseOption {
  id: number;
  name: string;
  category: string;
}

type CardioMetric = 'duration' | 'calories' | 'hr' | 'distance';

interface CardioChartPoint {
  date: string;
  value: number;
}

interface BodyWeightEntry {
  id: number;
  date: string;
  weightKg: number;
  loggedAt: string;
}

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const MUSCLE_GROUPS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
  'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'core',
] as const;

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes',
  calves: 'Calves', adductors: 'Adductors', core: 'Core',
};

const MUSCLE_COLORS: Record<string, string> = {
  chest: '#EF6C3E', back: '#3E8CEF', shoulders: '#9B6CEF',
  biceps: '#EF3E7A', triceps: '#EF9B3E', forearms: '#C87B3E',
  quads: '#3EEFB8', hamstrings: '#3EC4EF', glutes: '#EF3EDE',
  calves: '#EFDE3E', adductors: '#7BCF6E', core: '#6CEF3E',
};

// Line chart dimensions
const CHART_H      = 160;
const DATE_H       = 26;
const Y_AXIS_W     = 42;
const POINT_SPACING = 62;
const DOT_R        = 5;
const DOT_R_PR     = 7;

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const PLATE_KG = 45 * 0.453592;

function formatDate(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function formatWeight(kg: number, unit: WeightUnit): string {
  const val = unit === 'lbs' ? kg * 2.20462 : kg;
  return val % 1 === 0 ? val.toFixed(0) : val.toFixed(1);
}

function formatSetWeight(s: SessionSet, unit: WeightUnit): string {
  if (s.platesCount !== null) {
    const kickerKg = s.weightKg - s.platesCount * PLATE_KG;
    const plateLabel = `${s.platesCount} plate${s.platesCount !== 1 ? 's' : ''}`;
    if (kickerKg < 0.5) return plateLabel;
    return `${plateLabel} + ${formatWeight(kickerKg, unit)} ${unit}`;
  }
  return `${formatWeight(s.weightKg, unit)} ${unit}`;
}

function shortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

// ─────────────────────────────────────────────────────────────
// SESSION CARD  (History tab)
// ─────────────────────────────────────────────────────────────

interface SessionCardProps {
  session: SessionSummary;
  unit: WeightUnit;
  isExpanded: boolean;
  onToggle: () => void;
  exercises: SessionExercise[] | null;
  onExpand: () => void;
}

function SessionCard({ session, unit, isExpanded, onToggle, exercises, onExpand }: SessionCardProps) {
  const primaryMg = session.muscleGroups[0];
  const accentColor = primaryMg ? (MUSCLE_COLORS[primaryMg] ?? '#EF6C3E') : '#EF6C3E';
  const volumeDisplay = formatWeight(session.totalVolumeKg, unit);

  function handleToggle() {
    onToggle();
    if (!isExpanded) onExpand();
  }

  return (
    <View style={styles.sessionCard}>
      <View style={[styles.sessionAccent, { backgroundColor: accentColor }]} />
      <View style={styles.sessionCardInner}>
        <TouchableOpacity style={styles.sessionHeader} onPress={handleToggle} activeOpacity={0.8}>
          <View style={styles.sessionHeaderLeft}>
            <View style={styles.sessionTopRow}>
              <Text style={styles.sessionDate}>{formatDate(session.date)}</Text>
              <Text style={styles.sessionDot}>·</Text>
              <Text style={styles.sessionDuration}>{formatDuration(session.durationSeconds)}</Text>
              <Text style={styles.sessionDot}>·</Text>
              <Text style={styles.sessionSplitName}>{session.splitName}</Text>
            </View>
            <Text style={styles.sessionDayLabel}>{session.dayLabel}</Text>
            <View style={styles.sessionMgRow}>
              {session.muscleGroups.slice(0, 5).map(mg => (
                <View key={mg} style={[styles.sessionMgDot, { backgroundColor: MUSCLE_COLORS[mg] ?? '#555' }]} />
              ))}
              {session.muscleGroups.length > 5 && (
                <Text style={styles.sessionMgMore}>+{session.muscleGroups.length - 5}</Text>
              )}
            </View>
          </View>
          <View style={styles.sessionHeaderRight}>
            <View style={styles.sessionStats}>
              <Text style={styles.sessionStatValue}>{session.totalSets}</Text>
              <Text style={styles.sessionStatLabel}>SETS</Text>
            </View>
            <View style={styles.sessionStats}>
              <Text style={styles.sessionStatValue}>{volumeDisplay}</Text>
              <Text style={styles.sessionStatLabel}>{unit.toUpperCase()}</Text>
            </View>
            <Text style={[styles.sessionChevron, isExpanded && styles.sessionChevronOpen]}>›</Text>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.sessionDetail}>
            <View style={styles.sessionDetailDivider} />
            {exercises === null ? (
              <ActivityIndicator color="#EF6C3E" style={{ marginVertical: 16 }} />
            ) : exercises.length === 0 ? (
              <Text style={styles.noSetsText}>No sets recorded</Text>
            ) : (
              exercises.map(ex => (
                <View key={ex.exerciseId} style={styles.exGroup}>
                  <View style={styles.exGroupHeader}>
                    <View style={[styles.exGroupDot, { backgroundColor: MUSCLE_COLORS[ex.muscleGroup] ?? '#555' }]} />
                    <Text style={styles.exGroupName}>{ex.name}</Text>
                  </View>
                  {ex.sets.map(s => (
                    <View key={s.setNumber} style={styles.setRow}>
                      <Text style={styles.setNum}>{s.setNumber}</Text>
                      <Text style={styles.setDetail}>{formatSetWeight(s, unit)} × {s.reps} reps</Text>
                    </View>
                  ))}
                </View>
              ))
            )}
          </View>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// CHARTS VIEW
// ─────────────────────────────────────────────────────────────

function ChartsView({ unit }: { unit: WeightUnit }) {
  // ── Filter state ───────────────────────────────────────────
  const [filterMode, setFilterMode] = useState<FilterMode>('muscle');
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [splitDays, setSplitDays] = useState<SplitDay[]>([]);
  const [selectedDayId, setSelectedDayId] = useState<number | null>(null);
  const [dayExIds, setDayExIds] = useState<Set<number>>(new Set());

  // ── Exercise options ───────────────────────────────────────
  const [allExOptions, setAllExOptions] = useState<ExerciseOption[]>([]);
  const [selectedExId, setSelectedExId] = useState<number | null>(null);
  const [isLoadingEx, setIsLoadingEx] = useState(true);

  // ── Chart data ─────────────────────────────────────────────
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [hasPlatesData, setHasPlatesData] = useState(false);

  // ── Base weight ────────────────────────────────────────────
  const [baseWeightInput, setBaseWeightInput] = useState('');
  const [currentBaseKg, setCurrentBaseKg] = useState(0);

  // ── Load on mount ──────────────────────────────────────────
  useEffect(() => {
    Promise.all([loadExercises(), loadSplitDays()]);
  }, []);

  // ─────────────────────────────────────────────────────────
  // DATA LOADING
  // ─────────────────────────────────────────────────────────

  async function loadExercises() {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<{
        id: number; name: string; muscle_group: string; base_weight_kg: number | null;
      }>(`
        SELECT DISTINCT e.id, e.name, e.muscle_group, e.base_weight_kg
        FROM set_entries se
        JOIN exercises e ON e.id = se.exercise_id
        JOIN workout_sessions ws ON ws.id = se.session_id
        WHERE ws.completed_at IS NOT NULL
        ORDER BY e.name
      `);
      const opts = rows.map(r => ({
        id: r.id, name: r.name,
        muscleGroup: r.muscle_group,
        baseWeightKg: r.base_weight_kg,
      }));
      setAllExOptions(opts);
      if (opts.length > 0) {
        const first = opts[0];
        const bw = first.baseWeightKg ?? 0;
        setSelectedExId(first.id);
        setCurrentBaseKg(bw);
        setBaseWeightInput(bw > 0 ? bw.toString() : '');
        loadChartData(first.id, 'all', bw);
      }
    } catch (err) {
      console.error('loadExercises error:', err);
    } finally {
      setIsLoadingEx(false);
    }
  }

  async function loadSplitDays() {
    try {
      const db = await getDatabase();
      const pref = await db.getFirstAsync<{ active_split_id: number | null }>(
        `SELECT active_split_id FROM user_preferences WHERE id = 1`
      );
      if (!pref?.active_split_id) return;
      const days = await db.getAllAsync<{ id: number; label: string; day_number: number }>(
        `SELECT id, label, day_number FROM workout_days WHERE split_id = ? ORDER BY day_number`,
        [pref.active_split_id]
      );
      setSplitDays(days.map(d => ({ id: d.id, label: d.label, dayNumber: d.day_number })));
    } catch (err) {
      console.error('loadSplitDays error:', err);
    }
  }

  async function loadDayExIds(dayId: number) {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<{ exercise_id: number }>(
        `SELECT DISTINCT se.exercise_id
         FROM set_entries se
         JOIN workout_sessions ws ON ws.id = se.session_id
         WHERE ws.day_id = ? AND ws.completed_at IS NOT NULL`,
        [dayId]
      );
      setDayExIds(new Set(rows.map(r => r.exercise_id)));
    } catch (err) {
      console.error('loadDayExIds error:', err);
    }
  }

  async function loadChartData(exerciseId: number, range: TimeRange, baseKg: number) {
    setIsLoadingChart(true);
    try {
      const db = await getDatabase();

      const platesCheck = await db.getFirstAsync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM set_entries WHERE exercise_id = ? AND plates_count IS NOT NULL`,
        [exerciseId]
      );
      setHasPlatesData((platesCheck?.cnt ?? 0) > 0);

      const dateMap: Record<string, number> = { '1m': 29, '3m': 89, '6m': 179 };
      const dateClause = range !== 'all' && dateMap[range] != null
        ? `AND ws.date >= date('now', 'localtime', '-${dateMap[range]} days')`
        : '';

      const rows = await db.getAllAsync<{
        date: string; max_weight_kg: number; total_sets: number;
      }>(`
        SELECT
          ws.date,
          MAX(se.weight_kg) AS max_weight_kg,
          COUNT(se.id)      AS total_sets
        FROM set_entries se
        JOIN workout_sessions ws ON ws.id = se.session_id
        WHERE se.exercise_id = ?
          AND ws.completed_at IS NOT NULL
          ${dateClause}
        GROUP BY ws.id
        ORDER BY ws.completed_at ASC
      `, [exerciseId]);

      setChartData(rows.map(r => ({
        date: r.date,
        maxWeightKg: r.max_weight_kg + baseKg,
        totalSets: r.total_sets,
      })));
    } catch (err) {
      console.error('loadChartData error:', err);
    } finally {
      setIsLoadingChart(false);
    }
  }

  async function saveBaseWeight(exerciseId: number, kg: number | null) {
    try {
      const db = await getDatabase();
      await db.runAsync(`UPDATE exercises SET base_weight_kg = ? WHERE id = ?`, [kg, exerciseId]);
      setAllExOptions(prev =>
        prev.map(e => e.id === exerciseId ? { ...e, baseWeightKg: kg } : e)
      );
    } catch (err) {
      console.error('saveBaseWeight error:', err);
    }
  }

  // ─────────────────────────────────────────────────────────
  // EVENT HANDLERS
  // ─────────────────────────────────────────────────────────

  function handleSelectExercise(ex: ExerciseOption) {
    const bw = ex.baseWeightKg ?? 0;
    setSelectedExId(ex.id);
    setCurrentBaseKg(bw);
    setBaseWeightInput(bw > 0 ? bw.toString() : '');
    loadChartData(ex.id, timeRange, bw);
  }

  function handleTimeRange(range: TimeRange) {
    setTimeRange(range);
    if (selectedExId !== null) loadChartData(selectedExId, range, currentBaseKg);
  }

  function handleBaseWeightBlur() {
    if (selectedExId === null) return;
    const kg = parseFloat(baseWeightInput) || 0;
    const newBase = unit === 'lbs' ? kg * 0.453592 : kg; // store in kg always
    setCurrentBaseKg(newBase);
    saveBaseWeight(selectedExId, newBase || null);
    loadChartData(selectedExId, timeRange, newBase);
  }

  // ─────────────────────────────────────────────────────────
  // DERIVED DATA
  // ─────────────────────────────────────────────────────────

  const filteredExercises = (() => {
    if (filterMode === 'day' && dayExIds.size > 0) {
      return allExOptions.filter(e => dayExIds.has(e.id));
    }
    if (filterMode === 'muscle' && selectedMuscle !== null) {
      return allExOptions.filter(e => e.muscleGroup === selectedMuscle);
    }
    return allExOptions;
  })();

  const selectedEx = allExOptions.find(e => e.id === selectedExId);
  const accentColor = selectedEx ? (MUSCLE_COLORS[selectedEx.muscleGroup] ?? '#EF6C3E') : '#EF6C3E';

  const prWeightKg  = chartData.length > 0 ? Math.max(...chartData.map(d => d.maxWeightKg)) : 0;
  const latestKg    = chartData[chartData.length - 1]?.maxWeightKg ?? 0;
  const prevKg      = chartData[chartData.length - 2]?.maxWeightKg ?? null;
  const trendKg     = prevKg !== null ? latestKg - prevKg : null;

  // Y-axis scale
  const rawMin = chartData.length > 0 ? Math.min(...chartData.map(d => d.maxWeightKg)) : 0;
  const rawMax = prWeightKg;
  const yRange = rawMax - rawMin || 1;
  const displayMin = Math.max(0, rawMin - yRange * 0.15);
  const displayMax = rawMax + yRange * 0.1;
  const displayRange = displayMax - displayMin || 1;

  const yToPixel = (val: number) =>
    CHART_H - ((val - displayMin) / displayRange) * CHART_H;

  const yAxisEntries = [0, 0.33, 0.67, 1].map(frac => ({
    value: displayMin + frac * displayRange,
    y: CHART_H * (1 - frac),
  }));

  const totalChartWidth = Math.max(chartData.length * POINT_SPACING + POINT_SPACING, 280);

  const chartPoints = chartData.map((d, i) => ({
    x: i * POINT_SPACING + POINT_SPACING / 2,
    y: yToPixel(d.maxWeightKg),
    value: d.maxWeightKg,
    date: d.date,
    isPR: d.maxWeightKg === prWeightKg,
  }));

  // ─────────────────────────────────────────────────────────
  // EARLY RETURNS
  // ─────────────────────────────────────────────────────────

  if (isLoadingEx) {
    return <View style={styles.center}><ActivityIndicator color="#EF6C3E" size="large" /></View>;
  }

  if (allExOptions.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>▲</Text>
        <Text style={styles.emptyTitle}>No data yet</Text>
        <Text style={styles.emptySub}>Complete a workout to see your progress charts.</Text>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Filter mode toggle ── */}
      <View style={styles.filterToggle}>
        {(['muscle', 'day'] as FilterMode[]).map(mode => (
          <TouchableOpacity
            key={mode}
            style={[styles.filterToggleBtn, filterMode === mode && styles.filterToggleBtnActive]}
            onPress={() => setFilterMode(mode)}
          >
            <Text style={[styles.filterToggleText, filterMode === mode && styles.filterToggleTextActive]}>
              BY {mode.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Filter chips ── */}
      {filterMode === 'muscle' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
          <TouchableOpacity
            style={[styles.filterChip, selectedMuscle === null && styles.filterChipActive]}
            onPress={() => setSelectedMuscle(null)}
          >
            <Text style={[styles.filterChipText, selectedMuscle === null && styles.filterChipTextActive]}>ALL</Text>
          </TouchableOpacity>
          {MUSCLE_GROUPS.map(mg => {
            const isActive = selectedMuscle === mg;
            const col = MUSCLE_COLORS[mg];
            return (
              <TouchableOpacity
                key={mg}
                style={[styles.filterChip, isActive && { borderColor: col, backgroundColor: col + '22' }]}
                onPress={() => setSelectedMuscle(isActive ? null : mg)}
              >
                <View style={[styles.filterChipDot, { backgroundColor: isActive ? col : '#3A3835' }]} />
                <Text style={[styles.filterChipText, isActive && { color: col }]}>
                  {MUSCLE_LABELS[mg].toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : splitDays.length === 0 ? (
        <Text style={styles.helperText}>No active split — go to the Workout tab to set one.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
          {splitDays.map(day => {
            const isActive = selectedDayId === day.id;
            return (
              <TouchableOpacity
                key={day.id}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => {
                  const newId = isActive ? null : day.id;
                  setSelectedDayId(newId);
                  if (newId !== null) loadDayExIds(newId);
                  else setDayExIds(new Set());
                }}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  D{day.dayNumber} · {day.label.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ── Exercise picker ── */}
      <Text style={styles.sectionLabel}>EXERCISE</Text>
      {filteredExercises.length === 0 ? (
        <Text style={styles.helperText}>No exercises for this filter.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.exPickerRow}>
          {filteredExercises.map(ex => {
            const isActive = ex.id === selectedExId;
            const col = MUSCLE_COLORS[ex.muscleGroup] ?? '#EF6C3E';
            return (
              <TouchableOpacity
                key={ex.id}
                style={[styles.exPickerChip, isActive && { borderColor: col, backgroundColor: col + '22' }]}
                onPress={() => handleSelectExercise(ex)}
              >
                <View style={[styles.exPickerDot, { backgroundColor: isActive ? col : '#3A3835' }]} />
                <Text style={[styles.exPickerText, isActive && { color: col }]}>{ex.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ── Chart section ── */}
      {selectedExId !== null && (
        <>
          {/* Time range tabs */}
          <View style={styles.timeRangeRow}>
            {(['1m', '3m', '6m', 'all'] as TimeRange[]).map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.timeRangeBtn, timeRange === r && styles.timeRangeBtnActive]}
                onPress={() => handleTimeRange(r)}
              >
                <Text style={[styles.timeRangeBtnText, timeRange === r && styles.timeRangeBtnTextActive]}>
                  {r === 'all' ? 'ALL' : r.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Base weight (plates exercises only) */}
          {hasPlatesData && (
            <View style={styles.baseWeightRow}>
              <View>
                <Text style={styles.baseWeightTitle}>BASE WEIGHT</Text>
                <Text style={styles.baseWeightSub}>Bar or machine starting resistance</Text>
              </View>
              <View style={styles.baseWeightInputWrap}>
                <TextInput
                  style={styles.baseWeightInput}
                  value={baseWeightInput}
                  onChangeText={setBaseWeightInput}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#444"
                  selectTextOnFocus
                  onBlur={handleBaseWeightBlur}
                  returnKeyType="done"
                  onSubmitEditing={handleBaseWeightBlur}
                />
                <Text style={styles.baseWeightUnit}>{unit.toUpperCase()}</Text>
              </View>
            </View>
          )}

          {/* Line chart */}
          {isLoadingChart ? (
            <ActivityIndicator color="#EF6C3E" style={{ marginVertical: 40 }} />
          ) : chartData.length === 0 ? (
            <View style={styles.chartEmpty}>
              <Text style={styles.chartEmptyText}>No data for this time range.</Text>
            </View>
          ) : (
            <>
              <View style={styles.chartCard}>
                {/* Chart header */}
                <View style={styles.chartHeader}>
                  <View>
                    <Text style={styles.chartTitle}>
                      {selectedEx?.name.toUpperCase()}
                    </Text>
                    <Text style={styles.chartSubtitle}>MAX WEIGHT PER SESSION</Text>
                  </View>
                  <Text style={[styles.prLabel, { color: accentColor }]}>
                    PR · {formatWeight(prWeightKg, unit)} {unit}
                  </Text>
                </View>

                {/* Chart body: Y-axis + scrollable plot */}
                <View style={styles.chartBody}>
                  {/* Fixed Y-axis */}
                  <View style={{ width: Y_AXIS_W, height: CHART_H + DATE_H }}>
                    {yAxisEntries.map((entry, i) => (
                      <Text
                        key={i}
                        style={[styles.yAxisLabel, { position: 'absolute', top: entry.y - 7, right: 6 }]}
                      >
                        {Math.round(unit === 'lbs' ? entry.value * 2.20462 : entry.value)}
                      </Text>
                    ))}
                  </View>

                  {/* Scrollable plot area */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ flex: 1 }}
                    contentContainerStyle={{ width: totalChartWidth }}
                  >
                    <View style={{ width: totalChartWidth, height: CHART_H + DATE_H, position: 'relative' }}>

                      {/* Horizontal grid lines */}
                      {yAxisEntries.map((entry, i) => (
                        <View
                          key={i}
                          style={{
                            position: 'absolute', left: 0, right: 0,
                            top: entry.y, height: 1, backgroundColor: '#1E1D1A',
                          }}
                        />
                      ))}

                      {/* Line segments between dots */}
                      {chartPoints.map((pt, i) => {
                        if (i === chartPoints.length - 1) return null;
                        const next = chartPoints[i + 1];
                        const dx = next.x - pt.x;
                        const dy = next.y - pt.y;
                        const length = Math.sqrt(dx * dx + dy * dy);
                        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                        const midX = (pt.x + next.x) / 2;
                        const midY = (pt.y + next.y) / 2;
                        return (
                          <View
                            key={`seg-${i}`}
                            style={{
                              position: 'absolute',
                              left: midX - length / 2,
                              top: midY - 1.5,
                              width: length,
                              height: 3,
                              backgroundColor: accentColor,
                              opacity: 0.7,
                              transform: [{ rotate: `${angle}deg` }],
                            }}
                          />
                        );
                      })}

                      {/* Dots */}
                      {chartPoints.map((pt, i) => {
                        const r = pt.isPR ? DOT_R_PR : DOT_R;
                        return (
                          <View key={`dot-${i}`}>
                            <View
                              style={{
                                position: 'absolute',
                                left: pt.x - r,
                                top: pt.y - r,
                                width: r * 2,
                                height: r * 2,
                                borderRadius: r,
                                backgroundColor: pt.isPR ? accentColor : accentColor + '99',
                                ...(pt.isPR && { borderWidth: 2, borderColor: '#0E0D0B' }),
                              }}
                            />
                            {/* PR label above PR dot */}
                            {pt.isPR && (
                              <Text
                                style={{
                                  position: 'absolute',
                                  top: pt.y - r - 16,
                                  left: pt.x - 12,
                                  width: 24,
                                  textAlign: 'center',
                                  fontSize: 9,
                                  fontWeight: '800',
                                  color: accentColor,
                                  letterSpacing: 0.5,
                                }}
                              >
                                PR
                              </Text>
                            )}
                          </View>
                        );
                      })}

                      {/* Date labels below chart */}
                      {chartPoints.map((pt, i) => (
                        <Text
                          key={`date-${i}`}
                          style={{
                            position: 'absolute',
                            top: CHART_H + 6,
                            left: pt.x - 18,
                            width: 36,
                            textAlign: 'center',
                            fontSize: 9,
                            color: '#444',
                            fontWeight: '600',
                          }}
                        >
                          {shortDate(pt.date)}
                        </Text>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </View>

              {/* Stats strip */}
              <View style={styles.statsStrip}>
                <View style={styles.statCell}>
                  <Text style={[styles.statCellValue, { color: accentColor }]}>
                    {formatWeight(prWeightKg, unit)}
                    <Text style={styles.statCellUnit}> {unit}</Text>
                  </Text>
                  <Text style={styles.statCellLabel}>ALL-TIME PR</Text>
                </View>
                <View style={styles.statCellDivider} />
                <View style={styles.statCell}>
                  <Text style={styles.statCellValue}>{chartData.length}</Text>
                  <Text style={styles.statCellLabel}>SESSIONS</Text>
                </View>
                <View style={styles.statCellDivider} />
                <View style={styles.statCell}>
                  <Text style={[
                    styles.statCellValue,
                    trendKg !== null && trendKg > 0 ? styles.trendUp
                      : trendKg !== null && trendKg < 0 ? styles.trendDown
                      : {},
                  ]}>
                    {trendKg !== null
                      ? (trendKg >= 0 ? '+' : '') + formatWeight(Math.abs(trendKg), unit)
                      : '—'}
                  </Text>
                  <Text style={styles.statCellLabel}>VS LAST</Text>
                </View>
              </View>
            </>
          )}
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────
// CARDIO HISTORY VIEW
// ─────────────────────────────────────────────────────────────

const CARDIO_CAT_COLOR: Record<string, string> = {
  machine: '#3E8CEF', outdoor: '#3EEFB8', sport: '#EF9B3E', custom: '#9B6CEF',
};

function formatCardioHr(s: CardioSessionSummary): string {
  if (!s.hrType) return '—';
  if (s.hrType === 'avg' && s.hrAvg) return `${s.hrAvg} bpm`;
  if (s.hrType === 'range' && (s.hrMin || s.hrMax)) {
    return `${s.hrMin ?? '?'}–${s.hrMax ?? '?'} bpm`;
  }
  return '—';
}

function confColor(c: number): string {
  if (c >= 0.8) return '#6CEF3E';
  if (c >= 0.55) return '#EF9B3E';
  return '#EF3E7A';
}

function CardioHistoryView() {
  const [sessions, setSessions] = useState<CardioSessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [distUnit, setDistUnit] = useState<'km' | 'mi'>('km');

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    setIsLoading(true);
    try {
      const db = await getDatabase();
      const prefs = await db.getFirstAsync<{ weight_unit: string | null }>(
        `SELECT weight_unit FROM user_preferences WHERE id = 1`
      );
      setDistUnit(prefs?.weight_unit === 'lbs' ? 'mi' : 'km');
      const rows = await db.getAllAsync<{
        id: number; date: string; duration_seconds: number;
        exercise_name: string; category: string;
        calories_burned: number | null; calories_confidence: number | null;
        hr_type: string | null; hr_avg: number | null;
        hr_min: number | null; hr_max: number | null;
        distance_km: number | null;
      }>(`
        SELECT cs.id, cs.date, cs.duration_seconds,
               ce.name AS exercise_name, COALESCE(ce.category,'custom') AS category,
               cs.calories_burned, cs.calories_confidence,
               cs.hr_type, cs.hr_avg, cs.hr_min, cs.hr_max, cs.distance_km
        FROM cardio_sessions cs
        JOIN cardio_exercises ce ON ce.id = cs.cardio_exercise_id
        ORDER BY cs.logged_at DESC
        LIMIT 50
      `);
      setSessions(rows.map(r => ({
        id: r.id, date: r.date, exerciseName: r.exercise_name,
        category: r.category, durationSeconds: r.duration_seconds,
        caloriesBurned: r.calories_burned, caloriesConfidence: r.calories_confidence,
        hrAvg: r.hr_avg, hrMin: r.hr_min, hrMax: r.hr_max, hrType: r.hr_type,
        distanceKm: r.distance_km,
      })));
    } catch (e) {
      console.error('cardio history error:', e);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) return <View style={styles.center}><ActivityIndicator color="#EF6C3E" /></View>;

  if (sessions.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>♡</Text>
        <Text style={styles.emptyTitle}>No cardio logged</Text>
        <Text style={styles.emptySub}>Tap LOG CARDIO in the Workout tab to get started.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {sessions.map(s => {
        const color = CARDIO_CAT_COLOR[s.category] ?? '#EF6C3E';
        const durMin = Math.floor(s.durationSeconds / 60);
        const durSec = s.durationSeconds % 60;
        const durStr = `${durMin}:${String(durSec).padStart(2, '0')}`;
        return (
          <View key={s.id} style={styles.sessionCard}>
            <View style={[styles.sessionAccent, { backgroundColor: color }]} />
            <View style={[styles.sessionCardInner, { padding: 14 }]}>
              <View style={styles.sessionTopRow}>
                <Text style={styles.sessionDate}>{formatDate(s.date)}</Text>
                <Text style={styles.sessionDot}>·</Text>
                <Text style={styles.sessionDuration}>{durStr}</Text>
              </View>
              <Text style={styles.sessionDayLabel}>{s.exerciseName}</Text>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
                {s.caloriesBurned ? (
                  <View style={{ alignItems: 'flex-start' }}>
                    <Text style={[styles.sessionStatValue, { color: '#EF6C3E' }]}>
                      {s.caloriesBurned}
                      <Text style={{ fontSize: 10, color: '#555' }}> kcal</Text>
                    </Text>
                    <Text style={styles.sessionStatLabel}>
                      CALORIES
                      {s.caloriesConfidence ? (
                        <Text style={{ color: confColor(s.caloriesConfidence) }}>
                          {' '}({s.caloriesConfidence >= 0.8 ? 'HI' : s.caloriesConfidence >= 0.55 ? 'MED' : 'LO'})
                        </Text>
                      ) : null}
                    </Text>
                  </View>
                ) : null}
                {s.hrType ? (
                  <View style={{ alignItems: 'flex-start' }}>
                    <Text style={styles.sessionStatValue}>{formatCardioHr(s)}</Text>
                    <Text style={styles.sessionStatLabel}>HEART RATE</Text>
                  </View>
                ) : null}
                {s.distanceKm ? (
                  <View style={{ alignItems: 'flex-start' }}>
                    <Text style={styles.sessionStatValue}>
                      {distUnit === 'mi'
                        ? (s.distanceKm * 0.621371).toFixed(2)
                        : s.distanceKm.toFixed(2)}
                      <Text style={{ fontSize: 10, color: '#555' }}> {distUnit}</Text>
                    </Text>
                    <Text style={styles.sessionStatLabel}>DISTANCE</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        );
      })}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────
// CARDIO CHARTS VIEW
// ─────────────────────────────────────────────────────────────

const CARDIO_METRICS: { key: CardioMetric; label: string; unit: string }[] = [
  { key: 'duration',  label: 'Duration',   unit: 'min' },
  { key: 'calories',  label: 'Calories',   unit: 'kcal' },
  { key: 'hr',        label: 'Heart Rate', unit: 'bpm' },
  { key: 'distance',  label: 'Distance',   unit: 'km' },
];

function cardioMetricSql(metric: CardioMetric): string {
  switch (metric) {
    case 'duration':  return 'cs.duration_seconds / 60.0';
    case 'calories':  return 'cs.calories_burned';
    case 'hr':        return 'COALESCE(cs.hr_avg, (cs.hr_min + cs.hr_max) / 2.0)';
    case 'distance':  return 'cs.distance_km';
  }
}

function CardioChartsView() {
  const [exercises, setExercises]   = useState<CardioExerciseOption[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [metric, setMetric]         = useState<CardioMetric>('duration');
  const [timeRange, setTimeRange]   = useState<TimeRange>('all');
  const [chartData, setChartData]   = useState<CardioChartPoint[]>([]);
  const [isLoadingEx, setIsLoadingEx]     = useState(true);
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [distUnit, setDistUnit] = useState<'km' | 'mi'>('km');

  useEffect(() => {
    (async () => {
      try {
        const db = await getDatabase();
        const prefs = await db.getFirstAsync<{ weight_unit: string | null }>(
          `SELECT weight_unit FROM user_preferences WHERE id = 1`
        );
        setDistUnit(prefs?.weight_unit === 'lbs' ? 'mi' : 'km');
        const rows = await db.getAllAsync<{ id: number; name: string; category: string }>(`
          SELECT DISTINCT ce.id, ce.name, COALESCE(ce.category,'custom') AS category
          FROM cardio_sessions cs JOIN cardio_exercises ce ON ce.id = cs.cardio_exercise_id
          ORDER BY ce.name
        `);
        setExercises(rows);
        if (rows.length > 0) {
          setSelectedId(rows[0].id);
          loadChart(rows[0].id, 'duration', 'all');
        }
      } catch (e) { console.error('cardio ex load:', e); }
      finally { setIsLoadingEx(false); }
    })();
  }, []);

  async function loadChart(exId: number, m: CardioMetric, range: TimeRange) {
    setIsLoadingChart(true);
    try {
      const db = await getDatabase();
      let dateFilter = '';
      if (range !== 'all') {
        const months = range === '1m' ? 1 : range === '3m' ? 3 : 6;
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - months);
        dateFilter = `AND cs.date >= '${cutoff.toISOString().slice(0, 10)}'`;
      }
      const sql = `
        SELECT cs.date, ${cardioMetricSql(m)} AS value
        FROM cardio_sessions cs
        WHERE cs.cardio_exercise_id = ? ${dateFilter}
          AND ${cardioMetricSql(m)} IS NOT NULL
        ORDER BY cs.date ASC
      `;
      const rows = await db.getAllAsync<{ date: string; value: number }>(sql, [exId]);
      setChartData(rows.map(r => ({ date: r.date, value: r.value })));
    } catch (e) { console.error('cardio chart load:', e); }
    finally { setIsLoadingChart(false); }
  }

  function handleSelectEx(id: number) {
    setSelectedId(id);
    loadChart(id, metric, timeRange);
  }

  function handleMetric(m: CardioMetric) {
    setMetric(m);
    if (selectedId !== null) loadChart(selectedId, m, timeRange);
  }

  function handleRange(r: TimeRange) {
    setTimeRange(r);
    if (selectedId !== null) loadChart(selectedId, metric, r);
  }

  const selectedEx = exercises.find(e => e.id === selectedId);
  const metricDef  = CARDIO_METRICS.find(m => m.key === metric)!;
  const accentColor = CARDIO_CAT_COLOR[selectedEx?.category ?? ''] ?? '#EF6C3E';
  const convFactor = metric === 'distance' && distUnit === 'mi' ? 0.621371 : 1;
  const effectiveUnit = metric === 'distance' ? distUnit : metricDef.unit;

  // Chart geometry
  const vals = chartData.map(p => p.value * convFactor);
  const minV = vals.length ? Math.min(...vals) : 0;
  const maxV = vals.length ? Math.max(...vals) : 1;
  const range2 = Math.max(maxV - minV, 1);
  const yPad = 16;
  const plotH = CHART_H - yPad * 2;
  const totalW = Math.max(chartData.length * POINT_SPACING + Y_AXIS_W, 1);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    label: ((minV + t * range2) < 100
      ? (minV + t * range2).toFixed(1)
      : Math.round(minV + t * range2).toString()),
    y: CHART_H - yPad - t * plotH,
  }));

  const chartPoints = chartData.map((p, i) => {
    const v = p.value * convFactor;
    return {
      x: Y_AXIS_W + i * POINT_SPACING + POINT_SPACING / 2,
      y: CHART_H - yPad - ((v - minV) / range2) * plotH,
      date: p.date,
      value: v,
    };
  });

  const bestVal = vals.length ? Math.max(...vals) : null;

  if (isLoadingEx) return <View style={styles.center}><ActivityIndicator color="#EF6C3E" /></View>;

  if (exercises.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No cardio data yet</Text>
        <Text style={styles.emptySub}>Log cardio sessions to see charts here.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* Exercise picker */}
      <Text style={styles.sectionLabel}>EXERCISE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.exPickerRow}>
        {exercises.map(ex => {
          const isActive = ex.id === selectedId;
          const col = CARDIO_CAT_COLOR[ex.category] ?? '#EF6C3E';
          return (
            <TouchableOpacity
              key={ex.id}
              style={[styles.exPickerChip, isActive && { borderColor: col, backgroundColor: col + '22' }]}
              onPress={() => handleSelectEx(ex.id)}
            >
              <View style={[styles.exPickerDot, { backgroundColor: isActive ? col : '#3A3835' }]} />
              <Text style={[styles.exPickerText, isActive && { color: col }]}>{ex.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Metric picker */}
      <Text style={styles.sectionLabel}>METRIC</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
        {CARDIO_METRICS.map(m => (
          <TouchableOpacity
            key={m.key}
            style={[styles.exPickerChip, metric === m.key && { borderColor: accentColor, backgroundColor: accentColor + '22' }]}
            onPress={() => handleMetric(m.key)}
          >
            <Text style={[styles.exPickerText, metric === m.key && { color: accentColor }]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Time range */}
      <View style={styles.timeRangeRow}>
        {(['1m', '3m', '6m', 'all'] as TimeRange[]).map(r => (
          <TouchableOpacity
            key={r}
            style={[styles.timeRangeBtn, timeRange === r && styles.timeRangeBtnActive]}
            onPress={() => handleRange(r)}
          >
            <Text style={[styles.timeRangeBtnText, timeRange === r && styles.timeRangeBtnTextActive]}>
              {r === 'all' ? 'ALL' : r.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Distance unit toggle */}
      {metric === 'distance' && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 }}>
          <TouchableOpacity
            style={[styles.timeRangeBtn, { paddingHorizontal: 14 }]}
            onPress={() => setDistUnit(u => u === 'km' ? 'mi' : 'km')}
          >
            <Text style={styles.timeRangeBtnTextActive}>{distUnit.toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Chart */}
      {isLoadingChart ? (
        <ActivityIndicator color="#EF6C3E" style={{ marginVertical: 40 }} />
      ) : chartData.length === 0 ? (
        <View style={styles.chartEmpty}>
          <Text style={styles.chartEmptyText}>No data for this time range.</Text>
        </View>
      ) : (
        <>
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View>
                <Text style={styles.chartTitle}>{selectedEx?.name.toUpperCase()}</Text>
                <Text style={styles.chartSubtitle}>{metricDef.label.toUpperCase()} PER SESSION</Text>
              </View>
              {bestVal !== null && (
                <Text style={[styles.prLabel, { color: accentColor }]}>
                  BEST · {bestVal < 100 ? bestVal.toFixed(1) : Math.round(bestVal)} {effectiveUnit}
                </Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', height: CHART_H + DATE_H }}>
              {/* Y-axis */}
              <View style={{ width: Y_AXIS_W, height: CHART_H, position: 'relative' }}>
                {yTicks.map((t, i) => (
                  <Text key={i} style={{ position: 'absolute', top: t.y - 7, right: 6, fontSize: 9, color: '#444', fontWeight: '600' }}>
                    {t.label}
                  </Text>
                ))}
              </View>
              {/* Scrollable plot */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                <View style={{ width: totalW - Y_AXIS_W, height: CHART_H + DATE_H, position: 'relative' }}>
                  {/* Grid lines */}
                  {yTicks.map((t, i) => (
                    <View key={i} style={{ position: 'absolute', left: 0, top: t.y, right: 0, height: 1, backgroundColor: '#1E1D1A' }} />
                  ))}
                  {/* Lines between points */}
                  {chartPoints.map((pt, i) => {
                    if (i === chartPoints.length - 1) return null;
                    const next = chartPoints[i + 1];
                    const dx = next.x - Y_AXIS_W - (pt.x - Y_AXIS_W);
                    const dy = next.y - pt.y;
                    const length = Math.sqrt(dx * dx + dy * dy);
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    const midX = ((pt.x - Y_AXIS_W) + (next.x - Y_AXIS_W)) / 2;
                    const midY = (pt.y + next.y) / 2;
                    return (
                      <View key={i} style={{
                        position: 'absolute',
                        left: midX - length / 2,
                        top: midY - 1.5,
                        width: length, height: 3,
                        backgroundColor: accentColor, opacity: 0.7,
                        transform: [{ rotate: `${angle}deg` }],
                      }} />
                    );
                  })}
                  {/* Dots */}
                  {chartPoints.map((pt, i) => (
                    <View key={i} style={{
                      position: 'absolute',
                      left: pt.x - Y_AXIS_W - DOT_R,
                      top: pt.y - DOT_R,
                      width: DOT_R * 2, height: DOT_R * 2,
                      borderRadius: DOT_R,
                      backgroundColor: accentColor,
                    }} />
                  ))}
                  {/* Date labels */}
                  {chartPoints.map((pt, i) => (
                    <Text key={`d${i}`} style={{ position: 'absolute', top: CHART_H + 6, left: pt.x - Y_AXIS_W - 18, width: 36, textAlign: 'center', fontSize: 9, color: '#444', fontWeight: '600' }}>
                      {shortDate(pt.date)}
                    </Text>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>

          {/* Stats strip */}
          <View style={styles.statsStrip}>
            <View style={styles.statCell}>
              <Text style={[styles.statCellValue, { color: accentColor }]}>
                {bestVal !== null ? (bestVal < 100 ? bestVal.toFixed(1) : Math.round(bestVal)) : '—'}
                <Text style={styles.statCellUnit}> {effectiveUnit}</Text>
              </Text>
              <Text style={styles.statCellLabel}>BEST</Text>
            </View>
            <View style={styles.statCellDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statCellValue}>{chartData.length}</Text>
              <Text style={styles.statCellLabel}>SESSIONS</Text>
            </View>
            <View style={styles.statCellDivider} />
            <View style={styles.statCell}>
              {(() => {
                const last  = vals[vals.length - 1] ?? null;
                const prev2 = vals[vals.length - 2] ?? null;
                if (last === null || prev2 === null) return <Text style={styles.statCellValue}>—</Text>;
                const diff = last - prev2;
                return (
                  <Text style={[styles.statCellValue, diff > 0 ? styles.trendUp : diff < 0 ? styles.trendDown : {}]}>
                    {(diff >= 0 ? '+' : '') + (Math.abs(diff) < 100 ? diff.toFixed(1) : Math.round(diff))}
                  </Text>
                );
              })()}
              <Text style={styles.statCellLabel}>VS LAST</Text>
            </View>
          </View>
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────
// BODY WEIGHT VIEW
// ─────────────────────────────────────────────────────────────

function BodyView({ unit }: { unit: WeightUnit }) {
  const [entries, setEntries]     = useState<BodyWeightEntry[]>([]);
  const [chartData, setChartData] = useState<{ date: string; weightKg: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [weightInput, setWeightInput] = useState('');
  const [isLogging, setIsLogging]   = useState(false);
  const [timeRange, setTimeRange]   = useState<TimeRange>('3m');
  const timeRangeRef = useRef<TimeRange>('3m');

  useFocusEffect(useCallback(() => { load(timeRangeRef.current); }, []));

  async function load(range: TimeRange) {
    setIsLoading(true);
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<{
        id: number; date: string; weight_kg: number; logged_at: string;
      }>(`SELECT id, date, weight_kg, logged_at FROM body_weight_log ORDER BY logged_at DESC LIMIT 100`);
      setEntries(rows.map(r => ({ id: r.id, date: r.date, weightKg: r.weight_kg, loggedAt: r.logged_at })));

      let dateClause = '';
      if (range !== 'all') {
        const months = range === '1m' ? 1 : range === '3m' ? 3 : 6;
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - months);
        dateClause = `AND date >= '${cutoff.toISOString().slice(0, 10)}'`;
      }
      const chart = await db.getAllAsync<{ date: string; weight_kg: number }>(
        `SELECT date, weight_kg FROM body_weight_log
         WHERE 1=1 ${dateClause}
         GROUP BY date HAVING logged_at = MAX(logged_at)
         ORDER BY date ASC`
      );
      setChartData(chart.map(r => ({ date: r.date, weightKg: r.weight_kg })));
    } catch (e) {
      console.error('body weight load error:', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function logWeight() {
    const n = parseFloat(weightInput);
    if (!n || n <= 0) return;
    setIsLogging(true);
    try {
      const db = await getDatabase();
      const today = new Date().toISOString().slice(0, 10);
      const kg = unit === 'lbs' ? n * 0.453592 : n;
      await db.runAsync(`INSERT INTO body_weight_log (date, weight_kg) VALUES (?, ?)`, [today, kg]);
      setWeightInput('');
      await load(timeRangeRef.current);
    } catch (e) {
      console.error('log weight error:', e);
    } finally {
      setIsLogging(false);
    }
  }

  async function deleteEntry(id: number) {
    try {
      const db = await getDatabase();
      await db.runAsync(`DELETE FROM body_weight_log WHERE id = ?`, [id]);
      await load(timeRangeRef.current);
    } catch (e) {
      console.error('delete weight error:', e);
    }
  }

  function handleRange(r: TimeRange) {
    timeRangeRef.current = r;
    setTimeRange(r);
    load(r);
  }

  // Display values in user's unit
  const displayVals = chartData.map(e => unit === 'lbs' ? e.weightKg * 2.20462 : e.weightKg);
  const minV = displayVals.length ? Math.min(...displayVals) : 60;
  const maxV = displayVals.length ? Math.max(...displayVals) : 80;
  const vizPad = Math.max((maxV - minV) * 0.15, 1);
  const yMin   = Math.max(0, minV - vizPad);
  const yMax   = maxV + vizPad;
  const range2 = yMax - yMin;
  const yPad   = 16;
  const plotH  = CHART_H - yPad * 2;
  const totalW = Math.max(chartData.length * POINT_SPACING + Y_AXIS_W, 1);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    label: (yMin + t * range2).toFixed(1),
    y: CHART_H - yPad - t * plotH,
  }));

  const chartPoints = chartData.map((p, i) => {
    const v = unit === 'lbs' ? p.weightKg * 2.20462 : p.weightKg;
    return {
      x: Y_AXIS_W + i * POINT_SPACING + POINT_SPACING / 2,
      y: CHART_H - yPad - ((v - yMin) / range2) * plotH,
      date: p.date,
      value: v,
    };
  });

  const latestVal = displayVals.length ? displayVals[displayVals.length - 1] : null;
  const firstVal  = displayVals.length ? displayVals[0] : null;
  const change    = latestVal !== null && firstVal !== null ? latestVal - firstVal : null;
  const ACCENT    = '#9B6CEF';

  if (isLoading) return <View style={styles.center}><ActivityIndicator color="#EF6C3E" /></View>;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Log card */}
      <View style={styles.bwLogCard}>
        <View style={styles.bwLogRow}>
          <TextInput
            style={styles.bwLogInput}
            value={weightInput}
            onChangeText={setWeightInput}
            keyboardType="decimal-pad"
            placeholder={latestVal ? latestVal.toFixed(1) : '70.0'}
            placeholderTextColor="#333"
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={logWeight}
          />
          <Text style={styles.bwLogUnit}>{unit}</Text>
          <TouchableOpacity
            style={[styles.bwLogBtn, (!weightInput || isLogging) && { opacity: 0.4 }]}
            onPress={logWeight}
            disabled={!weightInput || isLogging}
            activeOpacity={0.85}
          >
            {isLogging
              ? <ActivityIndicator color="#0E0D0B" size="small" />
              : <Text style={styles.bwLogBtnText}>LOG</Text>
            }
          </TouchableOpacity>
        </View>
      </View>

      {/* Time range */}
      <View style={styles.timeRangeRow}>
        {(['1m', '3m', '6m', 'all'] as TimeRange[]).map(r => (
          <TouchableOpacity
            key={r}
            style={[styles.timeRangeBtn, timeRange === r && styles.timeRangeBtnActive]}
            onPress={() => handleRange(r)}
          >
            <Text style={[styles.timeRangeBtnText, timeRange === r && styles.timeRangeBtnTextActive]}>
              {r === 'all' ? 'ALL' : r.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chart */}
      {chartData.length >= 2 ? (
        <>
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View>
                <Text style={styles.chartTitle}>BODY WEIGHT</Text>
                <Text style={styles.chartSubtitle}>OVER TIME</Text>
              </View>
              {latestVal !== null && (
                <Text style={[styles.prLabel, { color: ACCENT }]}>
                  NOW · {latestVal.toFixed(1)} {unit}
                </Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', height: CHART_H + DATE_H }}>
              <View style={{ width: Y_AXIS_W, height: CHART_H, position: 'relative' }}>
                {yTicks.map((t, i) => (
                  <Text key={i} style={{ position: 'absolute', top: t.y - 7, right: 6, fontSize: 9, color: '#444', fontWeight: '600' }}>
                    {t.label}
                  </Text>
                ))}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                <View style={{ width: totalW - Y_AXIS_W, height: CHART_H + DATE_H, position: 'relative' }}>
                  {yTicks.map((t, i) => (
                    <View key={i} style={{ position: 'absolute', left: 0, top: t.y, right: 0, height: 1, backgroundColor: '#1E1D1A' }} />
                  ))}
                  {chartPoints.map((pt, i) => {
                    if (i === chartPoints.length - 1) return null;
                    const next = chartPoints[i + 1];
                    const dx = next.x - Y_AXIS_W - (pt.x - Y_AXIS_W);
                    const dy = next.y - pt.y;
                    const length = Math.sqrt(dx * dx + dy * dy);
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    const midX = ((pt.x - Y_AXIS_W) + (next.x - Y_AXIS_W)) / 2;
                    const midY = (pt.y + next.y) / 2;
                    return (
                      <View key={i} style={{
                        position: 'absolute',
                        left: midX - length / 2, top: midY - 1.5,
                        width: length, height: 3,
                        backgroundColor: ACCENT, opacity: 0.7,
                        transform: [{ rotate: `${angle}deg` }],
                      }} />
                    );
                  })}
                  {chartPoints.map((pt, i) => (
                    <View key={i} style={{
                      position: 'absolute',
                      left: pt.x - Y_AXIS_W - DOT_R, top: pt.y - DOT_R,
                      width: DOT_R * 2, height: DOT_R * 2,
                      borderRadius: DOT_R, backgroundColor: ACCENT,
                    }} />
                  ))}
                  {chartPoints.map((pt, i) => (
                    <Text key={`d${i}`} style={{ position: 'absolute', top: CHART_H + 6, left: pt.x - Y_AXIS_W - 18, width: 36, textAlign: 'center', fontSize: 9, color: '#444', fontWeight: '600' }}>
                      {shortDate(pt.date)}
                    </Text>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>

          {/* Stats strip */}
          <View style={styles.statsStrip}>
            <View style={styles.statCell}>
              <Text style={[styles.statCellValue, { color: ACCENT }]}>
                {latestVal?.toFixed(1)}
                <Text style={styles.statCellUnit}> {unit}</Text>
              </Text>
              <Text style={styles.statCellLabel}>CURRENT</Text>
            </View>
            <View style={styles.statCellDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statCellValue}>{chartData.length}</Text>
              <Text style={styles.statCellLabel}>ENTRIES</Text>
            </View>
            <View style={styles.statCellDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statCellValue}>
                {change !== null ? (change >= 0 ? '+' : '') + change.toFixed(1) : '—'}
              </Text>
              <Text style={styles.statCellLabel}>CHANGE</Text>
            </View>
          </View>
        </>
      ) : chartData.length === 1 ? (
        <View style={[styles.chartEmpty, { marginBottom: 16 }]}>
          <Text style={styles.chartEmptyText}>Log more days to see a trend.</Text>
        </View>
      ) : null}

      {/* History */}
      {entries.length > 0 ? (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 8 }]}>HISTORY</Text>
          {entries.map(e => {
            const displayW = unit === 'lbs' ? e.weightKg * 2.20462 : e.weightKg;
            return (
              <View key={e.id} style={styles.bwHistoryRow}>
                <Text style={styles.sessionDate}>{formatDate(e.date)}</Text>
                <Text style={styles.bwHistoryWeight}>{displayW.toFixed(1)} {unit}</Text>
                <TouchableOpacity onPress={() => deleteEntry(e.id)} style={styles.bwDeleteBtn} activeOpacity={0.6}>
                  <Text style={styles.bwDeleteBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </>
      ) : (
        <View style={[styles.center, { flex: 0, paddingVertical: 40 }]}>
          <Text style={styles.emptyTitle}>No entries yet</Text>
          <Text style={styles.emptySub}>Log your weight above to start tracking.</Text>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unit, setUnit] = useState<WeightUnit>('kg');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [exerciseCache, setExerciseCache] = useState<Record<number, SessionExercise[]>>({});
  const [dataMode, setDataMode] = useState<'weights' | 'cardio' | 'body'>('weights');
  const [activeTab, setActiveTab] = useState<'history' | 'charts'>('history');

  useFocusEffect(
    useCallback(() => { loadHistory(); }, [])
  );

  async function loadHistory() {
    setIsLoading(true);
    try {
      const db = await getDatabase();

      const prefs = await db.getFirstAsync<{ weight_unit: string }>(
        `SELECT weight_unit FROM user_preferences WHERE id = 1`
      );
      if (prefs?.weight_unit) setUnit(prefs.weight_unit as WeightUnit);

      const rows = await db.getAllAsync<{
        id: number; date: string; completed_at: string; duration_seconds: number | null;
        day_label: string; muscle_groups: string; split_name: string;
        total_sets: number; total_volume_kg: number;
      }>(`
        SELECT
          ws.id, ws.date, ws.completed_at, ws.duration_seconds,
          wd.label   AS day_label,
          wd.muscle_groups,
          wsp.name   AS split_name,
          COUNT(se.id)                             AS total_sets,
          COALESCE(SUM(se.weight_kg * se.reps), 0) AS total_volume_kg
        FROM workout_sessions ws
        JOIN workout_days   wd  ON wd.id  = ws.day_id
        JOIN workout_splits wsp ON wsp.id = ws.split_id
        LEFT JOIN set_entries se ON se.session_id = ws.id
        WHERE ws.completed_at IS NOT NULL
        GROUP BY ws.id
        ORDER BY ws.completed_at DESC
        LIMIT 50
      `);

      setSessions(rows.map(r => ({
        id: r.id, date: r.date, completedAt: r.completed_at,
        durationSeconds: r.duration_seconds, dayLabel: r.day_label,
        muscleGroups: r.muscle_groups ? r.muscle_groups.split(',').filter(Boolean) : [],
        splitName: r.split_name, totalSets: r.total_sets, totalVolumeKg: r.total_volume_kg,
      })));
    } catch (err) {
      console.error('loadHistory error:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSessionExercises(sessionId: number) {
    if (exerciseCache[sessionId]) return;
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<{
        exercise_id: number; exercise_name: string; muscle_group: string;
        set_number: number; reps: number; weight_kg: number; plates_count: number | null;
      }>(`
        SELECT e.id AS exercise_id, e.name AS exercise_name, e.muscle_group,
               se.set_number, se.reps, se.weight_kg, se.plates_count
        FROM set_entries se
        JOIN exercises e ON e.id = se.exercise_id
        WHERE se.session_id = ?
        ORDER BY e.name, se.set_number
      `, [sessionId]);

      const map = new Map<number, SessionExercise>();
      for (const r of rows) {
        if (!map.has(r.exercise_id)) {
          map.set(r.exercise_id, { exerciseId: r.exercise_id, name: r.exercise_name, muscleGroup: r.muscle_group, sets: [] });
        }
        map.get(r.exercise_id)!.sets.push({
          setNumber: r.set_number, reps: r.reps,
          weightKg: r.weight_kg, platesCount: r.plates_count ?? null,
        });
      }
      setExerciseCache(prev => ({ ...prev, [sessionId]: Array.from(map.values()) }));
    } catch (err) {
      console.error('loadSessionExercises error:', err);
      setExerciseCache(prev => ({ ...prev, [sessionId]: [] }));
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>TORVUS</Text>
          <Text style={styles.title}>Progress</Text>
        </View>
        {activeTab === 'history' && sessions.length > 0 && (
          <View style={styles.sessionCount}>
            <Text style={styles.sessionCountText}>{sessions.length} sessions</Text>
          </View>
        )}
      </View>

      {/* AI Weekly Insights banner */}
      <TouchableOpacity
        style={styles.insightsBanner}
        onPress={() => router.push('/progress/weekly-insights')}
        activeOpacity={0.75}
      >
        <Text style={styles.insightsBannerIcon}>💡</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.insightsBannerTitle}>AI WEEKLY INSIGHTS</Text>
          <Text style={styles.insightsBannerSub}>Get a personalised review of your week</Text>
        </View>
        <Text style={styles.insightsBannerChevron}>›</Text>
      </TouchableOpacity>

      {/* WEIGHTS / CARDIO / BODY toggle */}
      <View style={[styles.segmentBar, { borderBottomWidth: 0 }]}>
        {(['weights', 'cardio', 'body'] as const).map(mode => (
          <TouchableOpacity
            key={mode}
            style={[styles.segment, dataMode === mode && styles.segmentActive]}
            onPress={() => setDataMode(mode)}
          >
            <Text style={[styles.segmentText, dataMode === mode && styles.segmentTextActive]}>
              {mode.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* HISTORY / CHARTS sub-tabs (weights and cardio only) */}
      {(dataMode === 'weights' || dataMode === 'cardio') && (
        <View style={styles.segmentBar}>
          {(['history', 'charts'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.segment, activeTab === tab && styles.segmentActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.segmentText, activeTab === tab && styles.segmentTextActive]}>
                {tab.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Content */}
      {dataMode === 'body' ? (
        <BodyView unit={unit} />
      ) : dataMode === 'cardio' ? (
        activeTab === 'charts' ? (
          <CardioChartsView />
        ) : (
          <CardioHistoryView />
        )
      ) : activeTab === 'charts' ? (
        <ChartsView unit={unit} />
      ) : isLoading ? (
        <View style={styles.center}><ActivityIndicator color="#EF6C3E" size="large" /></View>
      ) : sessions.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>▲</Text>
          <Text style={styles.emptyTitle}>No sessions yet</Text>
          <Text style={styles.emptySub}>Complete a workout to see your history here.</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {sessions.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              unit={unit}
              isExpanded={expandedId === session.id}
              onToggle={() => setExpandedId(prev => prev === session.id ? null : session.id)}
              exercises={exerciseCache[session.id] ?? null}
              onExpand={() => loadSessionExercises(session.id)}
            />
          ))}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0E0D0B' },

  // ── Header ──────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#1E1D1A',
  },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 3, color: '#EF6C3E' },
  title: { fontSize: 24, fontWeight: '800', color: '#F2F0EB' },
  sessionCount: {
    backgroundColor: '#1A1714', borderWidth: 1, borderColor: '#2A2926',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  sessionCountText: { fontSize: 11, fontWeight: '700', color: '#555', letterSpacing: 0.5 },

  // ── AI Insights banner ───────────────────────────────────
  insightsBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#EF6C3E0D', borderBottomWidth: 1, borderBottomColor: '#EF6C3E22',
  },
  insightsBannerIcon:    { fontSize: 18 },
  insightsBannerTitle:   { fontSize: 9, fontWeight: '800', letterSpacing: 1.5, color: '#EF6C3E' },
  insightsBannerSub:     { fontSize: 11, color: '#555', marginTop: 1 },
  insightsBannerChevron: { fontSize: 18, color: '#444' },

  // ── Segment control ──────────────────────────────────────
  segmentBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1E1D1A' },
  segment: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  segmentActive: { borderBottomColor: '#EF6C3E' },
  segmentText: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: '#444' },
  segmentTextActive: { color: '#EF6C3E' },

  // ── Common ───────────────────────────────────────────────
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { fontSize: 36, color: '#EF6C3E', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#F2F0EB', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 20 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  // ── Session card (History) ───────────────────────────────
  sessionCard: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 14, marginBottom: 10, overflow: 'hidden', flexDirection: 'row',
  },
  sessionAccent: { width: 3 },
  sessionCardInner: { flex: 1 },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, paddingLeft: 12 },
  sessionHeaderLeft: { flex: 1, marginRight: 8 },
  sessionTopRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  sessionDate: { fontSize: 11, fontWeight: '700', color: '#F2F0EB', letterSpacing: 0.2 },
  sessionDot: { fontSize: 10, color: '#333' },
  sessionDuration: { fontSize: 11, color: '#555' },
  sessionSplitName: { fontSize: 11, color: '#555' },
  sessionDayLabel: { fontSize: 17, fontWeight: '800', color: '#F2F0EB', marginBottom: 8 },
  sessionMgRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sessionMgDot: { width: 7, height: 7, borderRadius: 3.5 },
  sessionMgMore: { fontSize: 10, color: '#555' },
  sessionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionStats: { alignItems: 'center' },
  sessionStatValue: { fontSize: 15, fontWeight: '800', color: '#F2F0EB' },
  sessionStatLabel: { fontSize: 8, fontWeight: '700', letterSpacing: 1.2, color: '#555', marginTop: 1 },
  sessionChevron: { fontSize: 20, color: '#444', lineHeight: 24, transform: [{ rotate: '0deg' }] },
  sessionChevronOpen: { transform: [{ rotate: '90deg' }], color: '#EF6C3E' },
  sessionDetail: { paddingHorizontal: 14, paddingBottom: 14 },
  sessionDetailDivider: { height: 1, backgroundColor: '#1E1D1A', marginBottom: 12 },
  noSetsText: { fontSize: 13, color: '#555', paddingVertical: 8 },
  exGroup: { marginBottom: 12 },
  exGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  exGroupDot: { width: 7, height: 7, borderRadius: 3.5 },
  exGroupName: { fontSize: 13, fontWeight: '700', color: '#F2F0EB' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, marginBottom: 3 },
  setNum: { fontSize: 11, fontWeight: '700', color: '#444', width: 16, textAlign: 'right' },
  setDetail: { fontSize: 13, color: '#777' },

  // ── Charts: filter toggle ────────────────────────────────
  filterToggle: {
    flexDirection: 'row', backgroundColor: '#141311',
    borderWidth: 1, borderColor: '#252320', borderRadius: 10,
    overflow: 'hidden', marginBottom: 12,
  },
  filterToggleBtn: { flex: 1, paddingVertical: 9, alignItems: 'center' },
  filterToggleBtnActive: { backgroundColor: '#EF6C3E18' },
  filterToggleText: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: '#555' },
  filterToggleTextActive: { color: '#EF6C3E' },

  // ── Charts: filter chips ─────────────────────────────────
  filterChipsRow: { gap: 7, paddingBottom: 14, paddingRight: 4 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: '#2A2926', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#141311',
  },
  filterChipActive: { borderColor: '#EF6C3E', backgroundColor: '#EF6C3E22' },
  filterChipDot: { width: 5, height: 5, borderRadius: 2.5 },
  filterChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: '#555' },
  filterChipTextActive: { color: '#EF6C3E' },

  helperText: { fontSize: 13, color: '#555', marginBottom: 12 },

  // ── Charts: exercise picker ──────────────────────────────
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2.5, color: '#555', marginBottom: 10 },
  exPickerRow: { gap: 7, paddingBottom: 16, paddingRight: 4 },
  exPickerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#2A2926', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#141311',
  },
  exPickerDot: { width: 5, height: 5, borderRadius: 2.5 },
  exPickerText: { fontSize: 12, fontWeight: '600', color: '#555' },

  // ── Charts: time range ───────────────────────────────────
  timeRangeRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  timeRangeBtn: {
    flex: 1, paddingVertical: 8, alignItems: 'center',
    borderWidth: 1, borderColor: '#2A2926', borderRadius: 8, backgroundColor: '#141311',
  },
  timeRangeBtnActive: { borderColor: '#EF6C3E', backgroundColor: '#EF6C3E18' },
  timeRangeBtnText: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: '#555' },
  timeRangeBtnTextActive: { color: '#EF6C3E' },

  // ── Charts: base weight ──────────────────────────────────
  baseWeightRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 12,
  },
  baseWeightTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: '#555' },
  baseWeightSub: { fontSize: 10, color: '#3A3835', marginTop: 2 },
  baseWeightInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  baseWeightInput: {
    backgroundColor: '#0E0D0B', borderWidth: 1, borderColor: '#2A2926',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
    fontSize: 15, fontWeight: '700', color: '#F2F0EB', textAlign: 'center', width: 72,
  },
  baseWeightUnit: { fontSize: 11, fontWeight: '700', color: '#555' },

  // ── Charts: line chart ───────────────────────────────────
  chartCard: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 14, paddingTop: 14, paddingBottom: 10, marginBottom: 12, overflow: 'hidden',
  },
  chartHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 14, marginBottom: 14,
  },
  chartTitle: { fontSize: 13, fontWeight: '800', color: '#F2F0EB', marginBottom: 2 },
  chartSubtitle: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: '#555' },
  prLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  chartBody: { flexDirection: 'row', paddingLeft: 8, paddingRight: 14 },
  yAxisLabel: { fontSize: 9, fontWeight: '600', color: '#444', textAlign: 'right' },

  chartEmpty: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 14, padding: 28, alignItems: 'center', marginBottom: 12,
  },
  chartEmptyText: { fontSize: 14, color: '#555' },

  // ── Charts: stats strip ──────────────────────────────────
  statsStrip: {
    flexDirection: 'row', backgroundColor: '#141311',
    borderWidth: 1, borderColor: '#252320', borderRadius: 14,
    paddingVertical: 16, marginBottom: 8,
  },
  statCell: { flex: 1, alignItems: 'center' },
  statCellValue: { fontSize: 18, fontWeight: '800', color: '#F2F0EB' },
  statCellUnit: { fontSize: 12, fontWeight: '700', color: '#F2F0EB' },
  statCellLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: '#555', marginTop: 3 },
  statCellDivider: { width: 1, backgroundColor: '#1E1D1A', marginVertical: 4 },
  trendUp: { color: '#6CEF3E' },
  trendDown: { color: '#EF3E7A' },

  // ── Body weight view ─────────────────────────────────────
  bwLogCard: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 14, marginBottom: 16, overflow: 'hidden',
  },
  bwLogRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  bwLogInput: {
    fontSize: 42, fontWeight: '800', color: '#F2F0EB',
    flex: 1, padding: 0,
  },
  bwLogUnit: { fontSize: 16, color: '#555', fontWeight: '600' },
  bwLogBtn: {
    backgroundColor: '#EF6C3E', borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  bwLogBtnText: { fontSize: 13, fontWeight: '800', letterSpacing: 1, color: '#0E0D0B' },
  bwHistoryRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8,
  },
  bwHistoryWeight: {
    fontSize: 17, fontWeight: '800', color: '#F2F0EB',
    flex: 1, textAlign: 'right', marginRight: 8,
  },
  bwDeleteBtn: { padding: 6 },
  bwDeleteBtnText: { fontSize: 14, color: '#444', fontWeight: '700' },
});
