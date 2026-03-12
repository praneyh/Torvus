// ============================================================
// TORVUS — AI Estimate Edge Function
// supabase/functions/ai-estimate/index.ts
//
// Security:
//   - Verifies Supabase JWT on every request
//   - Checks profiles.is_premium (server-side, not spoofable)
//   - Rate-limits to DAILY_LIMIT scans per user per day
//   - Validates and caps image size
//   - Sanitizes free-text notes
//   - Anthropic API key never leaves the server
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_URL  = 'https://api.anthropic.com/v1/messages';
const MAX_IMAGE_B64_CHARS = 7_000_000; // ~5 MB decoded
const DAILY_LIMIT         = 25;
const MAX_NOTES_LENGTH    = 300;
const FEATURE             = 'food_scan';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Use service role for DB queries (anon key can only read own rows via RLS)
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

    // ── 3. Rate limiting ───────────────────────────────────
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

    const { base64, mediaType, bias, notes } = body as {
      base64: string;
      mediaType: string;
      bias: Record<string, string>;
      notes?: string;
    };

    if (typeof base64 !== 'string' || base64.length === 0)
      return err(400, 'missing_image');

    if (base64.length > MAX_IMAGE_B64_CHARS)
      return err(400, 'image_too_large');

    const safeMediaType = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mediaType)
      ? mediaType
      : 'image/jpeg';

    // Strip HTML and cap length from free-text notes
    const safeNotes = typeof notes === 'string'
      ? notes.replace(/<[^>]*>/g, '').slice(0, MAX_NOTES_LENGTH)
      : undefined;

    // ── 5. Call Anthropic ──────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) return err(500, 'server_misconfigured');

    const prompt = buildPrompt(bias ?? {}, safeNotes);

    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key':          anthropicKey,
        'anthropic-version':  '2023-06-01',
        'content-type':       'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [{
          role:    'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: safeMediaType, data: base64 } },
            { type: 'text',  text: prompt },
          ],
        }],
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

function buildBiasInstructions(bias: Record<string, string>): string {
  const map: [string, string][] = [
    ['calories', 'calories'], ['protein', 'protein'],
    ['carbs', 'carbohydrates'], ['fat', 'fat'],
    ['fiber', 'fiber'], ['sodium', 'sodium'],
  ];
  const lines: string[] = [];
  for (const [key, label] of map) {
    if (bias[key] === 'overestimate')
      lines.push(`• For ${label}: lean toward the HIGHER end of your estimate.`);
    else if (bias[key] === 'underestimate')
      lines.push(`• For ${label}: lean toward the LOWER end of your estimate.`);
  }
  return lines.length > 0
    ? `\n\nEstimation bias (follow these instructions carefully):\n${lines.join('\n')}`
    : '';
}

function buildPrompt(bias: Record<string, string>, notes?: string): string {
  const notesSection = notes?.trim()
    ? `\n\nAdditional context from the user:\n"${notes.trim()}"`
    : '';
  return `You are a precise nutrition expert. Analyze the food in this photo and estimate its nutritional content for the portion shown.

If there is a size reference object in the image (like a hand, coin, or bottle), use it to estimate portion size more accurately.${notesSection}${buildBiasInstructions(bias)}

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
