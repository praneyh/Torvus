// ============================================================
// TORVUS — Split Builder Screen
// ============================================================

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
  Animated,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { getDatabase } from '@/db/schema';
import type {
  MuscleGroup,
  PresetSplitType,
} from '@/types/models';

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

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

const MUSCLE_COLORS: Record<MuscleGroup, string> = {
  chest: '#EF6C3E', back: '#3E8CEF', shoulders: '#9B6CEF',
  biceps: '#EF3E7A', triceps: '#EF9B3E', forearms: '#C87B3E',
  quads: '#3EEFB8', hamstrings: '#3EC4EF', glutes: '#EF3EDE',
  calves: '#EFDE3E', adductors: '#7BCF6E', core: '#6CEF3E',
};

// ─────────────────────────────────────────────────────────────
// LOCAL TYPES
// ─────────────────────────────────────────────────────────────

interface DayConfig {
  dayNumber: number;
  label: string;
  muscleGroups: MuscleGroup[];
}

interface SavedSplitDay {
  dayNumber: number;
  label: string;
  muscleGroups: MuscleGroup[];
}

interface SavedSplit {
  id: number;
  name: string;
  daysPerWeek: number;
  days: SavedSplitDay[];
}

// ─────────────────────────────────────────────────────────────
// PRESET DEFINITIONS
// ─────────────────────────────────────────────────────────────

interface PresetDefinition {
  type: PresetSplitType;
  name: string;
  description: string;
  daysPerWeek: number;
  days: Omit<DayConfig, 'dayNumber'>[];
}

const PRESETS: PresetDefinition[] = [
  {
    type: 'PPL',
    name: 'Push / Pull / Legs',
    description: '6-day — maximum frequency & volume',
    daysPerWeek: 6,
    days: [
      { label: 'Push A', muscleGroups: ['chest', 'shoulders', 'triceps'] },
      { label: 'Pull A', muscleGroups: ['back', 'biceps'] },
      { label: 'Legs A', muscleGroups: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { label: 'Push B', muscleGroups: ['chest', 'shoulders', 'triceps'] },
      { label: 'Pull B', muscleGroups: ['back', 'biceps'] },
      { label: 'Legs B', muscleGroups: ['quads', 'hamstrings', 'glutes', 'calves'] },
    ],
  },
  {
    type: 'UpperLower',
    name: 'Upper / Lower',
    description: '4-day — balanced strength & hypertrophy',
    daysPerWeek: 4,
    days: [
      { label: 'Upper A', muscleGroups: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] },
      { label: 'Lower A', muscleGroups: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { label: 'Upper B', muscleGroups: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] },
      { label: 'Lower B', muscleGroups: ['quads', 'hamstrings', 'glutes', 'calves'] },
    ],
  },
  {
    type: 'BroSplit',
    name: 'Bro Split',
    description: '5-day — one muscle group per session',
    daysPerWeek: 5,
    days: [
      { label: 'Chest', muscleGroups: ['chest', 'triceps'] },
      { label: 'Back', muscleGroups: ['back', 'biceps'] },
      { label: 'Shoulders', muscleGroups: ['shoulders', 'core'] },
      { label: 'Arms', muscleGroups: ['biceps', 'triceps'] },
      { label: 'Legs', muscleGroups: ['quads', 'hamstrings', 'glutes', 'calves'] },
    ],
  },
  {
    type: 'FullBody',
    name: 'Full Body',
    description: '3-day — ideal for beginners & efficiency',
    daysPerWeek: 3,
    days: [
      { label: 'Full Body A', muscleGroups: ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'core'] },
      { label: 'Full Body B', muscleGroups: ['chest', 'back', 'biceps', 'triceps', 'glutes', 'calves'] },
      { label: 'Full Body C', muscleGroups: ['shoulders', 'back', 'chest', 'quads', 'hamstrings', 'core'] },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

interface PresetCardProps {
  preset: PresetDefinition;
  isSelected: boolean;
  onPress: () => void;
}

const PresetCard: React.FC<PresetCardProps> = ({ preset, isSelected, onPress }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true, speed: 30 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30 }).start();
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
    >
      <Animated.View style={[
        styles.presetCard,
        isSelected && styles.presetCardSelected,
        { transform: [{ scale: scaleAnim }] },
      ]}>
        {isSelected && <View style={styles.presetCardActiveBorder} />}
        <View style={styles.presetCardContent}>
          <View style={styles.presetCardHeader}>
            <Text style={[styles.presetName, isSelected && styles.presetNameSelected]}>
              {preset.name}
            </Text>
            <View style={[styles.presetDayBadge, isSelected && styles.presetDayBadgeSelected]}>
              <Text style={[styles.presetDayBadgeText, isSelected && styles.presetDayBadgeTextSelected]}>
                {preset.daysPerWeek}d
              </Text>
            </View>
          </View>
          <Text style={styles.presetDescription}>{preset.description}</Text>
          <View style={styles.presetMuscleRow}>
            {preset.days[0].muscleGroups.slice(0, 4).map(mg => (
              <View
                key={mg}
                style={[styles.presetMuscleDot, { backgroundColor: MUSCLE_COLORS[mg] }]}
              />
            ))}
            {preset.days[0].muscleGroups.length > 4 && (
              <Text style={styles.presetMuscleMore}>+{preset.days[0].muscleGroups.length - 4}</Text>
            )}
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};

