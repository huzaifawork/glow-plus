import { HttpException, HttpStatus, Injectable, NestMiddleware } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import { InjectThrottlerStorage, ThrottlerStorage } from '@nestjs/throttler';
import { Request } from 'express';

import { THROTTLE_DEFAULTS, THROTTLE_MESSAGE, clientIp, isExemptPath, requestPath } from '../common/throttling';

/**
 * The API-wide per-IP ceiling  (T26) [F3]
 *
 * This is middleware and not part of the ThrottlerGuard for one reason,
 * discovered by testing rather than by reading: **in Nest, middleware always
 * runs before guards**, and `AuthMiddleware` throws 401 on any request without
 * a valid bearer token. So a guard-based limiter never sees an unauthenticated
 * request to a protected route — every one of those endpoints could still be
 * flooded for free, and the limiter's own headers were absent from the 401,
 * which is how this surfaced. Verified before the fix: `GET /merchants/public`
 * (excluded from AuthMiddleware) returned X-RateLimit-* headers; `GET /styles`
 * returned a bare 401 with none.
 *
 * Registered ahead of AuthMiddleware, this counts the request first, so a
 * flood of anonymous junk is refused before the API spends anything on it —
 * including the JWT verification AuthMiddleware would otherwise do per request.
 *
 * It owns the `global` tier **exclusively** — that tier is deliberately absent
 * from the guard's list in throttling.ts, or every authenticated request would
 * be counted twice and the real limit would silently be half the configured
 * one. The other two tiers stay in the guard, where they can read the
 * per-route @Throttle metadata that makes them useful.
 *
 * Both share the ThrottlerModule's storage service, so this is genuinely one
 * bucket and swapping in Redis for the multi-instance case (T53) still fixes
 * everything at once.
 */
@Injectable()
export class GlobalRateLimitMiddleware implements NestMiddleware {
  constructor(@InjectThrottlerStorage() private readonly storage: ThrottlerStorage) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Same exemptions as the guard, for the same reasons (Stripe retries
    // harder on a 429; a throttled health probe reads as an outage; a counted
    // CORS preflight halves every real limit for browser clients).
    if (req.method === 'OPTIONS' || isExemptPath(requestPath(req))) {
      return next();
    }

    const { ttl, limit } = THROTTLE_DEFAULTS.global;
    const key = `global-${clientIp(req)}`;

    const { totalHits, timeToExpire, isBlocked, timeToBlockExpire } = await this.storage.increment(
      key,
      ttl,
      limit,
      ttl,
      'global',
    );

    if (isBlocked) {
      // Retry-After twice, on purpose: the suffixed name matches what
      // @nestjs/throttler emits for a named tier so the two halves of the
      // limiter look the same in a network log, and the bare one is the
      // RFC 9110 header that clients actually honour. Ceil, so a sub-second
      // remainder never becomes `Retry-After: 0` and invites an instant retry.
      const seconds = Math.max(1, Math.ceil(timeToBlockExpire || timeToExpire || 1));
      res.header('Retry-After-global', String(timeToBlockExpire));
      res.header('Retry-After', String(seconds));
      throw new HttpException(THROTTLE_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }

    res.header('X-RateLimit-Limit-global', String(limit));
    res.header('X-RateLimit-Remaining-global', String(Math.max(0, limit - totalHits)));
    res.header('X-RateLimit-Reset-global', String(timeToExpire));

    next();
  }
}
