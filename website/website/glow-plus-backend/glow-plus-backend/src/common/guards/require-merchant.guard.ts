import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthedRequest } from '../../middleware/auth.middleware';

/**
 * Requires the caller to be acting for a merchant  (T17)
 *
 * Every merchant-scoped controller reads `req.merchantId!`. That `!` is a
 * lie: `AuthMiddleware` only guarantees a *valid token*, not a *merchant*
 * token, so a consumer's token reaches the handler with `merchantId`
 * undefined. What happened next depended entirely on the query:
 *
 *   - `findUnique({ where: { id: undefined } })` — Prisma throws, so the
 *     caller saw a bare **500** instead of a 403. This is what
 *     `POST /billing/cancel` did, and it is the auth error T17 is about.
 *   - `findMany({ where: { merchantId: undefined } })` — Prisma silently
 *     DROPS the filter and returns **the whole table** [F29].
 *
 * So the same missing check is a confusing error on one route and a
 * cross-tenant read on another. Failing closed here, before the handler
 * runs, removes both outcomes at once.
 *
 * Applied to the billing routes by T17, the merchant booking routes by T18,
 * redemption history by T23, staff by T24 — and by **T29** to the last three
 * unguarded controllers: styles, visits and `GET /merchants/me`. Handlers now
 * type their request as `MerchantRequest` instead of asserting with `!`.
 */
@Injectable()
export class RequireMerchantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    const isMerchant = req.accountRole === 'merchant_owner' || req.accountRole === 'merchant_staff';
    if (!isMerchant) {
      throw new ForbiddenException('This action requires a merchant account');
    }

    // Belt and braces. A merchant role without a merchantId should be
    // impossible — merchant-auth.service always sets both — but if a token
    // ever carried one without the other, every downstream query would
    // silently widen to the whole table rather than fail. Refuse instead.
    if (!req.merchantId) {
      throw new ForbiddenException('No merchant context on this request');
    }

    // Same reasoning for the staff/owner account id — `visits.logVisit` writes
    // it to `Visit.loggedBy`, so an undefined here would be a null in the audit
    // trail rather than a refused request. Checking it is also what makes
    // `MerchantRequest.accountId` honest as a non-optional type (T29).
    if (!req.accountId) {
      throw new ForbiddenException('No account context on this request');
    }

    return true;
  }
}
