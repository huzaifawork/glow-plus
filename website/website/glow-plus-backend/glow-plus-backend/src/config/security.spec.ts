/**
 * T28 — security headers and CORS.
 *
 * The origin tests are the point of this file. They are written as the
 * bypasses an attacker would actually try, not as "an allowed origin is
 * allowed": every real CORS hole in the wild comes from a *matching* rule that
 * is too generous, never from a list that is too short.
 *
 * The helmet block runs the real middleware over a fake response rather than
 * asserting on the options object, because the options object being correct is
 * not the property that matters — the emitted headers are.
 */
import helmet from 'helmet';

import {
  ALLOWED_HEADERS,
  ALLOWED_METHODS,
  DEV_FALLBACK_ORIGINS,
  EXPOSED_HEADERS,
  buildCorsOptions,
  buildHelmetOptions,
  isOriginAllowed,
  parseAllowedOrigins,
  resolveAllowedOrigins,
} from './security';

const SITE = 'https://glowplusmember.com';

describe('parseAllowedOrigins', () => {
  it('returns nothing for unset or empty', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins('')).toEqual([]);
    expect(parseAllowedOrigins('  ,  ,')).toEqual([]);
  });

  it('trims the space after a comma', () => {
    // `a, b` is how anyone naturally writes a list; without the trim the
    // second entry is " https://b" and matches nothing.
    expect(parseAllowedOrigins(`${SITE}, https://www.glowplusmember.com`)).toEqual([
      SITE,
      'https://www.glowplusmember.com',
    ]);
  });

  it('strips a trailing slash', () => {
    // An Origin header never has a path or a trailing slash, so the pasted
    // `https://site.com/` would silently never match.
    expect(parseAllowedOrigins(`${SITE}/`)).toEqual([SITE]);
    expect(parseAllowedOrigins(`${SITE}///`)).toEqual([SITE]);
  });
});

describe('isOriginAllowed', () => {
  const allowed = parseAllowedOrigins(SITE);

  it('allows a listed origin', () => {
    expect(isOriginAllowed(SITE, allowed)).toBe(true);
  });

  it('allows a request with no Origin header', () => {
    // curl, the React Native app, Stripe's webhook. CORS is a browser rule
    // about reading a response; refusing these blocks real clients and stops
    // no attacker, who would simply omit the header too.
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
    expect(isOriginAllowed('', allowed)).toBe(true);
  });

  it('refuses an unlisted origin', () => {
    expect(isOriginAllowed('https://evil.test', allowed)).toBe(false);
  });

  it('refuses the classic prefix/suffix near-misses', () => {
    // A `startsWith` check lets the first through; an `endsWith` check lets
    // the second through. Both are real, published CORS bypasses.
    expect(isOriginAllowed('https://glowplusmember.com.evil.test', allowed)).toBe(false);
    expect(isOriginAllowed('https://evil-glowplusmember.com', allowed)).toBe(false);
    expect(isOriginAllowed('https://glowplusmember.com@evil.test', allowed)).toBe(false);
  });

  it('refuses a scheme or port swap', () => {
    // http:// is a different origin from https:// — allowing it would let a
    // network attacker on the same wifi serve a page that reads the API.
    expect(isOriginAllowed('http://glowplusmember.com', allowed)).toBe(false);
    expect(isOriginAllowed('https://glowplusmember.com:8443', allowed)).toBe(false);
  });

  it('refuses a bare "null" origin', () => {
    // Browsers send `Origin: null` from sandboxed iframes and `file://`
    // documents. It is a string, so a truthy check would let it through.
    expect(isOriginAllowed('null', allowed)).toBe(false);
  });

  it('matches case-insensitively, since hostnames are', () => {
    expect(isOriginAllowed('https://GlowPlusMember.com', allowed)).toBe(true);
  });
});

