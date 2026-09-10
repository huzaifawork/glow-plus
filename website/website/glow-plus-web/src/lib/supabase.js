/**
 * ============================================================================
 * "Continue with Google", by way of Supabase Auth — the browser half.
 * ============================================================================
 *
 * The web counterpart of the React Native app's `src/api/supabase.js`, and it
 * exists for the same single purpose: to find out, with Google's word for it,
 * which email address this visitor owns. What comes back is one Supabase
 * access token, handed straight to `consumerGoogleLogin` in `lib/api.js`,
 * which trades it for an ordinary Glow+ session at `POST /auth/google`.
 *
 * ── What this is NOT ──────────────────────────────────────────────────────
 * Supabase is not this site's session store, and nothing here is persisted
 * past the round trip. The Glow+ access/refresh pair in `api.js` remains the
 * one credential the browser keeps, which is why not a single view, request or
 * guard downstream can tell how a user signed in. A second provider holding a
 * second long-lived session in localStorage would be a second thing to expire,
 * a second thing to revoke on sign-out, and a second answer to "who is signed
 * in" — and there are already four session keys in `api.js` to keep straight.
 *
 * ── Why the raw GoTrue endpoints and not `@supabase/supabase-js` ──────────
 * The SDK's value is precisely the parts this flow does not use: a persisted
 * session, an auto-refresh timer, realtime, a storage adapter. What is
 * actually needed is one redirect and one POST. Taking them directly keeps
 * this project's production dependencies at `react` + `react-dom`, which is
 * worth more than the code below — the whole site builds in a couple of
 * seconds and that is a property worth defending.
 *
 * ── Why a full-page redirect and not a popup ──────────────────────────────
 * A popup keeps the page's React state alive, which is the only thing it has
 * going for it. Against that: popup blockers fire on anything not obviously
 * user-initiated, iOS Safari treats a popup as a separate tab the user has to
 * find their way back from, and `window.opener` messaging across the Supabase
 * origin needs care to get right. The state being lost here is a half-typed
 * sign-in form on a page whose purpose is to stop existing once you are signed
 * in, so the trade is one-sided.
 *
 * ── Why PKCE and not the implicit flow ────────────────────────────────────
 * Supabase will happily hand the tokens back in the redirect's URL fragment,
 * which is one less round trip. It is also a bearer token in a URL, and a URL
 * on the web reaches the browser history, the back/forward cache, and any
 * extension that can read the address bar. What travels here instead is a
 * single-use code, worthless without a verifier that never leaves this tab.
 */
import { ApiError } from './api.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';

/**
 * The in-progress sign-in, held for the length of one round trip to Google.
 *
 * `sessionStorage`, not `localStorage`, and that is a security property rather
 * than tidiness: the verifier is the one thing standing between a leaked
 * authorization code and a session, and it must not outlive the tab that
 * created it or sit in storage for another day's visit to find.
 */
const PENDING_KEY = 'glowplus:google:pending';

/**
 * How long a pending sign-in stays valid. Long enough to create a Google
 * account from scratch mid-flow, short enough that a verifier does not sit in
 * storage all afternoon because someone abandoned the consent screen in
 * another tab.
 */
const PENDING_TTL_MS = 10 * 60 * 1000;

/** GoTrue is being asked one question; it should not take fifteen seconds. */
const EXCHANGE_TIMEOUT_MS = 15000;

/**
 * Is this build able to offer the button at all?
 *
 * Three things have to be true, and the third is not paranoia: PKCE needs
 * `crypto.subtle` to hash the verifier, and `crypto.subtle` is `undefined`
 * outside a secure context. A site served over plain HTTP on a LAN address —
 * which is exactly how someone tests a build on their phone — would otherwise
 * render a button that throws the moment it is pressed.
 */
export function isGoogleSignInAvailable() {
  return Boolean(
    SUPABASE_URL &&
      SUPABASE_ANON_KEY &&
      typeof window !== 'undefined' &&
      window.crypto &&
      window.crypto.subtle,
  );
}

/**
 * Where Supabase sends the browser back to: this page, and nothing else.
 *
 * Origin + pathname, with the query string and fragment deliberately dropped.
 * Supabase matches `redirect_to` against an allow-list and refuses anything it
 * does not recognise, so the fewer moving parts in this URL, the fewer ways a
 * deployment can be misconfigured. Whatever was in the query string is not
 * lost — it goes into the pending record below and is put back afterwards.
 */
