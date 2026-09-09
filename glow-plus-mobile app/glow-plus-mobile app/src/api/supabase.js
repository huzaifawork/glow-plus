import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { getConfig } from './config';
import { ApiError, NetworkError, TimeoutError } from './errors';

/**
 * ============================================================================
 * "Continue with Google", by way of Supabase Auth.
 * ============================================================================
 *
 * ── What this file is, and what it is NOT ──────────────────────────────────
 * This is the ONLY place in the app that talks to Supabase, and it talks to it
 * for exactly one purpose: to find out, with Google's word for it, which email
 * address the person holding this phone owns. What comes back is handed
 * straight to `client.js`, which trades it for a normal Glow+ session at
 * `POST /auth/google`.
 *
 * Supabase is therefore **not** this app's session store, and nothing below is
 * persisted. The Glow+ access/refresh pair in `session.js` remains the one
 * credential the app keeps (R1.4/NF2), and every screen, every request and the
 * whole of `AuthContext` are unchanged by a user having signed in this way.
 * A second identity provider holding a second long-lived session on the device
 * would be a second thing that can expire, a second thing to revoke on sign-out
 * and a second answer to "who is signed in" — R1.6 is hard enough with one.
 *
 * The Technical Constraint that all backend traffic goes through one module
 * still holds: this file issues no request to the Glow+ API. It sits beside
 * `client.js` in `src/api/` because it is network code and the same rule
 * ("nothing outside `src/api/` calls fetch") applies to it.
 *
 * ── Why the raw GoTrue endpoints and not `@supabase/supabase-js` ───────────
 * The SDK's value is the parts this flow does not use: a persisted session, an
 * auto-refresh timer, realtime, and a storage adapter. What is actually needed
 * is two HTTP calls, and taking them directly keeps the app's dependency list
 * to Expo's own modules — which matters on a managed Expo project, where a
 * library that needs a polyfill (`URL`, `structuredClone`) fails at runtime on
 * a device rather than at build time in CI.
 *
 * ── Why PKCE and not the implicit flow ────────────────────────────────────
 * Supabase's `/authorize` will happily hand the tokens back in the redirect's
 * URL fragment, which is one less round trip and one less thing to get right.
 * It is also a bearer token travelling in a URL through a browser and a
 * custom-scheme deep link — and on Android any app may register the same
 * `glowplus://` scheme. PKCE means what travels in that link is a single-use
 * code that is worthless without the verifier, which never leaves this process.
 */

/**
 * The redirect Supabase sends the browser back to when Google is done.
 *
 * Built from `expo-linking` rather than written out, so it is correct in all
 * three environments the app runs in without a branch: `glowplus://auth-callback`
 * in a build (the `scheme` in `app.json`), an `exp://…` URL in Expo Go, and a
 * localhost URL on web.
 *
 * ⚠️ This exact value must be listed under **Authentication → URL
 * Configuration → Redirect URLs** in the Supabase dashboard. Supabase refuses
 * any `redirect_to` it does not recognise and silently sends the user to the
 * project's Site URL instead — which presents as "the browser opened, I signed
 * in, and nothing happened".
 */
export function redirectUri() {
  return Linking.createURL('auth-callback');
}

/** True when this build has been given a Supabase project to sign in against. */
export function isGoogleSignInAvailable() {
  const { supabaseUrl, supabaseAnonKey, demoMode } = getConfig();
  // Demo mode has no network at all (R5.1), and its whole point is that an
  // evaluator can exercise every screen without configuring anything.
  return demoMode || Boolean(supabaseUrl && supabaseAnonKey);
}

/**
 * Run the Google sign-in and return the resulting Supabase access token.
 *
 * Resolves to `null` when the user backed out — a cancel is not an error and
 * must not put a red message on the screen. Every other failure throws, with
 * the same error types the rest of the app already knows how to render
 * (`messageFor` in `errors.js`).
 */
