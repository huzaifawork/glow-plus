/**
 * The old Express server (glow-plus-frontend/server.js) served a `/config.js`
 * route that did nothing but assign `window.GLOW_API_BASE_URL`, so the static
 * pages knew where the backend lived without hardcoding it.
 *
 * Vite replaces that with a build-time env var. The `window` global is still
 * set under the same name because the verify-email failure copy prints the URL
 * back to the user verbatim, and because anything else reading it keeps working.
 */
/**
 * T49 — the base URL now carries the API version, and the version lives HERE
 * rather than in every path inside `api.js`.
 *
 * That is the same shape the React Native app uses (`client.js:4` reads
 * `expoConfig.extra.apiBaseUrl` and then writes bare paths like
 * `/me/rewards`), which is exactly what makes `/v1` absorbable by Order 2 as a
 * config change instead of a code change. Keeping the two clients structured
 * the same way is the point — a version baked into 40 call sites is a version
 * you can never bump.
 *
 * `VITE_API_BASE_URL` should therefore be set to the full versioned origin in
 * production (T59), e.g. `https://api.glowplusmember.com/v1`. The fallback
 * below covers a fresh clone with no `.env`.
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/v1';

if (typeof window !== 'undefined') {
  window.GLOW_API_BASE_URL = API_BASE_URL;
}