function callbackUrl() {
  return window.location.origin + window.location.pathname;
}

/* --------------------------------------------------------------------------
   The pending sign-in
   -------------------------------------------------------------------------- */
function readPending() {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw);
    if (!pending || typeof pending.verifier !== 'string') return null;
    if (!(Date.now() - pending.at < PENDING_TTL_MS)) return null;
    return pending;
  } catch {
    // Private-mode browsers throw on sessionStorage rather than returning
    // null, and a malformed record must read as "no sign-in in progress"
    // rather than as a crash on page load.
    return null;
  }
}

function writePending(pending) {
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    return true;
  } catch {
    return false;
  }
}

function clearPending() {
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * What Supabase put on the URL when it sent the browser back, or `null`.
 *
 * Both halves of the URL are read. The code is always a query parameter, but
 * an error arrives in the query on some paths and in the fragment on others,
 * and a sign-in that fails silently because the message was on the wrong side
 * of a `#` is the hardest kind of bug for a user to report.
 */
function callbackParams() {
  try {
    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const code = query.get('code');
    const error =
      query.get('error_description') ||
      query.get('error') ||
      fragment.get('error_description') ||
      fragment.get('error');
    if (!code && !error) return null;
    return { code, error };
  } catch {
    return null;
  }
}

/**
 * Did this page load as the tail end of a Google sign-in?
 *
 * BOTH conditions are required, which is what stops a stray `?code=` on any of
 * this site's URLs from being mistaken for one: a code we cannot spend (there
 * is no verifier) is not a sign-in, and a verifier with no code is a flow that
 * was abandoned rather than completed.
 *
 * Read this BEFORE calling `resumeGoogleSignIn`, which clears both.
 */
export function isGoogleCallback() {
  return Boolean(readPending() && callbackParams());
}

/* --------------------------------------------------------------------------
   The two halves of the flow
   -------------------------------------------------------------------------- */

/**
 * Send the browser to Google. Does not return — the page is being replaced.
 *
 * Throws only for the two things that can be wrong before we leave: no project
 * configured, and no `sessionStorage` to hold the verifier in. The second is
 * worth its own branch rather than a silent `catch`: without a stored verifier
 * the user would go all the way through Google and come back to a page that
 * cannot finish, which reads as "it reloaded and did nothing".
 */
export async function beginGoogleSignIn() {
  if (!isGoogleSignInAvailable()) {
    throw new ApiError(
      'Google sign-in is not set up on this site. Sign in with your email and password instead.',
      0,
    );
  }

  const verifier = createCodeVerifier();
  const challenge = await createCodeChallenge(verifier);
  const redirect = callbackUrl();

  const stored = writePending({
    verifier,
    redirect,
    // The full URL, so a customer who started from `/consumer/rewards?x=1`
    // gets that back rather than a bare path.
    returnTo: window.location.href,
    at: Date.now(),
  });

  if (!stored) {
    throw new ApiError(
      'Google sign-in needs browser storage, which is blocked here. Sign in with your email and password instead.',
      0,
    );
  }

  window.location.assign(
    `${SUPABASE_URL}/auth/v1/authorize` +
      `?provider=google` +
      `&redirect_to=${encodeURIComponent(redirect)}` +
      `&code_challenge=${encodeURIComponent(challenge)}` +
      `&code_challenge_method=s256`,
  );
}

/**
 * Finish a sign-in the browser has just come back from.
 *
 * Resolves to the Supabase access token, or to `null` when there was nothing
 * to finish. Memoised for the life of the page: the authorization code is
 * single-use, so a second call would spend a code GoTrue has already retired
 * and turn a successful sign-in into an error. Two components mounting on the
 * same load therefore share one exchange rather than racing.
 */
let inFlight = null;

export function resumeGoogleSignIn() {
  if (!inFlight) inFlight = completeGoogleSignIn();
  return inFlight;
}

async function completeGoogleSignIn() {
  const pending = readPending();
  const params = callbackParams();

  // Cleared FIRST, and unconditionally. Whatever happens below, this page must
  // not be able to run the exchange again — not on a reload, not on a Back
  // button, and not from a URL someone copied out of the address bar while the
  // request was in flight.
  clearPending();
  restoreUrl(pending);

  if (!pending || !params) return null;

  // A refusal — consent denied, the provider not enabled, a redirect URL that
  // is not on the allow-list — arrives as parameters on a successful redirect
  // rather than as a failed request.
  if (params.error) throw new ApiError(humaniseOAuthError(params.error), 0);

  if (!params.code) {
    // Reached when the project is configured for the implicit flow, in which
    // case the tokens are in the fragment and there is no code at all. Naming
    // it beats "something went wrong".
    throw new ApiError(
      'Google sign-in did not complete. Please try again, or sign in with your email and password.',
      0,
    );
  }

  return exchangeCodeForToken(params.code, pending.verifier);
}

/**
 * Put the address bar back the way the user left it.
 *
 * Two reasons this is not cosmetic. A reload with `?code=` still in the URL
 * would look like a fresh callback to anything reading the query string, and
 * an authorization code left in the address bar is a credential sitting in the
 * browser history and in the next screenshot the user takes.
 *
 * `replaceState`, not `pushState`: a Back button that walks the user into a
 * spent OAuth callback is not a history entry anyone wants.
 */
function restoreUrl(pending) {
  try {
    const target =
      pending && typeof pending.returnTo === 'string'
        ? new URL(pending.returnTo, window.location.origin)
        : new URL(window.location.href);

    // A `returnTo` from another origin cannot happen — it was written by this
    // module from `window.location.href` — but it is read back out of storage,
    // and storage is not a trust boundary worth assuming.
    if (target.origin !== window.location.origin) return;

    // Belt and braces for the no-pending path: whatever we navigate to must
    // not carry the callback's own parameters.
    ['code', 'error', 'error_description', 'error_code'].forEach((p) =>
      target.searchParams.delete(p),
    );

    window.history.replaceState(
      null,
      '',
      target.pathname + target.search + target.hash,
    );
  } catch {
    /* An unchanged address bar is cosmetic, not a reason to fail a sign-in. */
  }
}

/**
 * Spend the one-time code for a Supabase session, and keep only its token.
 *
 * The response also carries a refresh token and the full Supabase user. Both
 * are deliberately dropped — see the note at the top of this file on why the
 * browser keeps exactly one session.
 */
async function exchangeCodeForToken(code, verifier) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXCHANGE_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new ApiError(
      err && err.name === 'AbortError'
        ? 'Google sign-in timed out. Please try again.'
        : 'Could not reach Google sign-in. Check your connection and try again.',
      0,
    );
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok || !data || !data.access_token) {
    throw new ApiError(
      humaniseOAuthError(
        (data && (data.error_description || data.msg || data.error)) || '',
      ),
      res.status || 0,
    );
  }

  return data.access_token;
}

