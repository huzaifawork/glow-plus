import { randomUUID } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import * as jsonwebtoken from 'jsonwebtoken';
import { AccountRole } from './auth.middleware';

/**
 * JWT (HS256) on top of the `jsonwebtoken` package  (T30, closing [F12])
 *
 * This file used to be a hand-rolled HS256 implementation — ~40 lines of
 * `createHmac` and base64url string surgery, carrying a comment that said
 * "swap for the jsonwebtoken package in a real deployment". This is that
 * swap, and it was not cosmetic: probing the old code against the running
 * API found four live defects, three of which let a *signed* token bypass
 * expiry entirely.
 *
 *   1. A token with NO `exp` claim never expired. The check was
 *      `if (payload.exp < now)`, and `undefined < number` is `false`, so an
 *      absent claim silently meant "valid forever". Confirmed live: 200.
 *   2. A token with a NON-NUMERIC `exp` never expired either — `'abc' < n`
 *      and `NaN < n` are both `false`. Same 200.
 *   3. A 4-, 5- or 6-segment string was accepted as a JWT. `token.split('.')`
 *      destructured the first three parts and ignored the rest, so
 *      `<valid-token>.garbage` authenticated. RFC 7519 requires exactly three.
 *   4. The signature was compared with `!==` — a non-constant-time compare
 *      on a secret-derived value.
 *
 * None of 1–3 is exploitable by an outsider today, because all three still
 * require the ability to SIGN. They matter because the next task to touch
 * this file is T47 (refresh tokens), which will call `sign()` for a second
 * kind of token — and "forgot to pass an expiry" would have produced an
 * immortal refresh token with no error raised anywhere. That is the specific
 * reason to stop hand-rolling this now rather than after T47.
 *
 * What the library gives us that the hand-rolled version could not:
 *   - `algorithms: ['HS256']` pinned at verify time. The old code was safe
 *     from alg-confusion only by accident: it always ran HMAC-SHA256 and
 *     never read the header at all (verified — an `alg:none` forgery was
 *     refused). Anything later that reads the header reintroduces the hole.
 *   - `exp` parsed and range-checked as a number, not `<`-compared as `any`.
 *   - Strict three-segment parsing.
 *   - `iss` / `aud` VERIFIED rather than merely present, so a token minted by
 *     another service that happens to share this secret is refused here.
 *   - `iat` and `jti` on every token: the hooks T47 needs for revocation and
 *     for "invalidate sessions issued before the password changed". Nothing
 *     checks `jti` against a store yet — issuing it now is what makes adding
 *     that store a one-file change instead of a forced re-login for everyone.
 *
 * ⚠ Tokens issued before T30 carry no `iss`/`aud` and are refused. That is a
 * one-time forced re-login, and it is deliberate: accepting claim-less legacy
 * tokens for a grace period would mean shipping the check switched off. The
 * API has never been deployed, so the only holders are dev browsers.
 */

export const JWT_ISSUER = 'glow-plus-api';
export const JWT_AUDIENCE = 'glow-plus-app';
export const JWT_ALGORITHM = 'HS256' as const;
/**
 * T47 shortened this from **7 days to 15 minutes**, and that is the whole
 * point of the task rather than a detail of it.
 *
 * A 7-day access token with no refresh mechanism was the worst of both: it
 * could not be revoked (nothing consults a store on the way in — see the
 * `jti` note above), so a token that leaked stayed usable for a week, and
 * yet the user was still logged out abruptly at the end of it. Fifteen
 * minutes is short enough that a leaked access token is a small window, and
 * the refresh token behind it (RefreshTokenService) is the half that IS
 * revocable and that keeps the session alive across it.
 *
 * ⚠ Order 2: the React Native app does not refresh yet — `client.js` stores
 * `result.token` and nothing else. Login now also returns `refreshToken` and
 * `expiresIn`, so that is app-side work, not backend rework, which is exactly
 * why T47 lands before deployment rather than after.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes

/**
 * 30 days. Long enough that a customer checking their points once a month
 * stays signed in; short enough to bound a stolen refresh token that is never
 * used (a used one is rotated, and a replayed one kills its whole family).
 */
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface TokenPayload {
  sub: string;
  role: AccountRole;
  merchantId?: string;
  exp: number;
  iat: number;
  jti: string;
}

const ROLES: readonly AccountRole[] = ['consumer', 'merchant_staff', 'merchant_owner', 'admin'];

