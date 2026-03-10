// app/gym/session.tsx — Active workout session logger

import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { router } from 'expo-router';
import { getDatabase } from '../../schema';
import { useWorkoutStore } from '@/store/workoutStore';
import type { MuscleGroup, EquipmentType } from '@/types/models';

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

type WeightUnit = 'kg' | 'lbs';
type InputMode = 'weight' | 'plates';

/** Standard Olympic plate = 45 lbs each side */
const PLATE_LBS = 45;
const PLATE_KG = PLATE_LBS * 0.453592; // 20.412 kg

const EQUIPMENT_OPTIONS: EquipmentType[] = [
  'barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'kettlebell', 'other',
];
const EQUIPMENT_LABELS: Record<EquipmentType, string> = {
  barbell: 'Barbell', dumbbell: 'Dumbbell', cable: 'Cable',
  machine: 'Machine', bodyweight: 'Bodyweight', kettlebell: 'Kettlebell',
  resistance_band: 'Band', other: 'Other',
};
const ALL_MUSCLE_GROUPS: MuscleGroup[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
  'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'core',
];

// ─────────────────────────────────────────────────────────────
// LOCAL TYPES
// ─────────────────────────────────────────────────────────────

interface LocalSet {
  tempId: number;
  // weight mode
  weight: string;
  // plates mode
  plates: string;  // integer — number of plates per side
  kicker: string;  // extra weight in current unit
  // shared
  reps: string;
}

interface ExerciseLog {
  id: number;
  name: string;
  muscleGroup: MuscleGroup;
  sets: LocalSet[];
  isCustom: boolean;
  mode: InputMode;
}

let _tempId = 0;
const nextTempId = () => ++_tempId;

