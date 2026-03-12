// ============================================================
// TORVUS — Stripe Return Page
// supabase/functions/stripe-return/index.ts
//
// Public HTML landing page shown after Stripe checkout/portal.
// No auth required.
// ============================================================

Deno.serve((req: Request) => {
  const url    = new URL(req.url);
  const status = url.searchParams.get('status') ?? 'success';

  const isSuccess = status === 'success';
  const isCancel  = status === 'cancel';

  const deepLink = `torvus://subscription/${status}`;

  const title   = isSuccess ? 'Subscription Activated!'
    : isCancel  ? 'Checkout Cancelled'
    : 'Manage Subscription';

  const message = isSuccess
    ? 'Your Torvus Premium subscription is now active. Return to the app to access all premium features.'
    : isCancel
    ? 'Checkout was cancelled. Return to Torvus and try again whenever you\'re ready.'
    : 'Return to Torvus to continue using the app.';

  const icon  = isSuccess ? '✓' : isCancel ? '✕' : '↩';
  const color = isSuccess ? '#6CEF3E' : isCancel ? '#EF3E7A' : '#EF6C3E';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="0;url=${deepLink}">
  <title>Torvus — ${title}</title>
  <script>window.location.replace('${deepLink}');</script>
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
      background: ${color}22; border: 2px solid ${color};
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 24px; font-size: 28px; color: ${color};
      line-height: 64px;
    }
    .eyebrow {
      font-size: 10px; font-weight: 700; letter-spacing: 3px;
      color: #EF6C3E; margin-bottom: 12px;
    }
    h1 { font-size: 22px; font-weight: 800; color: #F2F0EB; margin-bottom: 12px; }
    p { font-size: 14px; color: #888; line-height: 1.6; margin-bottom: 28px; }
    .btn {
      display: inline-block; background: #EF6C3E; color: #0E0D0B;
      font-size: 13px; font-weight: 900; letter-spacing: 1.5px;
      padding: 14px 28px; border-radius: 12px; text-decoration: none;
      cursor: pointer;
    }
    .note { font-size: 11px; color: #444; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <div class="eyebrow">TORVUS</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="${deepLink}" class="btn">RETURN TO APP</a>
    <p class="note">If the button doesn't work, close this page and reopen Torvus.</p>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});
