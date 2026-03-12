// ============================================================
// TORVUS — AI Nutrition Targets Edge Function
// supabase/functions/ai-nutrition-targets/index.ts
//
// Calculates personalised TDEE and macro targets using Claude.
//
// Security:
//   - Verifies Supabase JWT on every request
//   - Checks profiles.is_premium (server-side)
//   - Rate-limits to 3 calculations per user per day
//   - Validates and caps all numeric inputs
//   - Anthropic API key never leaves the server
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DAILY_LIMIT       = 3;
const FEATURE           = 'nutrition_targets';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_GOALS      = ['bulking', 'cutting', 'maintaining'] as const;
const VALID_ACTIVITIES = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;

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

    // ── 3. Rate limiting (3/day) ───────────────────────────
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
    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return err(400, 'invalid_json'); }

    const weightKg      = clampNum(body.weightKg,  20, 300);
    const heightCm      = clampNum(body.heightCm,  100, 250);
    const ageYears      = clampNum(body.ageYears,   10, 100);
    const fitnessGoal   = VALID_GOALS.includes(body.fitnessGoal as any)
      ? (body.fitnessGoal as string) : 'maintaining';
    const activityLevel = VALID_ACTIVITIES.includes(body.activityLevel as any)
      ? (body.activityLevel as string) : 'moderate';

    if (weightKg === null || heightCm === null)
      return err(400, 'missing_body_stats');

    // ── 5. Call Anthropic ──────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) return err(500, 'server_misconfigured');

    const prompt = buildTargetsPrompt(
      weightKg, heightCm, ageYears, fitnessGoal, activityLevel,
    );

    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 512,
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

    if (typeof result.calories !== 'number') return err(502, 'ai_parse_error');

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

function clampNum(val: unknown, min: number, max: number): number | null {
  const n = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(n)) return null;
  return Math.max(min, Math.min(max, n));
}

const ACTIVITY_LABELS: Record<string, string> = {
  sedentary:  'Sedentary (desk job, little exercise)',
  light:      'Lightly active (1-3 days/week exercise)',
  moderate:   'Moderately active (3-5 days/week exercise)',
  active:     'Very active (6-7 days/week hard exercise)',
  very_active:'Extremely active (physical job + daily training)',
};

const GOAL_LABELS: Record<string, string> = {
  bulking:     'Bulking (muscle gain, caloric surplus)',
  cutting:     'Cutting (fat loss, caloric deficit)',
  maintaining: 'Maintaining (body recomposition / maintenance)',
};

function buildTargetsPrompt(
  weightKg: number,
  heightCm: number,
  ageYears: number | null,
  fitnessGoal: string,
  activityLevel: string,
): string {
  const ageStr = ageYears ? `${ageYears} years` : 'unknown (assume 30)';
  return `You are a certified sports nutritionist calculating personalised daily nutrition targets.

User stats:
- Weight: ${weightKg}kg
- Height: ${heightCm}cm
- Age: ${ageStr}
- Goal: ${GOAL_LABELS[fitnessGoal] ?? fitnessGoal}
- Activity level: ${ACTIVITY_LABELS[activityLevel] ?? activityLevel}

Calculate:
1. TDEE (Total Daily Energy Expenditure) using the Mifflin-St Jeor formula
2. Adjusted calorie target based on the fitness goal (surplus ~250-500 kcal for bulking, deficit ~300-500 kcal for cutting)
3. Optimal macro split for the goal (high protein for both bulking/cutting, adjust carbs/fat based on goal)

Protein guideline: 1.6-2.2g per kg bodyweight.
Fiber: 25-35g/day. Sodium: 1500-2300mg/day.

Respond ONLY with a valid JSON object — no markdown, no explanation, no extra text:
{
  "tdee": 2400,
  "calories": 2700,
  "protein_g": 165,
  "carbs_g": 290,
  "fat_g": 80,
  "fiber_g": 30,
  "sodium_mg": 2000,
  "explanation": "Brief 1-2 sentence explanation of the targets and rationale"
}`;
}
