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

/**
 * ============================================================================
 * "Continue with Google", by way of Supabase Auth.
 * ============================================================================
 *
 * The same project the React Native app signs in against (`app.json`'s
 * `extra.supabaseUrl`), and deliberately so: one Supabase project means one
 * Google OAuth client, one consent screen, and one place a redirect URL can be
 * wrong. `POST /auth/google` on the backend verifies whatever token it is
 * handed against that project — it does not care which client obtained it — so
 * a customer who signed in on their phone and a customer who signed in here
 * arrive at the same Glow+ account.
 *
 * The anon key is PUBLIC. It is what every Supabase web app ships in its
 * bundle; it identifies the project and grants only what Row Level Security
 * allows, which for this project is nothing at all — the site never reads a
 * Supabase table. It is not a secret and must not be treated as one, or the
 * button becomes impossible to configure on a static host.
 *
 * Both are OPTIONAL. A deployment that leaves them unset simply does not offer
 * the button (see `isGoogleSignInAvailable` in `lib/supabase.js`); email and
 * password are untouched. That is what keeps this change safe to ship ahead of
 * the dashboard configuration rather than after it.
 *
 * ⚠️ The redirect URLs below must be listed under **Authentication → URL
 * Configuration → Redirect URLs** in the Supabase dashboard, or Supabase
 * silently sends the user to the project's Site URL instead — which presents
 * as "I signed in with Google and nothing happened":
 *
 *     http://localhost:3000/**          (dev)
 *     https://<the production domain>/**
 *
 * The `**` matters. Sign-in starts from four different paths on this site
 * (`/`, `/consumer/booking`, `/consumer/rewards`, and whatever `/` is rewritten
 * to) and each one is sent back to itself.
 */
export const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '')
  .trim()
  .replace(/\/+$/, '');

export const SUPABASE_ANON_KEY = String(
  import.meta.env.VITE_SUPABASE_ANON_KEY || '',
).trim();
