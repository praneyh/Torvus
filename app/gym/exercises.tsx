// ============================================================
// TORVUS — Exercise Library
// app/gym/exercises.tsx
// ============================================================

import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView,
  ScrollView, TouchableOpacity, Platform, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { getDatabase } from '../../schema';

// ─────────────────────────────────────────────────────────────
// TYPES & CONSTANTS
// ─────────────────────────────────────────────────────────────

type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'forearms'
  | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'adductors' | 'core';

interface Exercise {
  id: number;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: string;
  isCustom: boolean;
}

const MUSCLE_GROUPS: MuscleGroup[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
  'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'core',
];

const MUSCLE_LABELS: Record<MuscleGroup, string> = {
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

const EQUIPMENT_SHORT: Record<string, string> = {
  barbell: 'Barbell', dumbbell: 'Dumbbell', cable: 'Cable',
  machine: 'Machine', bodyweight: 'Bodyweight', kettlebell: 'Kettlebell',
  resistance_band: 'Band', other: 'Other',
};

// ─────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────

export default function ExerciseLibraryScreen() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMg, setSelectedMg] = useState<MuscleGroup | null>(null);

  useEffect(() => {
    loadExercises();
  }, []);

  async function loadExercises() {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<{
        id: number; name: string; muscle_group: string;
        equipment: string; is_custom: number;
      }>(
        `SELECT id, name, muscle_group, equipment, is_custom
         FROM exercises
         ORDER BY muscle_group, name`
      );
      setExercises(rows.map(r => ({
        id: r.id,
        name: r.name,
        muscleGroup: r.muscle_group as MuscleGroup,
        equipment: r.equipment,
        isCustom: r.is_custom === 1,
      })));
    } catch (err) {
      console.error('loadExercises error:', err);
    } finally {
      setIsLoading(false);
    }
  }

  const displayed = selectedMg
    ? exercises.filter(e => e.muscleGroup === selectedMg)
    : exercises;

  // Build sections for "All" view
  const sections: { muscle: MuscleGroup; items: Exercise[] }[] = selectedMg
    ? [{ muscle: selectedMg, items: displayed }]
    : MUSCLE_GROUPS.map(mg => ({
        muscle: mg,
        items: exercises.filter(e => e.muscleGroup === mg),
      })).filter(s => s.items.length > 0);

  const totalCustom = exercises.filter(e => e.isCustom).length;

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.eyebrow}>TORVUS</Text>
          <Text style={styles.title}>Exercises</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.countBadge}>{exercises.length}</Text>
        </View>
      </View>

      {/* ── Muscle group filter ── */}
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <TouchableOpacity
            style={[styles.filterChip, selectedMg === null && styles.filterChipActive]}
            onPress={() => setSelectedMg(null)}
          >
            <Text style={[styles.filterChipText, selectedMg === null && styles.filterChipTextActive]}>
              ALL
            </Text>
          </TouchableOpacity>
          {MUSCLE_GROUPS.map(mg => {
            const isActive = selectedMg === mg;
            const color = MUSCLE_COLORS[mg];
            return (
              <TouchableOpacity
                key={mg}
                style={[
                  styles.filterChip,
                  isActive && { borderColor: color, backgroundColor: color + '22' },
                ]}
                onPress={() => setSelectedMg(isActive ? null : mg)}
              >
                <View style={[styles.filterChipDot, { backgroundColor: isActive ? color : '#3A3835' }]} />
                <Text style={[styles.filterChipText, isActive && { color }]}>
                  {MUSCLE_LABELS[mg].toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Content ── */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#EF6C3E" size="large" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {sections.map(section => (
            <View key={section.muscle} style={styles.section}>
              {/* Section header */}
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionDot, { backgroundColor: MUSCLE_COLORS[section.muscle] }]} />
                <Text style={[styles.sectionLabel, { color: MUSCLE_COLORS[section.muscle] }]}>
                  {MUSCLE_LABELS[section.muscle].toUpperCase()}
                </Text>
                <Text style={styles.sectionCount}>{section.items.length}</Text>
              </View>

              {/* Exercise rows */}
              <View style={styles.sectionCard}>
                {section.items.map((ex, i) => (
                  <View
                    key={ex.id}
                    style={[
                      styles.exRow,
                      i < section.items.length - 1 && styles.exRowBorder,
                    ]}
                  >
                    <View style={[styles.exAccent, { backgroundColor: MUSCLE_COLORS[ex.muscleGroup] }]} />
                    <View style={styles.exInfo}>
                      <Text style={styles.exName}>{ex.name}</Text>
                      {ex.isCustom && <Text style={styles.customTag}>CUSTOM</Text>}
                    </View>
                    <Text style={styles.equipTag}>
                      {EQUIPMENT_SHORT[ex.equipment] ?? ex.equipment}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}

          {totalCustom > 0 && !selectedMg && (
            <Text style={styles.footerNote}>
              Includes {totalCustom} custom exercise{totalCustom !== 1 ? 's' : ''} you created.
            </Text>
          )}

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
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#1E1D1A',
  },
  backBtn: { width: 32 },
  backBtnText: { fontSize: 28, color: '#EF6C3E', lineHeight: 32 },
  headerCenter: { flex: 1, alignItems: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 3, color: '#EF6C3E' },
  title: { fontSize: 20, fontWeight: '800', color: '#F2F0EB' },
  headerRight: { width: 32, alignItems: 'flex-end' },
  countBadge: { fontSize: 12, fontWeight: '700', color: '#555' },

  // ── Filter bar ──────────────────────────────────────────
  filterBar: {
    borderBottomWidth: 1, borderBottomColor: '#1E1D1A', paddingVertical: 10,
  },
  filterRow: { paddingHorizontal: 16, gap: 7 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: '#2A2926', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#141311',
  },
  filterChipActive: { borderColor: '#EF6C3E', backgroundColor: '#EF6C3E22' },
  filterChipDot: { width: 5, height: 5, borderRadius: 2.5 },
  filterChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: '#555' },
  filterChipTextActive: { color: '#EF6C3E' },

  // ── List ────────────────────────────────────────────────
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },

  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8,
  },
  sectionDot: { width: 7, height: 7, borderRadius: 3.5 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 2, flex: 1 },
  sectionCount: { fontSize: 11, fontWeight: '700', color: '#3A3835' },

  sectionCard: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 12, overflow: 'hidden',
  },
  exRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingRight: 14,
  },
  exRowBorder: { borderBottomWidth: 1, borderBottomColor: '#1E1D1A' },
  exAccent: { width: 3, alignSelf: 'stretch', marginRight: 12 },
  exInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  exName: { fontSize: 14, fontWeight: '600', color: '#F2F0EB' },
  customTag: {
    fontSize: 9, fontWeight: '800', letterSpacing: 1, color: '#9B6CEF',
    backgroundColor: '#9B6CEF18', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
  },
  equipTag: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: '#555',
    backgroundColor: '#1A1714', borderWidth: 1, borderColor: '#2A2926',
    borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3,
  },

  footerNote: {
    fontSize: 12, color: '#3A3835', textAlign: 'center', marginTop: 8, marginBottom: 4,
  },
});
