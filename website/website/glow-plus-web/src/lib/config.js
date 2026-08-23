/**
 * The old Express server (glow-plus-frontend/server.js) served a `/config.js`
 * route that did nothing but assign `window.GLOW_API_BASE_URL`, so the static
 * pages knew where the backend lived without hardcoding it.
 *
 * Vite replaces that with a build-time env var. The `window` global is still
 * set under the same name because the verify-email failure copy prints the URL
 * back to the user verbatim, and because anything else reading it keeps working.
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

if (typeof window !== 'undefined') {
  window.GLOW_API_BASE_URL = API_BASE_URL;
}
