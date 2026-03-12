// ============================================================
// TORVUS — Stripe Webhook Handler
// supabase/functions/stripe-webhook/index.ts
//
// Handles subscription lifecycle events from Stripe.
//
// Security:
//   - Verifies Stripe-Signature header with HMAC-SHA256
//   - Rejects replayed events older than 5 minutes
//   - Uses service role to write profiles
//   - Never echoes sensitive Stripe data in logs
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('not found', { status: 404 });

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) return new Response('misconfigured', { status: 500 });

  // ── 1. Verify Stripe signature ─────────────────────────
  const sigHeader = req.headers.get('stripe-signature');
  if (!sigHeader) return new Response('missing signature', { status: 400 });

  const payload = await req.arrayBuffer();
  const isValid = await verifyStripeSignature(new Uint8Array(payload), sigHeader, webhookSecret);
  if (!isValid) return new Response('invalid signature', { status: 400 });

  let event: Record<string, unknown>;
  try { event = JSON.parse(new TextDecoder().decode(payload)); }
  catch { return new Response('invalid json', { status: 400 }); }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ── 2. Handle events ───────────────────────────────────
  try {
    const data = (event.data as Record<string, unknown>)?.object as Record<string, unknown>;

    switch (event.type) {
      case 'checkout.session.completed': {
        const userId     = (data.metadata as Record<string, string>)?.user_id
                        ?? (data.client_reference_id as string);
        if (!userId) break;

        await supabase.from('profiles').upsert(
          {
            id:                    userId,
            is_premium:            true,
            premium_since:         new Date().toISOString(),
            stripe_customer_id:    data.customer as string,
            stripe_subscription_id: data.subscription as string,
            updated_at:            new Date().toISOString(),
          },
          { onConflict: 'id' },
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const customerId = data.customer as string;
        await supabase
          .from('profiles')
          .update({
            is_premium:            false,
            stripe_subscription_id: null,
            updated_at:            new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);
        break;
      }

      case 'customer.subscription.updated': {
        const customerId = data.customer as string;
        const status     = data.status as string;
        const isActive   = status === 'active' || status === 'trialing';
        await supabase
          .from('profiles')
          .update({ is_premium: isActive, updated_at: new Date().toISOString() })
          .eq('stripe_customer_id', customerId);
        break;
      }

      case 'invoice.payment_failed': {
        console.log('Payment failed for customer:', data.customer);
        break;
      }
    }
  } catch (e) {
    console.error('Webhook handler error:', e);
    return new Response('handler error', { status: 500 });
  }

  return new Response('ok', { status: 200 });
});

// ─────────────────────────────────────────────────────────────
// Stripe HMAC-SHA256 signature verification
// ─────────────────────────────────────────────────────────────

async function verifyStripeSignature(
  payload: Uint8Array,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  const parts = sigHeader.split(',').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx !== -1) acc[part.slice(0, idx)] = part.slice(idx + 1);
    return acc;
  }, {} as Record<string, string>);

  const timestamp = parts['t'];
  const v1        = parts['v1'];
  if (!timestamp || !v1) return false;

  // Replay protection: reject events older than 5 minutes
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (age > 300) return false;

  const signedPayload = `${timestamp}.${new TextDecoder().decode(payload)}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig     = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const computed = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return computed === v1;
}
