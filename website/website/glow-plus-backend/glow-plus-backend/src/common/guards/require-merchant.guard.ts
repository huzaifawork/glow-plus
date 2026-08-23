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
 * Applied to the billing routes by T17. The remaining merchant controllers
 * are T29's authorization audit — the guard is written to be reused as-is.
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

    return true;
  }
}
