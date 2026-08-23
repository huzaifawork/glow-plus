import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthedRequest } from '../../middleware/auth.middleware';

/**
 * Requires the caller to be an admin (T22) [F7]
 *
 * Before this, `/admin/*` had NO guard at all — the controller's own comment
 * admitted it. Reproduced live in T17: a logged-in **consumer** token read
 * `GET /admin/merchants/pending`, which is how the passwordHash leak [F31]
 * was found. Same shape as RequireMerchantGuard/RequireConsumerGuard: fail
 * closed on the role before the handler runs, rather than trusting a `!`
 * assertion on a field that a non-admin token simply doesn't carry.
 */
@Injectable()
export class RequireAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    if (req.accountRole !== 'admin') {
      throw new ForbiddenException('This action requires an admin account');
    }
    if (!req.accountId) {
      throw new ForbiddenException('No account context on this request');
    }

    return true;
  }
}