function newSet(prev?: LocalSet): LocalSet {
  return {
    tempId: nextTempId(),
    weight: prev?.weight ?? '',
    plates: prev?.plates ?? '',
    kicker: prev?.kicker ?? '',
    reps: '',
  };
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

function toKg(value: number, unit: WeightUnit) {
  return unit === 'lbs' ? value * 0.453592 : value;
}

function convertWeight(value: number, from: WeightUnit, to: WeightUnit) {
  if (from === to || !value) return value;
  return from === 'kg' ? value * 2.20462 : value * 0.453592;
}

/** Weight of a set in kg, for DB storage and volume calculation. */
function setWeightKg(s: LocalSet, mode: InputMode, unit: WeightUnit): number {
  if (mode === 'plates') {
    const plates = parseInt(s.plates) || 0;
    const kicker = toKg(parseFloat(s.kicker) || 0, unit);
    return plates * PLATE_KG + kicker;
  }
  return toKg(parseFloat(s.weight) || 0, unit);
}

function setHasReps(s: LocalSet) { return !!(s.reps && parseInt(s.reps) > 0); }

// ─────────────────────────────────────────────────────────────
// EXERCISE CARD
// ─────────────────────────────────────────────────────────────

interface ExerciseCardProps {
  ex: ExerciseLog;
  unit: WeightUnit;
  isExpanded: boolean;
  onToggle: () => void;
  onAddSet: () => void;
  onUpdateSet: (tempId: number, field: keyof LocalSet, value: string) => void;
  onRemoveSet: (tempId: number) => void;
  onSetMode: (mode: InputMode) => void;
  onRemove: () => void;
}

function ExerciseCard({
  ex, unit, isExpanded, onToggle, onAddSet, onUpdateSet, onRemoveSet, onSetMode, onRemove,
}: ExerciseCardProps) {
  const logged = ex.sets.filter(setHasReps).length;

  function handleRemove() {
    const hasSets = ex.sets.some(s => s.weight || s.plates || s.kicker || s.reps);
    if (hasSets) {
      Alert.alert(
        'Remove exercise?',
        'All logged sets for this exercise will be lost.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: onRemove },
        ]
      );
    } else {
      onRemove();
    }
  }

  function handleModePress(mode: InputMode) {
    if (ex.mode === mode) return;
    const hasSets = ex.sets.some(s => s.weight || s.plates || s.kicker || s.reps);
    if (hasSets) {
      Alert.alert(
        'Switch input mode?',
        'Entered values for this exercise will be cleared.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Switch', style: 'destructive', onPress: () => onSetMode(mode) },
        ]
      );
    } else {
      onSetMode(mode);
    }
  }

  return (
    <View style={styles.exCard}>
      <TouchableOpacity style={styles.exHeader} onPress={onToggle} activeOpacity={0.8}>
        <View style={styles.exHeaderLeft}>
          <Text style={styles.exName}>{ex.name}</Text>
          {ex.isCustom && <Text style={styles.customTag}>CUSTOM</Text>}
          {logged > 0 && (
            <Text style={styles.exSetsTag}>{logged} set{logged !== 1 ? 's' : ''}</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.exRemoveBtn}
          onPress={handleRemove}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.exRemoveBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={[styles.exChevron, isExpanded && styles.exChevronOpen]}>›</Text>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.exBody}>
          {/* Mode toggle */}
          <View style={styles.modeRow}>
            <Text style={styles.modeRowLabel}>INPUT MODE</Text>
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, ex.mode === 'weight' && styles.modeBtnActive]}
                onPress={() => handleModePress('weight')}
              >
                <Text style={[styles.modeBtnText, ex.mode === 'weight' && styles.modeBtnTextActive]}>
                  WEIGHT
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, ex.mode === 'plates' && styles.modeBtnActive]}
                onPress={() => handleModePress('plates')}
              >
                <Text style={[styles.modeBtnText, ex.mode === 'plates' && styles.modeBtnTextActive]}>
                  PLATES
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {ex.mode === 'plates' && (
            <Text style={styles.platesHint}>
              1 plate = 45 lbs · kicker in {unit.toUpperCase()}
            </Text>
          )}

          {/* Column headers */}
          {ex.sets.length > 0 && (
            ex.mode === 'weight' ? (
              <View style={styles.setHeaderRow}>
                <Text style={[styles.setHeaderCell, styles.colNum]}>#</Text>
                <Text style={[styles.setHeaderCell, styles.colWeight]}>{unit.toUpperCase()}</Text>
                <Text style={[styles.setHeaderCell, styles.colReps]}>REPS</Text>
                <View style={styles.colDel} />
              </View>
            ) : (
              <View style={styles.setHeaderRow}>
                <Text style={[styles.setHeaderCell, styles.colNum]}>#</Text>
                <Text style={[styles.setHeaderCell, styles.colPlates]}>PLATES</Text>
                <Text style={[styles.setHeaderCell, styles.colKicker]}>+{unit.toUpperCase()}</Text>
                <Text style={[styles.setHeaderCell, styles.colReps]}>REPS</Text>
                <View style={styles.colDel} />
              </View>
            )
          )}

          {/* Set rows */}
          {ex.sets.map((s, i) => (
            ex.mode === 'weight' ? (
              <View key={s.tempId} style={styles.setRow}>
                <Text style={[styles.setNum, styles.colNum]}>{i + 1}</Text>
                <TextInput
                  style={[styles.setInput, styles.colWeight]}
                  value={s.weight}
                  onChangeText={v => onUpdateSet(s.tempId, 'weight', v)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#444"
                  selectTextOnFocus
                />
                <TextInput
                  style={[styles.setInput, styles.colReps]}
                  value={s.reps}
                  onChangeText={v => onUpdateSet(s.tempId, 'reps', v)}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="#444"
                  selectTextOnFocus
                />
                <TouchableOpacity
                  style={styles.colDel}
                  onPress={() => onRemoveSet(s.tempId)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.setDelBtn}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View key={s.tempId} style={styles.setRow}>
                <Text style={[styles.setNum, styles.colNum]}>{i + 1}</Text>
                <TextInput
                  style={[styles.setInput, styles.colPlates]}
                  value={s.plates}
                  onChangeText={v => onUpdateSet(s.tempId, 'plates', v)}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="#444"
                  selectTextOnFocus
                />
                <TextInput
                  style={[styles.setInput, styles.colKicker]}
                  value={s.kicker}
                  onChangeText={v => onUpdateSet(s.tempId, 'kicker', v)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#444"
                  selectTextOnFocus
                />
                <TextInput
                  style={[styles.setInput, styles.colReps]}
                  value={s.reps}
                  onChangeText={v => onUpdateSet(s.tempId, 'reps', v)}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="#444"
                  selectTextOnFocus
                />
                <TouchableOpacity
                  style={styles.colDel}
                  onPress={() => onRemoveSet(s.tempId)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.setDelBtn}>✕</Text>
                </TouchableOpacity>
              </View>
            )
          ))}

          <TouchableOpacity style={styles.addSetBtn} onPress={onAddSet}>
            <Text style={styles.addSetBtnText}>+ ADD SET</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// ADD EXERCISE FORM
// ─────────────────────────────────────────────────────────────

interface AddExerciseFormProps {
  defaultMuscleGroup: MuscleGroup;
  onAdd: (name: string, muscleGroup: MuscleGroup, equipment: EquipmentType) => void;
  onCancel: () => void;
}

function AddExerciseForm({ defaultMuscleGroup, onAdd, onCancel }: AddExerciseFormProps) {
  const [name, setName] = useState('');
  const [mg, setMg] = useState<MuscleGroup>(defaultMuscleGroup);
  const [equipment, setEquipment] = useState<EquipmentType>('barbell');

  function handleAdd() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter an exercise name.');
      return;
    }
    onAdd(name.trim(), mg, equipment);
  }

  return (
    <View style={styles.addExForm}>
      <Text style={styles.addExFormTitle}>ADD EXERCISE</Text>

      <Text style={styles.addExLabel}>NAME</Text>
      <TextInput
        style={styles.addExInput}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Incline Cable Fly"
        placeholderTextColor="#444"
        selectionColor="#EF6C3E"
        autoFocus
        maxLength={48}
      />

      <Text style={styles.addExLabel}>MUSCLE GROUP</Text>
      <View style={styles.addExChipRow}>
        {ALL_MUSCLE_GROUPS.map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.addExChip, mg === m && styles.addExChipActive]}
            onPress={() => setMg(m)}
          >
            <Text style={[styles.addExChipText, mg === m && styles.addExChipTextActive]}>
              {m.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.addExLabel}>EQUIPMENT</Text>
      <View style={styles.addExChipRow}>
        {EQUIPMENT_OPTIONS.map(eq => (
          <TouchableOpacity
            key={eq}
            style={[styles.addExChip, equipment === eq && styles.addExChipActive]}
            onPress={() => setEquipment(eq)}
          >
            <Text style={[styles.addExChipText, equipment === eq && styles.addExChipTextActive]}>
              {EQUIPMENT_LABELS[eq].toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.addExFormBtns}>
        <TouchableOpacity style={styles.addExCancelBtn} onPress={onCancel}>
          <Text style={styles.addExCancelText}>CANCEL</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addExSaveBtn} onPress={handleAdd}>
          <Text style={styles.addExSaveText}>ADD TO SESSION</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────

export default function SessionScreen() {
  const { activeSplit, nextDay } = useWorkoutStore();

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [exercises, setExercises] = useState<ExerciseLog[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);
  const [unit, setUnit] = useState<WeightUnit>('kg');
  const [showAddExercise, setShowAddExercise] = useState(false);

  const startedAt = useRef(new Date().toISOString());
  const startMs = useRef(Date.now());

  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!activeSplit || !nextDay) { router.back(); return; }
    initSession();
  }, []);

  async function initSession() {
    try {
      const db = await getDatabase();

      const prefs = await db.getFirstAsync<{ weight_unit: string }>(
        `SELECT weight_unit FROM user_preferences WHERE id = 1`
      );
      if (prefs?.weight_unit) setUnit(prefs.weight_unit as WeightUnit);

      const result = await db.runAsync(
        `INSERT INTO workout_sessions (split_id, day_id, date, started_at)
         VALUES (?, ?, date('now','localtime'), ?)`,
        [activeSplit!.id, nextDay!.id, startedAt.current]
      );
      setSessionId(result.lastInsertRowId as number);

      if (!nextDay!.muscleGroups.length) return;

      const placeholders = nextDay!.muscleGroups.map(() => '?').join(',');
      const rows = await db.getAllAsync<{ id: number; name: string; muscle_group: string }>(
        `SELECT id, name, muscle_group FROM exercises
         WHERE muscle_group IN (${placeholders}) AND is_custom = 0
         ORDER BY muscle_group, name`,
        nextDay!.muscleGroups
      );

      const exList: ExerciseLog[] = rows.map(r => ({
        id: r.id, name: r.name,
        muscleGroup: r.muscle_group as MuscleGroup,
        sets: [], isCustom: false, mode: 'weight',
      }));

      setExercises(exList);

      if (exList.length > 0) {
        setExpandedId(exList[0].id);
        setExercises(prev => prev.map((e, i) =>
          i === 0 ? { ...e, sets: [newSet()] } : e
        ));
      }
    } catch (err) {
      console.error('initSession error:', err);
      Alert.alert('Error', 'Could not start session.');
      router.back();
    }
  }

  // ── Unit toggle ────────────────────────────────────────────

  async function toggleUnit() {
    const next: WeightUnit = unit === 'kg' ? 'lbs' : 'kg';
    setExercises(prev => prev.map(e => ({
      ...e,
      sets: e.sets.map(s => {
        const w = parseFloat(s.weight);
        const k = parseFloat(s.kicker);
        return {
          ...s,
          weight: w ? convertWeight(w, unit, next).toFixed(1) : s.weight,
          kicker: k ? convertWeight(k, unit, next).toFixed(1) : s.kicker,
        };
      }),
    })));
    setUnit(next);
    try {
      const db = await getDatabase();
      await db.runAsync(`UPDATE user_preferences SET weight_unit = ? WHERE id = 1`, [next]);
    } catch (err) {
      console.error('save unit pref error:', err);
    }
  }

  // ── Set mutations ──────────────────────────────────────────

  function addSet(exerciseId: number) {
    setExercises(prev => prev.map(e => {
      if (e.id !== exerciseId) return e;
      const last = e.sets[e.sets.length - 1];
      return { ...e, sets: [...e.sets, newSet(last)] };
    }));
  }

  function updateSet(exerciseId: number, tempId: number, field: keyof LocalSet, value: string) {
    setExercises(prev => prev.map(e =>
      e.id === exerciseId
        ? { ...e, sets: e.sets.map(s => s.tempId === tempId ? { ...s, [field]: value } : s) }
        : e
    ));
  }

  function removeSet(exerciseId: number, tempId: number) {
    setExercises(prev => prev.map(e =>
      e.id === exerciseId
        ? { ...e, sets: e.sets.filter(s => s.tempId !== tempId) }
        : e
    ));
  }

  function removeExercise(exerciseId: number) {
    setExercises(prev => prev.filter(e => e.id !== exerciseId));
    if (expandedId === exerciseId) setExpandedId(null);
  }

  function setMode(exerciseId: number, mode: InputMode) {
    setExercises(prev => prev.map(e =>
      e.id === exerciseId
        ? { ...e, mode, sets: e.sets.map(s => ({ ...s, weight: '', plates: '', kicker: '', reps: '' })) }
        : e
    ));
  }

  // ── Add custom exercise ────────────────────────────────────

  async function handleAddCustomExercise(
    name: string, muscleGroup: MuscleGroup, equipment: EquipmentType
  ) {
    try {
      const db = await getDatabase();
      const result = await db.runAsync(
        `INSERT INTO exercises (name, muscle_group, equipment, is_custom) VALUES (?, ?, ?, 1)`,
        [name, muscleGroup, equipment]
      );
      const newId = result.lastInsertRowId as number;
      setExercises(prev => [...prev, {
        id: newId, name, muscleGroup, sets: [], isCustom: true, mode: 'weight',
      }]);
      setExpandedId(newId);
      setShowAddExercise(false);
    } catch (err) {
      console.error('add custom exercise error:', err);
      Alert.alert('Error', 'Could not add exercise.');
    }
  }

  // ── Totals ─────────────────────────────────────────────────

  const totalSets = exercises.reduce(
    (acc, e) => acc + e.sets.filter(setHasReps).length, 0
  );
  const totalVolumeKg = exercises.reduce(
    (acc, e) => acc + e.sets.reduce((sa, s) => {
      const r = parseInt(s.reps) || 0;
      return sa + setWeightKg(s, e.mode, unit) * r;
    }, 0), 0
  );
  const displayVolume = unit === 'lbs'
    ? (totalVolumeKg * 2.20462).toFixed(0)
    : totalVolumeKg.toFixed(0);

  // ── Finish ─────────────────────────────────────────────────

  async function handleFinish() {
    if (totalSets === 0) {
      Alert.alert('No sets logged', 'Log at least one set before finishing.');
      return;
    }
    setIsFinishing(true);
    try {
      const db = await getDatabase();
      const completedAt = new Date().toISOString();
      const duration = Math.floor((Date.now() - startMs.current) / 1000);

      await db.withExclusiveTransactionAsync(async () => {
        for (const ex of exercises) {
          const validSets = ex.sets.filter(setHasReps);
          for (let i = 0; i < validSets.length; i++) {
            const s = validSets[i];
            await db.runAsync(
              `INSERT INTO set_entries
                 (session_id, exercise_id, set_number, reps, weight_kg, is_warmup, plates_count)
               VALUES (?, ?, ?, ?, ?, 0, ?)`,
              [
                sessionId, ex.id, i + 1,
                parseInt(s.reps),
                setWeightKg(s, ex.mode, unit),
                ex.mode === 'plates' ? (parseInt(s.plates) || 0) : null,
              ]
            );
          }
        }
        await db.runAsync(
          `UPDATE workout_sessions SET completed_at = ?, duration_seconds = ? WHERE id = ?`,
          [completedAt, duration, sessionId]
        );
      });

      router.back();
    } catch (err) {
      console.error('finish session error:', err);
      Alert.alert('Error', 'Failed to save session.');
    } finally {
      setIsFinishing(false);
    }
  }

  // ── Discard ────────────────────────────────────────────────

  function handleDiscard() {
    Alert.alert(
      'Discard session?',
      'All logged sets will be lost.',
      [
        { text: 'Keep going', style: 'cancel' },
        {
          text: 'Discard', style: 'destructive',
          onPress: async () => {
            if (sessionId) {
              const db = await getDatabase();
              await db.runAsync(`DELETE FROM workout_sessions WHERE id = ?`, [sessionId]);
            }
            router.back();
          },
        },
      ]
    );
  }

  // ── Render ─────────────────────────────────────────────────

  const groups = (nextDay?.muscleGroups ?? []) as MuscleGroup[];
  const customExtra = exercises.filter(e => e.isCustom && !groups.includes(e.muscleGroup));

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleDiscard} style={styles.discardBtn}>
          <Text style={styles.discardBtnText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEyebrow}>
            DAY {nextDay?.dayNumber} · {nextDay?.label?.toUpperCase()}
          </Text>
          <Text style={styles.headerTimer}>{formatTime(elapsed)}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.unitToggle} onPress={toggleUnit}>
            <Text style={[styles.unitOption, unit === 'kg' && styles.unitOptionActive]}>KG</Text>
            <Text style={styles.unitSep}>·</Text>
            <Text style={[styles.unitOption, unit === 'lbs' && styles.unitOptionActive]}>LBS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.finishBtn, isFinishing && styles.finishBtnDisabled]}
            onPress={handleFinish}
            disabled={isFinishing}
          >
            <Text style={styles.finishBtnText}>{isFinishing ? '…' : 'FINISH'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {groups.map(mg => {
            const exList = exercises.filter(e => e.muscleGroup === mg);
            if (!exList.length) return null;
            return (
              <View key={mg} style={styles.muscleSection}>
                <Text style={styles.muscleSectionLabel}>{mg.toUpperCase()}</Text>
                {exList.map(ex => (
                  <ExerciseCard
                    key={ex.id}
                    ex={ex}
                    unit={unit}
                    isExpanded={expandedId === ex.id}
                    onToggle={() => setExpandedId(prev => prev === ex.id ? null : ex.id)}
                    onAddSet={() => addSet(ex.id)}
                    onUpdateSet={(tempId, field, value) => updateSet(ex.id, tempId, field, value)}
                    onRemoveSet={tempId => removeSet(ex.id, tempId)}
                    onSetMode={mode => setMode(ex.id, mode)}
                    onRemove={() => removeExercise(ex.id)}
                  />
                ))}
              </View>
            );
          })}

          {customExtra.length > 0 && (
            <View style={styles.muscleSection}>
              <Text style={styles.muscleSectionLabel}>ADDED</Text>
              {customExtra.map(ex => (
                <ExerciseCard
                  key={ex.id}
                  ex={ex}
                  unit={unit}
                  isExpanded={expandedId === ex.id}
                  onToggle={() => setExpandedId(prev => prev === ex.id ? null : ex.id)}
                  onAddSet={() => addSet(ex.id)}
                  onUpdateSet={(tempId, field, value) => updateSet(ex.id, tempId, field, value)}
                  onRemoveSet={tempId => removeSet(ex.id, tempId)}
                  onSetMode={mode => setMode(ex.id, mode)}
                  onRemove={() => removeExercise(ex.id)}
                />
              ))}
            </View>
          )}

          <View style={styles.addExSection}>
            {showAddExercise ? (
              <AddExerciseForm
                defaultMuscleGroup={groups[0] ?? 'chest'}
                onAdd={handleAddCustomExercise}
                onCancel={() => setShowAddExercise(false)}
              />
            ) : (
              <TouchableOpacity
                style={styles.addExTrigger}
                onPress={() => setShowAddExercise(true)}
              >
                <Text style={styles.addExTriggerText}>+ ADD EXERCISE</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalSets}</Text>
          <Text style={styles.statLabel}>SETS</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{displayVolume}</Text>
          <Text style={styles.statLabel}>{unit.toUpperCase()} VOLUME</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{formatTime(elapsed)}</Text>
          <Text style={styles.statLabel}>TIME</Text>
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

  // ── Header ──────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1E1D1A', gap: 8,
  },
  discardBtn: { width: 30, alignItems: 'flex-start' },
  discardBtnText: { fontSize: 18, color: '#555' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerEyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: '#555' },
  headerTimer: { fontSize: 20, fontWeight: '800', color: '#F2F0EB', letterSpacing: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unitToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#181714', borderWidth: 1, borderColor: '#2A2926',
    borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6,
  },
  unitOption: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: '#444' },
  unitOptionActive: { color: '#EF6C3E' },
  unitSep: { fontSize: 10, color: '#333' },
  finishBtn: {
    backgroundColor: '#EF6C3E', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
  },
  finishBtnDisabled: { opacity: 0.4 },
  finishBtnText: { color: '#0E0D0B', fontWeight: '800', fontSize: 11, letterSpacing: 1.5 },

  // ── Scroll ──────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },

  // ── Muscle section ───────────────────────────────────────
  muscleSection: { marginBottom: 24 },
  muscleSectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 2.5, color: '#EF6C3E', marginBottom: 10,
  },

  // ── Exercise card ────────────────────────────────────────
  exCard: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 12, marginBottom: 8, overflow: 'hidden',
  },
  exHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14,
  },
  exHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  exName: { fontSize: 15, fontWeight: '700', color: '#F2F0EB' },
  customTag: {
    fontSize: 9, fontWeight: '800', letterSpacing: 1, color: '#9B6CEF',
    backgroundColor: '#9B6CEF18', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
  },
  exSetsTag: {
    fontSize: 11, fontWeight: '700', color: '#EF6C3E',
    backgroundColor: '#EF6C3E18', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2,
  },
  exRemoveBtn: {
    backgroundColor: '#2A1414', borderWidth: 1, borderColor: '#4A2020',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, marginRight: 4,
  },
  exRemoveBtnText: { fontSize: 11, color: '#C06060', fontWeight: '700', letterSpacing: 0.5 },
  exChevron: { fontSize: 20, color: '#444', lineHeight: 24, transform: [{ rotate: '0deg' }] },
  exChevronOpen: { transform: [{ rotate: '90deg' }], color: '#EF6C3E' },

  // ── Exercise body ────────────────────────────────────────
  exBody: {
    borderTopWidth: 1, borderTopColor: '#1E1D1A', paddingHorizontal: 14, paddingVertical: 12,
  },

  // ── Mode toggle ──────────────────────────────────────────
  modeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
  },
  modeRowLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: '#444' },
  modeToggle: {
    flexDirection: 'row', borderWidth: 1, borderColor: '#2A2926', borderRadius: 8, overflow: 'hidden',
  },
  modeBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#0E0D0B' },
  modeBtnActive: { backgroundColor: '#EF6C3E18' },
  modeBtnText: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: '#444' },
  modeBtnTextActive: { color: '#EF6C3E' },

  platesHint: {
    fontSize: 11, color: '#555', marginBottom: 10, fontStyle: 'italic',
  },

  // ── Set table ────────────────────────────────────────────
  setHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  setHeaderCell: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: '#444', textAlign: 'center',
  },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 5 },
  setNum: { fontSize: 13, fontWeight: '700', color: '#555', textAlign: 'center' },
  setInput: {
    backgroundColor: '#0E0D0B', borderWidth: 1, borderColor: '#2A2926',
    borderRadius: 8, paddingVertical: 8, paddingHorizontal: 4,
    fontSize: 15, fontWeight: '700', color: '#F2F0EB', textAlign: 'center',
  },
  setDelBtn: { fontSize: 14, color: '#3A3835', textAlign: 'center' },

  // Column widths
  colNum: { width: 24 },
  colWeight: { flex: 2 },
  colPlates: { flex: 2 },
  colKicker: { flex: 2 },
  colReps: { flex: 2 },
  colDel: { width: 24, alignItems: 'center' },

  addSetBtn: {
    marginTop: 4, paddingVertical: 10,
    borderWidth: 1, borderColor: '#252320', borderRadius: 8, alignItems: 'center',
  },
  addSetBtnText: { fontSize: 12, fontWeight: '700', letterSpacing: 1.5, color: '#555' },

  // ── Add exercise section ─────────────────────────────────
  addExSection: { marginBottom: 8 },
  addExTrigger: {
    borderWidth: 1, borderColor: '#252320', borderRadius: 12, borderStyle: 'dashed',
    paddingVertical: 16, alignItems: 'center',
  },
  addExTriggerText: { fontSize: 12, fontWeight: '700', letterSpacing: 1.5, color: '#444' },

  // ── Add exercise form ────────────────────────────────────
  addExForm: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 12, padding: 16,
  },
  addExFormTitle: {
    fontSize: 11, fontWeight: '700', letterSpacing: 2.5, color: '#EF6C3E', marginBottom: 16,
  },
  addExLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: '#555', marginBottom: 8 },
  addExInput: {
    backgroundColor: '#0E0D0B', borderWidth: 1, borderColor: '#2A2926',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontWeight: '600', color: '#F2F0EB', marginBottom: 16,
  },
  addExChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 16 },
  addExChip: {
    borderWidth: 1, borderColor: '#2A2926', borderRadius: 7,
    paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#0E0D0B',
  },
  addExChipActive: { borderColor: '#EF6C3E', backgroundColor: '#EF6C3E18' },
  addExChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: '#555' },
  addExChipTextActive: { color: '#EF6C3E' },
  addExFormBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  addExCancelBtn: {
    flex: 1, borderWidth: 1, borderColor: '#252320', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  addExCancelText: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: '#555' },
  addExSaveBtn: {
    flex: 2, backgroundColor: '#EF6C3E', borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  addExSaveText: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: '#0E0D0B' },

  // ── Stats bar ─────────────────────────────────────────────
  statsBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#141311', borderTopWidth: 1, borderTopColor: '#1E1D1A',
    paddingVertical: 14, paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', color: '#F2F0EB' },
  statLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: '#555', marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: '#1E1D1A' },
});
