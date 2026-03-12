// ============================================================
// TORVUS — Activate Subscription Edge Function
// supabase/functions/activate-subscription/index.ts
//
// Security:
//   - Supabase gateway verifies JWT before function runs
//   - User ID extracted from verified JWT payload
//   - Code is never logged or echoed back
//   - Comparison is case-insensitive
//   - Only the service role can write to profiles
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jwtUserId(authHeader: string | null): string | null {
  try {
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7);
    const [, b64url] = token.split('.');
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const payload = JSON.parse(atob(padded));
    if (typeof payload?.sub !== 'string') return null;
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload.sub as string;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── 1. Verify JWT ──────────────────────────────────────
    const userId = jwtUserId(req.headers.get('Authorization'));
    if (!userId) return err(401, 'unauthorized');

    // ── 2. Supabase service client ─────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── 3. Parse body ──────────────────────────────────────
    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return err(400, 'invalid_json'); }

    const { code } = body as { code: string };
    if (typeof code !== 'string' || code.trim().length === 0)
      return err(400, 'missing_code');

    // ── 4. Validate promo code ─────────────────────────────
    const devCode = Deno.env.get('DEV_PROMO_CODE');
    if (!devCode) return err(500, 'server_misconfigured');

    const submitted = code.trim().toUpperCase();
    const expected  = devCode.trim().toUpperCase();

    if (submitted.length !== expected.length || submitted !== expected)
      return err(400, 'invalid_code');

    // ── 5. Activate premium ────────────────────────────────
    const { error: upsertErr } = await supabase
      .from('profiles')
      .upsert(
        {
          id:            userId,
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
