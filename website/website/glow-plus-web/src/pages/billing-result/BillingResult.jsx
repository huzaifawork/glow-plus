const Brand = () => (
  <div className="brand">Glow<span className="plus">+</span></div>
);

/**
 * Port of glow-plus-frontend/public/billing-result.html — the page Stripe
 * Checkout redirects back to (billing.service.ts's success_url / cancel_url,
 * both pointing at /business/billing with ?success=true or ?canceled=true).
 *
 * The original ran render() synchronously at the end of <body>, so the "⏳ One
 * moment…" placeholder was replaced before the first paint and was never
 * actually visible. Deriving the branch during render reproduces that exactly.
 */
export default function BillingResult() {
  const params = new URLSearchParams(window.location.search);
  const success = params.get('success') === 'true';
  const canceled = params.get('canceled') === 'true';
  const sessionId = params.get('session_id');

  if (success) {
    return (
      <div className="card status-success" id="card">
        <Brand />
        <div className="icon">✅</div>
        <h1>You’re all set!</h1>
        <p>
          Your Glow+ subscription checkout completed. It can take a few seconds
          for the payment confirmation to reach our system in the background —
          switch back to your Glow+ tab and log in again to see your updated
          status.
        </p>
        {sessionId ? (
          <div className="session-id">Checkout session: {sessionId}</div>
        ) : null}
        <div className="note">
          If your status still shows as pending after a minute, check that your
          backend’s <code>stripe listen</code> (in local dev) or webhook
          endpoint (in production) is running — that’s what actually activates
          your account.
        </div>
      </div>
    );
  }

  if (canceled) {
    return (
      <div className="card status-cancel" id="card">
        <Brand />
        <div className="icon">↩️</div>
        <h1>Checkout canceled</h1>
        <p>
          No charge was made. Head back to your Glow+ business portal whenever
          you’re ready to try again.
        </p>
      </div>
    );
  }

  // Neither flag set — the original left the card's class untouched here.
  return (
    <div className="card" id="card">
      <Brand />
      <div className="icon">⚠️</div>
      <h1>Nothing to show here</h1>
      <p>
        This page is meant to be reached via a Stripe Checkout redirect, not
        visited directly.
      </p>
    </div>
  );
}
