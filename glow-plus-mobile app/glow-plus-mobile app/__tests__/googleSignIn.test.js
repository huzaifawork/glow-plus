/**
 * "Continue with Google"  (R1.2 / R1.3)
 *
 * The parts of this flow worth pinning are the ones that are invisible when
 * they go wrong. A broken redirect parse, a challenge that is not really
 * base64url, or a cancel treated as a failure all present as "I tapped the
 * button and nothing happened" — with no stack trace and nothing in a log.
 *
 * The browser hop itself is stubbed. What is exercised is everything either
 * side of it: what URL we send the user to, what we do with what comes back,
 * and what the app is left holding afterwards.
 */

// `api/config` pulls in AsyncStorage (it is where the backend-URL and
// demo-mode overrides live), which has no native module under Jest.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-linking', () => ({ createURL: (path) => `glowplus://${path}` }));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  // Deterministic, so the challenge below is reproducible. Real randomness is
  // the platform's job; what this file tests is the shape it is turned into.
  getRandomBytes: (n) => Uint8Array.from({ length: n }, (_, i) => (i * 7) % 256),
  digestStringAsync: jest.fn().mockResolvedValue('a+b/c=='),
}));

const SUPABASE_URL = 'https://project.supabase.co';
const ANON_KEY = 'anon-key';

/**
 * Load a fresh copy of the modules under test.
 *
 * `api/config` reads its Supabase values once, at import time, so they are
 * injected through the env vars it reads — the same route an EAS build profile
 * uses — and the registry is reset so each test gets a module that saw them.
 *
 * The browser mock is re-required rather than imported at the top of the file
 * for the same reason: after `resetModules` the module registry hands out a
 * NEW mock object, and a `jest.fn()` captured before the reset is no longer
 * the one the code under test will call.
 */
function loadModules({ configured = true } = {}) {
  jest.resetModules();
  if (configured) {
    process.env.EXPO_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;
  } else {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  }
  return {
    supabase: require('../src/api/supabase'),
    config: require('../src/api/config'),
    browser: require('expo-web-browser'),
  };
}

/** The happy path's two stubs: a redirect carrying a code, and the exchange. */
function stubSuccessfulExchange(browser, body = { access_token: 'supabase-token' }) {
  browser.openAuthSessionAsync.mockResolvedValue({
    type: 'success',
    url: 'glowplus://auth-callback?code=the-code',
  });
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
  global.fetch = fetchMock;
  return fetchMock;
}

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
});

describe('parsing what the browser comes back with', () => {
  it('reads the authorisation code out of the query string', () => {
    const { supabase } = loadModules();
    const params = supabase.parseRedirect('glowplus://auth-callback?code=abc123&state=xyz');
    expect(params.code).toBe('abc123');
    expect(params.state).toBe('xyz');
  });

  it('reads an error out of the FRAGMENT too', () => {
    const { supabase } = loadModules();
    // Supabase puts errors on either side of the `#` depending on where the
    // refusal happened. A parser that reads only the query silently loses the
    // one message that explains a failed sign-in.
    const params = supabase.parseRedirect(
      'glowplus://auth-callback#error=access_denied&error_description=User+denied+access',
    );
    expect(params.error).toBe('access_denied');
    expect(params.error_description).toBe('User denied access');
  });

  it('decodes percent-escapes and survives a malformed one', () => {
    const { supabase } = loadModules();
    const params = supabase.parseRedirect(
      'glowplus://auth-callback?next=%2Fbookings&broken=%E0%A4%A',
    );
    expect(params.next).toBe('/bookings');
    // Not a throw: a bad redirect must not crash the sign-in screen.
    expect(params.broken).toBe('%E0%A4%A');
  });

  it('returns nothing rather than throwing on a URL with no parameters', () => {
    const { supabase } = loadModules();
    expect(supabase.parseRedirect('glowplus://auth-callback')).toEqual({});
  });
});

describe('the PKCE challenge', () => {
  it('is base64url — no +, / or padding, which Supabase rejects', () => {
    const { supabase } = loadModules();
    expect(supabase.base64ToBase64Url('a+b/c==')).toBe('a-b_c');
  });
});

