// ============================================================
// TORVUS — Profile & Settings Screen
// app/(tabs)/profile.tsx
// ============================================================

import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, Platform, ActivityIndicator,
  KeyboardAvoidingView, Alert,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { getDatabase } from '../../schema';
import { supabase, SUPABASE_URL, SUPABASE_ANON } from '../../src/lib/supabase';
import { pushAllData } from '../../src/lib/sync';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type FitnessGoal  = 'bulking' | 'maintaining' | 'cutting';
type WeightUnit   = 'kg' | 'lbs';
type HeightUnit   = 'cm' | 'ftin';
type Bias         = 'underestimate' | 'neutral' | 'overestimate';

interface AIBias {
  calories: Bias;
  protein:  Bias;
  carbs:    Bias;
  fat:      Bias;
  fiber:    Bias;
  sodium:   Bias;
}

interface Prefs {
  fitnessGoal:    FitnessGoal;
  bodyWeightKg:   number | null;
  weightUnit:     WeightUnit;
  heightCm:       number | null;
  aiEstimationBias: AIBias;
  anthropicApiKey: string;
}

const DEFAULT_BIAS: AIBias = {
  calories: 'neutral', protein: 'neutral', carbs: 'neutral',
  fat: 'neutral', fiber: 'neutral', sodium: 'neutral',
};

