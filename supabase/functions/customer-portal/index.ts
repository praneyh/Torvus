// ============================================================
// TORVUS — Stripe Customer Portal
// supabase/functions/customer-portal/index.ts
//
// Security:
//   - Supabase gateway verifies JWT before function runs
//   - User ID extracted from verified JWT payload
//   - Only allows users with stripe_customer_id to access
//   - Stripe secret key never exposed to client
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_API = 'https://api.stripe.com/v1';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jwtUserId(authHeader: string | null): string | null {
  try {
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7);
    const [, b64] = token.split('.');
    const padded = b64.replace(/-/g, '+').replace(/_/g, '/') + '==';
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

    // ── 3. Get Stripe customer ─────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, is_premium')
      .eq('id', userId)
      .single();

    if (!profile?.is_premium)        return err(402, 'subscription_required');
    if (!profile?.stripe_customer_id) return err(404, 'no_stripe_customer');

    // ── 4. Stripe config ───────────────────────────────────
    const stripeKey  = Deno.env.get('STRIPE_SECRET_KEY');
    const returnBase = Deno.env.get('STRIPE_RETURN_URL');
    if (!stripeKey || !returnBase) return err(500, 'server_misconfigured');

    // ── 5. Create portal session ───────────────────────────
    const portalRes = await fetch(`${STRIPE_API}/billing_portal/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'customer':   profile.stripe_customer_id,
        'return_url': `${returnBase}?status=manage`,
      }).toString(),
    });

    if (!portalRes.ok) {
      console.error('Stripe portal error:', await portalRes.json());
      return err(502, 'payment_provider_error');
    }

    const portal = await portalRes.json();
    return new Response(JSON.stringify({ url: portal.url }), {
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