describe('signInWithGoogle', () => {
  it('sends the user to Supabase with a PKCE challenge and the app’s redirect', async () => {
    const { supabase, browser } = loadModules();
    browser.openAuthSessionAsync.mockResolvedValue({ type: 'cancel' });

    await supabase.signInWithGoogle();

    const [authorizeUrl, redirect] = browser.openAuthSessionAsync.mock.calls[0];
    expect(authorizeUrl).toContain(`${SUPABASE_URL}/auth/v1/authorize`);
    expect(authorizeUrl).toContain('provider=google');
    expect(authorizeUrl).toContain('code_challenge_method=s256');
    // base64url of the stubbed digest — the value Supabase will hash the
    // verifier against when the code is spent.
    expect(authorizeUrl).toContain('code_challenge=a-b_c');
    expect(authorizeUrl).toContain(`redirect_to=${encodeURIComponent('glowplus://auth-callback')}`);
    // Passed as the return URL as well, or the browser sheet never closes.
    expect(redirect).toBe('glowplus://auth-callback');
  });

  it('uses a verifier of the length and alphabet RFC 7636 allows', async () => {
    const { supabase, browser } = loadModules();
    const fetchMock = stubSuccessfulExchange(browser);

    await supabase.signInWithGoogle();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`);
    expect(init.headers.apikey).toBe(ANON_KEY);

    const body = JSON.parse(init.body);
    expect(body.auth_code).toBe('the-code');
    // 43–128 unreserved characters. A verifier outside that is refused by
    // Supabase with a message about the code, not about the verifier.
    expect(body.code_verifier).toMatch(/^[A-Za-z0-9\-_]{43,128}$/);
  });

  it('resolves to the Supabase access token, and to that alone', async () => {
    const { supabase, browser } = loadModules();
    stubSuccessfulExchange(browser, {
      access_token: 'supabase-token',
      refresh_token: 'supabase-refresh',
      user: { id: 'sb-1' },
    });

    // The refresh token and the Supabase user are deliberately dropped — the
    // app keeps exactly one session, the Glow+ one. See api/supabase.js.
    await expect(supabase.signInWithGoogle()).resolves.toBe('supabase-token');
  });

  it.each([['cancel'], ['dismiss']])(
    'treats a %s as "the user changed their mind", not an error',
    async (type) => {
      const { supabase, browser } = loadModules();
      browser.openAuthSessionAsync.mockResolvedValue({ type });
      global.fetch = jest.fn();

      // null, not a throw. A red banner for someone who tapped Cancel is the
      // most common way this button is got wrong.
      await expect(supabase.signInWithGoogle()).resolves.toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );

  it('surfaces a refusal that came back on the redirect', async () => {
    const { supabase, browser } = loadModules();
    browser.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url:
        'glowplus://auth-callback#error=invalid_request' +
        '&error_description=Unsupported+provider%3A+provider+is+not+enabled',
    });
    global.fetch = jest.fn();

    // That raw string names the dashboard toggle nobody flipped. The user gets
    // a sentence, and the token exchange is never attempted.
    await expect(supabase.signInWithGoogle()).rejects.toThrow(/not enabled/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('surfaces a failed code exchange', async () => {
    const { supabase, browser } = loadModules();
    browser.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'glowplus://auth-callback?code=stale',
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error_description: 'invalid flow state, no valid flow state found' }),
    });

    await expect(supabase.signInWithGoogle()).rejects.toThrow(/flow state/);
  });

  it('refuses to open a browser at all when the build has no Supabase project', async () => {
    const { supabase, browser } = loadModules({ configured: false });

    expect(supabase.isGoogleSignInAvailable()).toBe(false);
    await expect(supabase.signInWithGoogle()).rejects.toThrow(/not set up/i);
    expect(browser.openAuthSessionAsync).not.toHaveBeenCalled();
  });

  it('offers the button in demo mode even with no Supabase project (R5.1)', () => {
    const { supabase, config } = loadModules({ configured: false });

    expect(supabase.isGoogleSignInAvailable()).toBe(false);
    config.setDemoMode(true);
    // An evaluator running with no backend must still be able to tap it —
    // `client.loginWithGoogle` serves the demo session without a network call.
    expect(supabase.isGoogleSignInAvailable()).toBe(true);
  });
});

describe('the demo backend answers a Google sign-in like the real one', () => {
  it('returns a session with the same fields POST /auth/login returns', async () => {
    const { demoApi } = require('../src/api/demo');
    const google = await demoApi.loginWithGoogle();
    const password = await demoApi.login('someone@example.com');

    // A demo path that answered a different shape would let a screen work in
    // demo mode and fail against the live API — see demo.test.js.
    expect(Object.keys(google).sort()).toEqual(Object.keys(password).sort());
    expect(google.token).toEqual(expect.any(String));
    expect(google.refreshToken).toEqual(expect.any(String));
    expect(google.user.id).toBe(password.user.id);
  });
});