// ─────────────────────────────────────────────────────────────

interface SavedSplitCardProps {
  split: SavedSplit;
  isActive: boolean;
  onActivate: () => void;
  onDelete: () => void;
}

const SavedSplitCard: React.FC<SavedSplitCardProps> = ({ split, isActive, onActivate, onDelete }) => (
  <View style={[styles.savedCard, isActive && styles.savedCardActive]}>
    {isActive && <View style={styles.savedCardActiveBorder} />}
    <View style={styles.savedCardInner}>
      <View style={styles.savedCardHeader}>
        <View style={styles.savedCardMeta}>
          <Text style={styles.savedCardName}>{split.name}</Text>
          <Text style={styles.savedCardSub}>{split.daysPerWeek} days per week</Text>
        </View>
        <View style={styles.savedCardActions}>
          {isActive ? (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>ACTIVE</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.setActiveBtn} onPress={onActivate}>
              <Text style={styles.setActiveBtnText}>SET ACTIVE</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={onDelete}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.deleteBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.savedCardDays}>
        {split.days.map(day => {
          const primaryColor = day.muscleGroups[0]
            ? MUSCLE_COLORS[day.muscleGroups[0]]
            : '#444';
          return (
            <View key={day.dayNumber} style={styles.savedDayChip}>
              <View style={[styles.savedDayDot, { backgroundColor: primaryColor }]} />
              <Text style={styles.savedDayLabel}>
                D{day.dayNumber} {day.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  </View>
);

// ─────────────────────────────────────────────────────────────

interface DayCardProps {
  day: DayConfig;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onLabelChange: (label: string) => void;
  onToggleMuscle: (mg: MuscleGroup) => void;
}

const DayCard: React.FC<DayCardProps> = ({
  day, isExpanded, onToggleExpand, onLabelChange, onToggleMuscle,
}) => {
  const expandAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

  const handleToggle = () => {
    Animated.spring(expandAnim, {
      toValue: isExpanded ? 0 : 1,
      useNativeDriver: false,
      speed: 20,
      bounciness: 4,
    }).start();
    onToggleExpand();
  };

  const primaryColor = day.muscleGroups[0]
    ? MUSCLE_COLORS[day.muscleGroups[0]]
    : '#444';

  return (
    <View style={styles.dayCard}>
      <View style={[styles.dayAccentStrip, { backgroundColor: primaryColor }]} />
      <View style={styles.dayCardContent}>
        <TouchableOpacity
          style={styles.dayCardHeader}
          onPress={handleToggle}
          activeOpacity={0.8}
        >
          <View style={styles.dayCardHeaderLeft}>
            <Text style={styles.dayNumber}>DAY {day.dayNumber}</Text>
            <Text style={styles.dayLabel} numberOfLines={1}>
              {day.label || 'Unnamed Day'}
            </Text>
          </View>
          <View style={styles.dayCardHeaderRight}>
            {!isExpanded && day.muscleGroups.slice(0, 3).map(mg => (
              <View
                key={mg}
                style={[styles.muscleChipSmall, { backgroundColor: MUSCLE_COLORS[mg] + '33', borderColor: MUSCLE_COLORS[mg] + '88' }]}
              >
                <Text style={[styles.muscleChipSmallText, { color: MUSCLE_COLORS[mg] }]}>
                  {MUSCLE_LABELS[mg].slice(0, 3).toUpperCase()}
                </Text>
              </View>
            ))}
            {!isExpanded && day.muscleGroups.length > 3 && (
              <Text style={styles.muscleOverflow}>+{day.muscleGroups.length - 3}</Text>
            )}
            <Text style={[styles.expandChevron, isExpanded && styles.expandChevronOpen]}>›</Text>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.dayCardBody}>
            <View style={styles.labelInputRow}>
              <Text style={styles.inputLabel}>DAY LABEL</Text>
              <TextInput
                style={styles.labelInput}
                value={day.label}
                onChangeText={onLabelChange}
                placeholder="e.g. Push, Pull, Legs…"
                placeholderTextColor="#555"
                selectionColor="#EF6C3E"
                maxLength={32}
              />
            </View>

            <Text style={styles.inputLabel}>MUSCLE GROUPS</Text>
            <View style={styles.muscleGrid}>
              {MUSCLE_GROUPS.map(mg => {
                const active = day.muscleGroups.includes(mg);
                return (
                  <TouchableOpacity
                    key={mg}
                    style={[
                      styles.muscleChip,
                      active && { backgroundColor: MUSCLE_COLORS[mg] + '22', borderColor: MUSCLE_COLORS[mg] },
                      !active && styles.muscleChipInactive,
                    ]}
                    onPress={() => onToggleMuscle(mg)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.muscleChipDot, { backgroundColor: active ? MUSCLE_COLORS[mg] : '#444' }]} />
                    <Text style={[styles.muscleChipText, active && { color: '#F2F0EB' }]}>
                      {MUSCLE_LABELS[mg]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────

export default function SplitBuilderScreen() {
  // ── New split form state ─────────────────────────────────
  const [splitName, setSplitName] = useState('');
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [selectedPreset, setSelectedPreset] = useState<PresetSplitType | null>(null);
  const [dayConfigs, setDayConfigs] = useState<DayConfig[]>(() => buildDefaultDays(4));
  const [expandedDay, setExpandedDay] = useState<number | null>(1);
  const [isSaving, setIsSaving] = useState(false);

  // ── Saved splits state ───────────────────────────────────
  const [savedSplits, setSavedSplits] = useState<SavedSplit[]>([]);
  const [activeSplitId, setActiveSplitId] = useState<number | null>(null);
  const [isLoadingSaved, setIsLoadingSaved] = useState(true);

  const scrollRef = useRef<ScrollView>(null);

  // Reload saved splits whenever this screen is focused
  useFocusEffect(
    useCallback(() => {
      loadSavedSplits();
    }, [])
  );

  // ── Load saved splits from DB ────────────────────────────

  async function loadSavedSplits() {
    setIsLoadingSaved(true);
    try {
      const db = await getDatabase();

      const prefs = await db.getFirstAsync<{ active_split_id: number | null }>(
        `SELECT active_split_id FROM user_preferences WHERE id = 1`
      );
      setActiveSplitId(prefs?.active_split_id ?? null);

      const splits = await db.getAllAsync<{ id: number; name: string; days_per_week: number }>(
        `SELECT id, name, days_per_week FROM workout_splits WHERE is_preset = 0 ORDER BY created_at DESC`
      );

      const result: SavedSplit[] = [];
      for (const split of splits) {
        const days = await db.getAllAsync<{ day_number: number; label: string; muscle_groups: string }>(
          `SELECT day_number, label, muscle_groups FROM workout_days
           WHERE split_id = ? ORDER BY day_number`,
          [split.id]
        );
        result.push({
          id: split.id,
          name: split.name,
          daysPerWeek: split.days_per_week,
          days: days.map((d: { day_number: number; label: string; muscle_groups: string }) => ({
            dayNumber: d.day_number,
            label: d.label,
            muscleGroups: d.muscle_groups.split(',').filter(Boolean) as MuscleGroup[],
          })),
        });
      }
      setSavedSplits(result);
    } catch (err) {
      console.error('loadSavedSplits error:', err);
    } finally {
      setIsLoadingSaved(false);
    }
  }

  // ── Activate a saved split ───────────────────────────────

  async function handleActivateSplit(splitId: number) {
    try {
      const db = await getDatabase();
      await db.runAsync(
        `UPDATE user_preferences SET active_split_id = ? WHERE id = 1`,
        [splitId]
      );
      setActiveSplitId(splitId);
    } catch (err) {
      console.error('activate split error:', err);
      Alert.alert('Error', 'Could not activate split.');
    }
  }

  // ── Delete a saved split ─────────────────────────────────

  function handleDeleteSplit(split: SavedSplit) {
    Alert.alert(
      `Delete "${split.name}"?`,
      'This will permanently remove this split and all its days.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              const db = await getDatabase();
              await db.runAsync(`DELETE FROM workout_days WHERE split_id = ?`, [split.id]);
              await db.runAsync(`DELETE FROM workout_splits WHERE id = ?`, [split.id]);
              if (activeSplitId === split.id) {
                await db.runAsync(
                  `UPDATE user_preferences SET active_split_id = NULL WHERE id = 1`
                );
                setActiveSplitId(null);
              }
              setSavedSplits(prev => prev.filter(s => s.id !== split.id));
            } catch (err) {
              console.error('delete split error:', err);
              Alert.alert('Error', 'Could not delete split.');
            }
          },
        },
      ]
    );
  }

  // ── New split form helpers ───────────────────────────────

  function buildDefaultDays(count: number): DayConfig[] {
    return Array.from({ length: count }, (_, i) => ({
      dayNumber: i + 1,
      label: '',
      muscleGroups: [],
    }));
  }

  const applyPreset = useCallback((preset: PresetDefinition) => {
    setSelectedPreset(preset.type);
    setSplitName(prev => (prev === '' || PRESETS.some(p => p.name === prev)) ? preset.name : prev);
    setDaysPerWeek(preset.daysPerWeek);
    setDayConfigs(
      preset.days.map((d, i) => ({
        dayNumber: i + 1,
        label: d.label,
        muscleGroups: d.muscleGroups,
      }))
    );
    setExpandedDay(1);
  }, []);

  const handleDaysChange = useCallback((newCount: number) => {
    setDaysPerWeek(newCount);
    setSelectedPreset(null);
    setDayConfigs(prev => {
      if (newCount > prev.length) {
        return [
          ...prev,
          ...Array.from({ length: newCount - prev.length }, (_, i) => ({
            dayNumber: prev.length + i + 1,
            label: '',
            muscleGroups: [] as MuscleGroup[],
          })),
        ];
      }
      return prev.slice(0, newCount);
    });
  }, []);

  const handleLabelChange = useCallback((dayNumber: number, label: string) => {
    setDayConfigs(prev =>
      prev.map(d => d.dayNumber === dayNumber ? { ...d, label } : d)
    );
  }, []);

  const handleToggleMuscle = useCallback((dayNumber: number, mg: MuscleGroup) => {
    setDayConfigs(prev =>
      prev.map(d => {
        if (d.dayNumber !== dayNumber) return d;
        const has = d.muscleGroups.includes(mg);
        return {
          ...d,
          muscleGroups: has
            ? d.muscleGroups.filter(m => m !== mg)
            : [...d.muscleGroups, mg],
        };
      })
    );
  }, []);

  function validate(): string | null {
    if (!splitName.trim()) return 'Please give your split a name.';
    for (const day of dayConfigs) {
      if (!day.label.trim()) return `Day ${day.dayNumber} needs a label.`;
      if (day.muscleGroups.length === 0)
        return `Day ${day.dayNumber} needs at least one muscle group.`;
    }
    return null;
  }

  // ── Save new split ───────────────────────────────────────

  const handleSave = async () => {
    const error = validate();
    if (error) {
      Alert.alert('Almost there', error);
      return;
    }

    setIsSaving(true);
    try {
      const db = await getDatabase();

      const splitResult = await db.runAsync(
        `INSERT INTO workout_splits
           (name, days_per_week, is_preset, preset_type)
         VALUES (?, ?, 0, ?)`,
        [splitName.trim(), daysPerWeek, selectedPreset ?? null]
      );
      const splitId = splitResult.lastInsertRowId as number;

      for (const day of dayConfigs) {
        await db.runAsync(
          `INSERT INTO workout_days
             (split_id, day_number, label, muscle_groups)
           VALUES (?, ?, ?, ?)`,
          [splitId, day.dayNumber, day.label.trim(), day.muscleGroups.join(',')]
        );
      }

      await db.runAsync(
        `UPDATE user_preferences SET active_split_id = ? WHERE id = 1`,
        [splitId]
      );

      // Reset form
      setSplitName('');
      setSelectedPreset(null);
      setDaysPerWeek(4);
      setDayConfigs(buildDefaultDays(4));
      setExpandedDay(1);

      // Reload the saved splits list
      await loadSavedSplits();

      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } catch (err) {
      console.error('SplitBuilder save error:', err);
      Alert.alert('Save failed', 'Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerEyebrow}>TORVUS</Text>
          <Text style={styles.headerTitle}>Split Builder</Text>
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text style={styles.saveBtnText}>{isSaving ? '…' : 'SAVE'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── My Splits ──────────────────────────────── */}
        {(isLoadingSaved || savedSplits.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>MY SPLITS</Text>
            {isLoadingSaved ? (
              <ActivityIndicator color="#EF6C3E" style={{ marginTop: 8 }} />
            ) : (
              savedSplits.map(split => (
                <SavedSplitCard
                  key={split.id}
                  split={split}
                  isActive={activeSplitId === split.id}
                  onActivate={() => handleActivateSplit(split.id)}
                  onDelete={() => handleDeleteSplit(split)}
                />
              ))
            )}
          </View>
        )}

        {/* ── Divider between saved splits and builder ─ */}
        {savedSplits.length > 0 && (
          <View style={styles.builderDivider}>
            <View style={styles.builderDividerLine} />
            <Text style={styles.builderDividerText}>CREATE NEW</Text>
            <View style={styles.builderDividerLine} />
          </View>
        )}

        {/* ── Split Name ─────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SPLIT NAME</Text>
          <TextInput
            style={styles.nameInput}
            value={splitName}
            onChangeText={setSplitName}
            placeholder="e.g. Summer Cut, My PPL…"
            placeholderTextColor="#555"
            selectionColor="#EF6C3E"
            maxLength={48}
            returnKeyType="done"
          />
        </View>

        {/* ── Days Per Week ──────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DAYS PER WEEK</Text>
          <View style={styles.daysRow}>
            {[3, 4, 5, 6].map(n => (
              <TouchableOpacity
                key={n}
                style={[styles.dayPill, daysPerWeek === n && styles.dayPillSelected]}
                onPress={() => handleDaysChange(n)}
                activeOpacity={0.75}
              >
                <Text style={[styles.dayPillText, daysPerWeek === n && styles.dayPillTextSelected]}>
                  {n}
                </Text>
                <Text style={[styles.dayPillSub, daysPerWeek === n && styles.dayPillSubSelected]}>
                  {'days'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Presets ────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>START FROM A PRESET</Text>
          <Text style={styles.sectionSub}>Optional — tap to pre-populate your days</Text>
          <View style={styles.presetsGrid}>
            {PRESETS.map(preset => (
              <PresetCard
                key={preset.type}
                preset={preset}
                isSelected={selectedPreset === preset.type}
                onPress={() => applyPreset(preset)}
              />
            ))}
          </View>
        </View>

        {/* ── Day Builder ────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CONFIGURE DAYS</Text>
          <Text style={styles.sectionSub}>Tap each day to set a label and muscle groups</Text>
          {dayConfigs.map(day => (
            <DayCard
              key={day.dayNumber}
              day={day}
              isExpanded={expandedDay === day.dayNumber}
              onToggleExpand={() =>
                setExpandedDay(prev => prev === day.dayNumber ? null : day.dayNumber)
              }
              onLabelChange={label => handleLabelChange(day.dayNumber, label)}
              onToggleMuscle={mg => handleToggleMuscle(day.dayNumber, mg)}
            />
          ))}
        </View>

        {/* ── Bottom CTA ─────────────────────────────── */}
        <TouchableOpacity
          style={[styles.bottomSaveBtn, isSaving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={isSaving}
          activeOpacity={0.85}
        >
          <Text style={styles.bottomSaveBtnText}>
            {isSaving ? 'Saving…' : `Save "${splitName || 'My Split'}"`}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
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
    paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1E1D1A',
  },
  backBtn: { width: 36, alignItems: 'flex-start' },
  backBtnText: { fontSize: 32, color: '#EF6C3E', lineHeight: 36, marginTop: -2 },
  headerEyebrow: {
    fontSize: 10, fontWeight: '700', letterSpacing: 3, color: '#EF6C3E', textAlign: 'center',
  },
  headerTitle: {
    fontSize: 20, fontWeight: '700', color: '#F2F0EB', textAlign: 'center', letterSpacing: 0.5,
  },
  saveBtn: { backgroundColor: '#EF6C3E', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#0E0D0B', fontWeight: '800', fontSize: 12, letterSpacing: 1.5 },

  // ── Scroll ──────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },

  // ── Section ─────────────────────────────────────────────
  section: { marginBottom: 32 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2.5, color: '#EF6C3E', marginBottom: 4 },
  sectionSub: { fontSize: 13, color: '#666', marginBottom: 14, letterSpacing: 0.2 },

  // ── Saved Splits ─────────────────────────────────────────
  savedCard: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 14, marginBottom: 10, overflow: 'hidden', flexDirection: 'row',
  },
  savedCardActive: { borderColor: '#EF6C3E44', backgroundColor: '#1A1510' },
  savedCardActiveBorder: { width: 3, backgroundColor: '#EF6C3E' },
  savedCardInner: { flex: 1, padding: 14 },
  savedCardHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12,
  },
  savedCardMeta: { flex: 1, marginRight: 8 },
  savedCardName: { fontSize: 15, fontWeight: '700', color: '#F2F0EB', marginBottom: 2 },
  savedCardSub: { fontSize: 12, color: '#555' },
  savedCardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeBadge: {
    backgroundColor: '#EF6C3E22', borderWidth: 1, borderColor: '#EF6C3E55',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  activeBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1.5, color: '#EF6C3E' },
  setActiveBtn: {
    backgroundColor: '#1E1D1A', borderWidth: 1, borderColor: '#2A2926',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  setActiveBtnText: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: '#888' },
  deleteBtn: { padding: 4 },
  deleteBtnText: { fontSize: 14, color: '#3A3835' },
  savedCardDays: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  savedDayChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#0E0D0B', borderWidth: 1, borderColor: '#252320',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  savedDayDot: { width: 6, height: 6, borderRadius: 3 },
  savedDayLabel: { fontSize: 11, fontWeight: '600', color: '#666' },

  // ── Builder divider ──────────────────────────────────────
  builderDivider: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 28,
  },
  builderDividerLine: { flex: 1, height: 1, backgroundColor: '#1E1D1A' },
  builderDividerText: {
    fontSize: 10, fontWeight: '700', letterSpacing: 2, color: '#333',
  },

  // ── Name Input ──────────────────────────────────────────
  nameInput: {
    backgroundColor: '#181714', borderWidth: 1, borderColor: '#2A2926',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 17, fontWeight: '600', color: '#F2F0EB', letterSpacing: 0.3,
  },

  // ── Days Picker ─────────────────────────────────────────
  daysRow: { flexDirection: 'row', gap: 10 },
  dayPill: {
    flex: 1, backgroundColor: '#181714', borderWidth: 1, borderColor: '#2A2926',
    borderRadius: 12, paddingVertical: 12, alignItems: 'center',
  },
  dayPillSelected: { backgroundColor: '#EF6C3E18', borderColor: '#EF6C3E' },
  dayPillText: { fontSize: 22, fontWeight: '700', color: '#555' },
  dayPillTextSelected: { color: '#EF6C3E' },
  dayPillSub: { fontSize: 10, color: '#444', letterSpacing: 0.5, marginTop: 2 },
  dayPillSubSelected: { color: '#EF6C3E99' },

  // ── Preset Cards ────────────────────────────────────────
  presetsGrid: { gap: 10 },
  presetCard: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 14, overflow: 'hidden', flexDirection: 'row',
  },
  presetCardSelected: { borderColor: '#EF6C3E44', backgroundColor: '#1A1510' },
  presetCardActiveBorder: { width: 3, backgroundColor: '#EF6C3E' },
  presetCardContent: { flex: 1, padding: 14 },
  presetCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4,
  },
  presetName: { fontSize: 15, fontWeight: '700', color: '#888', letterSpacing: 0.2 },
  presetNameSelected: { color: '#F2F0EB' },
  presetDayBadge: { backgroundColor: '#252320', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  presetDayBadgeSelected: { backgroundColor: '#EF6C3E22' },
  presetDayBadgeText: { fontSize: 11, fontWeight: '700', color: '#555', letterSpacing: 1 },
  presetDayBadgeTextSelected: { color: '#EF6C3E' },
  presetDescription: { fontSize: 12, color: '#555', marginBottom: 10, letterSpacing: 0.2 },
  presetMuscleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  presetMuscleDot: { width: 8, height: 8, borderRadius: 4 },
  presetMuscleMore: { fontSize: 11, color: '#555', marginLeft: 2 },

  // ── Day Cards ───────────────────────────────────────────
  dayCard: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 14, overflow: 'hidden', marginBottom: 10, flexDirection: 'row',
  },
  dayAccentStrip: { width: 3 },
  dayCardContent: { flex: 1 },
  dayCardHeader: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', padding: 14, paddingLeft: 12,
  },
  dayCardHeaderLeft: { flex: 1 },
  dayNumber: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: '#555', marginBottom: 2 },
  dayLabel: { fontSize: 16, fontWeight: '700', color: '#F2F0EB', letterSpacing: 0.2 },
  dayCardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  muscleChipSmall: { borderRadius: 5, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2 },
  muscleChipSmallText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  muscleOverflow: { fontSize: 11, color: '#555' },
  expandChevron: {
    fontSize: 22, color: '#444', transform: [{ rotate: '0deg' }], marginLeft: 4, lineHeight: 26,
  },
  expandChevronOpen: { transform: [{ rotate: '90deg' }], color: '#EF6C3E' },

  dayCardBody: {
    padding: 14, paddingLeft: 12, paddingTop: 16, paddingBottom: 18,
    borderTopWidth: 1, borderTopColor: '#1E1D1A',
  },
  labelInputRow: { marginBottom: 16 },
  inputLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 2, color: '#555', marginBottom: 8,
  },
  labelInput: {
    backgroundColor: '#0E0D0B', borderWidth: 1, borderColor: '#2A2926',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, fontWeight: '600', color: '#F2F0EB',
  },
  muscleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  muscleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
  },
  muscleChipInactive: { backgroundColor: '#0E0D0B', borderColor: '#2A2926' },
  muscleChipDot: { width: 7, height: 7, borderRadius: 3.5 },
  muscleChipText: { fontSize: 13, fontWeight: '600', color: '#555', letterSpacing: 0.2 },

  // ── Bottom Save ─────────────────────────────────────────
  bottomSaveBtn: {
    backgroundColor: '#EF6C3E', borderRadius: 14, paddingVertical: 17, alignItems: 'center', marginTop: 8,
  },
  bottomSaveBtnText: { color: '#0E0D0B', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
});
