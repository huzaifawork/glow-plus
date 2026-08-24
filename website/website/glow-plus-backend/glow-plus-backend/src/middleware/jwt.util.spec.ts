/**
 * Tests for the JWT helper  (T9, rewritten for T30)
 *
 * T9 wrote these against a hand-rolled HS256 implementation. T30 replaced
 * that with the `jsonwebtoken` package, so the original round-trip and
 * tamper tests stay (the contract did not change) and a second block is
 * added below for the four defects the hand-rolled version actually had.
 *
 * Those four are the point of this file now. Each one is written as a token
 * that the OLD implementation accepted with HTTP 200 against the running
 * API — so if anyone ever swaps the library back out for something
 * hand-rolled, these fail rather than the regression being invisible.
 *
 * Related: T47 (refresh tokens). The expiry test documents the current
 * fixed-7-day behaviour so that change is visible when it happens.
 */
import { createHmac } from 'crypto';
import {
  sign,
  verify,
  JWT_ISSUER,
  JWT_AUDIENCE,
  ACCESS_TOKEN_TTL_SECONDS,
} from './jwt.util';

// jest.setup.ts supplies JWT_SECRET; jwt.util reads it at import time.
const SECRET = process.env.JWT_SECRET as string;

const b64 = (input: string) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Mints a token exactly the way the pre-T30 hand-rolled code did: HMAC-SHA256
 * over `header.payload`, no claim validation of any kind. Every token this
 * produces is CORRECTLY SIGNED — which is what makes the tests below about
 * claim handling rather than about signature checking.
 */
