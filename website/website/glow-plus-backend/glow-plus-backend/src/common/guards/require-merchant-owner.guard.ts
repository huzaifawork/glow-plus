import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthedRequest } from '../../middleware/auth.middleware';

/**
 * Requires the caller to be the merchant OWNER, not merely staff  (T24)
 *
 * `RequireMerchantGuard` (T17) answers "is this request acting for a
 * merchant at all?" — it accepts `merchant_owner` and `merchant_staff`
 * alike, because until T24 there were no staff tokens for it to tell
 * apart. [F6] The `MerchantStaff` table existed with an `OWNER`/`STAFF`
 * enum and nothing ever read it.
 *
 * This guard is the narrower one: it protects the actions where staff
 * having the same power as the owner would be wrong regardless of any
 * ownership check —
 *
 *   - staff management itself (otherwise any hire can invite themselves
 *     an OWNER account, or delete the owner)
 *   - subscription billing (otherwise a receptionist can cancel the
 *     salon's subscription)
 *
 * It deliberately does NOT replace RequireMerchantGuard on day-to-day
 * work — logging visits, viewing bookings — which staff exist to do.
 */
@Injectable()
export class RequireMerchantOwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    if (req.accountRole === 'merchant_staff') {
      // Distinct message from the not-a-merchant case on purpose: this
      // caller IS authenticated for the right salon, they just don't have
      // the role. A generic "requires a merchant account" would read as a
      // bug to them.
      throw new ForbiddenException('This action requires the merchant owner account');
    }

    if (req.accountRole !== 'merchant_owner') {
      throw new ForbiddenException('This action requires a merchant account');
    }

    // Same belt-and-braces as RequireMerchantGuard: a merchant role with no
    // merchantId would let every downstream query widen to the whole table
    // instead of failing [F29].
    if (!req.merchantId) {
      throw new ForbiddenException('No merchant context on this request');
    }

    return true;
  }
}
