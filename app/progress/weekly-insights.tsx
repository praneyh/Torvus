// ============================================================
// TORVUS — AI Weekly Insights Screen
// app/progress/weekly-insights.tsx
//
// Premium feature: gathers last 7 days of data from SQLite,
// sends to the ai-weekly-insights edge function, and displays
// a structured AI-generated progress review.
// ============================================================

import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { getDatabase } from '../../schema';
import { supabase, SUPABASE_URL } from '../../src/lib/supabase';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface InsightsResult {
  summary:          string;
  wins:             string[];
  improvements:     string[];
  recommendations:  string[];
  nutritionInsight: string;
  workoutInsight:   string;
}

type Step = 'loading' | 'paywall' | 'ready' | 'generating' | 'result';

// ─────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────

export default function WeeklyInsightsScreen() {
  const [step, setStep]       = useState<Step>('loading');
  const [result, setResult]   = useState<InsightsResult | null>(null);
  const [usedToday, setUsedToday] = useState(false);

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

        // Check if already used today
        const today = new Date().toISOString().slice(0, 10);
        const { data: usage } = await supabase
          .from('ai_usage')
          .select('request_count')
          .eq('user_id', session.user.id)
          .eq('date', today)
          .eq('feature', 'weekly_insights')
          .single();

        if ((usage?.request_count ?? 0) >= 1) setUsedToday(true);
        setStep('ready');
      } catch {
        setStep('ready');
      }
    })();
  }, []);

  async function generateInsights() {
    setStep('generating');
    try {
      const db = await getDatabase();

      // ── Gather last 7 days of data ─────────────────────
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);

      // Workout sessions
      const sessions = await db.getAllAsync<{
        id: number; date: string; dayLabel: string;
        durationSeconds: number | null; totalVolumeKg: number;
      }>(`
        SELECT ws.id, ws.date, wd.label as dayLabel, ws.duration_seconds as durationSeconds,
               COALESCE(SUM(se.weight_kg * se.reps), 0) as totalVolumeKg
        FROM workout_sessions ws
        JOIN workout_days wd ON wd.id = ws.day_id
        LEFT JOIN set_entries se ON se.session_id = ws.id AND se.is_warmup = 0
        WHERE ws.date >= ? AND ws.completed_at IS NOT NULL
        GROUP BY ws.id
        ORDER BY ws.date DESC
      `, [sevenDaysAgo]);

      // Top exercises per session
      const workouts = await Promise.all(sessions.map(async s => {
        const exercises = await db.getAllAsync<{
          name: string; sets: number; topWeightKg: number;
        }>(`
          SELECT e.name,
                 COUNT(se.id) as sets,
                 MAX(se.weight_kg) as topWeightKg
          FROM set_entries se
          JOIN exercises e ON e.id = se.exercise_id
          WHERE se.session_id = ? AND se.is_warmup = 0
          GROUP BY se.exercise_id
          ORDER BY sets DESC
          LIMIT 5
        `, [s.id]);
        return {
          date:           s.date,
          dayLabel:       s.dayLabel,
          totalVolumeKg:  s.totalVolumeKg,
          durationMin:    s.durationSeconds ? Math.round(s.durationSeconds / 60) : null,
          exercises,
        };
      }));

      // Cardio sessions
      const cardio = await db.getAllAsync<{
        date: string; exercise: string; durationSeconds: number;
        distanceKm: number | null; caloriesBurned: number | null;
      }>(`
        SELECT cs.date, ce.name as exercise, cs.duration_seconds as durationSeconds,
               cs.distance_km as distanceKm, cs.calories_burned as caloriesBurned
        FROM cardio_sessions cs
        JOIN cardio_exercises ce ON ce.id = cs.cardio_exercise_id
        WHERE cs.date >= ?
        ORDER BY cs.date DESC
      `, [sevenDaysAgo]);

      // Nutrition logs
      const nutrition = await db.getAllAsync<{
        date: string; calories: number; protein_g: number; carbs_g: number; fat_g: number;
      }>(`
        SELECT date, total_calories as calories, total_protein_g as protein_g,
               total_carbs_g as carbs_g, total_fat_g as fat_g
        FROM daily_nutrition_logs
        WHERE date >= ? AND total_calories > 0
        ORDER BY date DESC
      `, [sevenDaysAgo]);

      // Body weight
      const bodyWeight = await db.getAllAsync<{ date: string; weightKg: number }>(`
        SELECT date, weight_kg as weightKg
        FROM body_weight_log
        WHERE date >= ?
        ORDER BY date ASC
      `, [fourteenDaysAgo]);

      // Nutrition goals
      const goals = await db.getFirstAsync<{
        calories: number; protein_g: number; carbs_g: number; fat_g: number;
      }>(`
        SELECT target_calories as calories, target_protein_g as protein_g,
               target_carbs_g as carbs_g, target_fat_g as fat_g
        FROM nutrition_goals WHERE id = 1
      `);

      // Fitness goal
      const prefs = await db.getFirstAsync<{ fitness_goal: string }>(
        `SELECT fitness_goal FROM user_preferences WHERE id = 1`
      );

      // ── Call edge function ────────────────────────────
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw { code: 'unauthorized' };

      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-weekly-insights`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          workouts:    workouts.map(w => ({ ...w, exercises: w.exercises })),
          cardio:      cardio.map(c => ({ ...c, durationMin: Math.round(c.durationSeconds / 60) })),
          nutrition:   nutrition ?? [],
          bodyWeight:  bodyWeight ?? [],
          goals:       goals ?? { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 },
          fitnessGoal: prefs?.fitness_goal ?? 'maintaining',
        }),
      });

      const body = await res.json();
      if (!res.ok) throw { code: body?.error ?? 'unknown' };

      setResult(body as InsightsResult);
      setUsedToday(true);
      setStep('result');
    } catch (e: any) {
      const code = e?.code ?? '';
      if (code === 'subscription_required') {
        setStep('paywall');
      } else if (code === 'daily_limit_reached') {
        Alert.alert('Already generated today', 'You can generate one weekly insight per day. Come back tomorrow!');
        setStep('ready');
      } else {
        Alert.alert('Generation failed', 'Please check your connection and try again.');
        setStep('ready');
      }
    }
  }

  // ── Render ──────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Weekly Insights</Text>
          <Text style={styles.headerSub}>AI progress review</Text>
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
            Weekly AI progress insights are available with Torvus Premium.
          </Text>
          <TouchableOpacity
            style={styles.paywallBtn}
            onPress={() => router.back()}
          >
            <Text style={styles.paywallBtnText}>GO BACK</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* READY */}
      {step === 'ready' && (
        <View style={styles.centerWrap}>
          <Text style={styles.readyIcon}>💡</Text>
          <Text style={styles.readyTitle}>Your Weekly Review</Text>
          <Text style={styles.readySub}>
            Claude will analyse your workouts, cardio, nutrition, and body weight from the past 7 days and provide personalised insights and recommendations.
          </Text>
          {usedToday && (
            <View style={styles.usedBanner}>
              <Text style={styles.usedBannerText}>You've already generated an insight today. Come back tomorrow for a fresh review.</Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.generateBtn, usedToday && styles.generateBtnDisabled]}
            onPress={generateInsights}
            disabled={usedToday}
          >
            <Text style={styles.generateBtnText}>GENERATE INSIGHTS</Text>
          </TouchableOpacity>
          <Text style={styles.readyNote}>1 generation per day • Resets at midnight</Text>
        </View>
      )}

      {/* GENERATING */}
      {step === 'generating' && (
        <View style={styles.centerWrap}>
          <ActivityIndicator color="#EF6C3E" size="large" />
          <Text style={styles.generatingText}>Analysing your week…</Text>
          <Text style={styles.generatingSubText}>Claude is reviewing your progress data</Text>
        </View>
      )}

      {/* RESULT */}
      {step === 'result' && result && (
        <ScrollView contentContainerStyle={styles.resultWrap} showsVerticalScrollIndicator={false}>
          {/* Summary */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>WEEKLY SUMMARY</Text>
            <Text style={styles.summaryText}>{result.summary}</Text>
          </View>

          {/* Insights row */}
          <View style={styles.insightRow}>
            <View style={[styles.insightCard, { flex: 1 }]}>
              <Text style={styles.insightCardLabel}>WORKOUT</Text>
              <Text style={styles.insightCardText}>{result.workoutInsight}</Text>
            </View>
            <View style={[styles.insightCard, { flex: 1 }]}>
              <Text style={styles.insightCardLabel}>NUTRITION</Text>
              <Text style={styles.insightCardText}>{result.nutritionInsight}</Text>
            </View>
          </View>

          {/* Wins */}
          <InsightSection
            title="WINS THIS WEEK"
            accent="#6CEF3E"
            icon="✓"
            items={result.wins}
          />

          {/* Improvements */}
          <InsightSection
            title="AREAS TO IMPROVE"
            accent="#EF9B3E"
            icon="▲"
            items={result.improvements}
          />

          {/* Recommendations */}
          <InsightSection
            title="NEXT WEEK FOCUS"
            accent="#EF6C3E"
            icon="→"
            items={result.recommendations}
          />

          <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>DONE</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// INSIGHT SECTION
// ─────────────────────────────────────────────────────────────

function InsightSection({ title, accent, icon, items }: {
  title: string; accent: string; icon: string; items: string[];
}) {
  if (!items?.length) return null;
  return (
    <View style={[sectionStyles.wrap, { borderLeftColor: accent }]}>
      <Text style={[sectionStyles.title, { color: accent }]}>{title}</Text>
      {items.map((item, i) => (
        <View key={i} style={sectionStyles.row}>
          <Text style={[sectionStyles.icon, { color: accent }]}>{icon}</Text>
          <Text style={sectionStyles.text}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  wrap: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderLeftWidth: 3, borderRadius: 12, padding: 16, marginBottom: 12,
  },
  title: { fontSize: 9, fontWeight: '800', letterSpacing: 2, marginBottom: 10 },
  row:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  icon:  { fontSize: 12, fontWeight: '800', marginTop: 2, width: 14 },
  text:  { flex: 1, fontSize: 13, color: '#C0BEB9', lineHeight: 19 },
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
    paddingHorizontal: 28, paddingBottom: 40,
  },

  // Paywall
  lockIcon:    { fontSize: 40, marginBottom: 16 },
  paywallTitle: { fontSize: 20, fontWeight: '900', color: '#F2F0EB', marginBottom: 10, textAlign: 'center' },
  paywallSub:   { fontSize: 13, color: '#777', lineHeight: 19, textAlign: 'center', marginBottom: 24 },
  paywallBtn:  {
    borderWidth: 1, borderColor: '#252320', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center',
  },
  paywallBtnText: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: '#555' },

  // Ready
  readyIcon:  { fontSize: 48, marginBottom: 16 },
  readyTitle: { fontSize: 22, fontWeight: '900', color: '#F2F0EB', marginBottom: 10, textAlign: 'center' },
  readySub:   { fontSize: 13, color: '#777', lineHeight: 19, textAlign: 'center', marginBottom: 24 },
  usedBanner: {
    backgroundColor: '#EF9B3E18', borderWidth: 1, borderColor: '#EF9B3E55',
    borderRadius: 10, padding: 12, marginBottom: 20, width: '100%',
  },
  usedBannerText: { fontSize: 12, color: '#EF9B3E', lineHeight: 17, textAlign: 'center' },
  generateBtn: {
    width: '100%', backgroundColor: '#EF6C3E', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginBottom: 10,
  },
  generateBtnDisabled: { opacity: 0.35 },
  generateBtnText: { color: '#0E0D0B', fontWeight: '800', fontSize: 14, letterSpacing: 1 },
  readyNote: { fontSize: 11, color: '#3A3835', textAlign: 'center' },

  // Generating
  generatingText:    { fontSize: 18, fontWeight: '800', color: '#F2F0EB', marginTop: 24 },
  generatingSubText: { fontSize: 13, color: '#555', marginTop: 6 },

  // Result
  resultWrap: { padding: 16 },

  summaryCard: {
    backgroundColor: '#EF6C3E18', borderWidth: 1, borderColor: '#EF6C3E55',
    borderRadius: 14, padding: 16, marginBottom: 12,
  },
  summaryLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 2, color: '#EF6C3E', marginBottom: 8 },
  summaryText:  { fontSize: 14, color: '#F2F0EB', lineHeight: 21, fontWeight: '600' },

  insightRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  insightCard: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 12, padding: 14,
  },
  insightCardLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 2, color: '#555', marginBottom: 6 },
  insightCardText:  { fontSize: 12, color: '#999', lineHeight: 17 },

  doneBtn: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  doneBtnText: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: '#555' },
});
