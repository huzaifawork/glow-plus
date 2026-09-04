import * as SecureStore from 'expo-secure-store';

/**
 * The signed-in session, at rest.
 *
 * ── R1.4 / NF2 ─────────────────────────────────────────────────────────────
 * *"Any authentication token issued to the app must be stored using the
 * operating system's secure credential storage, never in plain, unencrypted
 * form."* / *"All sensitive data stored on the device (in particular,
 * authentication credentials) must be encrypted at rest using the platform's
 * secure storage facilities."*
 *
 * `expo-secure-store` is the iOS **Keychain** and the Android **EncryptedSharedPreferences**
 * (Keystore-backed). `AsyncStorage` — which this app uses for the API URL and
 * the demo-mode flag — is a plaintext SQLite file and is explicitly not
 * acceptable here. That split is the whole point of there being two storage
 * modules in this app; do not merge them for tidiness.
 *
 * ── R1.5 ───────────────────────────────────────────────────────────────────
 * *"The app must remain logged in across app restarts until the user
 * explicitly logs out or the session is no longer valid."* Nothing here is
 * cleared on launch; the only callers of `clearSession` are logout and the
 * refresh path, when the server has told us the session is dead.
 *
 * ── Why a PAIR of tokens ───────────────────────────────────────────────────
 * The backend's access token lives **15 minutes** (its T47) and is refreshed
 * with a 30-day refresh token. An app that stored only the access token would
 * sign its user out every fifteen minutes, which is R1.5 failing in the most
 * visible way possible. They are written and cleared together — a device
 * holding one without the other is a signed-out device that believes it is
 * signed in.
 */

const ACCESS_KEY = 'glowplus.session.access';
const REFRESH_KEY = 'glowplus.session.refresh';

/**
 * An in-memory mirror of the access token.
 *
 * Every request reads the token, and a Keychain read is a native round trip:
 * on a screen that fires three requests on mount, that is three synchronous
 * hops into the OS before any of them leave. The mirror makes the common case
 * free. Disk stays the source of truth on cold start — `restoreSession()` is
 * what fills this in — so the cache can never be the reason a session is
 * missed, only the reason it is found faster.
 */
let cache = { accessToken: null, refreshToken: null, hydrated: false };

async function readItem(key) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    // A device whose keychain is unavailable (a locked device on some Android
    // OEMs, a simulator with a broken keychain) must land on the login screen,
    // not crash on launch.
    return null;
  }
}

async function writeItem(key, value) {
  try {
    if (value == null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // The in-memory session still works for this run. Losing persistence is a
    // sign-out on next launch; throwing here would be a sign-out right now.
  }
}

/** Read the stored session into memory. Call once, before the first request. */
export async function restoreSession() {
  const [accessToken, refreshToken] = await Promise.all([
    readItem(ACCESS_KEY),
    readItem(REFRESH_KEY),
  ]);
  cache = { accessToken, refreshToken, hydrated: true };
  return getSession();
}

export function getSession() {
  return { accessToken: cache.accessToken, refreshToken: cache.refreshToken };
}

export function getAccessToken() {
  return cache.accessToken;
}

export function hasSession() {
  return Boolean(cache.accessToken);
}

/**
 * Store a login or refresh response.
 *
 * `refreshToken` is treated as optional so that an older backend — one that
 * predates the platform's T47 — degrades to a 15-minute session rather than
 * wiping the one we just received.
 */
export async function saveSession({ token, refreshToken }) {
  if (token) cache.accessToken = token;
  if (refreshToken) cache.refreshToken = refreshToken;
  await Promise.all([
    token ? writeItem(ACCESS_KEY, token) : Promise.resolve(),
    refreshToken ? writeItem(REFRESH_KEY, refreshToken) : Promise.resolve(),
  ]);
}

/** Forget the session locally. Does NOT tell the server — see `client.logout`. */
export async function clearSession() {
  cache = { accessToken: null, refreshToken: null, hydrated: true };
  await Promise.all([writeItem(ACCESS_KEY, null), writeItem(REFRESH_KEY, null)]);
}
