import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthedRequest } from '../../middleware/auth.middleware';
import { LISTABLE_SUBSCRIPTION_STATUSES } from '../salon-listable';

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
      select: { status: true, subscription: { select: { status: true } } },
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
      // Returns here deliberately: PAST_DUE means there IS a plan and it is
      // failing, which the check below would read as "no plan" and refuse
      // outright, losing the read-only grace this branch exists to give.
      return true;
    }

    // T78 — the plan itself, not just the merchant's status.
    //
    // Until now this guard never looked at a subscription, despite its name.
    // It refused only SUSPENDED and CANCELLED, states reachable ONLY after a
    // salon has had a plan and lost it, so a salon that never subscribed was
    // never refused. Verified live: a PENDING salon, never approved and never
    // paid, created a service (201) and logged a visit that awarded loyalty
    // points (201). Admin approval made it worse rather than better, because
    // `approve()` sets ACTIVE with no billing check at all — approving a salon
    // handed it every paid feature for free.
    //
    // The rule is the one salon-listable.ts already defines for the public
    // directory, so the guard and the directory cannot disagree about what
    // paying means: a plan that is TRIALING or ACTIVE. The trial IS the free
    // period — 7 days, or 37 for the first 50 founding salons — and it begins
    // at checkout, so setup happens inside it rather than before it.
    const plan = merchant.subscription;
    if (!plan || !(LISTABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(plan.status)) {
      throw new ForbiddenException(
        'This account does not have an active plan. Start a plan to use Glow+.',
      );
    }

    return true;
  }
}
