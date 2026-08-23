/**
 * Tests for the hand-rolled HS256 JWT helper  (T9)
 *
 * This is the first test in the project — Jest was a dependency with no
 * config and no specs. jwt.util is a deliberate first target: every
 * authenticated route depends on it, and it's pure (no DB, no network), so
 * it runs fast and can't flake.
 *
 * Related: T30 (consider replacing with `jsonwebtoken`) and T47 (refresh
 * tokens). The expiry test below documents the current fixed-7-day behaviour
 * so that change is visible when it happens.
 */
import { sign, verify } from './jwt.util';

describe('jwt.util', () => {
  const payload = { sub: 'user_123', role: 'consumer' as const };

  it('round-trips a payload through sign() and verify()', () => {
    const decoded = verify(sign(payload));

    expect(decoded.sub).toBe('user_123');
    expect(decoded.role).toBe('consumer');
    expect(typeof decoded.exp).toBe('number');
  });

  it('preserves merchantId, which merchant-scoped routes depend on', () => {
    const decoded = verify(
      sign({ sub: 'm_1', role: 'merchant_owner', merchantId: 'merch_42' }),
    );

    expect(decoded.merchantId).toBe('merch_42');
    expect(decoded.role).toBe('merchant_owner');
  });

  it('defaults to a 7-day expiry', () => {
    const decoded = verify(sign(payload));
    const sevenDays = 60 * 60 * 24 * 7;
    const delta = decoded.exp - Math.floor(Date.now() / 1000);

    // Allow a couple of seconds of execution slack.
    expect(delta).toBeGreaterThan(sevenDays - 5);
    expect(delta).toBeLessThanOrEqual(sevenDays);
  });

  it('rejects an expired token', () => {
    const expired = sign(payload, -1);

    expect(() => verify(expired)).toThrow('Token expired');
  });

  it('rejects a token whose payload has been tampered with', () => {
    const [header, , signature] = sign(payload).split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'attacker', role: 'admin', exp: 9_999_999_999 }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(() => verify(`${header}.${forged}.${signature}`)).toThrow('Invalid token signature');
  });

  it.each([
    ['empty string', ''],
    ['two segments', 'aaa.bbb'],
    ['not a token at all', 'garbage'],
  ])('rejects a malformed token (%s)', (_label, token) => {
    expect(() => verify(token)).toThrow('Malformed token');
  });
});
