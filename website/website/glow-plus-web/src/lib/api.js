/**
 * ============================================================================
 * REAL API CLIENT — talks to the Glow+ NestJS backend.
 * ============================================================================
 *
 * Distinct from `lib/storage.js` on purpose. That module is the prototype's
 * localStorage seam and still backs the demo views; this one is the real
 * thing, introduced by T17 for the billing page and written to be the
 * foundation T35–T38 build the rest of the UI on.
 *
 * Two contracts it depends on, both established server-side:
 *
 *   - **Auth is token-only** (`Authorization: Bearer`), never cookies — the
 *     React Native app has no cookie jar, so the web client must not rely on
 *     one either or the two clients diverge (T46).
 *   - **The access token lives 15 minutes and is refreshed transparently**
 *     (T47). Every login response now carries `refreshToken` and `expiresIn`
 *     beside the `token` it always had. `apiRequest` spends the refresh token
 *     on a 401 and retries once, so no view has to know any of this happened —
 *     which is why none of them changed.
 *   - **Errors always arrive as `{ statusCode, message, error, details? }`
 *     with `message` a STRING** (T16). Before that filter existed, validation
 *     errors put an ARRAY in `message`, so anything rendering it directly
 *     showed `[object Object]` or a comma blob. `ApiError.message` is
 *     therefore safe to put straight on screen.
 */
import { API_BASE_URL } from './config.js';

const TOKEN_KEY = 'glowplus:token';
// Separate storage key for consumer sessions (T18). The merchant billing page
// (T17) and this page's consumer login can both be open in the same browser —
// one shared key would mean logging in on one silently logs the other out.
const CONSUMER_TOKEN_KEY = 'glowplus:token:consumer';
// Separate again for admin sessions (T22) — same reasoning: an admin should
// be able to be logged in alongside a merchant/consumer session in the same
// browser without either clobbering the other.
const ADMIN_TOKEN_KEY = 'glowplus:token:admin';
// Separate again for the team page (T24). It holds EITHER an owner token or a
// staff token, and deliberately not the same key as the billing page's
// `glowplus:token` — a staff member signing in here must not silently replace
// an owner session on the billing page, which they have no rights on.
const STAFF_TOKEN_KEY = 'glowplus:token:staff';

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/* --------------------------------------------------------------------------
   Token storage
   Kept in localStorage so a refresh doesn't log the user out. Wrapped in
   try/catch for the same reason lib/storage.js is: private-mode browsers throw
   on access rather than returning null.
   -------------------------------------------------------------------------- */