/* --------------------------------------------------------------------------
   PKCE
   -------------------------------------------------------------------------- */

/**
 * RFC 7636's `code_verifier`: 43–128 characters from an unreserved alphabet.
 *
 * Built by indexing a 64-character alphabet with random bytes rather than by
 * base64-encoding them. `byte % 64` is unbiased precisely because 256 is a
 * multiple of 64 — which is the reason for a 64-character alphabet rather than
 * the 66 unreserved characters RFC 7636 permits. Kept character-for-character
 * the same as the React Native client's, so the two implementations can be
 * diffed rather than re-reasoned about.
 */
const VERIFIER_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function createCodeVerifier() {
  const bytes = new Uint8Array(64);
  window.crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += VERIFIER_ALPHABET[bytes[i] % 64];
  return out;
}

/** `code_challenge` = base64url(SHA256(verifier)), with the padding stripped. */
async function createCodeChallenge(verifier) {
  const digest = await window.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* --------------------------------------------------------------------------
   Messages
   -------------------------------------------------------------------------- */

/**
 * A sentence for the visitor, from whatever Supabase or Google said.
 *
 * The raw strings are developer-facing (`"Unsupported provider: provider is
 * not enabled"`, `"invalid request: both auth code and code verifier should be
 * non-empty"`) and mean nothing to a customer — but they are also the only
 * clue to the two mistakes that actually happen when this is set up, so the
 * recognised ones are translated and everything else is passed through rather
 * than swallowed.
 */
function humaniseOAuthError(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return 'Google sign-in did not complete. Please try again.';

  const lower = text.toLowerCase();
  if (lower.includes('provider is not enabled') || lower.includes('unsupported provider')) {
    return 'Google sign-in is not enabled for Glow+ yet. Please sign in with your email and password.';
  }
  if (lower.includes('access_denied') || lower.includes('user denied')) {
    return 'Google sign-in was cancelled.';
  }
  return text;
}
