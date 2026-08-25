import BillingManager from './BillingManager.jsx';

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
          for the payment confirmation to reach us in the background, so your
          plan may show as pending for a moment.
        </p>
        {/* [F51] — this used to say "log in again to see your updated status",
            which was advice written around a bug: the app forgot the session
            on every navigation. Sessions now survive, so the honest next step
            is simply going back to the portal. */}
        <p>
          <a className="btn btn-primary btn-link" href="/business/billing">
            View my subscription
          </a>
        </p>
        {sessionId ? (
          <div className="session-id">Checkout session: {sessionId}</div>
        ) : null}
        {/* The troubleshooting note is DEV-ONLY. It used to render in every
            build, so a salon owner in production was told to go and check a
            `stripe listen` process on a machine they do not have — developer
            copy on a customer-facing page. `import.meta.env.DEV` is true only
            under `vite dev`; a production build drops this branch entirely. */}
        {import.meta.env.DEV ? (
          <div className="note">
            Dev note: if the status still shows as pending after a minute, check
            that <code>stripe listen</code> is running and forwarding to
            <code> /v1/billing/webhook</code> — that is what activates the
            account locally.
          </div>
        ) : (
          <div className="note">
            If your subscription still shows as pending after a few minutes,
            refresh this page or contact support with the checkout session id
            above.
          </div>
        )}
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

  // Reached directly, with no Stripe redirect flags.
  //
  // The original page dead-ended here with "Nothing to show here" — correct
  // when it was ONLY a Stripe return page, but this URL is the natural home
  // for billing, so T17 makes the direct visit useful instead: sign in and
  // manage the subscription. The two redirect branches above are untouched,
  // so the Stripe return behaviour T41 verified still renders exactly as it
  // did.
  return <BillingManager />;
}
