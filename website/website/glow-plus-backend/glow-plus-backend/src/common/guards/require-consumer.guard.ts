import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthedRequest } from '../../middleware/auth.middleware';

/**
 * Requires the caller to be a consumer (T18)
 *
 * Mirror of RequireMerchantGuard for the other direction. bookings.controller.ts
 * reads `req.accountId!` on create()/mine() — a merchant token still carries an
 * accountId (its own staff user id), so without this guard a merchant calling
 * POST /bookings would not get a clean 403, it would create a "booking" owned
 * by the merchant's own staff account, which is nonsensical data rather than a
 * refused request. Failing closed here keeps that out of the database.
 */
@Injectable()
export class RequireConsumerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    if (req.accountRole !== 'consumer') {
      throw new ForbiddenException('This action requires a consumer account');
    }
    if (!req.accountId) {
      throw new ForbiddenException('No account context on this request');
    }

    return true;
  }
}
