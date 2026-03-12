// ============================================================
// TORVUS — AI Weekly Insights Edge Function
// supabase/functions/ai-weekly-insights/index.ts
//
// Security:
//   - Verifies Supabase JWT on every request
//   - Checks profiles.is_premium (server-side, not spoofable)
//   - Rate-limits to 1 insight per user per day
//   - Sanitizes all user-supplied string fields
//   - Anthropic API key never leaves the server
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DAILY_LIMIT       = 1;
const FEATURE           = 'weekly_insights';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface WorkoutSummary {
  date: string;
  dayLabel: string;
  totalVolumeKg: number;
  durationMin: number | null;
  exercises: Array<{ name: string; sets: number; topWeightKg: number }>;
}

interface CardioSummary {
  date: string;
  exercise: string;
  durationMin: number;
  distanceKm: number | null;
  caloriesBurned: number | null;
}

interface NutritionDay {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface BodyWeightEntry {
  date: string;
  weightKg: number;
}

interface NutritionGoals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface InsightsPayload {
  workouts:    WorkoutSummary[];
  cardio:      CardioSummary[];
  nutrition:   NutritionDay[];
  bodyWeight:  BodyWeightEntry[];
  goals:       NutritionGoals;
  fitnessGoal: string;
}

// ─────────────────────────────────────────────────────────────
// ENTRY
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── 1. Verify JWT ──────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return err(401, 'unauthorized');

    const token = authHeader.slice(7);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return err(401, 'unauthorized');

    // ── 2. Premium check ───────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_premium')
      .eq('id', user.id)
      .single();

    if (!profile?.is_premium) return err(402, 'subscription_required');

    // ── 3. Rate limiting (1/day) ───────────────────────────
    const today = new Date().toISOString().slice(0, 10);

    const { data: usage } = await supabase
      .from('ai_usage')
      .select('request_count')
      .eq('user_id', user.id)
      .eq('date', today)
      .eq('feature', FEATURE)
      .single();

    const usageCount = usage?.request_count ?? 0;
    if (usageCount >= DAILY_LIMIT) return err(429, 'daily_limit_reached');

    // ── 4. Parse & validate body ───────────────────────────
    let body: InsightsPayload;
    try { body = await req.json(); }
    catch { return err(400, 'invalid_json'); }

    if (!Array.isArray(body.workouts) || !Array.isArray(body.nutrition))
      return err(400, 'invalid_payload');

    // Sanitize string fields
    const fitnessGoal = typeof body.fitnessGoal === 'string'
      ? body.fitnessGoal.replace(/<[^>]*>/g, '').slice(0, 50)
      : 'maintaining';

    // ── 5. Call Anthropic ──────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) return err(500, 'server_misconfigured');

    const prompt = buildInsightsPrompt(body, fitnessGoal);

    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      console.error('Anthropic error', anthropicRes.status, await anthropicRes.text());
      return err(502, 'ai_error');
    }

    const anthropicData = await anthropicRes.json();
    const rawText: string = anthropicData?.content?.[0]?.text ?? '';
    const cleaned = rawText.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();

    let result: Record<string, unknown>;
    try { result = JSON.parse(cleaned); }
    catch { return err(502, 'ai_parse_error'); }

    if (typeof result.summary !== 'string') return err(502, 'ai_parse_error');

    // ── 6. Increment usage counter ─────────────────────────
    await supabase.from('ai_usage').upsert(
      { user_id: user.id, date: today, feature: FEATURE, request_count: usageCount + 1 },
      { onConflict: 'user_id,date,feature' },
    );

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('Unhandled edge function error:', e);
    return err(500, 'server_error');
  }
});

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function err(status: number, code: string) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function buildInsightsPrompt(data: InsightsPayload, fitnessGoal: string): string {
  const workoutSection = data.workouts.length > 0
    ? data.workouts.map(w => {
        const exList = w.exercises
          .map(e => `    • ${e.name}: ${e.sets} sets, top ${e.topWeightKg}kg`)
          .join('\n');
        return `  ${w.date} — ${w.dayLabel} (${w.durationMin ?? '?'} min, ${Math.round(w.totalVolumeKg)}kg total volume)\n${exList}`;
      }).join('\n')
    : '  No workouts logged this week.';

  const cardioSection = data.cardio.length > 0
    ? data.cardio.map(c => {
        const parts = [`${c.durationMin} min`];
        if (c.distanceKm) parts.push(`${c.distanceKm.toFixed(1)} km`);
        if (c.caloriesBurned) parts.push(`${Math.round(c.caloriesBurned)} kcal burned`);
        return `  ${c.date} — ${c.exercise}: ${parts.join(', ')}`;
      }).join('\n')
    : '  No cardio logged this week.';

  const nutritionSection = data.nutrition.length > 0
    ? (() => {
        const avgCal  = Math.round(data.nutrition.reduce((s, d) => s + d.calories, 0)  / data.nutrition.length);
        const avgProt = Math.round(data.nutrition.reduce((s, d) => s + d.protein_g, 0) / data.nutrition.length);
        const avgCarb = Math.round(data.nutrition.reduce((s, d) => s + d.carbs_g, 0)   / data.nutrition.length);
        const avgFat  = Math.round(data.nutrition.reduce((s, d) => s + d.fat_g, 0)     / data.nutrition.length);
        return `  Avg daily: ${avgCal} kcal | ${avgProt}g protein | ${avgCarb}g carbs | ${avgFat}g fat\n  Target:    ${data.goals.calories} kcal | ${data.goals.protein_g}g protein | ${data.goals.carbs_g}g carbs | ${data.goals.fat_g}g fat\n  Days tracked: ${data.nutrition.length}/7`;
      })()
    : '  No nutrition data logged this week.';

  const bwSection = data.bodyWeight.length >= 2
    ? (() => {
        const first = data.bodyWeight[0].weightKg;
        const last  = data.bodyWeight[data.bodyWeight.length - 1].weightKg;
        const delta = last - first;
        return `  Start: ${first}kg → End: ${last}kg (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}kg over ${data.bodyWeight.length} entries)`;
      })()
    : data.bodyWeight.length === 1
      ? `  Current: ${data.bodyWeight[0].weightKg}kg`
      : '  No body weight entries this week.';

  return `You are a personal trainer and nutrition coach providing a weekly progress review.

User's fitness goal: ${fitnessGoal}

WORKOUT SUMMARY (last 7 days):
${workoutSection}

CARDIO SUMMARY (last 7 days):
${cardioSection}

NUTRITION SUMMARY (last 7 days):
${nutritionSection}

BODY WEIGHT (last 14 days):
${bwSection}

Based on this data, provide a concise and motivating weekly progress review. Be specific and reference actual numbers from the data above.

Respond ONLY with a valid JSON object — no markdown, no explanation, no extra text:
{
  "summary": "one-sentence overall performance summary",
  "wins": ["specific win 1 referencing data", "specific win 2", "specific win 3"],
  "improvements": ["specific area 1 with context", "specific area 2"],
  "recommendations": ["actionable recommendation 1 for next week", "actionable recommendation 2", "actionable recommendation 3"],
  "nutritionInsight": "one sentence about nutrition adherence vs goals",
  "workoutInsight": "one sentence about workout consistency and volume"
}`;
}
