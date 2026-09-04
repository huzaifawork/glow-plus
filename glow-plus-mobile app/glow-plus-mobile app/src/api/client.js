import { getConfig } from './config';
import { demoApi } from './demo';
import { ApiError, NetworkError, TimeoutError } from './errors';
import {
  clearSession,
  getAccessToken,
  getSession,
  restoreSession,
  saveSession,
} from './session';

/**
 * ============================================================================
 * THE ONE PLACE THIS APP TALKS TO THE NETWORK.
 * ============================================================================
 *
 * Technical Constraints: *"All network requests to the backend must be issued
 * from a single, centralized module, so the API contract is defined and
 * changed in exactly one place."*
 *
 * That is literal. **No file outside `src/api/` may call `fetch`.** Every
 * screen and hook imports a named function from here. The value shows up the
 * moment anything changes — the `/v1` prefix, a header, the refresh dance, the
 * pagination envelope — because all of it is edited here and nowhere else.
 *
 * NF1: *"The app must communicate with the backend using the same API contract
 * used by every other Glow+ surface — there must not be a separate,
 * app-specific version of the API."* Every path below is a route the website
 * also calls (`glow-plus-web/src/lib/api.js`). There is no `/mobile/*` and no
 * endpoint that exists for this app alone.
 *
 * ── What this module owns ──────────────────────────────────────────────────
 *   · the base URL (from `config.js` — R5.2)
 *   · the bearer token (from `session.js` — R1.4/NF2)
 *   · transparent 15-minute access-token refresh (the platform's T47)
 *   · turning every failure into an `ApiError` or a `NetworkError` (NF4)
 *   · the demo-mode switch (R5.1)
 *
 * ── What it deliberately does NOT own ──────────────────────────────────────
 * Caching, retries-on-a-timer and state. Those belong to the hooks above it;
 * putting them here would make this module the app's state manager as well as
 * its transport, and the two have different lifetimes.
 */

/**
 * How long to wait before deciding the network is not going to answer.
 *
 * NF4 is specifically about a **slow** connection as well as a lost one, and
 * `fetch` on React Native has no default timeout at all — a request on a dead
 * connection hangs until the OS gives up, which on iOS can be a full minute of
 * a spinner with no explanation. 15 seconds is long enough for a cold
 * serverless start (the backend runs on Vercel) and short enough that a user
 * gets a sentence instead of a spinner.
 */
const TIMEOUT_MS = 15000;

/** Longer, for the one route that can legitimately take a while: a cold boot. */
const SLOW_TIMEOUT_MS = 30000;

/* ---------------------------------------------------------------------------
   Session lifecycle
   -------------------------------------------------------------------------- */

/**
 * Told when the session dies for a reason the user did not choose.
 *
 * R1.6: *"The app must detect when a stored session is no longer valid ... and
 * return the user to the login screen rather than continuing to show stale
 * data."* `AuthContext` subscribes to this on mount. It is a callback rather
 * than an import of the context because this module must stay usable outside
 * React — a push-notification handler runs before any provider mounts.
 */
let onSessionExpired = null;

export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

async function expireSession() {
  await clearSession();
  onSessionExpired?.();
}

export { restoreSession, getSession, clearSession };

/* ---------------------------------------------------------------------------
   Transport
   -------------------------------------------------------------------------- */

function url(path, query) {
  const { apiBaseUrl } = getConfig();
  const search = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    : '';
  return `${apiBaseUrl}${path}${search ? `?${search}` : ''}`;
}

/**
 * `fetch` with a timeout and one error type per failure mode.
 *
 * `AbortController` rather than `Promise.race`: racing leaves the request
 * running, so a screen that times out three times has three live sockets and
 * three responses that will eventually try to set state on an unmounted
 * component. Aborting actually cancels.
 */
