// ============================================================
// TORVUS — AI Nutrition Targets Screen
// app/nutrition/ai-targets.tsx
//
// Premium feature: calculates personalised TDEE and macro
// targets using Claude, then lets the user apply them directly
// to their nutrition goals.
// ============================================================

import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, Platform, ActivityIndicator,
  Alert, KeyboardAvoidingView,
} from 'react-native';
import { router } from 'expo-router';
import { getDatabase } from '../../schema';
import { supabase, SUPABASE_URL } from '../../src/lib/supabase';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
type FitnessGoal  = 'bulking' | 'cutting' | 'maintaining';

interface TargetsResult {
  tdee:        number;
  calories:    number;
  protein_g:   number;
  carbs_g:     number;
  fat_g:       number;
  fiber_g:     number;
  sodium_mg:   number;
  explanation: string;
}

type Step = 'loading' | 'paywall' | 'input' | 'calculating' | 'result';

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary:  'Sedentary (desk job, little exercise)',
  light:      'Light (1-3 days/week)',
  moderate:   'Moderate (3-5 days/week)',
  active:     'Very Active (6-7 days/week)',
  very_active: 'Extremely Active (physical job + daily training)',
};

const GOAL_LABELS: Record<FitnessGoal, string> = {
  bulking:     'Bulking',
  maintaining: 'Maintaining',
  cutting:     'Cutting',
};

// ─────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────

