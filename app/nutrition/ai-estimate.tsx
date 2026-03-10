// ============================================================
// TORVUS — AI Food Photo Estimation
// app/nutrition/ai-estimate.tsx
//
// Params: date (YYYY-MM-DD), meal (breakfast|lunch|dinner|snacks)
// ============================================================

import { useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, Platform, ActivityIndicator,
  Image, Alert, KeyboardAvoidingView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { getDatabase } from '../../schema';

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

function buildBiasInstructions(bias: AIBias): string {
  const lines: string[] = [];
  const map: [keyof AIBias, string][] = [
    ['calories', 'calories'], ['protein', 'protein'],
    ['carbs', 'carbohydrates'], ['fat', 'fat'],
    ['fiber', 'fiber'], ['sodium', 'sodium'],
  ];
  for (const [key, label] of map) {
    if (bias[key] === 'overestimate') {
      lines.push(`• For ${label}: lean toward the HIGHER end of your estimate.`);
    } else if (bias[key] === 'underestimate') {
      lines.push(`• For ${label}: lean toward the LOWER end of your estimate.`);
    }
  }
  return lines.length > 0
    ? `\n\nEstimation bias (follow these instructions carefully):\n${lines.join('\n')}`
    : '';
}

function buildPrompt(bias: AIBias): string {
  return `You are a precise nutrition expert. Analyze the food in this photo and estimate its nutritional content for the portion shown.

If there is a size reference object in the image (like a hand, coin, or bottle), use it to estimate portion size more accurately.${buildBiasInstructions(bias)}

Respond ONLY with a valid JSON object — no markdown, no explanation, no extra text:
{
  "name": "descriptive food name",
  "serving_description": "e.g. 1 large bowl, approximately 400g",
  "calories": 450,
  "protein_g": 35,
  "carbs_g": 40,
  "fat_g": 15,
  "fiber_g": 5,
  "sodium_mg": 800
}`;
}

async function callClaudeVision(
  base64: string,
  mediaType: string,
  apiKey: string,
  bias: AIBias,
): Promise<EstimateResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          { type: 'text', text: buildPrompt(bias) },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any)?.error?.message ?? `API error ${response.status}`);
  }

  const data = await response.json();
  const text: string = data?.content?.[0]?.text ?? '';

  // Strip any accidental markdown fences
  const cleaned = text.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned) as EstimateResult;

  // Validate required fields
  if (typeof parsed.calories !== 'number') throw new Error('Unexpected response format');
  return parsed;
}

// ─────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────

type Step = 'pick' | 'preview' | 'analyzing' | 'result';

export default function AIEstimateScreen() {
  const params   = useLocalSearchParams<{ date: string; meal: string }>();
  const date     = params.date ?? new Date().toISOString().slice(0, 10);
  const mealType = (params.meal ?? 'breakfast') as MealType;

  const [step, setStep]         = useState<Step>('pick');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [base64, setBase64]     = useState<string | null>(null);
  const [mediaType, setMediaType] = useState('image/jpeg');
  const [result, setResult]     = useState<EstimateResult | null>(null);
  const [isLogging, setIsLogging] = useState(false);

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
      const prefs = await db.getFirstAsync<{
        anthropic_api_key: string | null;
        ai_estimation_bias: string;
      }>(`SELECT anthropic_api_key, ai_estimation_bias FROM user_preferences WHERE id = 1`);

      const apiKey = prefs?.anthropic_api_key?.trim() ?? '';
      if (!apiKey) {
        Alert.alert(
          'API Key Required',
          'Add your Anthropic API key in the Profile tab to use AI food scanning.',
        );
        setStep('preview');
        return;
      }

      let bias: AIBias = {
        calories: 'neutral', protein: 'neutral', carbs: 'neutral',
        fat: 'neutral', fiber: 'neutral', sodium: 'neutral',
      };
      try { bias = JSON.parse(prefs?.ai_estimation_bias ?? '{}'); } catch {}

      const estimate = await callClaudeVision(base64, mediaType, apiKey, bias);

      setResult(estimate);
      setEditName(estimate.name);
      setEditCal(String(Math.round(estimate.calories)));
      setEditProtein(String(Math.round(estimate.protein_g)));
      setEditCarbs(String(Math.round(estimate.carbs_g)));
      setEditFat(String(Math.round(estimate.fat_g)));
      setEditFiber(String(Math.round(estimate.fiber_g)));
      setEditSodium(String(Math.round(estimate.sodium_mg)));
      setEditDesc(estimate.serving_description);
      setStep('result');
    } catch (e: any) {
      Alert.alert('Analysis failed', e?.message ?? 'Please try again.');
      setStep('preview');
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

            <Text style={styles.pickNote}>
              Your Anthropic API key must be set in Profile settings.
            </Text>
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
});
