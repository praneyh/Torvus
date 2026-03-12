// ============================================================
// TORVUS — AI Food Photo Estimation
// app/nutrition/ai-estimate.tsx
//
// Params: date (YYYY-MM-DD), meal (breakfast|lunch|dinner|snacks)
// ============================================================

import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, Platform, ActivityIndicator,
  Image, Alert, KeyboardAvoidingView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { getDatabase } from '../../schema';
import { supabase, SUPABASE_URL } from '../../src/lib/supabase';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks';
type Bias = 'underestimate' | 'neutral' | 'overestimate';

interface AIBias {
  calories: Bias; protein: Bias; carbs: Bias;
  fat: Bias; fiber: Bias; sodium: Bias;
}

interface EstimateResult {
  name: string;
  serving_description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number;
}

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks',
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

async function callEdgeFunction(
  base64: string,
  mediaType: string,
  bias: AIBias,
  notes?: string,
): Promise<EstimateResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw { code: 'unauthorized' };

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-estimate`, {
    method: 'POST',
    headers: {
      'Authorization':  `Bearer ${session.access_token}`,
      'Content-Type':   'application/json',
    },
    body: JSON.stringify({ base64, mediaType, bias, notes }),
  });

  const body = await res.json();
  if (!res.ok) throw { code: body?.error ?? 'unknown', status: res.status };
  if (typeof body.calories !== 'number') throw { code: 'ai_parse_error' };
  return body as EstimateResult;
}

// ─────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────

type Step = 'loading' | 'paywall' | 'pick' | 'preview' | 'analyzing' | 'result';

export default function AIEstimateScreen() {
  const params   = useLocalSearchParams<{ date: string; meal: string }>();
  const date     = params.date ?? new Date().toISOString().slice(0, 10);
  const mealType = (params.meal ?? 'breakfast') as MealType;

  const [step, setStep]         = useState<Step>('loading');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [base64, setBase64]     = useState<string | null>(null);
  const [mediaType, setMediaType] = useState('image/jpeg');
  const [notes, setNotes]       = useState('');
  const [result, setResult]     = useState<EstimateResult | null>(null);
  const [isLogging, setIsLogging] = useState(false);
  const [scansUsed, setScansUsed] = useState<number | null>(null);

  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isRefreshing, setIsRefreshing]           = useState(false);

  // Promo code redemption
  const [promoCode, setPromoCode]       = useState('');
  const [isRedeeming, setIsRedeeming]   = useState(false);
  const [redeemError, setRedeemError]   = useState('');
  const [showPromoInput, setShowPromoInput] = useState(false);

  // ── Premium check ────────────────────────────────────────
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

        // Load today's usage count for display
        const today = new Date().toISOString().slice(0, 10);
        const { data: usage } = await supabase
          .from('ai_usage')
          .select('request_count')
          .eq('user_id', session.user.id)
          .eq('date', today)
          .eq('feature', 'food_scan')
          .single();
        setScansUsed(usage?.request_count ?? 0);

        setStep('pick');
      } catch {
        setStep('pick'); // fail open — edge function is the real gate
      }
    })();
  }, []);

  // Editable result fields
  const [editName, setEditName]       = useState('');
  const [editCal, setEditCal]         = useState('');
  const [editProtein, setEditProtein] = useState('');
  const [editCarbs, setEditCarbs]     = useState('');
  const [editFat, setEditFat]         = useState('');
  const [editFiber, setEditFiber]     = useState('');
  const [editSodium, setEditSodium]   = useState('');
  const [editDesc, setEditDesc]       = useState('');

  // ── Pick image ──────────────────────────────────────────

  async function pickFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take a photo.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      base64: true, quality: 0.7,
      allowsEditing: false,
    });
    handlePickResult(res);
  }

  async function pickFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      base64: true, quality: 0.7,
      allowsEditing: false,
      mediaTypes: 'images',
    });
    handlePickResult(res);
  }

  function handlePickResult(res: ImagePicker.ImagePickerResult) {
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setImageUri(asset.uri);
    setBase64(asset.base64 ?? null);
    const ext = asset.uri.split('.').pop()?.toLowerCase();
    setMediaType(ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
    setStep('preview');
  }

  // ── Analyze ─────────────────────────────────────────────

  async function analyze() {
    if (!base64) return;
    setStep('analyzing');
    try {
      const db = await getDatabase();
      let bias: AIBias = {
        calories: 'neutral', protein: 'neutral', carbs: 'neutral',
        fat: 'neutral', fiber: 'neutral', sodium: 'neutral',
      };
      try {
        const prefs = await db.getFirstAsync<{ ai_estimation_bias: string }>(
          `SELECT ai_estimation_bias FROM user_preferences WHERE id = 1`
        );
        bias = JSON.parse(prefs?.ai_estimation_bias ?? '{}');
      } catch {}

      const estimate = await callEdgeFunction(base64, mediaType, bias, notes);

      setResult(estimate);
      setEditName(estimate.name);
      setEditCal(String(Math.round(estimate.calories)));
      setEditProtein(String(Math.round(estimate.protein_g)));
      setEditCarbs(String(Math.round(estimate.carbs_g)));
      setEditFat(String(Math.round(estimate.fat_g)));
      setEditFiber(String(Math.round(estimate.fiber_g)));
      setEditSodium(String(Math.round(estimate.sodium_mg)));
      setEditDesc(estimate.serving_description);
      setScansUsed(n => (n ?? 0) + 1);
      setStep('result');
    } catch (e: any) {
      const code = e?.code ?? '';
      if (code === 'subscription_required') {
        setStep('paywall');
      } else if (code === 'daily_limit_reached') {
        Alert.alert('Daily limit reached', 'You\'ve used all 25 AI scans for today. Resets at midnight.');
        setStep('preview');
      } else {
        Alert.alert('Analysis failed', 'Please check your connection and try again.');
        setStep('preview');
      }
    }
  }

  // ── Redeem promo code ────────────────────────────────────

  async function redeemCode() {
    if (!promoCode.trim()) return;
    setIsRedeeming(true);
    setRedeemError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setRedeemError('Please sign in first.'); return; }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/activate-subscription`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ code: promoCode.trim() }),
      });

      const body = await res.json();
      if (!res.ok) {
        const msg = body?.error === 'invalid_code' ? 'Invalid code. Please try again.' : 'Something went wrong. Try again.';
        setRedeemError(msg);
        return;
      }

      // Success — re-run premium check
      setPromoCode('');
      setShowPromoInput(false);
      setStep('loading');
      // Re-trigger the premium check useEffect
      const today = new Date().toISOString().slice(0, 10);
      const { data: usage } = await supabase
        .from('ai_usage')
        .select('request_count')
        .eq('user_id', session.user.id)
        .eq('date', today)
        .eq('feature', 'food_scan')
        .single();
      setScansUsed(usage?.request_count ?? 0);
      setStep('pick');
    } catch {
      setRedeemError('Network error. Please check your connection.');
    } finally {
      setIsRedeeming(false);
    }
  }

  // ── Stripe checkout ──────────────────────────────────────

  async function openStripeCheckout(priceType: 'monthly' | 'annual') {
    setIsCheckoutLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        Alert.alert('Sign in required', 'Please sign in to subscribe.');
        return;
      }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ priceType }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body?.error === 'already_premium') {
          await refreshPremiumStatus();
          return;
        }
        Alert.alert('Error', 'Could not start checkout. Please try again.');
        return;
      }
      await WebBrowser.openBrowserAsync(body.url);
    } catch {
      Alert.alert('Network error', 'Please check your connection and try again.');
    } finally {
      setIsCheckoutLoading(false);
    }
  }

  async function refreshPremiumStatus() {
    setIsRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_premium')
        .eq('id', session.user.id)
        .single();
      if (profile?.is_premium) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: usage } = await supabase
          .from('ai_usage')
          .select('request_count')
          .eq('user_id', session.user.id)
          .eq('date', today)
          .eq('feature', 'food_scan')
          .single();
        setScansUsed(usage?.request_count ?? 0);
        setStep('pick');
      } else {
        Alert.alert('Not active yet', 'Your subscription is not active yet. If you just paid, please wait a moment and try again.');
      }
    } catch {
      Alert.alert('Error', 'Could not check subscription status.');
    } finally {
      setIsRefreshing(false);
    }
  }

  // ── Log ─────────────────────────────────────────────────

  async function logFood() {
    const name = editName.trim();
    const cal  = parseFloat(editCal)    || 0;
    const pro  = parseFloat(editProtein) || 0;
    const carb = parseFloat(editCarbs)   || 0;
    const fat  = parseFloat(editFat)     || 0;
    const fib  = parseFloat(editFiber)   || 0;
    const sod  = parseFloat(editSodium)  || 0;

    if (!name || cal === 0) {
      Alert.alert('Missing info', 'Name and calories are required.');
      return;
    }

    // Store as per-100g with serving_size_g = 100 (whole serving is the "100g" unit)
    setIsLogging(true);
    try {
      const db = await getDatabase();
      const ins = await db.runAsync(
        `INSERT INTO foods (name, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, serving_size_g, serving_label, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, 100, ?, 'ai')`,
        [name, cal, pro, carb, fat, fib, sod, editDesc || null]
      );
      await db.runAsync(
        `INSERT INTO meals (date, meal_type, food_id, serving_multiplier) VALUES (?, ?, ?, 1)`,
        [date, mealType, ins.lastInsertRowId]
      );
      router.back();
      router.back(); // pop both ai-estimate and search
    } catch (e) {
      console.error('AI log error:', e);
      Alert.alert('Error', 'Failed to log food. Please try again.');
    } finally {
      setIsLogging(false);
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
            <Text style={styles.headerTitle}>AI Food Scan</Text>
            <Text style={styles.headerSub}>{MEAL_LABELS[mealType]}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* ── STEP: LOADING ── */}
        {step === 'loading' && (
          <View style={styles.pickWrap}>
            <ActivityIndicator color="#EF6C3E" size="large" />
          </View>
        )}

        {/* ── STEP: PAYWALL ── */}
        {step === 'paywall' && (
          <ScrollView contentContainerStyle={styles.paywallWrap} showsVerticalScrollIndicator={false}>
            <View style={styles.paywallBadge}>
              <Text style={styles.paywallBadgeText}>PREMIUM</Text>
            </View>
            <Text style={styles.paywallTitle}>Torvus Premium</Text>
            <Text style={styles.paywallSub}>
              Unlock AI-powered tools to optimise your nutrition and track your progress smarter.
            </Text>

            <View style={styles.paywallFeatures}>
              {[
                { icon: '📸', text: '25 AI food scans per day' },
                { icon: '🎯', text: 'Per-nutrient estimation bias' },
                { icon: '🎯', text: 'AI-calculated TDEE & macro targets' },
                { icon: '💡', text: 'Weekly AI progress insights' },
                { icon: '🤖', text: 'Powered by Claude Sonnet' },
                { icon: '📝', text: 'Add context notes to improve accuracy' },
              ].map((f, i) => (
                <View key={i} style={styles.paywallFeatureRow}>
                  <Text style={styles.paywallFeatureIcon}>{f.icon}</Text>
                  <Text style={styles.paywallFeatureText}>{f.text}</Text>
                </View>
              ))}
            </View>

            <View style={styles.paywallPriceCard}>
              <Text style={styles.paywallPriceLabel}>TORVUS PREMIUM</Text>
              <Text style={styles.paywallPrice}>$4.99<Text style={styles.paywallPricePer}> / month</Text></Text>
              <Text style={styles.paywallPriceAlt}>or $39.99 / year — save 33%</Text>
            </View>

            <View style={styles.paywallCtaGroup}>
              <TouchableOpacity
                style={[styles.paywallCta, isCheckoutLoading && { opacity: 0.5 }]}
                onPress={() => openStripeCheckout('monthly')}
                disabled={isCheckoutLoading}
              >
                {isCheckoutLoading
                  ? <ActivityIndicator color="#0E0D0B" size="small" />
                  : <Text style={styles.paywallCtaText}>SUBSCRIBE · $4.99/MONTH</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.paywallCtaAnnual, isCheckoutLoading && { opacity: 0.5 }]}
                onPress={() => openStripeCheckout('annual')}
                disabled={isCheckoutLoading}
              >
                <Text style={styles.paywallCtaAnnualText}>$39.99/YEAR  —  SAVE 33%</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.paywallRefresh, isRefreshing && { opacity: 0.5 }]}
              onPress={refreshPremiumStatus}
              disabled={isRefreshing}
            >
              {isRefreshing
                ? <ActivityIndicator color="#555" size="small" />
                : <Text style={styles.paywallRefreshText}>Already subscribed? Refresh status</Text>
              }
            </TouchableOpacity>

            {/* Promo / test code */}
            <TouchableOpacity
              style={styles.paywallPromoToggle}
              onPress={() => { setShowPromoInput(v => !v); setRedeemError(''); }}
            >
              <Text style={styles.paywallPromoToggleText}>
                {showPromoInput ? 'Hide' : 'Have a promo or test code?'}
              </Text>
            </TouchableOpacity>

            {showPromoInput && (
              <View style={styles.paywallPromoWrap}>
                <TextInput
                  style={styles.paywallPromoInput}
                  value={promoCode}
                  onChangeText={t => { setPromoCode(t); setRedeemError(''); }}
                  placeholder="Enter code"
                  placeholderTextColor="#3A3835"
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[styles.paywallPromoBtn, isRedeeming && { opacity: 0.5 }]}
                  onPress={redeemCode}
                  disabled={isRedeeming || !promoCode.trim()}
                >
                  {isRedeeming
                    ? <ActivityIndicator color="#0E0D0B" size="small" />
                    : <Text style={styles.paywallPromoBtnText}>REDEEM</Text>
                  }
                </TouchableOpacity>
                {redeemError ? (
                  <Text style={styles.paywallPromoError}>{redeemError}</Text>
                ) : null}
              </View>
            )}

            <TouchableOpacity style={styles.paywallRestore} onPress={() => router.back()}>
              <Text style={styles.paywallRestoreText}>Go back</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ── STEP: PICK ── */}
        {step === 'pick' && (
          <View style={styles.pickWrap}>
            <Text style={styles.pickTitle}>Photo your meal</Text>
            <Text style={styles.pickSub}>
              Claude will estimate the calories and macros.{'\n'}
              Include a size reference (hand, bottle) for better accuracy.
            </Text>

            <TouchableOpacity style={styles.pickBtn} onPress={pickFromCamera}>
              <Text style={styles.pickBtnIcon}>📷</Text>
              <Text style={styles.pickBtnLabel}>Take Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.pickBtn, styles.pickBtnSecondary]} onPress={pickFromLibrary}>
              <Text style={styles.pickBtnIcon}>🖼</Text>
              <Text style={styles.pickBtnLabel}>Choose from Library</Text>
            </TouchableOpacity>

            {scansUsed !== null && (
              <Text style={styles.pickNote}>
                {25 - scansUsed} of 25 AI scans remaining today
              </Text>
            )}
          </View>
        )}

        {/* ── STEP: PREVIEW ── */}
        {step === 'preview' && imageUri && (
          <ScrollView contentContainerStyle={styles.previewWrap}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />

            <TouchableOpacity style={styles.changePhotoBtn} onPress={() => setStep('pick')}>
              <Text style={styles.changePhotoBtnText}>CHANGE PHOTO</Text>
            </TouchableOpacity>

            <Text style={styles.previewHint}>
              Tap Analyze to send this photo to Claude for nutrition estimation.
            </Text>

            <View style={styles.notesWrap}>
              <Text style={styles.notesLabel}>NOTES (optional)</Text>
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. large portion, homemade, extra sauce..."
                placeholderTextColor="#3A3835"
                multiline
                maxLength={300}
              />
            </View>

            <TouchableOpacity style={styles.analyzeBtn} onPress={analyze}>
              <Text style={styles.analyzeBtnText}>ANALYZE WITH AI</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ── STEP: ANALYZING ── */}
        {step === 'analyzing' && (
          <View style={styles.analyzingWrap}>
            {imageUri && (
              <Image source={{ uri: imageUri }} style={styles.analyzingImage} resizeMode="cover" />
            )}
            <ActivityIndicator color="#EF6C3E" size="large" style={{ marginTop: 32 }} />
            <Text style={styles.analyzingText}>Analyzing your meal…</Text>
            <Text style={styles.analyzingSubText}>Claude is estimating the nutrition</Text>
          </View>
        )}

        {/* ── STEP: RESULT ── */}
        {step === 'result' && result && (
          <ScrollView contentContainerStyle={styles.resultWrap} keyboardShouldPersistTaps="handled">
            {/* Thumbnail */}
            {imageUri && (
              <Image source={{ uri: imageUri }} style={styles.resultThumb} resizeMode="cover" />
            )}

            <Text style={styles.resultTitle}>Review & Edit</Text>
            <Text style={styles.resultSub}>
              AI estimates can be imperfect. Adjust any values before logging.
            </Text>

            {/* Serving description */}
            <Text style={styles.resultDesc}>{result.serving_description}</Text>

            {/* Name */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>FOOD NAME</Text>
              <TextInput
                style={styles.textInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Food name"
                placeholderTextColor="#444"
              />
            </View>

            {/* Macros grid */}
            <View style={styles.macroGrid}>
              <EditField label="CALORIES" unit="kcal" value={editCal}    onChange={setEditCal}    color="#EF6C3E" wide />
            </View>
            <View style={styles.macroGrid}>
              <EditField label="PROTEIN"  unit="g"    value={editProtein} onChange={setEditProtein} color="#EF3E7A" />
              <EditField label="CARBS"    unit="g"    value={editCarbs}   onChange={setEditCarbs}   color="#3E8CEF" />
              <EditField label="FAT"      unit="g"    value={editFat}     onChange={setEditFat}     color="#EF9B3E" />
            </View>
            <View style={styles.macroGrid}>
              <EditField label="FIBER"    unit="g"    value={editFiber}   onChange={setEditFiber}   color="#6CEF3E" />
              <EditField label="SODIUM"   unit="mg"   value={editSodium}  onChange={setEditSodium}  color="#EFDE3E" />
            </View>

            <TouchableOpacity
              style={[styles.logBtn, isLogging && styles.logBtnDisabled]}
              onPress={logFood}
              disabled={isLogging}
            >
              {isLogging
                ? <ActivityIndicator color="#0E0D0B" />
                : <Text style={styles.logBtnText}>LOG TO {MEAL_LABELS[mealType].toUpperCase()}</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={styles.retryBtn} onPress={() => setStep('pick')}>
              <Text style={styles.retryBtnText}>RETAKE PHOTO</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        )}

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// EDIT FIELD
// ─────────────────────────────────────────────────────────────

function EditField({
  label, unit, value, onChange, color, wide,
}: {
  label: string; unit: string; value: string;
  onChange: (v: string) => void; color: string; wide?: boolean;
}) {
  return (
    <View style={[efStyles.wrap, wide && { flex: 2 }]}>
      <Text style={[efStyles.label, { color }]}>{label}</Text>
      <View style={efStyles.row}>
        <TextInput
          style={efStyles.input}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          selectTextOnFocus
          placeholderTextColor="#444"
        />
        <Text style={efStyles.unit}>{unit}</Text>
      </View>
    </View>
  );
}

const efStyles = StyleSheet.create({
  wrap:  { flex: 1, marginBottom: 10, marginHorizontal: 4 },
  label: { fontSize: 8, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  row:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  input: {
    flex: 1, backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 15, fontWeight: '700', color: '#F2F0EB',
  },
  unit: { fontSize: 11, color: '#555', fontWeight: '600' },
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

  // ── Pick ──
  pickWrap: { flex: 1, paddingHorizontal: 24, paddingTop: 48, alignItems: 'center' },
  pickTitle: { fontSize: 24, fontWeight: '900', color: '#F2F0EB', marginBottom: 10, textAlign: 'center' },
  pickSub: { fontSize: 13, color: '#555', lineHeight: 19, textAlign: 'center', marginBottom: 40 },
  pickBtn: {
    width: '100%', backgroundColor: '#141311', borderWidth: 1, borderColor: '#EF6C3E',
    borderRadius: 14, paddingVertical: 20, alignItems: 'center', marginBottom: 12, gap: 6,
  },
  pickBtnSecondary: { borderColor: '#252320' },
  pickBtnIcon: { fontSize: 28 },
  pickBtnLabel: { fontSize: 15, fontWeight: '700', color: '#F2F0EB' },
  pickNote: { fontSize: 11, color: '#3A3835', marginTop: 32, textAlign: 'center', lineHeight: 16 },

  // ── Preview ──
  previewWrap: { paddingBottom: 40 },
  previewImage: { width: '100%', height: 280 },
  changePhotoBtn: { margin: 16, alignSelf: 'flex-start' },
  changePhotoBtnText: { fontSize: 11, color: '#555', fontWeight: '700', letterSpacing: 1 },
  previewHint: { fontSize: 13, color: '#555', paddingHorizontal: 20, marginBottom: 24, lineHeight: 18 },
  notesWrap: { marginHorizontal: 20, marginBottom: 20 },
  notesLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: '#555', marginBottom: 6 },
  notesInput: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 13, color: '#F2F0EB', minHeight: 64, textAlignVertical: 'top',
  },

  analyzeBtn: {
    backgroundColor: '#EF6C3E', marginHorizontal: 20, borderRadius: 12,
    paddingVertical: 16, alignItems: 'center',
  },
  analyzeBtnText: { color: '#0E0D0B', fontWeight: '800', fontSize: 14, letterSpacing: 1 },

  // ── Analyzing ──
  analyzingWrap: { flex: 1, alignItems: 'center', paddingTop: 0 },
  analyzingImage: { width: '100%', height: 220, opacity: 0.5 },
  analyzingText: { fontSize: 18, fontWeight: '800', color: '#F2F0EB', marginTop: 20 },
  analyzingSubText: { fontSize: 13, color: '#555', marginTop: 6 },

  // ── Result ──
  resultWrap: { paddingHorizontal: 16, paddingTop: 16 },
  resultThumb: { width: '100%', height: 160, borderRadius: 12, marginBottom: 16 },
  resultTitle: { fontSize: 20, fontWeight: '900', color: '#F2F0EB', marginBottom: 4 },
  resultSub: { fontSize: 12, color: '#555', lineHeight: 17, marginBottom: 12 },
  resultDesc: {
    fontSize: 13, color: '#EF6C3E', fontWeight: '600',
    marginBottom: 16, fontStyle: 'italic',
  },

  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: '#555', marginBottom: 5 },
  textInput: {
    backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: '#F2F0EB',
  },

  macroGrid: { flexDirection: 'row', marginHorizontal: -4, marginBottom: 2 },

  logBtn: {
    backgroundColor: '#EF6C3E', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 16,
  },
  logBtnDisabled: { opacity: 0.5 },
  logBtnText: { color: '#0E0D0B', fontWeight: '800', fontSize: 14, letterSpacing: 1 },

  retryBtn: {
    borderWidth: 1, borderColor: '#252320', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 10,
  },
  retryBtnText: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: '#555' },

  // ── Paywall ──
  paywallWrap: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 48, alignItems: 'center' },
  paywallBadge: {
    backgroundColor: '#EF6C3E18', borderWidth: 1, borderColor: '#EF6C3E55',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 16,
  },
  paywallBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 2, color: '#EF6C3E' },
  paywallTitle: { fontSize: 26, fontWeight: '900', color: '#F2F0EB', marginBottom: 10, textAlign: 'center' },
  paywallSub: { fontSize: 13, color: '#777', lineHeight: 19, textAlign: 'center', marginBottom: 28 },
  paywallFeatures: {
    width: '100%', backgroundColor: '#141311', borderWidth: 1,
    borderColor: '#252320', borderRadius: 14, padding: 16, marginBottom: 20, gap: 12,
  },
  paywallFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  paywallFeatureIcon: { fontSize: 18, width: 26, textAlign: 'center' },
  paywallFeatureText: { fontSize: 13, color: '#C0BEB9', fontWeight: '500' },
  paywallPriceCard: {
    width: '100%', backgroundColor: '#141311', borderWidth: 1, borderColor: '#EF6C3E55',
    borderRadius: 14, padding: 20, marginBottom: 20, alignItems: 'center',
  },
  paywallPriceLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 2, color: '#EF6C3E', marginBottom: 6 },
  paywallPrice: { fontSize: 36, fontWeight: '900', color: '#F2F0EB' },
  paywallPricePer: { fontSize: 16, fontWeight: '500', color: '#555' },
  paywallPriceAlt: { fontSize: 12, color: '#555', marginTop: 4 },
  paywallCtaGroup: { width: '100%', gap: 8, marginBottom: 12 },
  paywallCta: {
    width: '100%', backgroundColor: '#EF6C3E', borderRadius: 14,
    paddingVertical: 18, alignItems: 'center',
  },
  paywallCtaText: { fontSize: 14, fontWeight: '900', letterSpacing: 1.5, color: '#0E0D0B' },
  paywallCtaAnnual: {
    width: '100%', borderWidth: 1, borderColor: '#EF6C3E', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  paywallCtaAnnualText: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: '#EF6C3E' },
  paywallRefresh: { paddingVertical: 10, alignItems: 'center' },
  paywallRefreshText: { fontSize: 12, color: '#555', textDecorationLine: 'underline' },
  paywallRestore: { paddingVertical: 8 },
  paywallRestoreText: { fontSize: 12, color: '#555' },

  paywallPromoToggle: { paddingVertical: 10 },
  paywallPromoToggleText: { fontSize: 12, color: '#555', textDecorationLine: 'underline' },
  paywallPromoWrap: { width: '100%', marginBottom: 4 },
  paywallPromoInput: {
    width: '100%', backgroundColor: '#141311', borderWidth: 1, borderColor: '#252320',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontWeight: '700', color: '#F2F0EB', letterSpacing: 2,
    marginBottom: 8, textAlign: 'center',
  },
  paywallPromoBtn: {
    width: '100%', backgroundColor: '#EF6C3E', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  paywallPromoBtnText: { fontSize: 13, fontWeight: '900', letterSpacing: 1.5, color: '#0E0D0B' },
  paywallPromoError: { fontSize: 12, color: '#EF3E7A', textAlign: 'center', marginTop: 8 },
});