export default function AITargetsScreen() {
  const [step, setStep]             = useState<Step>('loading');
  const [result, setResult]         = useState<TargetsResult | null>(null);
  const [calcCount, setCalcCount]   = useState(0);

  // Form fields
  const [weightKg, setWeightKg]         = useState('');
  const [heightCm, setHeightCm]         = useState('');
  const [ageYears, setAgeYears]         = useState('');
  const [fitnessGoal, setFitnessGoal]   = useState<FitnessGoal>('maintaining');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [weightUnit, setWeightUnit]     = useState<'kg' | 'lbs'>('kg');

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) { setStep('paywall'); return; }

        const { data: profile } = await supabase
          .from('profiles')
          .select('is_premium')
          .eq('id', session.user.id)
          .single();

        if (!profile?.is_premium) { setStep('paywall'); return; }

        // Check today's usage
        const today = new Date().toISOString().slice(0, 10);
        const { data: usage } = await supabase
          .from('ai_usage')
          .select('request_count')
          .eq('user_id', session.user.id)
          .eq('date', today)
          .eq('feature', 'nutrition_targets')
          .single();
        setCalcCount(usage?.request_count ?? 0);

        // Pre-fill from profile
        const db = await getDatabase();
        const prefs = await db.getFirstAsync<{
          body_weight_kg: number | null;
          height_cm: number | null;
          fitness_goal: string;
          weight_unit: string;
        }>(`SELECT body_weight_kg, height_cm, fitness_goal, weight_unit FROM user_preferences WHERE id = 1`);

        if (prefs?.body_weight_kg) {
          const unit = prefs.weight_unit as 'kg' | 'lbs';
          setWeightUnit(unit);
          const disp = unit === 'lbs'
            ? String(Math.round(prefs.body_weight_kg * 2.20462 * 10) / 10)
            : String(prefs.body_weight_kg);
          setWeightKg(disp);
        }
        if (prefs?.height_cm) setHeightCm(String(Math.round(prefs.height_cm)));
        if (prefs?.fitness_goal) setFitnessGoal(prefs.fitness_goal as FitnessGoal);

        setStep('input');
      } catch {
        setStep('input');
      }
    })();
  }, []);

  async function calculate() {
    if (calcCount >= 3) {
      Alert.alert('Daily limit reached', 'You\'ve used all 3 AI target calculations for today. Resets at midnight.');
      return;
    }

    const wKg = weightUnit === 'lbs'
      ? (parseFloat(weightKg) || 0) * 0.453592
      : parseFloat(weightKg) || 0;
    const hCm = parseFloat(heightCm) || 0;

    if (wKg < 20 || hCm < 100) {
      Alert.alert('Missing info', 'Please enter your weight and height to calculate targets.');
      return;
    }

    setStep('calculating');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw { code: 'unauthorized' };

      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-nutrition-targets`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          weightKg:      wKg,
          heightCm:      hCm,
          ageYears:      parseFloat(ageYears) || null,
          fitnessGoal,
          activityLevel,
        }),
      });

      const body = await res.json();
      if (!res.ok) throw { code: body?.error ?? 'unknown' };

      setResult(body as TargetsResult);
      setCalcCount(n => n + 1);
      setStep('result');
    } catch (e: any) {
      const code = e?.code ?? '';
      if (code === 'subscription_required') {
        setStep('paywall');
      } else if (code === 'daily_limit_reached') {
        Alert.alert('Daily limit reached', 'You\'ve used all 3 calculations for today.');
        setStep('input');
      } else {
        Alert.alert('Calculation failed', 'Please check your connection and try again.');
        setStep('input');
      }
    }
  }

  async function applyTargets() {
    if (!result) return;
    try {
      const db = await getDatabase();
      await db.runAsync(
        `INSERT INTO nutrition_goals
           (id, target_calories, target_protein_g, target_carbs_g, target_fat_g, target_fiber_g, target_sodium_mg)
         VALUES (1, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           target_calories   = excluded.target_calories,
           target_protein_g  = excluded.target_protein_g,
           target_carbs_g    = excluded.target_carbs_g,
           target_fat_g      = excluded.target_fat_g,
           target_fiber_g    = excluded.target_fiber_g,
           target_sodium_mg  = excluded.target_sodium_mg,
           updated_at        = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        [result.calories, result.protein_g, result.carbs_g, result.fat_g, result.fiber_g, result.sodium_mg]
      );
      Alert.alert('Targets applied!', 'Your nutrition goals have been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      console.error('apply targets error:', e);
      Alert.alert('Error', 'Failed to apply targets. Please try again.');
    }
  }

  // ── Render ──────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>AI Nutrition Targets</Text>
            <Text style={styles.headerSub}>Personalised TDEE & macros</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* LOADING */}
        {step === 'loading' && (
          <View style={styles.centerWrap}>
            <ActivityIndicator color="#EF6C3E" size="large" />
          </View>
        )}

        {/* PAYWALL */}
        {step === 'paywall' && (
          <View style={styles.centerWrap}>
            <Text style={styles.lockIcon}>🔒</Text>
            <Text style={styles.paywallTitle}>Premium Feature</Text>
            <Text style={styles.paywallSub}>
              AI-calculated nutrition targets are available with Torvus Premium.
            </Text>
            <TouchableOpacity style={styles.backBtnAlt} onPress={() => router.back()}>
              <Text style={styles.backBtnAltText}>GO BACK</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* INPUT FORM */}
        {step === 'input' && (
          <ScrollView contentContainerStyle={styles.formWrap} keyboardShouldPersistTaps="handled">
            <Text style={styles.formIntro}>
              Enter your stats and Claude will calculate your TDEE and optimal macro targets.
            </Text>

            {calcCount > 0 && (
              <Text style={styles.usageNote}>{3 - calcCount} of 3 calculations remaining today</Text>
            )}

            {/* Weight */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>BODY WEIGHT</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={weightKg}
                  onChangeText={setWeightKg}
                  placeholder="—"
                  placeholderTextColor="#444"
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
                <View style={styles.unitToggle}>
                  {(['kg', 'lbs'] as const).map(u => (
                    <TouchableOpacity
                      key={u}
                      style={[styles.unitBtn, weightUnit === u && styles.unitBtnActive]}
                      onPress={() => setWeightUnit(u)}
                    >
                      <Text style={[styles.unitBtnText, weightUnit === u && styles.unitBtnTextActive]}>
                        {u}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* Height */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>HEIGHT (cm)</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={heightCm}
                  onChangeText={setHeightCm}
                  placeholder="—"
                  placeholderTextColor="#444"
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
                <Text style={styles.inputUnit}>cm</Text>
              </View>
            </View>

            {/* Age */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>AGE (optional)</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={ageYears}
                  onChangeText={setAgeYears}
                  placeholder="—"
                  placeholderTextColor="#444"
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
                <Text style={styles.inputUnit}>yrs</Text>
              </View>
            </View>

            {/* Fitness goal */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>FITNESS GOAL</Text>
              <View style={styles.btnGroup}>
                {(Object.keys(GOAL_LABELS) as FitnessGoal[]).map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.optionBtn, fitnessGoal === g && styles.optionBtnActive]}
                    onPress={() => setFitnessGoal(g)}
                  >
                    <Text style={[styles.optionBtnText, fitnessGoal === g && styles.optionBtnTextActive]}>
                      {GOAL_LABELS[g]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Activity level */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>ACTIVITY LEVEL</Text>
              {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map(a => (
                <TouchableOpacity
                  key={a}
                  style={[styles.activityBtn, activityLevel === a && styles.activityBtnActive]}
                  onPress={() => setActivityLevel(a)}
                >
                  <Text style={[styles.activityBtnText, activityLevel === a && styles.activityBtnTextActive]}>
                    {ACTIVITY_LABELS[a]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.calcBtn, calcCount >= 3 && styles.calcBtnDisabled]}
              onPress={calculate}
              disabled={calcCount >= 3}
            >
              <Text style={styles.calcBtnText}>CALCULATE MY TARGETS</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        )}

        {/* CALCULATING */}
        {step === 'calculating' && (
          <View style={styles.centerWrap}>
            <ActivityIndicator color="#EF6C3E" size="large" />
            <Text style={styles.calcingText}>Calculating your targets…</Text>
            <Text style={styles.calcingSubText}>Claude is analysing your stats</Text>
          </View>
        )}

        {/* RESULT */}
        {step === 'result' && result && (
          <ScrollView contentContainerStyle={styles.resultWrap} showsVerticalScrollIndicator={false}>
            {/* TDEE vs target */}
            <View style={styles.tdeeCard}>
              <View style={styles.tdeeRow}>
                <View style={styles.tdeeCol}>
                  <Text style={styles.tdeeLabel}>TDEE</Text>
                  <Text style={styles.tdeeValue}>{Math.round(result.tdee)}</Text>
                  <Text style={styles.tdeeUnit}>kcal/day</Text>
                </View>
                <View style={styles.tdeeDivider} />
                <View style={[styles.tdeeCol, { alignItems: 'flex-end' }]}>
                  <Text style={[styles.tdeeLabel, { color: '#EF6C3E' }]}>YOUR TARGET</Text>
                  <Text style={[styles.tdeeValue, { color: '#EF6C3E' }]}>{Math.round(result.calories)}</Text>
                  <Text style={styles.tdeeUnit}>kcal/day</Text>
                </View>
              </View>
              <Text style={styles.tdeeDiff}>
                {result.calories > result.tdee
                  ? `+${Math.round(result.calories - result.tdee)} kcal surplus`
                  : result.calories < result.tdee
                  ? `${Math.round(result.calories - result.tdee)} kcal deficit`
                  : 'Maintenance calories'}
              </Text>
            </View>

            {/* Macros */}
            <View style={styles.macroCard}>
              <Text style={styles.macroCardTitle}>DAILY MACROS</Text>
              <View style={styles.macroRow}>
                <MacroChip label="PROTEIN" value={result.protein_g} unit="g" color="#EF3E7A" />
                <MacroChip label="CARBS"   value={result.carbs_g}   unit="g" color="#3E8CEF" />
                <MacroChip label="FAT"     value={result.fat_g}     unit="g" color="#EF9B3E" />
              </View>
              <View style={[styles.macroRow, { marginTop: 8 }]}>
                <MacroChip label="FIBER"  value={result.fiber_g}   unit="g"  color="#6CEF3E" />
                <MacroChip label="SODIUM" value={result.sodium_mg} unit="mg" color="#EFDE3E" />
                <View style={{ flex: 1 }} />
              </View>
            </View>

            {/* Explanation */}
            <View style={styles.explanationCard}>
              <Text style={styles.explanationLabel}>HOW WE GOT HERE</Text>
              <Text style={styles.explanationText}>{result.explanation}</Text>
            </View>

            {/* Apply */}
            <TouchableOpacity style={styles.applyBtn} onPress={applyTargets}>
              <Text style={styles.applyBtnText}>APPLY THESE TARGETS</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.recalcBtn} onPress={() => setStep('input')}>
              <Text style={styles.recalcBtnText}>RECALCULATE</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// MACRO CHIP
// ─────────────────────────────────────────────────────────────

function MacroChip({ label, value, unit, color }: {
  label: string; value: number; unit: string; color: string;
}) {
  return (
    <View style={[chipStyles.wrap, { borderColor: color + '44' }]}>
      <Text style={[chipStyles.label, { color }]}>{label}</Text>
      <Text style={chipStyles.value}>{Math.round(value)}</Text>
      <Text style={chipStyles.unit}>{unit}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  wrap: {
    flex: 1, backgroundColor: '#141311', borderWidth: 1, borderRadius: 10,
    padding: 10, alignItems: 'center',
  },
  label: { fontSize: 8, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  value: { fontSize: 20, fontWeight: '900', color: '#F2F0EB' },
  unit:  { fontSize: 10, color: '#555', marginTop: 2 },
});

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

  centerWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 28,
  },
  lockIcon: { fontSize: 40, marginBottom: 16 },
  paywallTitle: { fontSize: 20, fontWeight: '900', color: '#F2F0EB', marginBottom: 10, textAlign: 'center' },
  paywallSub: { fontSize: 13, color: '#777', lineHeight: 19, textAlign: 'center', marginBottom: 24 },
  backBtnAlt: {
    borderWidth: 1, borderColor: '#252320', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 32,
  },
  backBtnAltText: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: '#555' },

  // Form
  formWrap: { padding: 20 },
  formIntro: { fontSize: 13, color: '#777', lineHeight: 19, marginBottom: 24 },
  usageNote: { fontSize: 11, color: '#3A3835', marginBottom: 16 },

  fieldGroup: { marginBottom: 20 },
  fieldLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: '#555', marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, fontWeight: '700', color: '#F2F0EB',
  },
  inputUnit: { fontSize: 13, color: '#555', fontWeight: '600', width: 30 },

  unitToggle: { flexDirection: 'row', gap: 4 },
  unitBtn: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12,
  },
  unitBtnActive: { borderColor: '#EF6C3E', backgroundColor: '#EF6C3E18' },
  unitBtnText: { fontSize: 12, fontWeight: '700', color: '#555' },
  unitBtnTextActive: { color: '#EF6C3E' },

  btnGroup: { flexDirection: 'row', gap: 8 },
  optionBtn: {
    flex: 1, backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  optionBtnActive: { borderColor: '#EF6C3E', backgroundColor: '#EF6C3E18' },
  optionBtnText: { fontSize: 11, fontWeight: '700', color: '#555' },
  optionBtnTextActive: { color: '#EF6C3E' },

  activityBtn: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8,
  },
  activityBtnActive: { borderColor: '#EF6C3E', backgroundColor: '#EF6C3E18' },
  activityBtnText: { fontSize: 13, color: '#555' },
  activityBtnTextActive: { color: '#EF6C3E', fontWeight: '600' },

  calcBtn: {
    backgroundColor: '#EF6C3E', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  calcBtnDisabled: { opacity: 0.4 },
  calcBtnText: { color: '#0E0D0B', fontWeight: '800', fontSize: 14, letterSpacing: 1 },

  // Calculating
  calcingText:    { fontSize: 18, fontWeight: '800', color: '#F2F0EB', marginTop: 24 },
  calcingSubText: { fontSize: 13, color: '#555', marginTop: 6 },

  // Result
  resultWrap: { padding: 16 },

  tdeeCard: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 14, padding: 16, marginBottom: 12,
  },
  tdeeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  tdeeCol: { flex: 1 },
  tdeeDivider: { width: 1, height: 50, backgroundColor: '#252320', marginHorizontal: 16 },
  tdeeLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: '#555', marginBottom: 4 },
  tdeeValue: { fontSize: 32, fontWeight: '900', color: '#F2F0EB' },
  tdeeUnit:  { fontSize: 11, color: '#555', marginTop: 2 },
  tdeeDiff:  { fontSize: 12, color: '#777', textAlign: 'center' },

  macroCard: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 14, padding: 16, marginBottom: 12,
  },
  macroCardTitle: { fontSize: 9, fontWeight: '800', letterSpacing: 2, color: '#555', marginBottom: 12 },
  macroRow: { flexDirection: 'row', gap: 8 },

  explanationCard: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 12, padding: 14, marginBottom: 16,
  },
  explanationLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 2, color: '#555', marginBottom: 8 },
  explanationText:  { fontSize: 13, color: '#999', lineHeight: 19 },

  applyBtn: {
    backgroundColor: '#EF6C3E', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginBottom: 10,
  },
  applyBtnText: { color: '#0E0D0B', fontWeight: '800', fontSize: 14, letterSpacing: 1 },
  recalcBtn: {
    borderWidth: 1, borderColor: '#252320', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  recalcBtnText: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: '#555' },
});
