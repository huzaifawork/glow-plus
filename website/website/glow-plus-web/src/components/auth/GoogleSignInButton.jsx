import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext.jsx';
import { consumerGoogleLogin } from '../../lib/api.js';
import {
  beginGoogleSignIn,
  isGoogleCallback,
  isGoogleSignInAvailable,
  resumeGoogleSignIn,
} from '../../lib/supabase.js';
import './google-signin.css';

/**
 * "Continue with Google" — one component for all three consumer sign-in
 * surfaces (the SPA's `ConsumerAuth`, and the standalone booking and rewards
 * pages).
 *
 * One component rather than a copy in each place, because the flow is a round
 * trip through another origin and the tricky half happens on the way BACK — on
 * a page load that the user did not initiate, with no memory of having pressed
 * anything. Three things have to be got right identically in all three places:
 *
 *  1. **The button both starts and finishes the flow.** A surface that renders
 *     this gets the callback handled for free; there is no separate route, no
 *     `/auth/callback` page, and nothing for a caller to remember to wire up.
 *  2. **The exchange runs exactly once per page load.** The authorization code
 *     is single-use, so a second attempt turns a successful sign-in into an
 *     error. `resumeGoogleSignIn` memoises its half and `finishSignIn` below
 *     memoises the rest, so even two mounted instances share one exchange.
 *  3. **The button hides itself when the deployment cannot use it.** A site
 *     with no Supabase project configured would send the visitor to nowhere;
 *     an always-visible button that always fails is worse than no button, and
 *     email and password are completely unaffected either way.
 *
 * ── Where the session comes from ───────────────────────────────────────────
 * Nothing here knows about Google beyond the logo. `lib/supabase.js` returns a
 * Supabase token, `consumerGoogleLogin` trades it for a Glow+ session under
 * the ordinary consumer token key, and by the time `onSuccess` fires the
 * browser is in exactly the state a password sign-in would have left it in —
 * which is why the callers below are one line each.
 */

/**
 * The callback, memoised at module scope for the life of the page.
 *
 * Module scope rather than a ref because the guard has to survive a remount:
 * `ConsumerAuth` keeps every view mounted, but the standalone pages swap their
 * `LoginCard` out entirely the moment a session exists, and React 18's
 * StrictMode double-invokes effects in development. Any of those would
 * otherwise spend the code twice.
 */
let finishing = null;

function finishSignIn() {
  if (!finishing) {
    finishing = resumeGoogleSignIn().then((accessToken) =>
      accessToken ? consumerGoogleLogin(accessToken) : null,
    );
  }
  return finishing;
}

export default function GoogleSignInButton({ onSuccess, onError, disabled = false }) {
  const { t } = useI18n();

  // Read ONCE, at mount, and before the effect below runs: `resumeGoogleSignIn`
  // clears the pending record and strips the URL, so anything asking later
  // gets `false`. As initial state rather than a `useMemo` because it must not
  // be recomputed — the honest answer changes underneath us by design.
  const [returning] = useState(isGoogleCallback);

  // Starts `true` on a callback load, so the button shows "Finishing sign-in…"
  // from the first paint instead of flashing its idle label.
  const [busy, setBusy] = useState(returning);
  const [error, setError] = useState(null);

  // Held in refs so the effect below can stay keyed on `returning` alone. A
  // caller passing an inline arrow (all three do) would otherwise re-run it on
  // every render — and re-running an OAuth exchange is not a wasted render, it
  // is a spent authorization code.
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!returning) return;
    let cancelled = false;

    finishSignIn()
      .then((data) => {
        // `null` means there was nothing to finish after all. Leave the form
        // exactly as the visitor found it.
        if (!cancelled && data) onSuccessRef.current?.(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        onErrorRef.current?.(err);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [returning]);

  // The sibling of the config check in `lib/supabase.js`: a deployment that
  // was not given a Supabase project simply does not offer this way in.
  if (!isGoogleSignInAvailable()) return null;

  async function start() {
    if (busy || disabled) return;
    setBusy(true);
    setError(null);
    try {
      await beginGoogleSignIn();
      // Deliberately no `setBusy(false)` on this path. The navigation is
      // already underway and the page is being replaced; clearing it would put
      // the idle label back for the last frame before the browser leaves,
      // which reads as "nothing happened, press it again".
    } catch (err) {
      setError(err);
      onErrorRef.current?.(err);
      setBusy(false);
    }
  }

  const label = busy
    ? returning
      ? t('google_finishing')
      : t('google_redirecting')
    : t('google_continue');

  return (
    <>
      <div className="google-or" aria-hidden="true">
        {t('google_or')}
      </div>

      <button
        type="button"
        className="btn google-btn"
        onClick={start}
        disabled={busy || disabled}
      >
        <GoogleLogo />
        {label}
      </button>

      {error ? (
        <p className="err google-error" role="alert">
          {error.message}
        </p>
      ) : null}
    </>
  );
}

/**
 * Google's four-colour "G", inline.
 *
 * Inline rather than an `<img>` from a CDN for three reasons that all point
 * the same way: no third-party request on the sign-in page, no flash of a
 * missing logo on a slow connection, and no external asset that can 404 years
 * from now and leave the button wordless. `aria-hidden` because the button's
 * own text already says Google — a screen reader announcing it twice is noise.
 */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}