describe('resolveAllowedOrigins', () => {
  it('uses the configured list when there is one', () => {
    expect(resolveAllowedOrigins({ ALLOWED_ORIGINS: SITE } as NodeJS.ProcessEnv)).toEqual({
      origins: [SITE],
      usedFallback: false,
    });
  });

  it('falls back to localhost outside production, and says so', () => {
    expect(resolveAllowedOrigins({} as NodeJS.ProcessEnv)).toEqual({
      origins: DEV_FALLBACK_ORIGINS,
      usedFallback: true,
    });
  });

  it('NEVER falls back in production', () => {
    // The whole reason the old inline `?? ['http://localhost:3000']` was a
    // problem: a deploy missing the variable would trust localhost silently.
    expect(resolveAllowedOrigins({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toEqual({
      origins: [],
      usedFallback: false,
    });
    expect(resolveAllowedOrigins({ VERCEL: '1' } as NodeJS.ProcessEnv)).toEqual({
      origins: [],
      usedFallback: false,
    });
  });
});

describe('buildCorsOptions', () => {
  const options = buildCorsOptions({ ALLOWED_ORIGINS: `${SITE}/` } as NodeJS.ProcessEnv);

  function askOrigin(origin: string | undefined): boolean | undefined {
    let result: boolean | undefined;
    (options.origin as (o: string | undefined, cb: (e: Error | null, ok: boolean) => void) => void)(
      origin,
      (_err, ok) => {
        result = ok;
      },
    );
    return result;
  }

  it('answers the origin callback rather than throwing', () => {
    // A refusal must not become a 500: CORS does not apply to non-browser
    // callers, and an exception would break them for a browser-only rule.
    expect(askOrigin(SITE)).toBe(true);
    expect(askOrigin('https://evil.test')).toBe(false);
    expect(askOrigin(undefined)).toBe(true);
  });

  it('does not advertise credentials support', () => {
    // Auth is token-only in both clients. `true` here is what would make a
    // future cookie-based session CSRF-able on day one.
    expect(options.credentials).toBe(false);
  });

  it('lists methods and headers explicitly instead of reflecting them', () => {
    expect(options.methods).toEqual(ALLOWED_METHODS);
    expect(options.allowedHeaders).toEqual(ALLOWED_HEADERS);
    expect(options.methods).not.toContain('TRACE');
  });

  it('exposes the rate-limit headers so a browser client can read a 429', () => {
    // Without this, T26's limiter is enforced but invisible cross-origin and
    // the UI cannot tell the user how long to wait.
    expect(options.exposedHeaders).toEqual(EXPOSED_HEADERS);
    expect(options.exposedHeaders).toContain('Retry-After');
  });

  it('also exposes X-Total-Count, alongside the rate-limit headers not instead of them', () => {
    // T44 — the paginated public lists report their total in this header.
    // It lives here rather than in a per-route
    // `res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count')`,
    // which REPLACES the list: `GET /merchants` was answering with that one
    // name and hiding every rate-limit header from the browser. Both halves
    // are asserted together because the bug looked like the header working.
    expect(options.exposedHeaders).toContain('X-Total-Count');
    expect(options.exposedHeaders).toContain('X-RateLimit-Remaining');
  });

  it('answers the preflight itself with 204', () => {
    expect(options.preflightContinue).toBe(false);
    expect(options.optionsSuccessStatus).toBe(204);
  });
});

/** Minimal ServerResponse stand-in: helmet only sets and removes headers. */
function runHelmet(env: NodeJS.ProcessEnv): Record<string, string> {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (name: string, value: string | number) => {
      headers[name.toLowerCase()] = String(value);
    },
    removeHeader: (name: string) => {
      delete headers[name.toLowerCase()];
    },
    getHeader: (name: string) => headers[name.toLowerCase()],
  };

  let called = false;
  helmet(buildHelmetOptions(env))({} as never, res as never, () => {
    called = true;
  });
  expect(called).toBe(true);
  return headers;
}

describe('buildHelmetOptions — emitted headers', () => {
  const dev = runHelmet({} as NodeJS.ProcessEnv);

  it('sets a JSON-API content security policy', () => {
    expect(dev['content-security-policy']).toBe(
      "default-src 'none';frame-ancestors 'none';base-uri 'none';form-action 'none'",
    );
    // useDefaults:false, so nothing tuned for an HTML server leaks in.
    expect(dev['content-security-policy']).not.toContain('script-src');
  });

  it('stops content sniffing and framing', () => {
    expect(dev['x-content-type-options']).toBe('nosniff');
    expect(dev['x-frame-options']).toBe('DENY');
  });

  it('leaks no referrer', () => {
    expect(dev['referrer-policy']).toBe('no-referrer');
  });

  it('allows cross-origin reads, because that is what this API is for', () => {
    // Helmet's default is same-origin, which describes a deployment this
    // project does not have — the site and the API are different hosts.
    expect(dev['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('does not send the dead XSS filter header', () => {
    expect(dev['x-xss-protection']).toBeUndefined();
  });

  it('does not pin HSTS in development', () => {
    // Plain HTTP on :4000 locally. Pinning would bite anyone who fronts the
    // dev server with an HTTPS tunnel.
    expect(dev['strict-transport-security']).toBeUndefined();
  });

  it('pins HSTS in production, without preload', () => {
    const prod = runHelmet({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);
    expect(prod['strict-transport-security']).toBe('max-age=15552000; includeSubDomains');
    // preload is a one-way door on the client's own domain — their call.
    expect(prod['strict-transport-security']).not.toContain('preload');
  });

  it('treats a Vercel deploy with no NODE_ENV as production', () => {
    const prod = runHelmet({ VERCEL: '1' } as NodeJS.ProcessEnv);
    expect(prod['strict-transport-security']).toContain('max-age=15552000');
  });
});

/**
 * Expo web  (T51)
 *
 * The native app is deliberately absent from these tests, because it is
 * absent from the problem: Expo Go and a built binary send no Origin header,
 * CORS never engages, and `isOriginAllowed(undefined, ...)` is already true.
 * What DOES need an entry is Expo *web*, which is an ordinary browser origin.
 */
describe('CORS covers Expo web (T51)', () => {
  it.each([
    ['http://localhost:8081', 'Expo Metro web, SDK 49+'],
    ['http://localhost:19006', 'Expo webpack web, legacy'],
  ])('the dev fallback includes %s (%s)', (origin) => {
    expect(DEV_FALLBACK_ORIGINS).toContain(origin);
  });

  it('still includes the website dev server', () => {
    expect(DEV_FALLBACK_ORIGINS).toContain('http://localhost:3000');
  });

  it('allows an Expo web origin when the fallback is in use', () => {
    const { origins } = resolveAllowedOrigins({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);

    expect(isOriginAllowed('http://localhost:8081', origins)).toBe(true);
    expect(isOriginAllowed('http://localhost:19006', origins)).toBe(true);
  });

  it('allows a native request, which carries no Origin at all', () => {
    const { origins } = resolveAllowedOrigins({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);

    expect(isOriginAllowed(undefined, origins)).toBe(true);
  });

  it('does NOT hand Expo an exemption in production', () => {
    // The fallback is development-only. A deployed Expo web build has a real
    // origin and belongs in ALLOWED_ORIGINS like any other; baking localhost
    // into production would be an open door that looks like configuration.
    const { origins } = resolveAllowedOrigins({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://glowplusmember.com',
    } as NodeJS.ProcessEnv);

    expect(isOriginAllowed('http://localhost:8081', origins)).toBe(false);
    expect(isOriginAllowed('https://glowplusmember.com', origins)).toBe(true);
  });

  it('reads a comma-separated list with Expo entries in it', () => {
    const { origins } = resolveAllowedOrigins({
      ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:8081,http://localhost:19006',
    } as NodeJS.ProcessEnv);

    expect(origins).toHaveLength(3);
    expect(isOriginAllowed('http://localhost:8081', origins)).toBe(true);
  });
});
