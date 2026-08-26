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

/**
 * The timezone every salon's hours and appointments are shown in.  [F63]
 *
 * **Why this exists.** `availability.service.ts` resolves "09:00" against the
 * SALON's timezone and returns real UTC instants — that part is correct, and
 * [F57] fixed it. The browser then rendered those instants with
 * `toLocaleTimeString(undefined, …)`, i.e. in **the viewer's** timezone. So a
 * Toronto salon offering 9am showed as 6pm to a customer in Karachi, and the
 * two halves of the same feature disagreed about what "9am" meant.
 *
 * ⚠️ **This must track the backend's `SALON_TIMEZONE`.** Both default to
 * `America/Toronto` — the country the platform actually sells in, since prices
 * are in CAD — and both are overridable by environment. Changing one without
 * the other reintroduces exactly the bug this fixes, which is why they share
 * a default rather than one silently falling back to UTC.
 *
 * The platform is single-timezone by design for now (see `salon-time.ts`). The
 * end state is a `timezone` column on Merchant, at which point this constant
 * becomes the fallback rather than the answer.
 */
export const SALON_TIMEZONE =
  import.meta.env.VITE_SALON_TIMEZONE || 'America/Toronto';
