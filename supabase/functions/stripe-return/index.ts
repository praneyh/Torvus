// ============================================================
// TORVUS — Stripe Return Page
// supabase/functions/stripe-return/index.ts
//
// For checkout success/cancel: HTTP 302 redirect straight to the
// torvus:// deep link so openAuthSessionAsync closes instantly.
// For manage (customer portal): show a simple HTML page.
// No auth required.
// ============================================================

Deno.serve((req: Request) => {
  const url    = new URL(req.url);
  const status = url.searchParams.get('status') ?? 'success';

  // Checkout / cancel — redirect immediately so the in-app browser
  // (ASWebAuthenticationSession) intercepts it and closes without
  // showing any intermediate page.
  if (status === 'success' || status === 'cancel') {
    return new Response(null, {
      status: 302,
      headers: { 'Location': `torvus://subscription/${status}` },
    });
  }

  // Manage (customer portal return) — show a simple page.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Torvus — Manage Subscription</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0E0D0B; color: #F2F0EB;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100vh; display: flex; align-items: center;
      justify-content: center; padding: 24px;
    }
    .card {
      background: #141311; border: 1px solid #252320;
      border-radius: 16px; padding: 40px 32px;
      max-width: 400px; width: 100%; text-align: center;
    }
    .icon {
      width: 64px; height: 64px; border-radius: 50%;
      background: #EF6C3E22; border: 2px solid #EF6C3E;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 24px; font-size: 28px; color: #EF6C3E;
      line-height: 64px;
    }
    .eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 3px; color: #EF6C3E; margin-bottom: 12px; }
    h1 { font-size: 22px; font-weight: 800; color: #F2F0EB; margin-bottom: 12px; }
    p { font-size: 14px; color: #888; line-height: 1.6; margin-bottom: 28px; }
    .btn {
      display: inline-block; background: #EF6C3E; color: #0E0D0B;
      font-size: 13px; font-weight: 900; letter-spacing: 1.5px;
      padding: 14px 28px; border-radius: 12px; text-decoration: none;
    }
    .note { font-size: 11px; color: #444; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">↩</div>
    <div class="eyebrow">TORVUS</div>
    <h1>Manage Subscription</h1>
    <p>Return to Torvus to continue using the app.</p>
    <a href="torvus://subscription/manage" class="btn">RETURN TO APP</a>
    <p class="note">If the button doesn't work, close this page and reopen Torvus.</p>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});
