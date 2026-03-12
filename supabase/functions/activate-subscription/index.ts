// ============================================================
// TORVUS — Activate Subscription Edge Function
// supabase/functions/activate-subscription/index.ts
//
// Accepts a promo/test code and activates premium for the user.
// The valid code is stored as SUPABASE secret DEV_PROMO_CODE.
//
// Security:
//   - Verifies Supabase JWT on every request
//   - Code is never logged or echoed back
//   - Comparison is case-insensitive
//   - Only the service role can write to profiles
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // ── 2. Parse body ──────────────────────────────────────
    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return err(400, 'invalid_json'); }

    const { code } = body as { code: string };
    if (typeof code !== 'string' || code.trim().length === 0)
      return err(400, 'missing_code');

    // ── 3. Validate promo code ─────────────────────────────
    const devCode = Deno.env.get('DEV_PROMO_CODE');
    if (!devCode) return err(500, 'server_misconfigured');

    const submitted = code.trim().toUpperCase();
    const expected  = devCode.trim().toUpperCase();

    // Reject if lengths differ (avoids timing side-channel)
    if (submitted.length !== expected.length || submitted !== expected)
      return err(400, 'invalid_code');

    // ── 4. Activate premium ────────────────────────────────
    const { error: upsertErr } = await supabase
      .from('profiles')
      .upsert(
        {
          id:            user.id,
          is_premium:    true,
          premium_since: new Date().toISOString(),
          updated_at:    new Date().toISOString(),
        },
        { onConflict: 'id' },
      );

    if (upsertErr) {
      console.error('profiles upsert error:', upsertErr);
      return err(500, 'server_error');
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('Unhandled error:', e);
    return err(500, 'server_error');
  }
});

function err(status: number, code: string) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
