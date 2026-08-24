import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MerchantsService } from '../merchants/merchants.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MerchantsService,
  ) {}

  pendingMerchants() {
    return this.merchants.listByStatus('PENDING');
  }

  /**
   * The full merchant directory (T38). `MerchantsService.listByStatus`
   * already accepted an optional status and already selects through
   * MERCHANT_PUBLIC_SELECT — so the `passwordHash`/`stripeCustomerId`
   * allow-list from T17 [F31] covers this route by construction, not by
   * remembering to strip anything here.
   */
  listMerchants(status?: string) {
    return this.merchants.listByStatus(status);
  }

  approveMerchant(merchantId: string) {
    return this.merchants.approve(merchantId);
  }

  suspendMerchant(merchantId: string) {
    return this.merchants.suspend(merchantId);
  }

  /** Normalizes annual subscriptions to a monthly figure for MRR. */
  async mrr() {
    const subs = await this.prisma.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'TRIALING'] } },
      select: { plan: true, priceCents: true },
    });

    const mrrCents = subs.reduce((sum, s) => sum + (s.plan === 'ANNUAL' ? Math.round(s.priceCents / 12) : s.priceCents), 0);
    return { activeSubscriptions: subs.length, mrrCents };
  }

  /** Simple monthly churn: canceled this month / active at month start. */
  async churn() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [activeAtStart, canceledThisMonth] = await Promise.all([
      this.prisma.subscription.count({
        where: { createdAt: { lt: startOfMonth }, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
      }),
      this.prisma.merchant.count({
        where: { status: 'CANCELLED', subscription: { currentPeriodEnd: { gte: startOfMonth } } },
      }),
    ]);

    const rate = activeAtStart === 0 ? 0 : canceledThisMonth / activeAtStart;
    return { activeAtStart, canceledThisMonth, churnRate: Number(rate.toFixed(4)) };
  }

  async platformStats() {
    const [merchantCount, visitCount, pointsIssued] = await Promise.all([
      this.prisma.merchant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.visit.count(),
      this.prisma.visit.aggregate({ _sum: { pointsEarned: true } }),
    ]);

    return {
      activeMerchants: merchantCount,
      totalVisits: visitCount,
      totalPointsIssued: pointsIssued._sum.pointsEarned ?? 0,
    };
  }
}
