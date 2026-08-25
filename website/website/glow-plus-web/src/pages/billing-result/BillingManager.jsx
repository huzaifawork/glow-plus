/**
 * Billing management — the working half of T17.
 *
 * Lives on /business/billing, the URL the backend already redirects to after
 * Stripe Checkout (billing.service.ts success_url / cancel_url). Reusing it
 * means a merchant returning from Stripe lands on the same page that shows
 * their subscription, instead of a dead-end confirmation card.
 *
 * It talks to the REAL API (lib/api.js), not the localStorage seam the
 * prototype views still use. Login is here rather than shared with the
 * prototype's BusinessAuth view because that view is fake — it never had a
 * password field and never called the backend [F9]. Wiring real auth into it
 * is T35; this page needs a real token today, so it asks for one directly.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  cancelSubscription,
  clearToken,
  createCheckoutSession,
  getMerchantProfile,
  getToken,
  merchantLogin,
  resumeSubscription,
} from '../../lib/api.js';

const Brand = () => (
  <div className="brand">Glow<span className="plus">+</span></div>
);

/** Money, from the integer cents the API stores. */
function formatPrice(cents) {
  if (typeof cents !== 'number') return '—';
  return '$' + (cents / 100).toFixed(2);
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * The one piece of real product logic on this page: a subscription that is
 * TRIALING and also set to cancel is NOT the same as one that is simply
 * active, and showing "Active" for both is how a merchant gets surprised by
 * losing access. Each state gets its own line.
 */
function describe(subscription) {
  if (!subscription) {
    return {
      label: 'No subscription',
      tone: 'neutral',
      detail: 'You have not started a plan yet.',
    };
  }
  const { status, cancelAtPeriodEnd, currentPeriodEnd, trialEnd } = subscription;

  if (cancelAtPeriodEnd) {
    return {
      label: 'Cancels at period end',
      tone: 'warn',
      detail:
        'Your plan stays active until ' +
        formatDate(currentPeriodEnd) +
        ', then stops. You can resume any time before then.',
    };
  }
  if (status === 'TRIALING') {
    return {
      label: 'Trial',
      tone: 'ok',
      detail: 'Your free trial runs until ' + formatDate(trialEnd) + '.',
    };
  }
  if (status === 'PAST_DUE') {
    return {
      label: 'Payment overdue',
      tone: 'warn',
      detail: 'We could not take your last payment. Update your card to avoid losing access.',
    };
  }
  if (status === 'CANCELED') {
    return { label: 'Cancelled', tone: 'bad', detail: 'This subscription has ended.' };
  }
  return {
    label: 'Active',
    tone: 'ok',
    detail: 'Renews on ' + formatDate(currentPeriodEnd) + '.',
  };
}

export default function BillingManager({ banner }) {
  const [authed, setAuthed] = useState(() => Boolean(getToken()));
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [plan, setPlan] = useState('MONTHLY');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProfile(await getMerchantProfile());
    } catch (err) {
      // An expired or rejected token must not leave the page stuck showing a
      // logged-in shell it cannot populate — drop it and fall back to login.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        clearToken();
        setAuthed(false);
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) load();
  }, [authed, load]);

  async function act(kind) {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'cancel') await cancelSubscription();
      else await resumeSubscription();
      await load(); // re-read from the server rather than guessing locally
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  /**
   * Start a subscription  [F49]
   *
   * `POST /billing/checkout` and `createCheckoutSession()` both already
   * existed — nothing in the site called either, so a salon that signed up
   * could never pay. This page said "start a plan from your business portal"
   * and the portal's Billing tab linked straight back here, so the two halves
   * pointed at each other and neither reached Stripe.
   *
   * `location.assign`, not `window.open`: Checkout must replace the tab so
   * Stripe's own success_url/cancel_url bring the merchant back to THIS page
   * (billing.service.ts builds both from APP_URL). A popup would strand the
   * return on a tab the merchant never sees, and is blocked by default anyway
   * because this runs after an await rather than inside the click.
   */
  async function startCheckout() {
    setBusy('checkout');
    setError(null);
    try {
      const { url } = await createCheckoutSession(plan);
      if (!url) throw new Error('Stripe did not return a checkout URL.');
      window.location.assign(url);
    } catch (err) {
      setError(err.message);
      setBusy(null); // on success the tab is leaving, so only reset on failure
    }
  }

  function logOut() {
    clearToken();
    setAuthed(false);
    setProfile(null);
  }

  if (!authed) {
    return <LoginCard banner={banner} onSuccess={() => setAuthed(true)} />;
  }

  const subscription = profile ? profile.subscription : null;
  const state = describe(subscription);

  return (
    <div className="card" id="card">
      <Brand />
      {banner}
      <h1>Billing</h1>

      {loading && !profile ? <p>Loading your subscription…</p> : null}

      {profile ? (
        <>
          <p className="biz-name">{profile.businessName}</p>

          <div className={'state state-' + state.tone}>
            <div className="state-label">{state.label}</div>
            <div className="state-detail">{state.detail}</div>
          </div>

          {subscription ? (
            <dl className="facts">
              <div>
                <dt>Plan</dt>
                <dd>{subscription.plan === 'ANNUAL' ? 'Annual' : 'Monthly'}</dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>{formatPrice(subscription.priceCents)}</dd>
              </div>
              <div>
                <dt>Current period ends</dt>
                <dd>{formatDate(subscription.currentPeriodEnd)}</dd>
              </div>
            </dl>
          ) : null}

          {error ? (
            <p className="err" role="alert">
              {error}
            </p>
          ) : null}

          <div className="actions">
            {subscription ? (
              subscription.cancelAtPeriodEnd ? (
                <button
                  className="btn btn-primary"
                  disabled={busy !== null}
                  onClick={() => act('resume')}
                >
                  {busy === 'resume' ? 'Resuming…' : 'Resume subscription'}
                </button>
              ) : (
                <button
                  className="btn btn-danger"
                  disabled={busy !== null}
                  onClick={() => act('cancel')}
                >
                  {busy === 'cancel' ? 'Cancelling…' : 'Cancel subscription'}
                </button>
              )
            ) : (
              <div className="plan-picker">
                <div className="plan-picker-label">Choose a plan</div>
                {[
                  ['MONTHLY', 'Monthly', '$49.99', 'per month'],
                  ['ANNUAL', 'Annual', '$479.99', 'per year — about 20% off'],
                ].map(([value, name, price, per]) => (
                  <label
                    key={value}
                    className={'plan-option' + (plan === value ? ' selected' : '')}
                  >
                    <input
                      type="radio"
                      name="plan"
                      value={value}
                      checked={plan === value}
                      onChange={() => setPlan(value)}
                      disabled={busy !== null}
                    />
                    <span className="plan-name">{name}</span>
                    <span className="plan-price">{price}</span>
                    <span className="plan-per">{per}</span>
                  </label>
                ))}
                <button
                  className="btn btn-primary"
                  disabled={busy !== null}
                  onClick={startCheckout}
                >
                  {busy === 'checkout' ? 'Opening Stripe…' : 'Start plan'}
                </button>
                <p className="note">
                  Your free trial starts now — you will not be charged until it ends.
                </p>
              </div>
            )}

            {/* The billing page is a separate document from the SPA, so there
                was no way back to the portal except the browser's Back button
                — which, before [F51] was fixed, also looked like a logout. */}
            <a className="btn btn-quiet btn-link" href="/">
              Back to portal
            </a>

            <button className="btn btn-quiet" disabled={busy !== null} onClick={logOut}>
              Log out
            </button>
          </div>
        </>
      ) : error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function LoginCard({ onSuccess, banner }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await merchantLogin(email.trim(), password);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" id="card">
      <Brand />
      {banner}
      <h1>Business sign in</h1>
      <p>Sign in to manage your Glow+ subscription.</p>

      <form onSubmit={submit} className="form">
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            required
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@salon.com"
          />
        </label>
        <label className="field">
          <span>Password</span>
          {/* The prototype had NO password field anywhere [F9]. This is one. */}
          <input
            type="password"
            value={password}
            required
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
