// ============================================================
// TORVUS — Create Stripe Checkout Session
// supabase/functions/create-checkout-session/index.ts
//
// Security:
//   - Supabase gateway verifies JWT before function runs
//   - User ID extracted from verified JWT payload (no extra network hop)
//   - Stripe secret key never exposed to client
//   - Re-uses existing Stripe customer to prevent duplicates
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_API = 'https://api.stripe.com/v1';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Decode JWT payload without verifying signature (gateway already verified). */
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
    // ── 1. Verify JWT (decode payload; gateway verified signature) ──
    const userId = jwtUserId(req.headers.get('Authorization'));
    if (!userId) return err(401, 'unauthorized');

    // ── 2. Supabase service client (DB only) ───────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── 3. Check if already premium ───────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_premium, stripe_customer_id')
      .eq('id', userId)
      .single();

    if (profile?.is_premium) return err(409, 'already_premium');

    // ── 4. Parse body ──────────────────────────────────────
    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return err(400, 'invalid_json'); }

    const priceType = body.priceType === 'annual' ? 'annual' : 'monthly';

    // ── 5. Stripe config ───────────────────────────────────
    const stripeKey    = Deno.env.get('STRIPE_SECRET_KEY');
    const priceMonthly = Deno.env.get('STRIPE_PRICE_MONTHLY');
    const priceAnnual  = Deno.env.get('STRIPE_PRICE_ANNUAL');
    const returnBase   = Deno.env.get('STRIPE_RETURN_URL');

    if (!stripeKey || !priceMonthly || !priceAnnual || !returnBase)
      return err(500, 'server_misconfigured');

    const priceId = priceType === 'annual' ? priceAnnual : priceMonthly;

    // ── 6. Build checkout params ───────────────────────────
    const params = new URLSearchParams({
      'mode':                      'subscription',
      'line_items[0][price]':      priceId,
      'line_items[0][quantity]':   '1',
      'client_reference_id':       userId,
      'metadata[user_id]':         userId,
      'allow_promotion_codes':     'true',
      'success_url':               `${returnBase}?status=success`,
      'cancel_url':                `${returnBase}?status=cancel`,
    });

    const existingCustomerId = profile?.stripe_customer_id;
    if (existingCustomerId) {
      params.set('customer', existingCustomerId);
    }

    // ── 7. Create Stripe session ───────────────────────────
    const stripeRes = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!stripeRes.ok) {
      const stripeErr = await stripeRes.json();
      console.error('Stripe error:', JSON.stringify(stripeErr));
      return new Response(JSON.stringify({
        error:  'payment_provider_error',
        detail: stripeErr?.error?.message ?? stripeErr,
      }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const session = await stripeRes.json();
    return new Response(JSON.stringify({ url: session.url }), {
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
