import { ExecutionContext } from '@nestjs/common';
import {
  THROTTLE_DEFAULTS,
  bodyEmail,
  clientIp,
  isExemptPath,
  requestPath,
  throttlerOptions,
} from './throttling';

/**
 * T26 [F3] — unit cover for the decisions the limiter makes about *who* a
 * caller is and *when* it stands aside. Those are the parts that fail
 * silently: a limiter that keys every request differently, or skips every
 * route, still returns 200 forever and looks like it is working. The
 * counting itself is @nestjs/throttler's and is exercised live instead.
 */

function ctxFor(req: Record<string, any>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
}

// ThrottlerModuleOptions is a union (bare array | object form); we always
// build the object form, so narrow once here rather than at every use.
const options = throttlerOptions as Exclude<typeof throttlerOptions, any[]>;
const named = (name: string) => (options.throttlers as any[]).find((t) => t.name === name)!;

describe('clientIp', () => {
  const original = process.env.TRUST_PROXY_HEADER;
  afterEach(() => {
    if (original === undefined) delete process.env.TRUST_PROXY_HEADER;
    else process.env.TRUST_PROXY_HEADER = original;
  });

  it('ignores a spoofable X-Forwarded-For when the proxy is not trusted', () => {
    process.env.TRUST_PROXY_HEADER = '0';
    const req = { ip: '10.0.0.1', headers: { 'x-forwarded-for': '9.9.9.9' } };
    // The whole point: an attacker rotating this header must NOT get a new
    // bucket per request.
    expect(clientIp(req)).toBe('10.0.0.1');
  });

  it('uses the leftmost forwarded address when the proxy IS trusted', () => {
    process.env.TRUST_PROXY_HEADER = '1';
    const req = { ip: '10.0.0.1', headers: { 'x-forwarded-for': ' 203.0.113.7 , 70.41.3.18' } };
    expect(clientIp(req)).toBe('203.0.113.7');
  });

  it('falls back to the socket address, then to a constant, rather than undefined', () => {
    process.env.TRUST_PROXY_HEADER = '0';
    expect(clientIp({ socket: { remoteAddress: '172.16.0.5' }, headers: {} })).toBe('172.16.0.5');
    // undefined here would make every anonymous caller share one key by
    // accident — right answer for the wrong reason. Be explicit.
    expect(clientIp({ headers: {} })).toBe('unknown');
  });

  it('does not fall back to a trusted-but-absent header', () => {
    process.env.TRUST_PROXY_HEADER = '1';
    expect(clientIp({ ip: '10.0.0.1', headers: {} })).toBe('10.0.0.1');
  });
});

describe('bodyEmail', () => {
  it('normalises case and whitespace so one account is one bucket', () => {
    expect(bodyEmail({ body: { email: '  Bob@Example.COM ' } })).toBe('bob@example.com');
  });

  it('returns undefined when there is no usable email', () => {
    expect(bodyEmail({ body: {} })).toBeUndefined();
    expect(bodyEmail({ body: { email: '   ' } })).toBeUndefined();
    expect(bodyEmail({ body: { email: 42 } })).toBeUndefined();
    expect(bodyEmail({})).toBeUndefined();
  });
});

describe('isExemptPath', () => {
  it('exempts the Stripe webhook and the health probes', () => {
    expect(isExemptPath('/billing/webhook')).toBe(true);
    expect(isExemptPath('/health')).toBe(true);
    expect(isExemptPath('/health/ready')).toBe(true);
  });

  it('exempts nothing else — including near-misses', () => {
    expect(isExemptPath('/billing/checkout')).toBe(false);
    expect(isExemptPath('/auth/login')).toBe(false);
    expect(isExemptPath('/healthcheck')).toBe(false);
    expect(isExemptPath('/admin/health')).toBe(false);
  });
});