// ─────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const [prefs, setPrefs] = useState<Prefs>({
    fitnessGoal: 'maintaining',
    bodyWeightKg: null,
    weightUnit: 'kg',
    heightCm: null,
    aiEstimationBias: DEFAULT_BIAS,
    anthropicApiKey: '',
  });
  const [bodyWeightInput, setBodyWeightInput] = useState('');
  const [heightCmInput, setHeightCmInput]     = useState('');
  const [heightFtInput, setHeightFtInput]     = useState('');
  const [heightInInput, setHeightInInput]     = useState('');
  const [heightUnit, setHeightUnit]           = useState<HeightUnit>('cm');
  const [apiKeyInput, setApiKeyInput]         = useState(''); // kept for saveCore signature compat
  const [isLoading, setIsLoading]             = useState(true);
  const [savedAt, setSavedAt]                 = useState<number | null>(null);
  const [userEmail, setUserEmail]             = useState<string | null>(null);
  const [isSyncing, setIsSyncing]             = useState(false);
  const [isPremium, setIsPremium]           = useState(false);
  const [isManaging, setIsManaging]         = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  function getHeightCmFromInputs(): number | null {
    if (heightUnit === 'cm') {
      const v = parseFloat(heightCmInput);
      return isNaN(v) ? null : v;
    }
    const ft = parseInt(heightFtInput) || 0;
    const inches = parseFloat(heightInInput) || 0;
    if (ft === 0 && inches === 0) return null;
    return ft * 30.48 + inches * 2.54;
  }

  function initHeightInputs(cm: number | null, unit: HeightUnit) {
    if (cm === null) {
      setHeightCmInput('');
      setHeightFtInput('');
      setHeightInInput('');
      return;
    }
    if (unit === 'cm') {
      setHeightCmInput(String(Math.round(cm)));
    } else {
      const totalIn = cm / 2.54;
      const ft = Math.floor(totalIn / 12);
      const inches = Math.round(totalIn % 12);
      setHeightFtInput(String(ft));
      setHeightInInput(String(inches));
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUserEmail(session?.user?.email ?? null);
      });
    }, [])
  );

  async function load() {
    setIsLoading(true);
    try {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{
        fitness_goal: string;
        body_weight_kg: number | null;
        weight_unit: string;
        height_cm: number | null;
        ai_estimation_bias: string;
        anthropic_api_key: string | null;
      }>(`SELECT fitness_goal, body_weight_kg, weight_unit, height_cm, ai_estimation_bias, anthropic_api_key
          FROM user_preferences WHERE id = 1`);

      if (row) {
        let bias: AIBias = DEFAULT_BIAS;
        try { bias = JSON.parse(row.ai_estimation_bias); } catch {}

        const unit = (row.weight_unit ?? 'kg') as WeightUnit;
        const hUnit: HeightUnit = unit === 'lbs' ? 'ftin' : 'cm';

        const loaded: Prefs = {
          fitnessGoal:     row.fitness_goal as FitnessGoal,
          bodyWeightKg:    row.body_weight_kg,
          weightUnit:      unit,
          heightCm:        row.height_cm,
          aiEstimationBias: bias,
          anthropicApiKey: row.anthropic_api_key ?? '',
        };
        setPrefs(loaded);
        setHeightUnit(hUnit);
        setBodyWeightInput(
          loaded.bodyWeightKg !== null
            ? String(loaded.weightUnit === 'lbs'
                ? Math.round(loaded.bodyWeightKg * 2.20462 * 10) / 10
                : loaded.bodyWeightKg)
            : ''
        );
        initHeightInputs(row.height_cm, hUnit);
        setApiKeyInput(loaded.anthropicApiKey);
      }

      // Check premium status
      const { data: { session: premSession } } = await supabase.auth.getSession();
      if (premSession?.user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_premium')
          .eq('id', premSession.user.id)
          .single();
        setIsPremium(!!profile?.is_premium);
      }
    } catch (e) {
      console.error('profile load error:', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function saveCore(
    fitnessGoal: FitnessGoal,
    weightUnit: WeightUnit,
    aiEstimationBias: AIBias,
    bodyWeightStr: string,
    heightCm: number | null,
    apiKey: string,
  ) {
    try {
      const db = await getDatabase();

      const bwRaw = parseFloat(bodyWeightStr);
      const bwKg  = isNaN(bwRaw) ? null
        : weightUnit === 'lbs' ? bwRaw * 0.453592 : bwRaw;

      await db.runAsync(
        `UPDATE user_preferences SET
           fitness_goal       = ?,
           body_weight_kg     = ?,
           weight_unit        = ?,
           height_cm          = ?,
           ai_estimation_bias = ?,
           anthropic_api_key  = ?,
           updated_at         = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = 1`,
        [fitnessGoal, bwKg, weightUnit, heightCm, JSON.stringify(aiEstimationBias), apiKey.trim()]
      );
      setPrefs(p => ({ ...p, bodyWeightKg: bwKg, heightCm, anthropicApiKey: apiKey.trim() }));
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);

      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user?.id) pushAllData(db, session.user.id).catch(() => {});
      });
    } catch (e) {
      console.error('profile save error:', e);
    }
  }

  function save() {
    saveCore(
      prefs.fitnessGoal, prefs.weightUnit, prefs.aiEstimationBias,
      bodyWeightInput, getHeightCmFromInputs(), apiKeyInput,
    );
  }

  async function openManageSubscription() {
    setIsManaging(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/customer-portal`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey':        SUPABASE_ANON,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (!res.ok) {
        Alert.alert('Error', 'Could not open subscription management. Please try again.');
        return;
      }
      await WebBrowser.openBrowserAsync(body.url);
    } catch {
      Alert.alert('Error', 'Network error. Please check your connection.');
    } finally {
      setIsManaging(false);
    }
  }

  async function checkPremiumStatus() {
    setIsCheckingStatus(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_premium')
        .eq('id', session.user.id)
        .single();
      setIsPremium(!!profile?.is_premium);
    } catch {
      Alert.alert('Error', 'Could not check subscription status.');
    } finally {
      setIsCheckingStatus(false);
    }
  }

  async function syncNow() {
    setIsSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const db = await getDatabase();
      await pushAllData(db, session.user.id);
      Alert.alert('Synced', 'Your data has been backed up to the cloud.');
    } catch (e: any) {
      Alert.alert('Sync failed', e?.message ?? 'Please check your connection.');
    } finally {
      setIsSyncing(false);
    }
  }

  function confirmLogout() {
    Alert.alert(
      'Log Out',
      'Your data will be backed up before logging out.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out', style: 'destructive', onPress: async () => {
            // Push latest data to cloud before signing out so it's there for next login
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (session?.user?.id) {
                const db = await getDatabase();
                await pushAllData(db, session.user.id);
              }
            } catch {}
            await supabase.auth.signOut();
          },
        },
      ]
    );
  }

  function setBias(nutrient: keyof AIBias, val: Bias) {
    const newBias = { ...prefs.aiEstimationBias, [nutrient]: val };
    setPrefs(p => ({ ...p, aiEstimationBias: newBias }));
    saveCore(prefs.fitnessGoal, prefs.weightUnit, newBias, bodyWeightInput, getHeightCmFromInputs(), apiKeyInput);
  }

  function switchUnit(unit: WeightUnit) {
    if (unit === prefs.weightUnit) return;
    const current = parseFloat(bodyWeightInput);
    const convertedStr = !isNaN(current)
      ? String(unit === 'lbs'
          ? Math.round(current * 2.20462 * 10) / 10
          : Math.round(current * 0.453592 * 10) / 10)
      : bodyWeightInput;
    const newHUnit: HeightUnit = unit === 'lbs' ? 'ftin' : 'cm';
    const currentHeightCm = getHeightCmFromInputs();
    setBodyWeightInput(convertedStr);
    setHeightUnit(newHUnit);
    initHeightInputs(currentHeightCm, newHUnit);
    setPrefs(p => ({ ...p, weightUnit: unit }));
    saveCore(prefs.fitnessGoal, unit, prefs.aiEstimationBias, convertedStr, currentHeightCm, apiKeyInput);
  }

  // ── Render ──────────────────────────────────────────────

  const bodyWeightDisplay = prefs.bodyWeightKg !== null
    ? `${prefs.weightUnit === 'lbs'
        ? Math.round(prefs.bodyWeightKg * 2.20462 * 10) / 10
        : prefs.bodyWeightKg} ${prefs.weightUnit}`
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>TORVUS</Text>
            <Text style={styles.title}>Profile</Text>
          </View>
          {savedAt ? <Text style={styles.savedIndicator}>SAVED</Text> : null}
        </View>

        {isLoading ? (
          <ActivityIndicator color="#EF6C3E" style={{ marginTop: 48 }} />
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── BODY ── */}
            <SectionLabel label="BODY" />
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>BODY WEIGHT</Text>
                  <View style={styles.bodyWeightRow}>
                    <TextInput
                      style={styles.bodyWeightInput}
                      value={bodyWeightInput}
                      onChangeText={setBodyWeightInput}
                      onBlur={save}
                      keyboardType="decimal-pad"
                      placeholder="—"
                      placeholderTextColor="#444"
                      selectTextOnFocus
                    />
                    <Text style={styles.bodyWeightUnit}>{prefs.weightUnit}</Text>
                  </View>
                </View>
                <View style={styles.unitToggle}>
                  {(['kg', 'lbs'] as WeightUnit[]).map(u => (
                    <TouchableOpacity
                      key={u}
                      style={[styles.unitBtn, prefs.weightUnit === u && styles.unitBtnActive]}
                      onPress={() => switchUnit(u)}
                    >
                      <Text style={[styles.unitBtnText, prefs.weightUnit === u && styles.unitBtnTextActive]}>
                        {u.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.cardDivider} />

              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>HEIGHT</Text>
                  {heightUnit === 'cm' ? (
                    <View style={styles.bodyWeightRow}>
                      <TextInput
                        style={styles.bodyWeightInput}
                        value={heightCmInput}
                        onChangeText={setHeightCmInput}
                        onBlur={save}
                        keyboardType="decimal-pad"
                        placeholder="—"
                        placeholderTextColor="#444"
                        selectTextOnFocus
                      />
                      <Text style={styles.bodyWeightUnit}>cm</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'baseline' }}>
                      <View style={styles.bodyWeightRow}>
                        <TextInput
                          style={styles.bodyWeightInput}
                          value={heightFtInput}
                          onChangeText={setHeightFtInput}
                          onBlur={save}
                          keyboardType="number-pad"
                          placeholder="—"
                          placeholderTextColor="#444"
                          selectTextOnFocus
                        />
                        <Text style={styles.bodyWeightUnit}>ft</Text>
                      </View>
                      <View style={styles.bodyWeightRow}>
                        <TextInput
                          style={styles.bodyWeightInput}
                          value={heightInInput}
                          onChangeText={setHeightInInput}
                          onBlur={save}
                          keyboardType="decimal-pad"
                          placeholder="—"
                          placeholderTextColor="#444"
                          selectTextOnFocus
                        />
                        <Text style={styles.bodyWeightUnit}>in</Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* ── FITNESS GOAL ── */}
            <SectionLabel label="FITNESS GOAL" />
            <View style={styles.card}>
              <View style={styles.goalRow}>
                {([
                  { val: 'bulking',     label: 'BULKING',     color: '#3E8CEF', desc: 'Caloric surplus' },
                  { val: 'maintaining', label: 'MAINTAINING', color: '#EF6C3E', desc: 'Caloric balance' },
                  { val: 'cutting',     label: 'CUTTING',     color: '#EF3E7A', desc: 'Caloric deficit' },
                ] as { val: FitnessGoal; label: string; color: string; desc: string }[]).map(g => {
                  const active = prefs.fitnessGoal === g.val;
                  return (
                    <TouchableOpacity
                      key={g.val}
                      style={[styles.goalBtn, active && { borderColor: g.color, backgroundColor: g.color + '18' }]}
                      onPress={() => {
                      setPrefs(p => ({ ...p, fitnessGoal: g.val }));
                      saveCore(g.val, prefs.weightUnit, prefs.aiEstimationBias, bodyWeightInput, getHeightCmFromInputs(), apiKeyInput);
                    }}
                    >
                      <Text style={[styles.goalBtnLabel, active && { color: g.color }]}>{g.label}</Text>
                      <Text style={[styles.goalBtnDesc, active && { color: g.color + 'AA' }]}>{g.desc}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── AI ESTIMATION BIAS ── */}
            <SectionLabel label="AI ESTIMATION BIAS" />
            <Text style={styles.sectionSub}>
              For each nutrient, tell the AI whether to lean toward over- or under-estimating
              when analyzing food photos. Useful if you're cutting (overestimate) or bulking (underestimate).
            </Text>
            <View style={styles.card}>
              {([
                { key: 'calories', label: 'Calories' },
                { key: 'protein',  label: 'Protein'  },
                { key: 'carbs',    label: 'Carbs'    },
                { key: 'fat',      label: 'Fat'      },
                { key: 'fiber',    label: 'Fiber'    },
                { key: 'sodium',   label: 'Sodium'   },
              ] as { key: keyof AIBias; label: string }[]).map((nutrient, i, arr) => (
                <View
                  key={nutrient.key}
                  style={[styles.biasRow, i < arr.length - 1 && styles.biasRowBorder]}
                >
                  <Text style={styles.biasLabel}>{nutrient.label}</Text>
                  <View style={styles.biasOptions}>
                    {([
                      { val: 'underestimate', short: 'UNDER' },
                      { val: 'neutral',       short: 'NEUTRAL' },
                      { val: 'overestimate',  short: 'OVER' },
                    ] as { val: Bias; short: string }[]).map(opt => {
                      const active = prefs.aiEstimationBias[nutrient.key] === opt.val;
                      const color = opt.val === 'underestimate' ? '#3E8CEF'
                        : opt.val === 'overestimate' ? '#EF3E7A' : '#EF6C3E';
                      return (
                        <TouchableOpacity
                          key={opt.val}
                          style={[styles.biasBtn, active && { borderColor: color, backgroundColor: color + '18' }]}
                          onPress={() => setBias(nutrient.key, opt.val)}
                        >
                          <Text style={[styles.biasBtnText, active && { color }]}>{opt.short}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>

            {/* ── SUBSCRIPTION ── */}
            <SectionLabel label="SUBSCRIPTION" />
            <View style={styles.card}>
              <View style={styles.subRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>STATUS</Text>
                  <View style={styles.subBadgeRow}>
                    <View style={[styles.subBadge, isPremium ? styles.subBadgePremium : styles.subBadgeFree]}>
                      <Text style={[styles.subBadgeText, isPremium ? styles.subBadgeTextPremium : styles.subBadgeTextFree]}>
                        {isPremium ? 'PREMIUM' : 'FREE'}
                      </Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.subRefreshBtn, isCheckingStatus && { opacity: 0.5 }]}
                  onPress={checkPremiumStatus}
                  disabled={isCheckingStatus}
                >
                  {isCheckingStatus
                    ? <ActivityIndicator color="#555" size="small" />
                    : <Text style={styles.subRefreshBtnText}>REFRESH</Text>
                  }
                </TouchableOpacity>
              </View>
              {isPremium ? (
                <>
                  <View style={styles.cardDivider} />
                  <TouchableOpacity
                    style={[styles.subManageBtn, isManaging && { opacity: 0.5 }]}
                    onPress={openManageSubscription}
                    disabled={isManaging}
                  >
                    {isManaging
                      ? <ActivityIndicator color="#EF6C3E" size="small" />
                      : <Text style={styles.subManageBtnText}>MANAGE SUBSCRIPTION</Text>
                    }
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.cardDivider} />
                  <TouchableOpacity
                    style={styles.subUpgradeBtn}
                    onPress={() => router.push('/nutrition/ai-estimate')}
                  >
                    <Text style={styles.subUpgradeBtnText}>GET PREMIUM →</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* ── ACCOUNT ── */}
            <SectionLabel label="ACCOUNT" />
            <View style={styles.card}>
              <View style={styles.accountRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>SIGNED IN AS</Text>
                  <Text style={styles.accountEmail}>{userEmail ?? '—'}</Text>
                </View>
              </View>
              <View style={styles.accountDivider} />
              <View style={styles.accountBtnRow}>
                <TouchableOpacity
                  style={[styles.syncBtn, isSyncing && styles.syncBtnDisabled]}
                  onPress={syncNow}
                  disabled={isSyncing}
                >
                  {isSyncing
                    ? <ActivityIndicator color="#EF6C3E" size="small" />
                    : <Text style={styles.syncBtnText}>SYNC NOW</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
                  <Text style={styles.logoutBtnText}>LOG OUT</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ height: 48 }} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION LABEL
// ─────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
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
  savedIndicator: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: '#6CEF3E' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },

  sectionLabel: {
    fontSize: 9, fontWeight: '700', letterSpacing: 2.5, color: '#555',
    marginBottom: 8, marginTop: 4,
  },
  sectionSub: {
    fontSize: 12, color: '#444', lineHeight: 17, marginBottom: 10,
  },

  card: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 14, marginBottom: 20, overflow: 'hidden',
  },

  // ── Body weight ──
  cardDivider: { height: 1, backgroundColor: '#1E1D1A' },
  cardRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16 },
  fieldLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: '#555', marginBottom: 8 },
  bodyWeightRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  bodyWeightInput: {
    fontSize: 28, fontWeight: '800', color: '#F2F0EB',
    minWidth: 80, padding: 0,
  },
  bodyWeightUnit: { fontSize: 14, color: '#555', fontWeight: '600' },
  unitToggle: {
    flexDirection: 'column', gap: 6,
  },
  unitBtn: {
    borderWidth: 1, borderColor: '#2A2926', borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 5, alignItems: 'center',
  },
  unitBtnActive: { borderColor: '#EF6C3E', backgroundColor: '#EF6C3E18' },
  unitBtnText: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: '#555' },
  unitBtnTextActive: { color: '#EF6C3E' },

  // ── Fitness goal ──
  goalRow: { flexDirection: 'row', padding: 12, gap: 8 },
  goalBtn: {
    flex: 1, borderWidth: 1, borderColor: '#252320', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', gap: 4,
  },
  goalBtnLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: '#555' },
  goalBtnDesc: { fontSize: 9, color: '#333' },

  // ── AI Bias ──
  biasRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  biasRowBorder: { borderBottomWidth: 1, borderBottomColor: '#1E1D1A' },
  biasLabel: { fontSize: 13, fontWeight: '600', color: '#C0BEB9', width: 72 },
  biasOptions: { flexDirection: 'row', gap: 6 },
  biasBtn: {
    borderWidth: 1, borderColor: '#252320', borderRadius: 6,
    paddingHorizontal: 9, paddingVertical: 5,
  },
  biasBtnText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, color: '#555' },

  // ── API Key ──
  apiKeyRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10, paddingBottom: 12 },
  apiKeyInput: {
    flex: 1, fontSize: 13, color: '#F2F0EB',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  apiKeyToggle: {
    borderWidth: 1, borderColor: '#252320', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  apiKeyToggleText: { fontSize: 9, fontWeight: '700', letterSpacing: 1, color: '#555' },
  apiKeyStatus: { fontSize: 11, paddingHorizontal: 16, paddingBottom: 12 },
  apiKeyStatusOk: { color: '#6CEF3E' },
  apiKeyStatusWarn: { color: '#EF9B3E' },

  // ── Subscription ──
  subRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  subBadgeRow: { flexDirection: 'row', marginTop: 4 },
  subBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  subBadgePremium: { backgroundColor: '#EF6C3E18', borderColor: '#EF6C3E' },
  subBadgeFree: { backgroundColor: '#55555518', borderColor: '#555' },
  subBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  subBadgeTextPremium: { color: '#EF6C3E' },
  subBadgeTextFree: { color: '#555' },
  subRefreshBtn: { borderWidth: 1, borderColor: '#252320', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  subRefreshBtnText: { fontSize: 9, fontWeight: '700', letterSpacing: 1, color: '#555' },
  subManageBtn: { paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  subManageBtnText: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#EF6C3E' },
  subUpgradeBtn: { paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  subUpgradeBtnText: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#EF6C3E' },

  // ── Account ──
  accountRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  accountEmail: { fontSize: 14, color: '#F2F0EB', fontWeight: '600', marginTop: 2 },
  accountDivider: { height: 1, backgroundColor: '#1E1D1A' },
  accountBtnRow: { flexDirection: 'row', gap: 10, padding: 12 },
  syncBtn: {
    flex: 1, borderWidth: 1, borderColor: '#EF6C3E', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  syncBtnDisabled: { opacity: 0.5 },
  syncBtnText: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#EF6C3E' },
  logoutBtn: {
    flex: 1, borderWidth: 1, borderColor: '#EF3E7A', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  logoutBtnText: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#EF3E7A' },
});
