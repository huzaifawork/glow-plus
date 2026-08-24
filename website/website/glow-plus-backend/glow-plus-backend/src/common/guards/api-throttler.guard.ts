import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerLimitDetail } from '@nestjs/throttler/dist/throttler.guard.interface';

/**
 * The global rate limiter  (T26) [F3]
 *
 * Everything about *what* is limited lives in `common/throttling.ts`. This
 * subclass exists for one reason: the standard `Retry-After` header.
 *
 * @nestjs/throttler suffixes its headers with the tier name for every tier
 * except the one called `default`, so a refusal from the `global` or
 * `identity` tier ships `Retry-After-global` / `Retry-After-identity` — real
 * information in a header no HTTP client, SDK or browser has ever read. The
 * caller then sees a bare 429 with no idea when to come back and, in practice,
 * retries immediately, which is the behaviour the limiter exists to prevent.
 *
 * So: whichever tier fires, also set the plain, spec'd `Retry-After` (RFC 9110
 * §10.2.3 — delta-seconds), rounding up so a sub-second remainder never
 * becomes a `Retry-After: 0` that invites an instant retry.
 */
@Injectable()
export class ApiThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);
    const seconds = Math.max(1, Math.ceil((detail.timeToBlockExpire ?? detail.timeToExpire ?? 0) || 1));
    res.header('Retry-After', String(seconds));

    return super.throwThrottlingException(context, detail);
  }
}