async function rawFetch(fullUrl, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(fullUrl, { ...options, signal: controller.signal });
  } catch (err) {
    // An abort we caused is a timeout; anything else `fetch` throws is the
    // request never having arrived. Both are NF4's territory, and the user
    // needs different advice for each.
    if (err?.name === 'AbortError') throw new TimeoutError();
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read a response body without ever throwing on a body that is not JSON.
 *
 * A proxy, a captive portal or a platform-level 502 answers with HTML, and
 * `res.json()` on that throws a `SyntaxError` whose message ("Unexpected token
 * <") would otherwise be the sentence shown to the user.
 */
async function readBody(res) {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * One refresh at a time.
 *
 * Rotation is single-use on the server: a screen that fires three requests on
 * mount would otherwise get three 401s, send three refreshes with the same
 * token, and have two of them treated as a **replay** — which the backend
 * correctly answers by revoking the entire refresh family. The user would be
 * signed out by their own dashboard finishing loading. So concurrent callers
 * share one in-flight promise.
 */
let refreshInFlight = null;

async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const { refreshToken } = getSession();
    if (!refreshToken) return null;
    try {
      const res = await rawFetch(
        url('/auth/refresh'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refreshToken }),
        },
        TIMEOUT_MS,
      );
      if (!res.ok) return null;
      const data = await readBody(res);
      if (!data?.token) return null;
      await saveSession(data);
      return data.token;
    } catch {
      // A refresh that fails on the NETWORK is not an expired session — the
      // user is in a lift. Returning null lets the original 401 surface as
      // itself rather than signing someone out for losing signal.
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * The single request function. Everything below it is a thin named wrapper.
 *
 * @param path      route path, WITHOUT the version prefix (that is in the base URL)
 * @param options.auth       send the bearer token (default true)
 * @param options.withTotal  also return `X-Total-Count` as `{ items, total }`
 * @param options.retried    internal — stops the refresh retry recursing
 */
async function request(path, options = {}) {
  const {
    method = 'GET',
    body,
    query,
    auth = true,
    withTotal = false,
    retried = false,
    timeoutMs = TIMEOUT_MS,
  } = options;

  const { apiBaseUrl } = getConfig();
  if (!apiBaseUrl) {
    // R5.2's failure mode, made legible. Without this the user gets
    // `fetch('undefined/merchants')` and a network error that blames their
    // connection for a configuration problem.
    throw new ApiError(
      'No Glow+ server is configured. Set the backend address in Settings, or turn on Demo mode.',
      0,
    );
  }

  const token = auth ? getAccessToken() : null;
  const res = await rawFetch(
    url(path, query),
    {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    timeoutMs,
  );

  if (res.status === 401 && auth && !retried) {
    // T47 — spend the refresh token and try exactly once more. A second retry
    // would be a loop against a server that has decided the answer is no.
    const fresh = await refreshAccessToken();
    if (fresh) return request(path, { ...options, retried: true });
    // R1.6 — the session really is gone. Clear it and tell the app, so the
    // user lands on Login rather than on a screen full of stale data.
    await expireSession();
  }

  if (!res.ok) {
    const payload = await readBody(res);
    // The backend guarantees `{ statusCode, message, error, details? }` with
    // `message` a STRING (its T16), which is why it can be shown as-is. The
    // fallbacks cover everything that is not the backend answering.
    const message =
      (typeof payload?.message === 'string' && payload.message) ||
      (res.status >= 500
        ? 'Glow+ is having a problem right now. Please try again shortly.'
        : `Something went wrong (${res.status}).`);
    throw new ApiError(message, res.status, payload?.details);
  }

  // 204, and any other body-less success.
  if (res.status === 204) return withTotal ? { items: [], total: 0 } : null;

  const data = await readBody(res);
  if (!withTotal) return data;

  // The platform's list routes answer with a **bare array** and put the count
  // in `X-Total-Count` (its T43/T44/T50). Kept in one place so no screen has
  // to know that.
  const total = Number(res.headers.get('X-Total-Count'));
  return {
    items: Array.isArray(data) ? data : [],
    total: Number.isFinite(total) ? total : (Array.isArray(data) ? data.length : 0),
  };
}

/** True when calls should be served by `demo.js` instead of the network. */
const demo = () => getConfig().demoMode;

/* ===========================================================================
   Authentication  (R1.1 – R1.7)
   =========================================================================== */

/**
 * R1.2/R1.3 — the same `POST /auth/login` the website uses, so a consumer's
 * login works identically whichever surface they created the account on.
 *
 * The session is saved here rather than by the caller, so there is no path
 * through the app that authenticates without persisting (R1.5).
 */
export async function login(email, password) {
  const data = demo()
    ? await demoApi.login(email)
    : await request('/auth/login', {
        method: 'POST',
        auth: false,
        body: { email: email.trim(), password },
        // Login is the request most likely to hit a cold serverless start,
        // and the one where a timeout reads as "my password is wrong".
        timeoutMs: SLOW_TIMEOUT_MS,
      });
  await saveSession(data);
  return data.user ?? null;
}

/**
 * R1.1 — name, email, password and an OPTIONAL phone number.
 *
 * Does not sign the user in: the platform requires a verified email address
 * before a consumer may log in (its T81), so an app that treated signup as a
 * session would put the user on a dashboard that 403s on every call. The
 * screen sends them to Login with a "check your inbox" message instead.
 */
export async function signup({ name, email, password, phone }) {
  if (demo()) return demoApi.signup({ name, email });
  return request('/auth/signup', {
    method: 'POST',
    auth: false,
    body: {
      name: name.trim(),
      email: email.trim(),
      password,
      // Omitted entirely rather than sent as '' — the DTO treats the field as
      // optional, and an empty string is a value.
      ...(phone?.trim() ? { phone: phone.trim() } : {}),
    },
    timeoutMs: SLOW_TIMEOUT_MS,
  });
}

/**
 * R1.7 — *"a way for a user who has forgotten their password to regain access"*.
 *
 * Always resolves, whatever the server says, because the endpoint is
 * deliberately an account-existence oracle-free zone: it answers `{ ok: true }`
 * for an unknown address on purpose, and a client that surfaced a difference
 * would undo that.
 */
export async function forgotPassword(email) {
  if (demo()) return demoApi.forgotPassword();
  return request('/auth/forgot-password', {
    method: 'POST',
    auth: false,
    body: { email: email.trim() },
  });
}

export function resendVerification(email) {
  if (demo()) return demoApi.forgotPassword();
  return request('/auth/resend-verification', {
    method: 'POST',
    auth: false,
    body: { email: email.trim() },
  });
}

/**
 * End the session — on the server as well as on the device.
 *
 * The local clear happens whether or not the network call does: a user on a
 * dead connection must still be able to sign out of their own phone. The
 * revoke is attempted first (it needs the token that is about to be erased)
 * and its failure is swallowed.
 */
export async function logout() {
  const { refreshToken } = getSession();
  if (!demo() && refreshToken) {
    request('/auth/logout', { method: 'POST', auth: false, body: { refreshToken } }).catch(
      () => {},
    );
  }
  await clearSession();
}

/**
 * "Who am I?" — how a stored session is restored on launch (R1.5/R1.6).
 *
 * A token that is present is not a token that is valid. This is the call that
 * decides which, and a 401 from it is what sends a returning user to Login
 * instead of into a shell that fails one screen at a time.
 */
export function getProfile() {
  if (demo()) return demoApi.profile();
  return request('/me');
}

/* ===========================================================================
   Rewards  (R2.1 – R2.5)
   =========================================================================== */

/**
 * One call behind the whole Rewards screen: total points (R2.1), the per-salon
 * breakdown (R2.2), progress toward each active rule (R2.3) and recent visits
 * with the service received (R2.4).
 */
export function getRewards() {
  if (demo()) return demoApi.rewards();
  return request('/me/rewards');
}

/* ===========================================================================
   Salon directory + booking  (R3.1 – R3.13)
   =========================================================================== */

/**
 * R3.1 — the public directory. **`auth: false`**, because the requirement is
 * that a user can browse *"without requiring the user to be logged in"*.
 *
 * R3.10 — `q` searches the salon's name and its city; `city` filters exactly.
 */
export function listSalons({ q, city, limit, offset } = {}) {
  if (demo()) return demoApi.salons({ q, city });
  return request('/merchants', {
    auth: false,
    withTotal: true,
    query: { q, city, limit, offset },
  });
}

/** R3.2 — a salon's bookable services. Public, for the same reason. */
export function listSalonServices(merchantId) {
  if (demo()) return demoApi.styles(merchantId);
  return request(`/styles/public/${encodeURIComponent(merchantId)}`, { auth: false });
}

/**
 * R3.5 — is this salon full on the selected date?
 *
 * **The app does not compute this.** R3.5 detail requires it to be *"computed
 * centrally (by the same logic used everywhere else in the platform) rather
 * than calculated independently inside the app"*, so this returns the server's
 * `state` (`AVAILABLE` / `FULLY_BOOKED` / `CLOSED` / `NOT_BOOKABLE`) and its
 * `spotsLeft`, and the UI renders them. If you ever find yourself deriving the
 * label from `openNow` and `seats` in a component, that is the requirement
 * being broken.
 */
export function getSalonCapacity(merchantId, date) {
  if (demo()) return demoApi.capacity(merchantId, date);
  return request(`/merchants/${encodeURIComponent(merchantId)}/capacity`, {
    auth: false,
    query: { date },
  });
}

/**
 * R3.3 — the real times available for a service on a date, *"computed from
 * that salon's real business hours and existing bookings — not a fixed or
 * assumed schedule"*.
 *
 * Hence: no client-side slot generation anywhere in this app. The array comes
 * from the server, which owns the hours, the seat count and the bookings.
 */
export function getAvailability(merchantId, styleId, date) {
  if (demo()) return demoApi.availability(merchantId, styleId, date);
  return request('/bookings/availability', {
    auth: false,
    query: { merchantId, styleId, date },
  });
}

/** R3.4 — submit a booking request. The one call here that needs a session. */
export function createBooking({ merchantId, styleId, startTime, notes }) {
  if (demo()) return demoApi.createBooking({ merchantId, styleId, startTime, notes });
  return request('/bookings', {
    method: 'POST',
    body: { merchantId, styleId, startTime, ...(notes?.trim() ? { notes: notes.trim() } : {}) },
  });
}

/* ===========================================================================
   My Bookings  (R4.1 – R4.4)
   =========================================================================== */

/** R4.1 — upcoming and past, newest first. The split into two lists is the screen's job. */
export function listMyBookings({ limit, offset } = {}) {
  if (demo()) return demoApi.myBookings();
  return request('/bookings/me', { withTotal: true, query: { limit, offset } });
}

/** R4.3 — cancel a booking that is still pending or confirmed. */
export function cancelBooking(bookingId) {
  if (demo()) return demoApi.cancelBooking(bookingId);
  return request(`/bookings/${encodeURIComponent(bookingId)}/cancel`, { method: 'PATCH' });
}

/* ===========================================================================
   Push notifications  (R4.5)
   =========================================================================== */

/** Tell the platform to notify THIS device when a booking's status changes. */
export function registerDevice(token, platform) {
  if (demo()) return demoApi.registerDevice();
  return request('/me/devices', { method: 'POST', body: { token, platform } });
}

/** Sent on logout, and when the user turns notifications off. */
export function unregisterDevice(token) {
  if (demo()) return demoApi.unregisterDevice();
  return request('/me/devices', { method: 'DELETE', body: { token } });
}

/* ===========================================================================
   Diagnostics
   =========================================================================== */

/**
 * Used by Settings to prove a backend address before the user relies on it.
 *
 * `/health` is VERSION-NEUTRAL on the platform — it is served at `/health`,
 * not `/v1/health` — so this deliberately strips the version segment off the
 * configured base URL rather than calling `request()`. A version prefix here
 * would 404 against a perfectly healthy server and report it as unreachable.
 */
export async function pingBackend() {
  const { apiBaseUrl } = getConfig();
  if (!apiBaseUrl) throw new ApiError('No backend address is set.', 0);
  const origin = apiBaseUrl.replace(/\/v\d+$/, '');
  const res = await rawFetch(`${origin}/health`, { method: 'GET' }, TIMEOUT_MS);
  if (!res.ok) throw new ApiError(`The server answered ${res.status}.`, res.status);
  return readBody(res);
}