const mintLegacy = (payload: Record<string, unknown>, header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }) => {
  const h = b64(JSON.stringify(header));
  const p = b64(JSON.stringify(payload));
  const sig = Buffer.from(createHmac('sha256', SECRET).update(`${h}.${p}`).digest())
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${h}.${p}.${sig}`;
};

describe('jwt.util', () => {
  const payload = { sub: 'user_123', role: 'consumer' as const };

  it('round-trips a payload through sign() and verify()', () => {
    const decoded = verify(sign(payload));

    expect(decoded.sub).toBe('user_123');
    expect(decoded.role).toBe('consumer');
    expect(typeof decoded.exp).toBe('number');
  });

  it('preserves merchantId, which merchant-scoped routes depend on', () => {
    const decoded = verify(sign({ sub: 'm_1', role: 'merchant_owner', merchantId: 'merch_42' }));

    expect(decoded.merchantId).toBe('merch_42');
    expect(decoded.role).toBe('merchant_owner');
  });

  it('omits merchantId entirely for a consumer rather than emitting null', () => {
    // [F29]'s root cause was an undefined merchantId reaching a Prisma filter.
    // The claim should be absent, not present-and-empty.
    const decoded = verify(sign(payload));

    expect(decoded.merchantId).toBeUndefined();
  });

  it('defaults to a 7-day expiry', () => {
    const decoded = verify(sign(payload));
    const delta = decoded.exp - Math.floor(Date.now() / 1000);

    // Allow a couple of seconds of execution slack.
    expect(delta).toBeGreaterThan(ACCESS_TOKEN_TTL_SECONDS - 5);
    expect(delta).toBeLessThanOrEqual(ACCESS_TOKEN_TTL_SECONDS);
  });

  it('rejects an expired token', () => {
    // Past clockTolerance (5s), or this is accepted as skew.
    expect(() => verify(sign(payload, -60))).toThrow('Token expired');
  });

  it('rejects a token whose payload has been tampered with', () => {
    const [header, , signature] = sign(payload).split('.');
    const forged = b64(JSON.stringify({ sub: 'attacker', role: 'admin', exp: 9_999_999_999 }));

    expect(() => verify(`${header}.${forged}.${signature}`)).toThrow('Invalid token signature');
  });

  it('rejects a token signed with a different secret', () => {
    const other = mintLegacy({
      sub: 'attacker',
      role: 'admin',
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    // Re-sign the same header/payload with a wrong key.
    const [h, p] = other.split('.');
    const badSig = Buffer.from(createHmac('sha256', 'not-the-secret-at-all-not-even-close').update(`${h}.${p}`).digest())
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(() => verify(`${h}.${p}.${badSig}`)).toThrow('Invalid token signature');
  });

  it.each([
    ['empty string', ''],
    ['two segments', 'aaa.bbb'],
    ['not a token at all', 'garbage'],
  ])('rejects a malformed token (%s)', (_label, token) => {
    expect(() => verify(token)).toThrow('Malformed token');
  });

  describe('claims the token now carries (T30)', () => {
    it('issues iat, jti, iss and aud', () => {
      const decoded = verify(sign(payload));

      expect(typeof decoded.iat).toBe('number');
      // jti is the hook T47 needs for revocation. Nothing checks it against a
      // store yet, but it must be present and unique per token.
      expect(decoded.jti).toMatch(/^[0-9a-f-]{36}$/);
      expect(verify(sign(payload)).jti).not.toBe(decoded.jti);
    });

    it('puts iss and aud on the wire', () => {
      const raw = JSON.parse(Buffer.from(sign(payload).split('.')[1], 'base64').toString('utf8'));

      expect(raw.iss).toBe(JWT_ISSUER);
      expect(raw.aud).toBe(JWT_AUDIENCE);
    });
  });

  /**
   * Each of these was accepted by the pre-T30 implementation, verified live
   * against the running API (HTTP 200 on GET /bookings/me). They are all
   * CORRECTLY SIGNED, so nothing here is a signature test.
   */
  describe('defects the hand-rolled implementation had (T30)', () => {
    const now = () => Math.floor(Date.now() / 1000);
    const base = { sub: 'user_123', role: 'consumer', iss: JWT_ISSUER, aud: JWT_AUDIENCE, iat: now() };

    it('rejects a signed token with NO exp claim (was: valid forever)', () => {
      // Old check: `if (payload.exp < now)`. `undefined < number` is false.
      expect(() => verify(mintLegacy(base))).toThrow();
    });

    it.each([
      ['a string', '9999999999'],
      ['non-numeric', 'never'],
      ['null', null],
    ])('rejects a signed token whose exp is %s (was: valid forever)', (_label, exp) => {
      // Old check coerced: `'never' < n` and `NaN < n` are both false.
      expect(() => verify(mintLegacy({ ...base, exp }))).toThrow();
    });

    it.each([4, 5, 6])('rejects a %i-segment token (was: extra segments ignored)', (segments) => {
      // Old code did `const [h, p, s] = token.split('.')` and dropped the rest,
      // so `<valid-token>.garbage` authenticated.
      const token = [sign(payload), ...Array(segments - 3).fill('x')].join('.');

      expect(token.split('.')).toHaveLength(segments);
      expect(() => verify(token)).toThrow('Malformed token');
    });

    it('rejects a token minted for a different audience with the same secret', () => {
      // The hand-rolled version had no iss/aud at all, so any service sharing
      // this secret produced tokens this API honoured.
      const foreign = mintLegacy({ ...base, aud: 'some-other-service', exp: now() + 600 });

      expect(() => verify(foreign)).toThrow();
    });

    it('rejects a token with no iss/aud at all — i.e. a pre-T30 token', () => {
      const legacy = mintLegacy({ sub: 'user_123', role: 'consumer', exp: now() + 600 });

      expect(() => verify(legacy)).toThrow();
    });

    it('rejects an alg:none forgery', () => {
      // The old code was safe from this by accident (it never read the header)
      // and this asserts the library is safe from it on purpose.
      const header = b64(JSON.stringify({ alg: 'none', typ: 'JWT' }));
      const body = b64(JSON.stringify({ ...base, role: 'admin', exp: now() + 600 }));

      expect(() => verify(`${header}.${body}.`)).toThrow();
    });

    it('rejects an unknown role, which no guard would have matched', () => {
      const weird = mintLegacy({ ...base, role: 'superuser', exp: now() + 600 });

      expect(() => verify(weird)).toThrow('Malformed token');
    });
  });
});
