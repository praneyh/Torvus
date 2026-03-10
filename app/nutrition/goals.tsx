// ============================================================
// TORVUS — Nutrition Goals Screen
// app/nutrition/goals.tsx
// ============================================================

import { useEffect, useState } from 'react';
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

interface GoalFields {
  calories: string;
  protein:  string;
  carbs:    string;
  fat:      string;
  fiber:    string;
  sodium:   string;
}

// ─────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────

export default function NutritionGoalsScreen() {
  const [fields, setFields] = useState<GoalFields>({
    calories: '2000', protein: '150', carbs: '200', fat: '65', fiber: '30', sodium: '2300',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving]   = useState(false);
  const [saved, setSaved]         = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const db = await getDatabase();
        const row = await db.getFirstAsync<{
          target_calories: number; target_protein_g: number;
          target_carbs_g: number; target_fat_g: number;
          target_fiber_g: number; target_sodium_mg: number;
        }>(`SELECT * FROM nutrition_goals WHERE id = 1`);
        if (row) {
          setFields({
            calories: String(Math.round(row.target_calories)),
            protein:  String(Math.round(row.target_protein_g)),
            carbs:    String(Math.round(row.target_carbs_g)),
            fat:      String(Math.round(row.target_fat_g)),
            fiber:    String(Math.round(row.target_fiber_g)),
            sodium:   String(Math.round(row.target_sodium_mg)),
          });
        }
      } catch (e) {
        console.error('load goals error:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  function setField(key: keyof GoalFields, val: string) {
    setFields(f => ({ ...f, [key]: val }));
    setSaved(false);
  }

  async function save() {
    setIsSaving(true);
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
        [
          parseFloat(fields.calories) || 0,
          parseFloat(fields.protein)  || 0,
          parseFloat(fields.carbs)    || 0,
          parseFloat(fields.fat)      || 0,
          parseFloat(fields.fiber)    || 0,
          parseFloat(fields.sodium)   || 0,
        ]
      );
      setSaved(true);
      setTimeout(() => router.back(), 600);
    } catch (e) {
      console.error('save goals error:', e);
    } finally {
      setIsSaving(false);
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
            <Text style={styles.headerTitle}>Nutrition Goals</Text>
            <Text style={styles.headerSub}>Daily targets</Text>
          </View>
          <View style={{ width: 64 }} />
        </View>

        {isLoading ? (
          <ActivityIndicator color="#EF6C3E" style={{ marginTop: 48 }} />
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

            {/* Main goal */}
            <GoalField
              label="DAILY CALORIES"
              unit="kcal"
              value={fields.calories}
              onChange={v => setField('calories', v)}
              accent="#EF6C3E"
              large
            />

            <View style={styles.divider} />

            {/* Macros */}
            <Text style={styles.sectionLabel}>MACRONUTRIENTS</Text>
            <View style={styles.macroRow}>
              <GoalField
                label="PROTEIN"
                unit="g"
                value={fields.protein}
                onChange={v => setField('protein', v)}
                accent="#EF3E7A"
                flex
              />
              <GoalField
                label="CARBS"
                unit="g"
                value={fields.carbs}
                onChange={v => setField('carbs', v)}
                accent="#3E8CEF"
                flex
              />
              <GoalField
                label="FAT"
                unit="g"
                value={fields.fat}
                onChange={v => setField('fat', v)}
                accent="#EF9B3E"
                flex
              />
            </View>

            {/* Macro ratio hint */}
            <MacroRatioHint
              calories={parseFloat(fields.calories) || 0}
              protein={parseFloat(fields.protein)   || 0}
              carbs={parseFloat(fields.carbs)       || 0}
              fat={parseFloat(fields.fat)           || 0}
            />

            <View style={styles.divider} />

            {/* Other */}
            <Text style={styles.sectionLabel}>OTHER</Text>
            <View style={styles.otherRow}>
              <GoalField
                label="FIBER"
                unit="g"
                value={fields.fiber}
                onChange={v => setField('fiber', v)}
                accent="#6CEF3E"
                flex
              />
              <GoalField
                label="SODIUM"
                unit="mg"
                value={fields.sodium}
                onChange={v => setField('sodium', v)}
                accent="#EFDE3E"
                flex
              />
            </View>

            {/* Save */}
            <TouchableOpacity
              style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
              onPress={save}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#0E0D0B" />
              ) : (
                <Text style={styles.saveBtnText}>{saved ? 'SAVED ✓' : 'SAVE GOALS'}</Text>
              )}
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// GOAL FIELD
// ─────────────────────────────────────────────────────────────

function GoalField({
  label, unit, value, onChange, accent, large, flex,
}: {
  label: string; unit: string; value: string;
  onChange: (v: string) => void; accent: string;
  large?: boolean; flex?: boolean;
}) {
  return (
    <View style={[goalFieldStyles.wrap, flex && { flex: 1 }]}>
      <Text style={[goalFieldStyles.label, { color: accent }]}>{label}</Text>
      <View style={goalFieldStyles.inputRow}>
        <TextInput
          style={[goalFieldStyles.input, large && goalFieldStyles.inputLarge]}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          selectTextOnFocus
          placeholderTextColor="#444"
        />
        <Text style={goalFieldStyles.unit}>{unit}</Text>
      </View>
    </View>
  );
}

const goalFieldStyles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: {
    flex: 1, backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 16, fontWeight: '700', color: '#F2F0EB',
  },
  inputLarge: { fontSize: 24 },
  unit: { fontSize: 13, color: '#555', fontWeight: '600', minWidth: 30 },
});

// ─────────────────────────────────────────────────────────────
// MACRO RATIO HINT
// ─────────────────────────────────────────────────────────────

function MacroRatioHint({ calories, protein, carbs, fat }: {
  calories: number; protein: number; carbs: number; fat: number;
}) {
  const calFromMacros = protein * 4 + carbs * 4 + fat * 9;
  if (calFromMacros === 0 || calories === 0) return null;

  const pPct = Math.round((protein * 4 / calories) * 100);
  const cPct = Math.round((carbs   * 4 / calories) * 100);
  const fPct = Math.round((fat     * 9 / calories) * 100);
  const total = pPct + cPct + fPct;
  const match = total >= 95 && total <= 105;

  return (
    <View style={ratioStyles.wrap}>
      <Text style={ratioStyles.text}>
        Macro ratio: {pPct}% P · {cPct}% C · {fPct}% F
        {'  '}
        <Text style={{ color: match ? '#6CEF3E' : '#EF9B3E' }}>
          ({Math.round(calFromMacros)} kcal from macros{!match ? ' — adjust to match goal' : ''})
        </Text>
      </Text>
    </View>
  );
}

const ratioStyles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  text: { fontSize: 11, color: '#555', lineHeight: 16 },
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
  backBtn: { padding: 4, marginRight: 8, width: 36 },
  backBtnText: { fontSize: 26, color: '#EF6C3E', lineHeight: 30 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#F2F0EB' },
  headerSub: { fontSize: 11, color: '#555' },

  content: { paddingHorizontal: 20, paddingTop: 24 },

  sectionLabel: {
    fontSize: 9, fontWeight: '700', letterSpacing: 2, color: '#555', marginBottom: 14,
  },
  divider: { height: 1, backgroundColor: '#1E1D1A', marginVertical: 20 },

  macroRow: { flexDirection: 'row', gap: 12 },
  otherRow: { flexDirection: 'row', gap: 12 },

  saveBtn: {
    backgroundColor: '#EF6C3E', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 16,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#0E0D0B', fontWeight: '800', fontSize: 14, letterSpacing: 1 },
});
