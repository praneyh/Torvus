// ============================================================
// TORVUS — Cardio Session Logger
// app/gym/cardio.tsx
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, Platform, ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { router } from 'expo-router';
import { getDatabase } from '../../schema';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface CardioExercise {
  id: number;
  name: string;
  category: string;
  is_preset: number;
  is_custom: number;
  has_distance: number;
  has_speed: number;
  has_incline: number;
  has_resistance: number;
  has_rpm: number;
  has_pace: number;
  has_laps: number;
  has_rounds: number;
  custom_metric_1_name: string | null;
  custom_metric_2_name: string | null;
  met_value: number;
}

type HrMode = 'avg' | 'range';

// ─────────────────────────────────────────────────────────────
// CALORIE ESTIMATION
// ─────────────────────────────────────────────────────────────

function estimateCalories(
  durationSeconds: number,
  metValue: number,
  weightKg: number | null,
  hrAvg: number | null,
): { calories: number; confidence: number } {
  const durationMin = durationSeconds / 60;
  if (durationMin <= 0) return { calories: 0, confidence: 0 };

  if (hrAvg && hrAvg > 0 && weightKg && weightKg > 0) {
    // Keytel formula (male approx.) — best available without gender/age
    const kcalPerMin = Math.max(0, (0.6309 * hrAvg + 0.09036 * weightKg - 55.0969) / 4.184);
    return { calories: Math.round(kcalPerMin * durationMin), confidence: 0.82 };
  }

  const refWeight = weightKg ?? 70;
  const calories  = metValue * refWeight * (durationMin / 60);
  const confidence = weightKg ? 0.60 : 0.30;
  return { calories: Math.round(calories), confidence };
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  machine: 'Machine', outdoor: 'Outdoor', sport: 'Sport / Other', custom: 'Custom',
};

const CATEGORY_ORDER = ['machine', 'outdoor', 'sport', 'custom'];

function parseDuration(minStr: string, secStr: string): number {
  const m = parseInt(minStr) || 0;
  const s = parseInt(secStr) || 0;
  return m * 60 + s;
}

function formatConfidence(c: number): string {
  if (c >= 0.8) return 'HIGH';
  if (c >= 0.55) return 'MED';
  return 'LOW';
}

function confColor(c: number): string {
  if (c >= 0.8) return '#6CEF3E';
  if (c >= 0.55) return '#EF9B3E';
  return '#EF3E7A';
}

// ─────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────

