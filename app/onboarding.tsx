// ============================================================
// TORVUS — Onboarding Screen
// app/onboarding.tsx
// 3-step flow: fitness goal → body weight → done
// ============================================================

import { useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  TextInput, Platform, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { getDatabase } from '../schema';
import { supabase } from '../src/lib/supabase';
import { pushAllData } from '../src/lib/sync';

type Goal = 'bulking' | 'maintaining' | 'cutting';
type Unit = 'kg' | 'lbs';
type HeightUnit = 'cm' | 'ftin';

const GOAL_OPTIONS: { key: Goal; label: string; sub: string; color: string }[] = [
  { key: 'bulking',     label: 'BULKING',     sub: 'Build muscle & gain mass',  color: '#3E8CEF' },
  { key: 'maintaining', label: 'MAINTAINING',  sub: 'Stay at current weight',    color: '#EF6C3E' },
  { key: 'cutting',     label: 'CUTTING',      sub: 'Lose fat, preserve muscle', color: '#EF3E7A' },
];

export default function OnboardingScreen() {
  const [step, setStep]           = useState(0);
  const [goal, setGoal]           = useState<Goal>('maintaining');
  const [weightStr, setWeightStr] = useState('');
  const [unit, setUnit]           = useState<Unit>('kg');
  const [heightCmStr, setHeightCmStr] = useState('');
  const [heightFtStr, setHeightFtStr] = useState('');
  const [heightInStr, setHeightInStr] = useState('');
  const [heightUnit, setHeightUnit] = useState<HeightUnit>('cm');
  const [saving, setSaving]       = useState(false);

  function getHeightCm(): number | null {
    if (heightUnit === 'cm') {
      const v = parseFloat(heightCmStr);
      return isNaN(v) ? null : v;
    }
    const ft = parseInt(heightFtStr) || 0;
    const inches = parseFloat(heightInStr) || 0;
    if (ft === 0 && inches === 0) return null;
    return ft * 30.48 + inches * 2.54;
  }

  function heightDisplay(): string {
    const cm = getHeightCm();
    if (!cm) return 'Not set';
    if (heightUnit === 'cm') return `${Math.round(cm)} cm`;
    const totalIn = cm / 2.54;
    const ft = Math.floor(totalIn / 12);
    const inches = Math.round(totalIn % 12);
    return `${ft}' ${inches}"`;
  }

  async function finish() {
    setSaving(true);
    try {
      const db = await getDatabase();
      const weightKg = weightStr
        ? unit === 'lbs'
          ? parseFloat(weightStr) / 2.20462
          : parseFloat(weightStr)
        : null;

      const heightCm = getHeightCm();

      await db.runAsync(
        `UPDATE user_preferences
         SET fitness_goal = ?, body_weight_kg = ?, weight_unit = ?,
             height_cm = ?,
             onboarding_complete = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = 1`,
        [goal, weightKg, unit, heightCm]
      );

      // Push initial data to cloud
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        await pushAllData(db, session.user.id).catch(() => {});
      }

      router.replace('/(tabs)');
    } catch (e) {
      console.error('onboarding save error:', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Progress dots */}
        <View style={styles.dotsRow}>
          {[0, 1, 2].map(i => (
            <View key={i} style={[styles.dot, step === i && styles.dotActive]} />
          ))}
        </View>

        {/* ── Step 0: Fitness goal ─────────────────────────── */}
        {step === 0 && (
          <View style={styles.stepWrap}>
            <Text style={styles.stepNum}>01 / 03</Text>
            <Text style={styles.stepTitle}>What's your goal?</Text>
            <Text style={styles.stepSub}>We'll tailor your nutrition targets and recommendations.</Text>

            <View style={styles.optionsCol}>
              {GOAL_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.optionBtn, goal === opt.key && { borderColor: opt.color, borderWidth: 2 }]}
                  onPress={() => setGoal(opt.key)}
                >
                  <Text style={[styles.optionLabel, { color: opt.color }]}>{opt.label}</Text>
                  <Text style={styles.optionSub}>{opt.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.nextBtn} onPress={() => setStep(1)}>
              <Text style={styles.nextBtnText}>NEXT</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 1: Body metrics ─────────────────────────── */}
        {step === 1 && (
          <View style={styles.stepWrap}>
            <Text style={styles.stepNum}>02 / 03</Text>
            <Text style={styles.stepTitle}>Body metrics</Text>
            <Text style={styles.stepSub}>Used for calorie estimation and personalised goals.</Text>

            {/* Unit toggle */}
            <View style={styles.unitRow}>
              {(['kg', 'lbs'] as Unit[]).map(u => (
                <TouchableOpacity
                  key={u}
                  style={[styles.unitBtn, unit === u && styles.unitBtnActive]}
                  onPress={() => {
                    setUnit(u);
                    setHeightUnit(u === 'kg' ? 'cm' : 'ftin');
                  }}
                >
                  <Text style={[styles.unitBtnText, unit === u && styles.unitBtnTextActive]}>
                    {u === 'kg' ? 'KG / CM' : 'LBS / FT'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>BODY WEIGHT</Text>
            <TextInput
              style={styles.weightInput}
              value={weightStr}
              onChangeText={setWeightStr}
              placeholder={unit === 'kg' ? '75' : '165'}
              placeholderTextColor="#444"
              keyboardType="decimal-pad"
            />

            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>HEIGHT</Text>
            {heightUnit === 'cm' ? (
              <TextInput
                style={styles.weightInput}
                value={heightCmStr}
                onChangeText={setHeightCmStr}
                placeholder="175"
                placeholderTextColor="#444"
                keyboardType="decimal-pad"
              />
            ) : (
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 32 }}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={[styles.weightInput, { marginBottom: 0 }]}
                    value={heightFtStr}
                    onChangeText={setHeightFtStr}
                    placeholder="5"
                    placeholderTextColor="#444"
                    keyboardType="number-pad"
                  />
                  <Text style={styles.heightUnitLabel}>ft</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={[styles.weightInput, { marginBottom: 0 }]}
                    value={heightInStr}
                    onChangeText={setHeightInStr}
                    placeholder="11"
                    placeholderTextColor="#444"
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.heightUnitLabel}>in</Text>
                </View>
              </View>
            )}

            <View style={styles.rowBtns}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(0)}>
                <Text style={styles.backBtnText}>BACK</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.nextBtn, { flex: 1 }]} onPress={() => setStep(2)}>
                <Text style={styles.nextBtnText}>NEXT</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Step 2: Done ─────────────────────────────────── */}
        {step === 2 && (
          <View style={[styles.stepWrap, { alignItems: 'center' }]}>
            <Text style={styles.doneEmoji}>✓</Text>
            <Text style={styles.stepTitle}>You're all set.</Text>
            <Text style={styles.stepSub}>
              Your profile is saved. You can update everything in the Profile tab at any time.
            </Text>

            <View style={styles.summaryCard}>
              <SummaryRow label="Goal"   value={goal.charAt(0).toUpperCase() + goal.slice(1)} />
              <SummaryRow
                label="Weight"
                value={weightStr ? `${weightStr} ${unit}` : 'Not set'}
              />
              <SummaryRow label="Height" value={heightDisplay()} />
            </View>

            <View style={[styles.rowBtns, { marginTop: 32 }]}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                <Text style={styles.backBtnText}>BACK</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nextBtn, { flex: 1 }, saving && styles.btnDisabled]}
                onPress={finish}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#0E0D0B" />
                  : <Text style={styles.nextBtnText}>GET STARTED</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={summaryStyles.row}>
      <Text style={summaryStyles.label}>{label}</Text>
      <Text style={summaryStyles.value}>{value}</Text>
    </View>
  );
}
const summaryStyles = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  label: { fontSize: 12, color: '#555', fontWeight: '600' },
  value: { fontSize: 12, color: '#F2F0EB', fontWeight: '700' },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0E0D0B' },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingTop: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#252320' },
  dotActive: { backgroundColor: '#EF6C3E', width: 24 },

  stepWrap: { flex: 1, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 32 },
  stepNum:  { fontSize: 10, color: '#EF6C3E', fontWeight: '700', letterSpacing: 2, marginBottom: 12 },
  stepTitle: { fontSize: 28, fontWeight: '900', color: '#F2F0EB', marginBottom: 8 },
  stepSub:   { fontSize: 14, color: '#555', lineHeight: 20, marginBottom: 32 },

  optionsCol: { gap: 12, marginBottom: 32 },
  optionBtn: {
    backgroundColor: '#141311',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#252320',
    padding: 18,
  },
  optionLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  optionSub:   { fontSize: 12, color: '#555' },

  nextBtn: {
    backgroundColor: '#EF6C3E',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextBtnText: { color: '#0E0D0B', fontWeight: '800', fontSize: 14, letterSpacing: 1 },
  btnDisabled: { opacity: 0.5 },

  unitRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  unitBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320', alignItems: 'center',
  },
  unitBtnActive: { backgroundColor: '#EF6C3E', borderColor: '#EF6C3E' },
  unitBtnText: { fontSize: 13, fontWeight: '700', color: '#555' },
  unitBtnTextActive: { color: '#0E0D0B' },

  fieldLabel: {
    fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: '#555', marginBottom: 8,
  },
  weightInput: {
    backgroundColor: '#141311',
    borderWidth: 1,
    borderColor: '#252320',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 32,
    fontWeight: '700',
    color: '#F2F0EB',
    textAlign: 'center',
    marginBottom: 32,
  },
  heightUnitLabel: {
    fontSize: 12, color: '#555', fontWeight: '600', textAlign: 'center', marginTop: 4,
  },

  rowBtns: { flexDirection: 'row', gap: 12 },
  backBtn: {
    borderWidth: 1, borderColor: '#252320', borderRadius: 12,
    paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center',
  },
  backBtnText: { color: '#555', fontWeight: '700', fontSize: 13 },

  doneEmoji: { fontSize: 56, marginBottom: 16 },
  summaryCard: {
    backgroundColor: '#141311',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#252320',
    paddingHorizontal: 20,
    paddingVertical: 4,
    width: '100%',
    marginTop: 8,
  },
});