function readToken(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeToken(key, token) {
  try {
    window.localStorage.setItem(key, token);
  } catch {
    /* non-persistent session is better than a crash */
  }
}

function removeToken(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/* --------------------------------------------------------------------------
   Sessions  (T47)

   A session is now a PAIR — a 15-minute access token and a 30-day refresh
   token — so each of the four session keys above gets a sibling key holding
   its refresh half. They are stored and cleared together; a page holding one
   without the other is a signed-out page that thinks it is signed in.
   -------------------------------------------------------------------------- */
const REFRESH_SUFFIX = ':refresh';
const refreshKeyFor = (key) => key + REFRESH_SUFFIX;

/** Store a login/refresh response. `refreshToken` is absent from nothing the API returns now, but treated as optional so an older backend degrades to T46 behaviour rather than wiping the session. */
function writeSession(key, data) {
  if (data?.token) writeToken(key, data.token);
  if (data?.refreshToken) writeToken(refreshKeyFor(key), data.refreshToken);
}

/** Forget a session locally. Does NOT tell the server — see `endSession`. */
function clearSession(key) {
  removeToken(key);
  removeToken(refreshKeyFor(key));
}

/**
 * Log out properly: revoke the session server-side, then forget it locally.
 *
 * Before T47 "log out" only ever meant the first half of that sentence's
 * second clause — the client forgot its token and the token stayed valid for
 * the rest of its life anywhere else it had reached. `POST /auth/logout`
 * revokes the whole refresh lineage, so the session cannot be continued.
 *
 * Fire-and-forget on purpose: the local clear must happen whether or not the
 * network call does, or a user on a dead connection cannot sign out of their
 * own browser. The request is also deliberately made BEFORE the clear reads
 * are lost, and swallows its own errors (the endpoint always answers
 * `{ ok: true }` anyway, so there is nothing to branch on).
 */
function endSession(key) {
  const refreshToken = readToken(refreshKeyFor(key));
  clearSession(key);
  if (refreshToken) {
    apiRequest('/auth/logout', { method: 'POST', auth: false, body: { refreshToken } }).catch(() => {});
  }
}

/**
 * One refresh at a time per session key.
 *
 * Without this, a page that fires four requests on mount gets four 401s and
 * four refresh attempts — and since rotation is single-use server-side, three
 * of them are REPLAYS, which the backend correctly treats as a leak and
 * answers by revoking the whole family. The user would be logged out by their
 * own dashboard loading. So concurrent callers share one in-flight promise.
 */
const refreshInFlight = new Map();

function refreshSession(key) {
  if (refreshInFlight.has(key)) return refreshInFlight.get(key);

  const attempt = (async () => {
    const refreshToken = readToken(refreshKeyFor(key));
    if (!refreshToken) return null;

    try {
      const data = await apiRequest('/auth/refresh', {
        method: 'POST',
        auth: false,
        body: { refreshToken },
      });
      writeSession(key, data);
      return data?.token ?? null;
    } catch {
      // The single-flight promise above only covers THIS tab. Two tabs share
      // localStorage but not the promise, so the one that loses the race
      // presents a token the winner already spent and is refused. Before
      // concluding the session is dead, look at what is in storage now: if the
      // refresh token changed while we were asking, another tab rotated it
      // successfully and this tab should simply adopt the result.
      const current = readToken(refreshKeyFor(key));
      if (current && current !== refreshToken) return readToken(key);

      clearSession(key);
      return null;
    }
  })();

  refreshInFlight.set(key, attempt);
  attempt.finally(() => refreshInFlight.delete(key));
  return attempt;
}

/**
 * `getX`/`clearX` only — the `setX` writers were removed by T47. A session is
 * a pair now, and a caller that stored only the access half would produce a
 * page that looks signed in for 15 minutes and then signs itself out with no
 * way back. `writeSession` is the one writer, and it is internal.
 */
export const getToken = () => readToken(TOKEN_KEY);
export const clearToken = () => endSession(TOKEN_KEY);

export const getConsumerToken = () => readToken(CONSUMER_TOKEN_KEY);
export const clearConsumerToken = () => endSession(CONSUMER_TOKEN_KEY);

export const getStaffToken = () => readToken(STAFF_TOKEN_KEY);
export const clearStaffToken = () => endSession(STAFF_TOKEN_KEY);

export const getAdminToken = () => readToken(ADMIN_TOKEN_KEY);
export const clearAdminToken = () => endSession(ADMIN_TOKEN_KEY);

/* --------------------------------------------------------------------------
   Request
   -------------------------------------------------------------------------- */
export async function apiRequest(path, { method = 'GET', body, auth = true, tokenKey = TOKEN_KEY, retried = false } = {}) {
  const token = auth ? readToken(tokenKey) : null;

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (networkError) {
    // fetch only rejects for network-level failures. Saying so plainly beats
    // "Failed to fetch", which reads to a user as though the app is broken.
    throw new ApiError(
      `Could not reach the Glow+ API at ${API_BASE_URL}. Is the backend running?`,
      0,
    );
  }

  // 204 and empty bodies are valid successes.
  const text = await res.text();
  const payload = text ? safeJson(text) : null;

  if (!res.ok) {
    // A 401 on a request we DID send a token with means that token is no good
    // — expired, tampered with, or (T30) issued by the pre-`jsonwebtoken`
    // signer and missing the `iss`/`aud` claims the API now verifies. Drop it.
    //
    // Without this the page stays "logged in" holding a token the server will
    // never accept: every render re-sends it, gets 401, and shows the API's
    // own words ("Malformed token") as though the user had done something
    // wrong — and there is no button anywhere that clears it. Discarding it
    // here puts the page back in its signed-out state, which every one of
    // these pages already knows how to render.
    //
    // Only on 401. A 403 is a *valid* token being refused a *specific* route
    // (T29's role guards, T29's paywall) — throwing that session away would
    // log a merchant out for touching one admin URL.
    //
    // T47 — but a 401 is now usually just "the 15 minutes are up", not "this
    // session is over". So before giving up, spend the refresh token and
    // replay the request exactly once. `retried` is what makes it exactly
    // once: a route that 401s for a reason refreshing cannot fix must not
    // become an infinite loop. `/auth/refresh` itself is sent with
    // `auth: false`, so it has no `token` and can never reach this branch.
    if (res.status === 401 && token && !retried) {
      const fresh = await refreshSession(tokenKey);
      if (fresh) {
        return apiRequest(path, { method, body, auth, tokenKey, retried: true });
      }
    }

    // Either there was no refresh token, or spending it failed — the session
    // really is over. `clearSession`, not `removeToken`: leaving the refresh
    // half behind would have the next 401 try to spend a token the server has
    // already revoked, which reads to it as a replay.
    if (res.status === 401 && token) clearSession(tokenKey);

    throw new ApiError(
      payload?.message || `Request failed (${res.status})`,
      res.status,
      payload?.details,
    );
  }

  return payload;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------------------
   Endpoints used by the billing page (T17)
   -------------------------------------------------------------------------- */
export async function merchantLogin(email, password) {
  const data = await apiRequest('/merchants/login', {
    method: 'POST',
    auth: false,
    body: { email, password },
  });
  writeSession(TOKEN_KEY, data);
  return data;
}

export function getMerchantProfile() {
  return apiRequest('/merchants/me');
}

export function cancelSubscription() {
  return apiRequest('/billing/cancel', { method: 'POST' });
}

export function resumeSubscription() {
  return apiRequest('/billing/resume', { method: 'POST' });
}

export function createCheckoutSession(plan = 'MONTHLY') {
  return apiRequest('/billing/checkout', { method: 'POST', body: { plan } });
}

/* --------------------------------------------------------------------------
   Endpoints used by the SPA auth views (T35)
   -------------------------------------------------------------------------- */
export function consumerSignup({ email, password, name, phone }) {
  return apiRequest('/auth/signup', {
    method: 'POST',
    auth: false,
    body: { email, password, name, phone: phone || undefined },
  });
}

export function merchantSignup({ businessName, email, password }) {
  return apiRequest('/merchants/signup', {
    method: 'POST',
    auth: false,
    body: { businessName, email, password },
  });
}

/** Same retry route T31/T60's signup fix relies on — works for either role, the API looks the email up in both tables. */
export function resendVerification(email) {
  return apiRequest('/auth/resend-verification', { method: 'POST', auth: false, body: { email } });
}

export const logoutMerchant = clearToken;
export const logoutConsumer = clearConsumerToken;
export const logoutAdmin = clearAdminToken;

/* --------------------------------------------------------------------------
   Endpoints used by the consumer booking page (T18)
   -------------------------------------------------------------------------- */
export async function consumerLogin(email, password) {
  const data = await apiRequest('/auth/login', { method: 'POST', auth: false, body: { email, password } });
  writeSession(CONSUMER_TOKEN_KEY, data);
  return data;
}

/**
 * The public salon directory (T43).
 *
 * **The path is `/merchants`, not T18's `/merchants/public`** — that stopgap
 * is gone. `/merchants` is what the React Native app already calls
 * (`client.js:152`), so having one canonical route is what lets Order 2 ship
 * against this backend unchanged.
 *
 * Each row now carries `foundingMember`, `styleCount` and `styleTypes`, which
 * is why the salon grid no longer fetches a style list per salon.
 *
 * `q`/`limit`/`offset` are supported server-side and passed through here;
 * nothing in the site paginates yet, and the API's default page is larger
 * than the directory, so callers can keep omitting them. The filtered total
 * rides on the `X-Total-Count` response header (exposed via CORS) rather than
 * wrapping the body, because the RN app maps over the array directly.
 */
export function listPublicMerchants({ q, limit, offset } = {}) {
  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  if (limit != null) qs.set('limit', String(limit));
  if (offset != null) qs.set('offset', String(offset));
  const suffix = qs.toString();
  return apiRequest('/merchants' + (suffix ? `?${suffix}` : ''), { auth: false });
}

/** Founding-spots counter for the landing page (T43) [F42] — `{ cap, taken, left }`. */
export function getFoundingSpots() {
  return apiRequest('/merchants/founding-spots', { auth: false });
}

export function listPublicStyles(merchantId) {
  return apiRequest(`/styles/public/${encodeURIComponent(merchantId)}`, { auth: false });
}

export function getAvailability(merchantId, styleId, date) {
  const qs = new URLSearchParams({ merchantId, styleId, date }).toString();
  return apiRequest(`/bookings/availability?${qs}`, { auth: false });
}

export function createBooking({ merchantId, styleId, startTime, notes }) {
  return apiRequest('/bookings', {
    method: 'POST',
    tokenKey: CONSUMER_TOKEN_KEY,
    body: { merchantId, styleId, startTime, notes: notes || undefined },
  });
}

export function listMyBookings() {
  return apiRequest('/bookings/me', { tokenKey: CONSUMER_TOKEN_KEY });
}

export function cancelBooking(id) {
  return apiRequest(`/bookings/${encodeURIComponent(id)}/cancel`, {
    method: 'PATCH',
    tokenKey: CONSUMER_TOKEN_KEY,
  });
}

/* --------------------------------------------------------------------------
   Endpoints used by the consumer rewards page (T23)
   -------------------------------------------------------------------------- */
export function listAvailableRewards(merchantId) {
  const qs = new URLSearchParams({ merchantId }).toString();
  return apiRequest(`/redemptions/available?${qs}`, { tokenKey: CONSUMER_TOKEN_KEY });
}

export function redeemReward(rewardRuleId) {
  return apiRequest('/redemptions', {
    method: 'POST',
    tokenKey: CONSUMER_TOKEN_KEY,
    body: { rewardRuleId },
  });
}

/** Points balance + expiry, per salon (T25). */
export function getMyPoints() {
  return apiRequest('/points/me', { tokenKey: CONSUMER_TOKEN_KEY });
}

export function listMyRedemptions() {
  return apiRequest('/redemptions/me', { tokenKey: CONSUMER_TOKEN_KEY });
}

/* --------------------------------------------------------------------------
   Endpoints used by the SPA consumer dashboard (T36)
   -------------------------------------------------------------------------- */

/**
 * One call behind the whole rewards tab (T42).
 *
 * Returns `{ totalPoints, merchants: [{ merchantId, businessName, points,
 * rewards[], recentVisits[] }] }` — the shape the React Native app was already
 * written against, so the two clients read the same payload. Each reward
 * carries `eligible`, which is why the dashboard does not also have to call
 * `/redemptions/available` once per salon just to enable a Redeem button.
 */
export function getMyRewards() {
  return apiRequest('/me/rewards', { tokenKey: CONSUMER_TOKEN_KEY });
}

/** Full visit history across every salon, newest first (T45). */
export function listMyVisits() {
  return apiRequest('/visits/me', { tokenKey: CONSUMER_TOKEN_KEY });
}

/* --------------------------------------------------------------------------
   Endpoints used by the admin panel (T22)
   -------------------------------------------------------------------------- */
export async function adminLogin(email, password) {
  const data = await apiRequest('/admin/login', { method: 'POST', auth: false, body: { email, password } });
  writeSession(ADMIN_TOKEN_KEY, data);
  return data;
}

export function listPendingMerchants() {
  return apiRequest('/admin/merchants/pending', { tokenKey: ADMIN_TOKEN_KEY });
}

/**
 * The whole merchant directory (T38) — this route did not exist until T38
 * built it. The approval queue above is only the PENDING slice; the console's
 * "All salons" list needs everything, including SUSPENDED and CANCELLED
 * salons, which by definition never appear in a pending queue.
 *
 * `status` is left off entirely rather than sent empty: the API validates it
 * against the real MerchantStatus enum, so `?status=` would be a 400.
 */
export function listAllMerchants(status) {
  const qs = status ? `?${new URLSearchParams({ status }).toString()}` : '';
  return apiRequest(`/admin/merchants${qs}`, { tokenKey: ADMIN_TOKEN_KEY });
}

export function approveMerchant(id) {
  return apiRequest(`/admin/merchants/${encodeURIComponent(id)}/approve`, {
    method: 'PATCH',
    tokenKey: ADMIN_TOKEN_KEY,
  });
}

export function suspendMerchant(id) {
  return apiRequest(`/admin/merchants/${encodeURIComponent(id)}/suspend`, {
    method: 'PATCH',
    tokenKey: ADMIN_TOKEN_KEY,
  });
}

export function getMrr() {
  return apiRequest('/admin/metrics/mrr', { tokenKey: ADMIN_TOKEN_KEY });
}

export function getChurn() {
  return apiRequest('/admin/metrics/churn', { tokenKey: ADMIN_TOKEN_KEY });
}

export function getPlatformStats() {
  return apiRequest('/admin/metrics/platform', { tokenKey: ADMIN_TOKEN_KEY });
}

/* --------------------------------------------------------------------------
   Endpoints used by the team / staff page (T24)
   -------------------------------------------------------------------------- */

/**
 * One sign-in box for both kinds of merchant account.
 *
 * The salon's own account lives in `Merchant`; staff live in `MerchantStaff`.
 * A team member typing their email has no idea which table they are in — and
 * shouldn't need to — so try the owner endpoint first and fall back to the
 * staff one on a 401. Any other error (network, 500) is rethrown rather than
 * retried, so a real outage doesn't get reported as "wrong password".
 */
export async function teamSignIn(email, password) {
  try {
    const data = await apiRequest('/merchants/login', { method: 'POST', auth: false, body: { email, password } });
    writeSession(STAFF_TOKEN_KEY, data);
    return data;
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
  }
  const data = await apiRequest('/staff/login', { method: 'POST', auth: false, body: { email, password } });
  writeSession(STAFF_TOKEN_KEY, data);
  return data;
}

export function getStaffMe() {
  return apiRequest('/staff/me', { tokenKey: STAFF_TOKEN_KEY });
}

export function listStaff() {
  return apiRequest('/staff', { tokenKey: STAFF_TOKEN_KEY });
}

export function inviteStaff({ email, name, role }) {
  return apiRequest('/staff/invites', {
    method: 'POST',
    tokenKey: STAFF_TOKEN_KEY,
    body: { email, name: name || undefined, role },
  });
}

export function revokeStaffInvite(id) {
  return apiRequest(`/staff/invites/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    tokenKey: STAFF_TOKEN_KEY,
  });
}

export function updateStaffRole(id, role) {
  return apiRequest(`/staff/${encodeURIComponent(id)}/role`, {
    method: 'PATCH',
    tokenKey: STAFF_TOKEN_KEY,
    body: { role },
  });
}

export function removeStaff(id) {
  return apiRequest(`/staff/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    tokenKey: STAFF_TOKEN_KEY,
  });
}

/* Both public — an invitee has no account yet, so no token exists to send. */
export function previewStaffInvite(token) {
  return apiRequest(`/staff/invites/${encodeURIComponent(token)}`, { auth: false });
}

export function acceptStaffInvite({ token, password, name }) {
  return apiRequest('/staff/accept-invite', {
    method: 'POST',
    auth: false,
    body: { token, password, name: name || undefined },
  });
}

/* --------------------------------------------------------------------------
   Endpoints used by the SPA merchant portal (T37)

   All on the merchant TOKEN_KEY (`glowplus:token`) — the default — which is
   the same session the billing page holds, so the portal's "Billing" tab can
   hand off to /business/billing without a second sign-in. The team page keeps
   its own key on purpose (see STAFF_TOKEN_KEY above): it may hold a *staff*
   token, which has fewer rights than the owner session the portal runs on.
   -------------------------------------------------------------------------- */

/** The merchant's own catalogue, including deactivated styles. */
export function listStyles() {
  return apiRequest('/styles');
}

export function createStyle({ name, type, pointsPerVisit }) {
  return apiRequest('/styles', { method: 'POST', body: { name, type, pointsPerVisit } });
}

export function setStyleActive(id, active) {
  return apiRequest(`/styles/${encodeURIComponent(id)}/${active ? 'activate' : 'deactivate'}`, {
    method: 'PATCH',
  });
}

/**
 * Reward rules (T37) — these routes did not exist until T37 built them.
 *
 * Reads accept staff; every write is owner-only, enforced server-side by
 * RequireMerchantOwnerGuard. The SPA only ever signs in owners (BusinessAuth
 * calls /merchants/login), so the portal does not render a staff-mode form —
 * but the refusal is real and does not depend on the UI to hold.
 */
export function listRewardRules() {
  return apiRequest('/reward-rules');
}

export function createRewardRule(rule) {
  return apiRequest('/reward-rules', { method: 'POST', body: rule });
}

export function setRewardRuleActive(id, active) {
  return apiRequest(`/reward-rules/${encodeURIComponent(id)}/${active ? 'activate' : 'deactivate'}`, {
    method: 'PATCH',
  });
}

/** The merchant's visit ledger, newest first, with style and client included. */
export function listMerchantVisits() {
  return apiRequest('/visits');
}

/**
 * Logs a visit. The client is named by EMAIL, not phone.
 *
 * The prototype's form asked for "Client phone" and keyed its fake data on it;
 * the backend identifies people by email and creates a lightweight account for
 * a walk-in who has never signed up (VisitsService.findOrCreateClient). Email
 * is the identity the whole API — and the RN app's login — already uses, so
 * the portal form follows the backend rather than the mockup.
 */
export function logVisit({ clientEmail, clientName, styleId }) {
  return apiRequest('/visits', {
    method: 'POST',
    body: { clientEmail, clientName: clientName || undefined, styleId },
  });
}