export default function CardioScreen() {
  const [exercises, setExercises] = useState<CardioExercise[]>([]);
  const [selected, setSelected]   = useState<CardioExercise | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving]   = useState(false);
  const [userWeightKg, setUserWeightKg] = useState<number | null>(null);
  const [distUnit, setDistUnit] = useState<'km' | 'mi'>('km');

  // Duration
  const [durMin, setDurMin] = useState('');
  const [durSec, setDurSec] = useState('');

  // Metrics
  const [distanceKm, setDistanceKm]     = useState('');
  const [speedKmh, setSpeedKmh]         = useState('');
  const [inclinePct, setInclinePct]     = useState('');
  const [resistance, setResistance]     = useState('');
  const [rpm, setRpm]                   = useState('');
  const [paceSec, setPaceSec]           = useState('');
  const [laps, setLaps]                 = useState('');
  const [rounds, setRounds]             = useState('');
  const [custom1, setCustom1]           = useState('');
  const [custom2, setCustom2]           = useState('');

  // Heart rate
  const [hrEnabled, setHrEnabled] = useState(false);
  const [hrMode, setHrMode]       = useState<HrMode>('avg');
  const [hrAvg, setHrAvg]         = useState('');
  const [hrMin, setHrMin]         = useState('');
  const [hrMax, setHrMax]         = useState('');

  // Notes
  const [notes, setNotes] = useState('');

  // ── Load ────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const db = await getDatabase();
        const rows = await db.getAllAsync<CardioExercise>(
          `SELECT * FROM cardio_exercises ORDER BY is_preset DESC, name ASC`
        );
        setExercises(rows);

        const prefs = await db.getFirstAsync<{ body_weight_kg: number | null; weight_unit: string | null }>(
          `SELECT body_weight_kg, weight_unit FROM user_preferences WHERE id = 1`
        );
        setUserWeightKg(prefs?.body_weight_kg ?? null);
        setDistUnit(prefs?.weight_unit === 'lbs' ? 'mi' : 'km');

        if (rows.length > 0) setSelected(rows[0]);
      } catch (e) {
        console.error('cardio load error:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // ── Calorie estimate (live) ──────────────────────────────

  const durationSeconds = parseDuration(durMin, durSec);

  const effectiveHr: number | null = (() => {
    if (!hrEnabled) return null;
    if (hrMode === 'avg') {
      const v = parseInt(hrAvg);
      return isNaN(v) ? null : v;
    }
    const mn = parseInt(hrMin);
    const mx = parseInt(hrMax);
    if (isNaN(mn) && isNaN(mx)) return null;
    if (isNaN(mn)) return mx;
    if (isNaN(mx)) return mn;
    return Math.round((mn + mx) / 2);
  })();

  const estimate = selected
    ? estimateCalories(durationSeconds, selected.met_value, userWeightKg, effectiveHr)
    : null;

  // ── Save ────────────────────────────────────────────────

  async function save() {
    if (!selected || durationSeconds < 30) return;
    setIsSaving(true);
    try {
      const db = await getDatabase();
      const today = new Date().toISOString().slice(0, 10);
      const now   = new Date().toISOString();

      const hrType = hrEnabled ? hrMode : null;
      const hrAvgVal = hrEnabled && hrMode === 'avg' ? (parseInt(hrAvg) || null) : null;
      const hrMinVal = hrEnabled && hrMode === 'range' ? (parseInt(hrMin) || null) : null;
      const hrMaxVal = hrEnabled && hrMode === 'range' ? (parseInt(hrMax) || null) : null;
      const cal = estimate && durationSeconds > 0 ? estimate.calories : null;
      const conf = estimate && durationSeconds > 0 ? estimate.confidence : null;

      // distance/speed: user enters in distUnit, stored always as km/km/h
      const toMetricDist = (v: string) => {
        const n = parseFloat(v);
        if (!n) return null;
        return distUnit === 'mi' ? n * 1.60934 : n;
      };
      // pace stored as s/km; user enters s/mi when distUnit==='mi'
      const toPaceSeckm = (v: string) => {
        const n = parseFloat(v);
        if (!n) return null;
        return distUnit === 'mi' ? n / 1.60934 : n;
      };

      await db.runAsync(
        `INSERT INTO cardio_sessions
           (cardio_exercise_id, date, duration_seconds,
            distance_km, avg_speed_kmh, avg_incline_pct, resistance_level,
            avg_rpm, avg_pace_sec_per_km, laps, rounds,
            custom_metric_1_val, custom_metric_2_val,
            hr_type, hr_avg, hr_min, hr_max,
            calories_burned, calories_confidence, notes, logged_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          selected.id, today, durationSeconds,
          toMetricDist(distanceKm),
          toMetricDist(speedKmh),
          parseFloat(inclinePct)  || null,
          parseInt(resistance)    || null,
          parseFloat(rpm)         || null,
          toPaceSeckm(paceSec),
          parseInt(laps)          || null,
          parseInt(rounds)        || null,
          parseFloat(custom1)     || null,
          parseFloat(custom2)     || null,
          hrType, hrAvgVal, hrMinVal, hrMaxVal,
          cal, conf,
          notes.trim() || null, now,
        ]
      );

      router.back();
    } catch (e) {
      console.error('cardio save error:', e);
    } finally {
      setIsSaving(false);
    }
  }

  // ── Grouped exercises ───────────────────────────────────

  const grouped: Record<string, CardioExercise[]> = {};
  for (const ex of exercises) {
    const cat = ex.category ?? 'custom';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(ex);
  }

  // ── Render ──────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color="#EF6C3E" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>LOG CARDIO</Text>
          <View style={{ width: 64 }} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Exercise Picker ──────────────────────────── */}
          <SectionLabel label="EXERCISE" />
          {CATEGORY_ORDER.map(cat => {
            const items = grouped[cat];
            if (!items?.length) return null;
            return (
              <View key={cat} style={{ marginBottom: 8 }}>
                <Text style={styles.catLabel}>{CATEGORY_LABELS[cat]}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingHorizontal: 0, paddingVertical: 4 }}
                >
                  {items.map(ex => {
                    const isActive = selected?.id === ex.id;
                    return (
                      <TouchableOpacity
                        key={ex.id}
                        style={[styles.exChip, isActive && styles.exChipActive]}
                        onPress={() => setSelected(ex)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.exChipText, isActive && styles.exChipTextActive]}>
                          {ex.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            );
          })}

          {/* ── Duration ────────────────────────────────── */}
          <SectionLabel label="DURATION (REQUIRED)" />
          <View style={styles.card}>
            <View style={styles.durationRow}>
              <View style={styles.durationField}>
                <TextInput
                  style={styles.durationInput}
                  value={durMin}
                  onChangeText={setDurMin}
                  placeholder="30"
                  placeholderTextColor="#444"
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <Text style={styles.durationUnit}>min</Text>
              </View>
              <Text style={styles.durationColon}>:</Text>
              <View style={styles.durationField}>
                <TextInput
                  style={styles.durationInput}
                  value={durSec}
                  onChangeText={setDurSec}
                  placeholder="00"
                  placeholderTextColor="#444"
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <Text style={styles.durationUnit}>sec</Text>
              </View>
            </View>
          </View>

          {/* ── Exercise Metrics ─────────────────────────── */}
          {selected && (
            selected.has_distance + selected.has_speed + selected.has_incline +
            selected.has_resistance + selected.has_rpm + selected.has_pace +
            selected.has_laps + selected.has_rounds > 0
          ) && (
            <>
              <SectionLabel label="METRICS (OPTIONAL)" />
              <View style={styles.card}>
                {selected?.has_distance  ? <MetricInput label="Distance" unit={distUnit}                    value={distanceKm}  onChange={setDistanceKm}  last={false} onUnitPress={() => setDistUnit(u => u === 'km' ? 'mi' : 'km')} /> : null}
                {selected?.has_speed     ? <MetricInput label="Avg Speed" unit={distUnit === 'km' ? 'km/h' : 'mph'} value={speedKmh}    onChange={setSpeedKmh}    last={false} /> : null}
                {selected?.has_incline   ? <MetricInput label="Incline"   unit="%"    value={inclinePct}  onChange={setInclinePct}  last={false} /> : null}
                {selected?.has_resistance? <MetricInput label="Resistance" unit="lvl" value={resistance}  onChange={setResistance}  last={false} /> : null}
                {selected?.has_rpm       ? <MetricInput label="Avg RPM"   unit="rpm"  value={rpm}         onChange={setRpm}         last={false} /> : null}
                {selected?.has_pace      ? <MetricInput label="Avg Pace"  unit={distUnit === 'km' ? 's/km' : 's/mi'} value={paceSec} onChange={setPaceSec} last={false} /> : null}
                {selected?.has_laps      ? <MetricInput label="Laps"      unit=""     value={laps}        onChange={setLaps}        last={false} /> : null}
                {selected?.has_rounds    ? <MetricInput label="Rounds"    unit=""     value={rounds}      onChange={setRounds}      last={true}  /> : null}
                {selected?.custom_metric_1_name ? (
                  <MetricInput label={selected.custom_metric_1_name} unit="" value={custom1} onChange={setCustom1} last={!selected.custom_metric_2_name} />
                ) : null}
                {selected?.custom_metric_2_name ? (
                  <MetricInput label={selected.custom_metric_2_name} unit="" value={custom2} onChange={setCustom2} last={true} />
                ) : null}
              </View>
            </>
          )}

          {/* ── Heart Rate ───────────────────────────────── */}
          <SectionLabel label="HEART RATE" />
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.hrToggleRow}
              onPress={() => setHrEnabled(v => !v)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.hrToggleLabel}>Track heart rate</Text>
                <Text style={styles.hrToggleSub}>Improves calorie estimate accuracy</Text>
              </View>
              <View style={[styles.toggle, hrEnabled && styles.toggleOn]}>
                <View style={[styles.toggleKnob, hrEnabled && styles.toggleKnobOn]} />
              </View>
            </TouchableOpacity>

            {hrEnabled && (
              <>
                <View style={styles.divider} />
                <View style={styles.hrModeRow}>
                  {(['avg', 'range'] as HrMode[]).map(m => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.hrModeBtn, hrMode === m && styles.hrModeBtnActive]}
                      onPress={() => setHrMode(m)}
                    >
                      <Text style={[styles.hrModeBtnText, hrMode === m && styles.hrModeBtnTextActive]}>
                        {m === 'avg' ? 'AVERAGE' : 'MIN / MAX'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.hrInputRow}>
                  {hrMode === 'avg' ? (
                    <View style={styles.hrField}>
                      <TextInput
                        style={styles.hrInput}
                        value={hrAvg}
                        onChangeText={setHrAvg}
                        placeholder="140"
                        placeholderTextColor="#444"
                        keyboardType="number-pad"
                        maxLength={3}
                      />
                      <Text style={styles.hrUnit}>bpm avg</Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.hrField}>
                        <TextInput
                          style={styles.hrInput}
                          value={hrMin}
                          onChangeText={setHrMin}
                          placeholder="120"
                          placeholderTextColor="#444"
                          keyboardType="number-pad"
                          maxLength={3}
                        />
                        <Text style={styles.hrUnit}>bpm min</Text>
                      </View>
                      <Text style={styles.hrSep}>—</Text>
                      <View style={styles.hrField}>
                        <TextInput
                          style={styles.hrInput}
                          value={hrMax}
                          onChangeText={setHrMax}
                          placeholder="160"
                          placeholderTextColor="#444"
                          keyboardType="number-pad"
                          maxLength={3}
                        />
                        <Text style={styles.hrUnit}>bpm max</Text>
                      </View>
                    </>
                  )}
                </View>
              </>
            )}
          </View>

          {/* ── Calorie Estimate ─────────────────────────── */}
          {estimate !== null && durationSeconds >= 30 && (
            <>
              <SectionLabel label="ESTIMATED CALORIES" />
              <View style={[styles.card, styles.calCard]}>
                <Text style={styles.calValue}>{estimate.calories}</Text>
                <Text style={styles.calUnit}>kcal</Text>
                <View style={[styles.confBadge, { backgroundColor: confColor(estimate.confidence) + '22', borderColor: confColor(estimate.confidence) + '66' }]}>
                  <Text style={[styles.confText, { color: confColor(estimate.confidence) }]}>
                    {formatConfidence(estimate.confidence)} CONFIDENCE
                  </Text>
                </View>
                {!userWeightKg && (
                  <Text style={styles.calNote}>
                    Add your weight in Profile for a more accurate estimate.
                  </Text>
                )}
              </View>
            </>
          )}

          {/* ── Notes ───────────────────────────────────── */}
          <SectionLabel label="NOTES" />
          <View style={styles.card}>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="How did it feel?"
              placeholderTextColor="#444"
              multiline
              numberOfLines={3}
            />
          </View>

          {/* ── Log Button ───────────────────────────────── */}
          <TouchableOpacity
            style={[
              styles.logBtn,
              (durationSeconds < 30 || isSaving) && styles.logBtnDisabled,
            ]}
            onPress={save}
            disabled={durationSeconds < 30 || isSaving}
          >
            {isSaving
              ? <ActivityIndicator color="#0E0D0B" />
              : <Text style={styles.logBtnText}>LOG SESSION</Text>
            }
          </TouchableOpacity>
          {durationSeconds < 30 && (durMin !== '' || durSec !== '') && (
            <Text style={styles.durationWarn}>Minimum 30 seconds required</Text>
          )}

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

interface MetricInputProps {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  last: boolean;
  onUnitPress?: () => void;
}

function MetricInput({ label, unit, value, onChange, last, onUnitPress }: MetricInputProps) {
  return (
    <View style={[styles.metricRow, !last && styles.metricRowBorder]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricInputWrap}>
        <TextInput
          style={styles.metricInput}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder="—"
          placeholderTextColor="#444"
          selectTextOnFocus
        />
        {unit ? (
          onUnitPress ? (
            <TouchableOpacity onPress={onUnitPress} style={styles.metricUnitBtn} activeOpacity={0.7}>
              <Text style={styles.metricUnitBtnText}>{unit}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.metricUnit}>{unit}</Text>
          )
        ) : null}
      </View>
    </View>
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
  backBtn: { paddingVertical: 4, paddingRight: 12 },
  backBtnText: { fontSize: 16, color: '#EF6C3E', fontWeight: '600' },
  headerTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 2, color: '#F2F0EB' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  sectionLabel: {
    fontSize: 9, fontWeight: '700', letterSpacing: 2.5, color: '#555',
    marginBottom: 8, marginTop: 4,
  },

  catLabel: {
    fontSize: 10, fontWeight: '600', letterSpacing: 1.5, color: '#3A3835', marginBottom: 4,
  },

  exChip: {
    borderWidth: 1, borderColor: '#252320', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#141311',
  },
  exChipActive: { borderColor: '#EF6C3E', backgroundColor: '#EF6C3E18' },
  exChipText: { fontSize: 13, fontWeight: '600', color: '#666' },
  exChipTextActive: { color: '#EF6C3E', fontWeight: '700' },

  card: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 14, marginBottom: 20, overflow: 'hidden',
  },

  // Duration
  durationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 16 },
  durationField: { alignItems: 'center' },
  durationInput: {
    fontSize: 42, fontWeight: '800', color: '#F2F0EB',
    textAlign: 'center', minWidth: 80, padding: 0,
  },
  durationUnit: { fontSize: 11, color: '#555', fontWeight: '600', letterSpacing: 1, marginTop: 4 },
  durationColon: { fontSize: 36, color: '#333', fontWeight: '300', marginBottom: 16 },

  divider: { height: 1, backgroundColor: '#1E1D1A' },

  // Metric rows
  metricRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  metricRowBorder: { borderBottomWidth: 1, borderBottomColor: '#1E1D1A' },
  metricLabel: { fontSize: 14, color: '#C0BEB9', fontWeight: '500', flex: 1 },
  metricInputWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  metricInput: {
    fontSize: 20, fontWeight: '700', color: '#F2F0EB',
    textAlign: 'right', minWidth: 60, padding: 0,
  },
  metricUnit: { fontSize: 12, color: '#555', fontWeight: '600' },
  metricUnitBtn: {
    backgroundColor: '#1E1D1A', borderWidth: 1, borderColor: '#EF6C3E55',
    borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3,
  },
  metricUnitBtnText: { fontSize: 11, color: '#EF6C3E', fontWeight: '800', letterSpacing: 0.5 },

  // Heart rate
  hrToggleRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  hrToggleLabel: { fontSize: 14, fontWeight: '600', color: '#F2F0EB' },
  hrToggleSub: { fontSize: 11, color: '#555', marginTop: 2 },
  toggle: {
    width: 44, height: 24, borderRadius: 12,
    backgroundColor: '#252320', justifyContent: 'center', padding: 2,
  },
  toggleOn: { backgroundColor: '#EF6C3E' },
  toggleKnob: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: '#555',
  },
  toggleKnobOn: { backgroundColor: '#0E0D0B', alignSelf: 'flex-end' },

  hrModeRow: { flexDirection: 'row', gap: 8, padding: 12 },
  hrModeBtn: {
    flex: 1, borderWidth: 1, borderColor: '#252320', borderRadius: 8,
    paddingVertical: 8, alignItems: 'center',
  },
  hrModeBtnActive: { borderColor: '#EF6C3E', backgroundColor: '#EF6C3E18' },
  hrModeBtnText: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#555' },
  hrModeBtnTextActive: { color: '#EF6C3E' },

  hrInputRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 20, paddingBottom: 16, gap: 12,
  },
  hrField: { alignItems: 'center', flex: 1 },
  hrInput: {
    fontSize: 36, fontWeight: '800', color: '#F2F0EB',
    textAlign: 'center', padding: 0, minWidth: 80,
  },
  hrUnit: { fontSize: 10, color: '#555', fontWeight: '600', letterSpacing: 1, marginTop: 2 },
  hrSep: { fontSize: 24, color: '#333', fontWeight: '300' },

  // Calories
  calCard: {
    alignItems: 'center', flexDirection: 'row',
    paddingHorizontal: 20, paddingVertical: 16, gap: 12, flexWrap: 'wrap',
  },
  calValue: { fontSize: 40, fontWeight: '900', color: '#EF6C3E' },
  calUnit: { fontSize: 16, color: '#555', fontWeight: '600', alignSelf: 'flex-end', marginBottom: 6 },
  confBadge: {
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  confText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  calNote: {
    width: '100%', fontSize: 11, color: '#555', marginTop: 4, lineHeight: 16,
  },

  // Notes
  notesInput: {
    fontSize: 14, color: '#F2F0EB', padding: 16,
    minHeight: 80, textAlignVertical: 'top',
  },

  // Log button
  logBtn: {
    backgroundColor: '#EF6C3E', borderRadius: 14,
    paddingVertical: 18, alignItems: 'center', marginBottom: 8,
  },
  logBtnDisabled: { opacity: 0.4 },
  logBtnText: { fontSize: 14, fontWeight: '800', letterSpacing: 1.5, color: '#0E0D0B' },
  durationWarn: { fontSize: 11, color: '#EF3E7A', textAlign: 'center', marginBottom: 8 },
});
