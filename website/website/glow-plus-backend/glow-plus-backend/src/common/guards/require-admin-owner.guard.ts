import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthedRequest } from '../../middleware/auth.middleware';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Requires the caller to be an admin OWNER, not merely an admin  (T77)
 *
 * `RequireAdminGuard` (T22) answers "is this an admin at all?" — it is the
 * right guard for approving a salon or reading platform metrics. This one is
 * the narrower gate on the actions that change *who can administer the
 * platform*: creating an admin, promoting a user, deleting an admin.
 *
 * Same split as RequireMerchantGuard/RequireMerchantOwnerGuard (T24), and for
 * the same reason: if every admin could mint admins, one stolen admin session
 * would be a permanent foothold. The attacker creates a second account, you
 * revoke the first, and nothing has changed.
 *
 * **Why this reads the database instead of the token.** The JWT carries
 * `role: 'admin'` and nothing finer, and deliberately so: a role baked into a
 * 15-minute token is a role that stays true for 15 minutes after you take it
 * away. Demoting or deleting an admin has to bite on their very next request,
 * not whenever their access token happens to expire. The cost is one indexed
 * primary-key lookup on a handful of routes that a human triggers by hand.
 *
 * It also fails closed on a deleted account: an admin whose row is gone still
 * holds a syntactically valid token until it expires, and `findUnique` returns
 * null for them.
 */
@Injectable()
export class RequireAdminOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    // Not a duplicate of RequireAdminGuard: this guard is used on its own, so
    // it cannot assume another guard already established the role.
    if (req.accountRole !== 'admin') {
      throw new ForbiddenException('This action requires an admin account');
    }
    if (!req.accountId) {
      throw new ForbiddenException('No account context on this request');
    }

    const admin = await this.prisma.admin.findUnique({
      where: { id: req.accountId },
      select: { role: true },
    });

    if (!admin) {
      // The token is valid but the account behind it is gone.
      throw new ForbiddenException('This admin account no longer exists');
    }

    if (admin.role !== 'OWNER') {
      // Distinct message from the not-an-admin case on purpose: this caller IS
      // a legitimate admin, they just don't hold the tier. A generic "requires
      // an admin account" would read to them as a bug.
      throw new ForbiddenException('This action requires an admin owner account');
    }

    return true;
  }
}
