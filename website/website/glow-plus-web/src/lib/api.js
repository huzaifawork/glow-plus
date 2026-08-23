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
   Kept in localStorage so a refresh doesn't log the merchant out. Wrapped in
   try/catch for the same reason lib/storage.js is: private-mode browsers throw
   on access rather than returning null.
   -------------------------------------------------------------------------- */
export function getToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* non-persistent session is better than a crash */
  }
}

export function clearToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/* --------------------------------------------------------------------------
   Request
   -------------------------------------------------------------------------- */
export async function apiRequest(path, { method = 'GET', body, auth = true } = {}) {
  const token = auth ? getToken() : null;

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
