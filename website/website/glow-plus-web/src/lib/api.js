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

export const getToken = () => readToken(TOKEN_KEY);
export const setToken = (token) => writeToken(TOKEN_KEY, token);
export const clearToken = () => removeToken(TOKEN_KEY);

export const getConsumerToken = () => readToken(CONSUMER_TOKEN_KEY);
export const setConsumerToken = (token) => writeToken(CONSUMER_TOKEN_KEY, token);
export const clearConsumerToken = () => removeToken(CONSUMER_TOKEN_KEY);

export const getAdminToken = () => readToken(ADMIN_TOKEN_KEY);
export const setAdminToken = (token) => writeToken(ADMIN_TOKEN_KEY, token);
export const clearAdminToken = () => removeToken(ADMIN_TOKEN_KEY);

/* --------------------------------------------------------------------------
   Request
   -------------------------------------------------------------------------- */
export async function apiRequest(path, { method = 'GET', body, auth = true, tokenKey = TOKEN_KEY } = {}) {
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
  if (data?.token) setToken(data.token);
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
   Endpoints used by the consumer booking page (T18)
   -------------------------------------------------------------------------- */
export async function consumerLogin(email, password) {
  const data = await apiRequest('/auth/login', { method: 'POST', auth: false, body: { email, password } });
  if (data?.token) setConsumerToken(data.token);
  return data;
}

export function listPublicMerchants() {
  return apiRequest('/merchants/public', { auth: false });
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

export function listMyRedemptions() {
  return apiRequest('/redemptions/me', { tokenKey: CONSUMER_TOKEN_KEY });
}

/* --------------------------------------------------------------------------
   Endpoints used by the admin panel (T22)
   -------------------------------------------------------------------------- */
export async function adminLogin(email, password) {
  const data = await apiRequest('/admin/login', { method: 'POST', auth: false, body: { email, password } });
  if (data?.token) setAdminToken(data.token);
  return data;
}

export function listPendingMerchants() {
  return apiRequest('/admin/merchants/pending', { tokenKey: ADMIN_TOKEN_KEY });
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
