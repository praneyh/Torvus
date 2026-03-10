import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView,
  TouchableOpacity, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { getDatabase } from '../../schema';
import { useWorkoutStore } from '@/store/workoutStore';
import type { MuscleGroup, WorkoutDay } from '@/types/models';

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const MUSCLE_COLORS: Record<MuscleGroup, string> = {
  chest: '#EF6C3E', back: '#3E8CEF', shoulders: '#9B6CEF',
  biceps: '#EF3E7A', triceps: '#EF9B3E', forearms: '#C87B3E',
  quads: '#3EEFB8', hamstrings: '#3EC4EF', glutes: '#EF3EDE',
  calves: '#EFDE3E', adductors: '#7BCF6E', core: '#6CEF3E',
};

// ─────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────

export default function WorkoutHomeScreen() {
  const {
    activeSplit, activeSplitDays, nextDay, isLoadingSplit,
    setActiveSplit, setNextDay, setLoadingSplit,
  } = useWorkoutStore();

  const [selectedDay, setSelectedDay] = useState<WorkoutDay | null>(null);

  // Reload every time this tab gains focus (picks up split-builder saves)
  useFocusEffect(
    useCallback(() => {
      loadActiveSplit();
    }, [])
  );

  async function loadActiveSplit() {
    setLoadingSplit(true);
    try {
      const db = await getDatabase();

      const prefs = await db.getFirstAsync<{ active_split_id: number | null }>(
        `SELECT active_split_id FROM user_preferences WHERE id = 1`
      );

      if (!prefs?.active_split_id) {
        setActiveSplit(null, []);
        setNextDay(null);
        return;
      }

      const raw = await db.getFirstAsync<{
        id: number; name: string; days_per_week: number;
        is_preset: number; preset_type: string | null;
        created_at: string; updated_at: string;
      }>(`SELECT * FROM workout_splits WHERE id = ?`, [prefs.active_split_id]);

      if (!raw) {
        setActiveSplit(null, []);
        setNextDay(null);
        return;
      }

      const split = {
        id: raw.id,
        name: raw.name,
        daysPerWeek: raw.days_per_week,
        isPreset: raw.is_preset === 1,
        presetType: raw.preset_type as any,
        createdAt: raw.created_at,
        updatedAt: raw.updated_at,
      };

      const rawDays = await db.getAllAsync<{
        id: number; split_id: number; day_number: number;
        label: string; muscle_groups: string;
      }>(`SELECT * FROM workout_days WHERE split_id = ? ORDER BY day_number`, [split.id]);

      const days = rawDays.map(d => ({
        id: d.id,
        splitId: d.split_id,
        dayNumber: d.day_number,
        label: d.label,
        muscleGroups: d.muscle_groups
          ? (d.muscle_groups.split(',').filter(Boolean) as MuscleGroup[])
          : [],
      }));

      setActiveSplit(split, days);

      // Determine next day from last completed session
      const lastSession = await db.getFirstAsync<{ day_id: number }>(
        `SELECT day_id FROM workout_sessions
         WHERE split_id = ? AND completed_at IS NOT NULL
         ORDER BY completed_at DESC LIMIT 1`,
        [split.id]
      );

      let computedNext: WorkoutDay | null;
      if (!lastSession) {
        computedNext = days[0] ?? null;
      } else {
        const lastDayIndex = days.findIndex(d => d.id === lastSession.day_id);
        const nextIndex = lastDayIndex === -1 ? 0 : (lastDayIndex + 1) % days.length;
        computedNext = days[nextIndex] ?? null;
      }
      setNextDay(computedNext);
      setSelectedDay(computedNext);
    } catch (err) {
      console.error('loadActiveSplit error:', err);
      setActiveSplit(null, []);
    } finally {
      setLoadingSplit(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>TORVUS</Text>
          <Text style={styles.title}>Workout</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerAction}
            onPress={() => router.push('/gym/exercises')}
          >
            <Text style={styles.headerActionText}>EXERCISES</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerAction}
            onPress={() => router.push('/gym/split-builder')}
          >
            <Text style={styles.headerActionText}>+ SPLIT</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.body}>
        {/* LOG CARDIO — always accessible at top of body */}
        <TouchableOpacity
          style={styles.cardioBtn}
          onPress={() => router.push('/gym/cardio')}
          activeOpacity={0.85}
        >
          <Text style={styles.cardioBtnText}>♡ LOG CARDIO</Text>
        </TouchableOpacity>

        <View style={{ flex: 1, justifyContent: 'center' }}>
        {isLoadingSplit ? (
          <ActivityIndicator color="#EF6C3E" />
        ) : !activeSplit ? (
          // ── Empty state ─────────────────────────────────
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>⚡</Text>
            <Text style={styles.emptyTitle}>No split selected</Text>
            <Text style={styles.emptyBody}>
              Create a workout split to start logging your sessions.
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/gym/split-builder')}
            >
              <Text style={styles.emptyBtnText}>BUILD MY SPLIT</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // ── Active split card ─────────────────────────
          <View style={styles.splitCard}>
            <View style={styles.splitCardTop}>
              <View style={styles.splitMeta}>
                <Text style={styles.splitLabel}>ACTIVE SPLIT</Text>
                <Text style={styles.splitName}>{activeSplit.name}</Text>
                <Text style={styles.splitDays}>{activeSplit.daysPerWeek} days per week</Text>
              </View>
              <TouchableOpacity
                style={styles.changeSplitBtn}
                onPress={() => router.push('/gym/split-builder')}
              >
                <Text style={styles.changeSplitText}>CHANGE</Text>
              </TouchableOpacity>
            </View>

            {activeSplitDays.length > 0 && (
              <>
                <View style={styles.divider} />

                {/* ── Day picker ───────────────────────────── */}
                <View style={styles.dayPickerSection}>
                  <Text style={styles.dayPickerEyebrow}>SELECT DAY</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.dayPickerRow}
                  >
                    {activeSplitDays.map(day => {
                      const isSelected = selectedDay?.id === day.id;
                      const isNext = nextDay?.id === day.id;
                      return (
                        <TouchableOpacity
                          key={day.id}
                          style={[styles.dayChip, isSelected && styles.dayChipSelected]}
                          onPress={() => setSelectedDay(day)}
                          activeOpacity={0.7}
                        >
                          {isNext && !isSelected && (
                            <View style={styles.dayChipDot} />
                          )}
                          <Text style={[styles.dayChipNum, isSelected && styles.dayChipNumSelected]}>
                            D{day.dayNumber}
                          </Text>
                          <Text style={[styles.dayChipLabel, isSelected && styles.dayChipLabelSelected]}>
                            {day.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* ── Selected day info ────────────────────── */}
                {selectedDay && (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.nextDaySection}>
                      {nextDay?.id === selectedDay.id ? (
                        <Text style={styles.nextDayEyebrow}>UP NEXT</Text>
                      ) : (
                        <Text style={styles.nextDayEyebrowAlt}>SELECTED DAY</Text>
                      )}
                      <Text style={styles.nextDayName}>
                        Day {selectedDay.dayNumber} · {selectedDay.label}
                      </Text>
                      {selectedDay.muscleGroups.length > 0 && (
                        <View style={styles.muscleChips}>
                          {selectedDay.muscleGroups.map(mg => (
                            <View
                              key={mg}
                              style={[
                                styles.muscleChip,
                                {
                                  backgroundColor: MUSCLE_COLORS[mg] + '22',
                                  borderColor: MUSCLE_COLORS[mg] + '77',
                                },
                              ]}
                            >
                              <Text style={[styles.muscleChipText, { color: MUSCLE_COLORS[mg] }]}>
                                {mg.toUpperCase()}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>

                    <TouchableOpacity
                      style={styles.startBtn}
                      onPress={() => {
                        setNextDay(selectedDay);
                        router.push('/gym/session');
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.startBtnText}>START SESSION</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </View>
        )}
        </View>
      </View>
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
  headerActions: { flexDirection: 'row', gap: 8 },
  headerAction: {
    backgroundColor: '#1A1714', borderWidth: 1, borderColor: '#2A2926',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
  },
  headerActionText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: '#EF6C3E' },

  body: { flex: 1, padding: 20 },
  cardioBtn: {
    borderWidth: 1, borderColor: '#3EEFB8', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', marginBottom: 16,
  },
  cardioBtnText: { fontSize: 12, fontWeight: '700', letterSpacing: 2, color: '#3EEFB8' },

  // ── Empty state ───────────────────────────────────────────
  emptyCard: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 16, padding: 28, alignItems: 'center',
  },
  emptyIcon: { fontSize: 36, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#F2F0EB', marginBottom: 8 },
  emptyBody: {
    fontSize: 14, color: '#555', textAlign: 'center',
    lineHeight: 20, marginBottom: 20,
  },
  emptyBtn: {
    backgroundColor: '#EF6C3E', borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  emptyBtnText: { color: '#0E0D0B', fontWeight: '800', fontSize: 12, letterSpacing: 1.5 },

  // ── Active split card ─────────────────────────────────────
  splitCard: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 16, overflow: 'hidden',
  },
  splitCardTop: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', padding: 20,
  },
  splitMeta: { flex: 1 },
  splitLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 2.5,
    color: '#EF6C3E', marginBottom: 4,
  },
  splitName: { fontSize: 20, fontWeight: '800', color: '#F2F0EB', marginBottom: 4 },
  splitDays: { fontSize: 13, color: '#555' },
  changeSplitBtn: {
    backgroundColor: '#1E1D1A', borderWidth: 1, borderColor: '#2A2926',
    borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5,
  },
  changeSplitText: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: '#888' },

  divider: { height: 1, backgroundColor: '#1E1D1A' },

  // ── Day picker ────────────────────────────────────────────
  dayPickerSection: { paddingTop: 16, paddingBottom: 12 },
  dayPickerEyebrow: {
    fontSize: 10, fontWeight: '700', letterSpacing: 2.5,
    color: '#555', marginBottom: 10, paddingHorizontal: 20,
  },
  dayPickerRow: { paddingHorizontal: 16, gap: 8 },
  dayChip: {
    alignItems: 'center', borderWidth: 1, borderColor: '#2A2926',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#0E0D0B', minWidth: 60,
  },
  dayChipSelected: { borderColor: '#EF6C3E', backgroundColor: '#EF6C3E18' },
  dayChipDot: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: '#EF6C3E',
    position: 'absolute', top: 6,
  },
  dayChipNum: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#555' },
  dayChipNumSelected: { color: '#EF6C3E' },
  dayChipLabel: { fontSize: 10, fontWeight: '600', color: '#3A3835', marginTop: 2 },
  dayChipLabelSelected: { color: '#EF6C3E99' },

  nextDaySection: { padding: 20, paddingBottom: 16 },
  nextDayEyebrow: {
    fontSize: 10, fontWeight: '700', letterSpacing: 2.5,
    color: '#555', marginBottom: 4,
  },
  nextDayEyebrowAlt: {
    fontSize: 10, fontWeight: '700', letterSpacing: 2.5,
    color: '#EF6C3E', marginBottom: 4,
  },
  nextDayName: { fontSize: 18, fontWeight: '700', color: '#F2F0EB', marginBottom: 12 },
  muscleChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  muscleChip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  muscleChipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },

  startBtn: {
    backgroundColor: '#EF6C3E', margin: 20, marginTop: 4,
    borderRadius: 12, paddingVertical: 16, alignItems: 'center',
  },
  startBtnText: { color: '#0E0D0B', fontWeight: '800', fontSize: 15, letterSpacing: 1 },
});