describe('requestPath', () => {
  it('uses originalUrl, because Nest wildcard middleware leaves req.url rewritten to "/"', () => {
    // Exactly the live failure this exists for: Express strips the matched
    // mount prefix, so inside `forRoutes('*')` middleware req.url/req.path is
    // "/" and every exemption missed while the unit tests stayed green.
    expect(requestPath({ originalUrl: '/health', url: '/', path: '/' })).toBe('/health');
    expect(isExemptPath(requestPath({ originalUrl: '/billing/webhook', url: '/', path: '/' }))).toBe(true);
  });

  it('drops the query string so an exempt path is still recognised with params', () => {
    expect(requestPath({ originalUrl: '/health/ready?probe=1' })).toBe('/health/ready');
    expect(isExemptPath(requestPath({ originalUrl: '/health/ready?probe=1' }))).toBe(true);
  });

  it('falls back to url then path when originalUrl is absent', () => {
    expect(requestPath({ url: '/auth/login' })).toBe('/auth/login');
    expect(requestPath({ path: '/auth/login' })).toBe('/auth/login');
    expect(requestPath({})).toBe('');
  });
});

describe('throttler tiers', () => {
  it('defines exactly the guard-side tiers, each with a limit and a window', () => {
    const names = (options.throttlers as any[]).map((t) => t.name);
    // `global` is deliberately absent: middleware/globalRateLimit.middleware.ts
    // owns it, because guards run after AuthMiddleware's 401 and would never
    // see an anonymous request to a protected route. Listing it here too would
    // double-count every authenticated request.
    expect(names).toEqual(['default', 'identity']);
    for (const t of options.throttlers as any[]) {
      expect(t.limit).toBeGreaterThan(0);
      expect(t.ttl).toBeGreaterThan(0);
    }
  });

  it('gives the global tier a real limit and window for the middleware to use', () => {
    expect(THROTTLE_DEFAULTS.global.limit).toBeGreaterThan(THROTTLE_DEFAULTS.default.limit);
    expect(THROTTLE_DEFAULTS.global.ttl).toBeGreaterThan(0);
  });

  it('tracks the identity tier by body email and the IP tiers by IP', () => {
    process.env.TRUST_PROXY_HEADER = '0';
    const req = { ip: '10.0.0.1', headers: {}, body: { email: 'Victim@X.com' } };
    expect(named('identity').getTracker(req, ctxFor(req))).toBe('victim@x.com');
    expect(named('default').getTracker(req, ctxFor(req))).toBe('10.0.0.1');
    // The middleware keys the global tier off the same helper.
    expect(clientIp(req)).toBe('10.0.0.1');
  });

  it('skips CORS preflight and exempt paths on every tier', () => {
    const preflight = ctxFor({ method: 'OPTIONS', originalUrl: '/auth/login', url: '/', body: {} });
    const webhook = ctxFor({ method: 'POST', originalUrl: '/billing/webhook', url: '/', body: {} });
    expect(options.skipIf!(preflight)).toBe(true);
    expect(options.skipIf!(webhook)).toBe(true);
    // The identity tier replaces the common skipIf rather than adding to it,
    // so it has to re-check the exemptions itself or the webhook loses them.
    expect(named('identity').skipIf(webhook)).toBe(true);
    expect(named('identity').skipIf(preflight)).toBe(true);
  });

  it('skips the identity tier when the body names no account, and applies it when it does', () => {
    expect(named('identity').skipIf(ctxFor({ method: 'GET', originalUrl: '/styles', body: {} }))).toBe(true);
    expect(
      named('identity').skipIf(ctxFor({ method: 'POST', originalUrl: '/auth/login', body: { email: 'a@b.c' } })),
    ).toBe(false);
  });

  it('does not skip an ordinary request', () => {
    const req = ctxFor({ method: 'POST', originalUrl: '/auth/login', body: { email: 'a@b.c' } });
    expect(options.skipIf!(req)).toBe(false);
  });

  it('lets the per-email tier bite long before the per-IP one, so NAT does not lock a salon out', () => {
    // Documented intent, asserted: the shared-office IP gets more headroom
    // than any single account does.
    expect(THROTTLE_DEFAULTS.default.limit).toBeGreaterThan(THROTTLE_DEFAULTS.identity.limit);
  });
});