/**
 * No `?? 'dev-secret-change-me'` fallback here any more (T27).
 *
 * That default was [F20] with the safety off: if JWT_SECRET were ever unset,
 * the API would boot happily and sign every token — including `role:'admin'`
 * — with a constant string published in this repository. The same class of
 * mistake was already proven exploitable once, when JWT_SECRET held the
 * `.env.example` placeholder and a hand-forged admin token was accepted.
 *
 * config/env.validation.ts refuses to start without a real, >=32-char secret,
 * so reaching this line without one is impossible in the app. The throw
 * covers the remaining path — a script or test importing this module
 * directly — and fails loudly instead of silently signing with a known key.
 */
const SECRET = requireSecret();

function requireSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Tokens cannot be signed or verified without it.');
  }
  return secret;
}

export function sign(
  payload: Pick<TokenPayload, 'sub' | 'role' | 'merchantId'>,
  expiresInSeconds = ACCESS_TOKEN_TTL_SECONDS,
): string {
  // `sub`, `iss`, `aud`, `exp`, `iat` and `jti` go through jsonwebtoken's own
  // options rather than the payload object, so the library owns their format
  // and no call site can hand-roll a malformed one. Only the two
  // app-specific claims travel in the payload.
  return jsonwebtoken.sign(
    { role: payload.role, ...(payload.merchantId ? { merchantId: payload.merchantId } : {}) },
    SECRET,
    {
      algorithm: JWT_ALGORITHM,
      subject: payload.sub,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: expiresInSeconds,
      jwtid: randomUUID(),
    },
  );
}

export function verify(token: string): TokenPayload {
  let decoded: jsonwebtoken.JwtPayload;

  try {
    decoded = jsonwebtoken.verify(token, SECRET, {
      // Pinned. Without this, jsonwebtoken infers the algorithm from the
      // token's own header — the classic confusion attack.
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      clockTolerance: 5, // seconds, for skew between serverless instances
    }) as jsonwebtoken.JwtPayload;
  } catch (err) {
    throw toUnauthorized(err);
  }

  // The library guarantees the registered claims are well-formed; it knows
  // nothing about ours. An unknown `role` reaching req.accountRole would be
  // compared against by every guard and match none of them — better to
  // refuse it once here than to have four guards each fail differently.
  // `exp`/`iat` are asserted numeric so defects 1 and 2 above cannot return
  // even if a future option change makes them optional again.
  if (typeof decoded.sub !== 'string' || !decoded.sub) {
    throw new UnauthorizedException('Malformed token');
  }
  if (typeof decoded.role !== 'string' || !ROLES.includes(decoded.role as AccountRole)) {
    throw new UnauthorizedException('Malformed token');
  }
  if (typeof decoded.exp !== 'number' || typeof decoded.iat !== 'number') {
    throw new UnauthorizedException('Malformed token');
  }
  if (decoded.merchantId !== undefined && typeof decoded.merchantId !== 'string') {
    throw new UnauthorizedException('Malformed token');
  }

  return {
    sub: decoded.sub,
    role: decoded.role as AccountRole,
    merchantId: decoded.merchantId as string | undefined,
    exp: decoded.exp,
    iat: decoded.iat,
    jti: typeof decoded.jti === 'string' ? decoded.jti : '',
  };
}

/**
 * Map the library's error classes onto the messages this API already
 * returned, so nothing downstream of AuthMiddleware sees a behaviour change.
 *
 * Everything here is a 401 with a short, non-specific reason. The library's
 * own strings ("jwt audience invalid. expected: glow-plus-app") describe our
 * configuration, and there is no reason to hand that to an unauthenticated
 * caller — the same principle as [F31] applied to error text instead of
 * response bodies.
 */
function toUnauthorized(err: unknown): UnauthorizedException {
  if (err instanceof jsonwebtoken.TokenExpiredError) {
    return new UnauthorizedException('Token expired');
  }
  if (err instanceof jsonwebtoken.NotBeforeError) {
    return new UnauthorizedException('Token not yet valid');
  }
  if (err instanceof jsonwebtoken.JsonWebTokenError) {
    // `invalid signature` is the one case worth naming: it is the difference
    // between "your token is stale" and "your token was tampered with", and
    // the old implementation already reported it.
    if (err.message === 'invalid signature') {
      return new UnauthorizedException('Invalid token signature');
    }
    return new UnauthorizedException('Malformed token');
  }
  return new UnauthorizedException('Malformed token');
}
