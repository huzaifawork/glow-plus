import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where the backend lives, and whether we are talking to it at all.
 *
 * ── R5.2 ───────────────────────────────────────────────────────────────────
 * *"The address of the backend service the app connects to must be
 * configurable, not fixed in the app's source code."*
 *
 * Three sources, in precedence order, and each exists for a different person:
 *
 *   1. **A runtime override**, saved on the device from Settings → Backend.
 *      For the reviewer or QA tester who needs to point a TestFlight build at
 *      a staging API without a rebuild. Highest precedence because it is the
 *      only one a person can change while holding the phone.
 *   2. **`EXPO_PUBLIC_API_BASE_URL`**, read at build time. For CI: EAS build
 *      profiles set it per channel, so staging and production are one env var
 *      apart rather than one committed edit apart.
 *   3. **`expo.extra.apiBaseUrl` in `app.json`**. The default shipped in the
 *      binary.
 *
 * There is deliberately no fourth source and no hardcoded fallback URL beyond
 * that config value — a literal in a `.js` file is exactly what R5.2 forbids.
 *
 * ── R5.1 ───────────────────────────────────────────────────────────────────
 * *"The app must be usable for evaluation and demonstration purposes without
 * requiring a live backend connection."* Demo mode is a runtime toggle in
 * Settings, so an evaluator can flip it on a device that has no route to the
 * API and still exercise every screen. It defaults to `expo.extra.demoMode`.
 */

const OVERRIDE_URL_KEY = 'glowplus.config.apiBaseUrl';
const OVERRIDE_DEMO_KEY = 'glowplus.config.demoMode';

const extra = Constants.expoConfig?.extra ?? {};

/** The build-time default: env var if the build set one, else `app.json`. */
export const BUILD_TIME_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || extra.apiBaseUrl || '';

export const BUILD_TIME_DEMO_MODE = extra.demoMode === true;

/**
 * The Supabase project that runs "Continue with Google".
 *
 * Same three-source shape as the API URL above, minus the runtime override:
 * an env var for CI, `app.json` for the shipped default, and no hardcoded
 * literal. Unlike `apiBaseUrl` there is nothing to point at staging — a build
 * signs in against one Supabase project — so Settings does not expose it.
 *
 * Both values are PUBLISHABLE. The anon key is designed to ship inside a
 * client (it is what every Supabase web app puts in its bundle) and grants
 * nothing on its own: it is the project's row-level-security policies, and
 * here the Glow+ API's own verification of the returned token, that decide
 * what a holder can do. The service-role key is the one that must never be in
 * this file, or in `app.json`, or anywhere else in this repository.
 *
 * Empty is a supported state: the app hides the Google button and every other
 * way in still works. See `isGoogleSignInAvailable` in `api/supabase.js`.
 */
export const SUPABASE_URL = normaliseBaseUrl(
  process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || extra.supabaseUrl || '',
);

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || extra.supabaseAnonKey || '';

/**
 * The live configuration.
 *
 * Held in a module-level object rather than React state because
 * `src/api/client.js` is not a component and must be able to read it from any
 * call, including one fired by a background push handler. `ConfigContext`
 * mirrors it into React so screens re-render when it changes; this is the
 * source of truth, that is the projection.
 */
const current = {
  apiBaseUrl: BUILD_TIME_API_BASE_URL,
  demoMode: BUILD_TIME_DEMO_MODE,
  loaded: false,
};

const listeners = new Set();

function emit() {
  for (const listener of listeners) listener(getConfig());
}

export function getConfig() {
  return {
    apiBaseUrl: current.apiBaseUrl,
    demoMode: current.demoMode,
    loaded: current.loaded,
    // Build-time and therefore constant, but exposed through the same accessor
    // so no caller has to know which parts of the configuration can change and
    // which cannot.
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
  };
}

export function subscribeToConfig(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Normalise a base URL the user typed.
 *
 * A trailing slash is the difference between `.../v1/merchants` and
 * `.../v1//merchants`, and the second matches no route on the backend — a
 * 404 that looks like "the API is broken" rather than "you typed a slash".
 */
export function normaliseBaseUrl(value) {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

/**
 * Load the saved overrides. Called once, before the first request.
 *
 * `AsyncStorage` and not `SecureStore`: this is a URL and a boolean, not a
 * credential. Putting non-secrets in the keychain is not free — every read is
 * slower, and on Android the encrypted store has a size limit that a app
 * filling it with preferences will eventually meet.
 */
export async function loadConfig() {
  try {
    const [[, savedUrl], [, savedDemo]] = await AsyncStorage.multiGet([
      OVERRIDE_URL_KEY,
      OVERRIDE_DEMO_KEY,
    ]);
    if (savedUrl) current.apiBaseUrl = savedUrl;
    if (savedDemo != null) current.demoMode = savedDemo === 'true';
  } catch {
    // A device that cannot read its own preferences must still start on the
    // build-time defaults rather than not start.
  }
  current.loaded = true;
  emit();
  return getConfig();
}

export async function setApiBaseUrl(value) {
  const next = normaliseBaseUrl(value);
  current.apiBaseUrl = next || BUILD_TIME_API_BASE_URL;
  emit();
  try {
    if (next) await AsyncStorage.setItem(OVERRIDE_URL_KEY, next);
    else await AsyncStorage.removeItem(OVERRIDE_URL_KEY);
  } catch {
    // The in-memory value already took effect; failing to persist it means the
    // override lasts for this session, which is better than refusing it.
  }
}

export async function setDemoMode(enabled) {
  current.demoMode = !!enabled;
  emit();
  try {
    await AsyncStorage.setItem(OVERRIDE_DEMO_KEY, String(!!enabled));
  } catch {
    /* see above */
  }
}

/** True when there is nowhere to send a request — used to fail with a sentence, not a stack. */
export function isApiConfigured() {
  return Boolean(current.apiBaseUrl) || current.demoMode;
}
