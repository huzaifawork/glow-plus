/**
 * Tests for AuthMiddleware — auth is token-only  (T46)
 *
 * Phase 7 exists so the React Native app of Order 2 connects with zero
 * backend rework. The single most expensive thing to get wrong is *how* a
 * credential reaches the API: a native client has no cookie jar, so a backend
 * that authenticates by cookie cannot be talked to at all, and one that
 * accepts a cookie *as well* has a second credential channel to keep in sync
 * — and to get wrong.
 *
 * So these tests do not merely assert that `Authorization: Bearer` works.
 * They assert that **nothing else does**: not a cookie holding a perfectly
 * valid token, not a query parameter, not another scheme, not another header.
 * Each negative case below is written with a token that is genuinely valid,
 * so a failure means the credential channel widened, not that the token was
 * bad.
 *
 * The case-insensitivity block is a regression guard. Until T46 the check was
 * `header.startsWith('Bearer ')`, and RFC 7235 §2.1 makes the scheme name
 * case-insensitive — so a spec-compliant client or an intermediary that
 * normalised the header was 401'd by a backend the app side is not allowed to
 * change. It was found by replaying the header in the case a client may
 * legitimately send it, not by reading the code.
 */
import { UnauthorizedException } from '@nestjs/common';
import type { Response, NextFunction } from 'express';
import { AuthMiddleware, AuthedRequest } from './auth.middleware';
import { sign } from './jwt.util';

const CONSUMER = { sub: 'user_1', role: 'consumer' as const };
const MERCHANT = { sub: 'm_1', role: 'merchant_owner' as const, merchantId: 'm_1' };

/** A request carrying whatever headers/query the case is about, and nothing else. */
const reqWith = (headers: Record<string, string>, query: Record<string, string> = {}) =>
  ({ headers, query } as unknown as AuthedRequest);

describe('AuthMiddleware (T46 — token-only auth)', () => {
  let mw: AuthMiddleware;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    mw = new AuthMiddleware();
    // A real Express Response would have .cookie() — this one records any
    // attempt to use it, so "the middleware never issues a cookie" is a test
    // and not a comment.
    res = { cookie: jest.fn(), setHeader: jest.fn() } as unknown as Response;
    next = jest.fn();
  });

  describe('accepts Authorization: Bearer', () => {
    it('passes a valid token through and copies the claims onto the request', () => {
      const req = reqWith({ authorization: `Bearer ${sign(CONSUMER)}` });

      mw.use(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.accountId).toBe('user_1');
      expect(req.accountRole).toBe('consumer');
      expect(req.merchantId).toBeUndefined();
    });

    it('carries merchantId through for a merchant token', () => {
      const req = reqWith({ authorization: `Bearer ${sign(MERCHANT)}` });

      mw.use(req, res, next);

      expect(req.merchantId).toBe('m_1');
      expect(req.accountRole).toBe('merchant_owner');
    });

    it('never sets a cookie on the way through', () => {
      mw.use(reqWith({ authorization: `Bearer ${sign(CONSUMER)}` }), res, next);

      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.setHeader).not.toHaveBeenCalledWith(
        expect.stringMatching(/set-cookie/i),
        expect.anything(),
      );
    });
  });

  // RFC 7235 §2.1 — "the scheme name is case-insensitive". `startsWith` was not.
  describe('matches the scheme case-insensitively (regression, T46)', () => {
    it.each(['Bearer', 'bearer', 'BEARER', 'BeArEr'])('accepts %s', (scheme) => {
      const req = reqWith({ authorization: `${scheme} ${sign(CONSUMER)}` });

      mw.use(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.accountId).toBe('user_1');
    });

    it('tolerates extra spacing around the token', () => {
      const req = reqWith({ authorization: `Bearer   ${sign(CONSUMER)}  ` });

      mw.use(req, res, next);

      expect(req.accountId).toBe('user_1');
    });
  });

  describe('refuses every credential channel that is not the bearer header', () => {
    // Each of these carries a VALID token. If one ever returns 200, the API
    // has grown a second way in.
    const token = () => sign(CONSUMER);

    it.each([
      ['token', 'cookie'],
      ['jwt', 'cookie'],
      ['session', 'cookie'],
      ['access_token', 'cookie'],
      ['connect.sid', 'cookie'],
    ])('rejects a valid token in the %s cookie', (name) => {
      const req = reqWith({ cookie: `${name}=${token()}` });

      expect(() => mw.use(req, res, next)).toThrow(UnauthorizedException);
      expect(next).not.toHaveBeenCalled();
      expect(req.accountId).toBeUndefined();
    });

    it('rejects a valid token in the query string', () => {
      const req = reqWith({}, { token: token(), access_token: token() });

      expect(() => mw.use(req, res, next)).toThrow(UnauthorizedException);
      expect(next).not.toHaveBeenCalled();
    });

    it.each([
      ['X-Auth-Token', 'a second custom header'],
      ['x-access-token', 'a second custom header'],
    ])('rejects a valid token in %s', (header) => {
      const req = reqWith({ [header.toLowerCase()]: token() });

      expect(() => mw.use(req, res, next)).toThrow(UnauthorizedException);
    });

    it.each([
      ['Basic dXNlcjpwYXNz', 'Basic auth'],
      ['Token abc.def.ghi', 'a Token scheme'],
      ['Bearer', 'the scheme with no token'],
      ['Bearer ', 'the scheme with an empty token'],
      ['', 'an empty header'],
    ])('rejects Authorization: %s', (value) => {
      expect(() => mw.use(reqWith({ authorization: value }), res, next)).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a bare token with no scheme at all', () => {
      expect(() => mw.use(reqWith({ authorization: token() }), res, next)).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a request carrying no credential', () => {
      expect(() => mw.use(reqWith({}), res, next)).toThrow(UnauthorizedException);
    });

    it('says "bearer" in the message, so the client is told which channel to use', () => {
      expect(() => mw.use(reqWith({}), res, next)).toThrow(/bearer/i);
    });
  });

  describe('still rejects a bad token presented the right way', () => {
    it.each([
      ['a tampered signature', `${sign(CONSUMER)}tampered`],
      ['a non-token string', 'not-a-jwt'],
    ])('rejects %s', (_label, value) => {
      expect(() => mw.use(reqWith({ authorization: `Bearer ${value}` }), res, next)).toThrow();
      expect(next).not.toHaveBeenCalled();
    });
  });
});