export async function signInWithGoogle() {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ApiError(
      'Google sign-in is not set up in this build of Glow+. Sign in with your email and password instead.',
      0,
    );
  }

  const verifier = createCodeVerifier();
  const challenge = await createCodeChallenge(verifier);
  const redirect = redirectUri();

  const authorizeUrl =
    `${supabaseUrl}/auth/v1/authorize` +
    `?provider=google` +
    `&redirect_to=${encodeURIComponent(redirect)}` +
    `&code_challenge=${encodeURIComponent(challenge)}` +
    `&code_challenge_method=s256`;

  // `openAuthSessionAsync` is `ASWebAuthenticationSession` on iOS and a Custom
  // Tab on Android — the system browser, sharing its cookie jar. A plain
  // WebView would work and is what a hand-rolled version usually reaches for;
  // Google refuses to serve its sign-in page to one (`disallowed_useragent`),
  // and it would also mean the user typing their Google password into a view
  // this app controls, with no address bar to check.
  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, redirect, {
    // Keeps the user's existing Google session, so someone already signed in
    // on their phone taps once rather than typing a password.
    preferEphemeralSession: false,
  });

  // 'cancel' is the iOS sheet's Cancel button; 'dismiss' is the Android back
  // gesture. Neither is a failure, and both must leave the screen exactly as
  // it was.
  if (result.type !== 'success' || !result.url) return null;

  const params = parseRedirect(result.url);

  // Supabase reports a refusal (consent denied, a provider that is not
  // enabled, a redirect URL that is not on the allow-list) as query parameters
  // on the redirect rather than as a failed request.
  if (params.error || params.error_description) {
    throw new ApiError(
      humaniseOAuthError(params.error_description || params.error),
      0,
    );
  }

  const code = params.code;
  if (!code) {
    // Reached when the project is configured for the implicit flow, in which
    // case the tokens are in the fragment and there is no code at all. Naming
    // it beats "something went wrong".
    throw new ApiError(
      'Google sign-in did not complete. Please try again, or sign in with your email and password.',
      0,
    );
  }

  return exchangeCodeForToken(code, verifier);
}

/**
 * Spend the one-time code for a Supabase session, and keep only its token.
 *
 * The response also carries a refresh token and the full Supabase user. Both
 * are deliberately dropped: see the note at the top of this file on why the
 * app keeps exactly one session.
 */
async function exchangeCodeForToken(code, verifier) {
  const { supabaseUrl, supabaseAnonKey } = getConfig();

  const res = await withTimeout(
    (signal) =>
      fetch(`${supabaseUrl}/auth/v1/token?grant_type=pkce`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
        signal,
      }),
    15000,
  );

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.access_token) {
    throw new ApiError(
      humaniseOAuthError(data?.error_description || data?.msg || data?.error),
      res.status || 0,
    );
  }

  return data.access_token;
}

/* ---------------------------------------------------------------------------
   PKCE
   -------------------------------------------------------------------------- */

/**
 * RFC 7636's `code_verifier`: 43–128 characters from an unreserved alphabet.
 *
 * Built by indexing a 64-character alphabet with random bytes rather than by
 * base64-encoding them, because there is no `Buffer` in a React Native runtime
 * and hand-rolling base64 to feed a security primitive is a poor trade for
 * three lines saved. `byte % 64` is unbiased precisely because 256 is a
 * multiple of 64 — which is the reason for a 64-character alphabet rather than
 * the 66 unreserved characters RFC 7636 permits.
 */
const VERIFIER_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function createCodeVerifier() {
  const bytes = Crypto.getRandomBytes(64);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += VERIFIER_ALPHABET[bytes[i] % 64];
  return out;
}

/** `code_challenge` = base64url(SHA256(verifier)), with the padding stripped. */
async function createCodeChallenge(verifier) {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return base64ToBase64Url(digest);
}

export function base64ToBase64Url(value) {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ---------------------------------------------------------------------------
   Plumbing
   -------------------------------------------------------------------------- */

/**
 * Read the parameters off the URL the browser came back with.
 *
 * Both halves are read. The code is a QUERY parameter, but Supabase puts an
 * error in the fragment on some paths and in the query on others, and a
 * sign-in that fails silently because the message was on the wrong side of a
 * `#` is the hardest kind of bug to be told about by a user.
 *
 * Hand-parsed rather than via `URL`/`URLSearchParams`: Hermes' URL support has
 * historically not handled custom schemes like `glowplus://`, and this runs on
 * the one path where a wrong answer means "nothing happened".
 */
export function parseRedirect(url) {
  const out = {};
  const [beforeHash, hash = ''] = String(url).split('#');
  const query = beforeHash.includes('?') ? beforeHash.slice(beforeHash.indexOf('?') + 1) : '';

  for (const part of `${query}&${hash}`.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = eq === -1 ? part : part.slice(0, eq);
    const value = eq === -1 ? '' : part.slice(eq + 1);
    if (!key) continue;
    try {
      out[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      // A malformed escape must not throw here — that would turn a bad
      // redirect into a crash on the sign-in screen.
      out[key] = value;
    }
  }
  return out;
}

/**
 * A sentence for the user, from whatever Supabase or Google said.
 *
 * The raw strings are developer-facing (`"Unsupported provider: provider is
 * not enabled"`, `"invalid request: both auth code and code verifier should be
 * non-empty"`) and mean nothing to a customer, but they are also the only clue
 * to the two mistakes that actually happen when this is set up — so the
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

/** `fetch` with a deadline, and the app's own error types. Mirrors client.js. */
async function withTimeout(run, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } catch (err) {
    if (err?.name === 'AbortError') throw new TimeoutError();
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }
}
