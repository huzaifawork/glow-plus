import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthedRequest } from '../../middleware/auth.middleware';

/** Methods that change state. Everything else is a read. */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * The subscription paywall  (T29)
 *
 * Replaces `RequireActiveSubscriptionMiddleware`, which was registered for
 * `styles/(.*)`, `visits/(.*)` and `reward-rules/(.*)` and matched **none**
 * of the real paths — so a SUSPENDED merchant still read *and wrote*
 * (`POST /styles` returned 201 and created the row). That is [F30]: a
 * revenue control that ran on nothing. Path-matched middleware has now
 * silently missed its target three times in this codebase ([F3] rate
 * limiting, [F33] the throttler's exemptions, [F30] here), so this is a
 * guard: applied per route with `@UseGuards`, it cannot be aimed at a path
 * that doesn't exist.
 *
 * Always pair it with `RequireMerchantGuard`, which runs first and
 * guarantees `req.merchantId` — a guard list executes in order.
 *
 * PAST_DUE is read-only rather than blocked: a merchant whose card just
 * failed should still be able to look at their salon while they fix it,
 * but not keep adding to it. The old middleware set `req.readOnly = true`
 * and left it to "the route handlers themselves" to honour — **no handler
 * ever did**, so PAST_DUE was in practice full access. The refusal is
 * enforced here now, by HTTP method, and `req.readOnly` is still set so a
 * handler can soften a response if it wants to.
 */
@Injectable()
export class RequireActiveSubscriptionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest & { readOnly?: boolean }>();

    if (!req.merchantId) {
      throw new ForbiddenException('No merchant context on this request');
    }

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: req.merchantId },
      select: { status: true },
    });

    if (!merchant) {
      throw new ForbiddenException('Unknown merchant');
    }

    if (merchant.status === 'SUSPENDED' || merchant.status === 'CANCELLED') {
      throw new ForbiddenException('Subscription inactive. Please update billing to continue.');
    }

    if (merchant.status === 'PAST_DUE') {
      req.readOnly = true;
      if (WRITE_METHODS.has(req.method)) {
        throw new ForbiddenException(
          'Your last payment failed, so this account is read-only. Please update billing to make changes.',
        );
      }
    }

    return true;
  }
}
