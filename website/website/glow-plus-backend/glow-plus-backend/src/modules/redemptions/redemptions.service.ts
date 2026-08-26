import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { freeServiceFields, resolveFreeServiceNames } from '../../common/free-service';

@Injectable()
export class RedemptionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active reward rules at one merchant, with this consumer's progress and
   *  whether a redeemable milestone is currently available. */
  async available(userId: string, merchantId: string) {
    // T29 [F34] — `merchantId` is a *query* param, so it can simply be absent.
    // Without this it arrived as `undefined`, Prisma dropped the filter, and
    // `GET /redemptions/available` with no query string returned the active
    // reward rules of **every merchant on the platform** — [F29]'s trap in a
    // route that was guarded from birth. A guard fixes *who* is asking; only
    // this fixes *what* they are allowed to scope the question to.
    if (!merchantId) {
      throw new BadRequestException('merchantId is required');
    }
    const rules = await this.prisma.rewardRule.findMany({ where: { merchantId, active: true } });
    // [F62] — resolved once for the whole set rather than inside progressFor,
    // which runs per rule. Kept in step with `/me/rewards` on purpose: T42's
    // note is that these two must not disagree about a reward, and "what am I
    // actually getting" is part of that.
    const freeServiceNames = await resolveFreeServiceNames(this.prisma, rules);
    return Promise.all(
      rules.map(async (rule) => ({
        ...(await this.progressFor(userId, rule)),
        ...freeServiceFields(rule, freeServiceNames),
      })),
    );
  }

  /**
   * What THIS CUSTOMER has claimed, newest first.  [F75]
   *
   * `businessName` is included deliberately. Without it the response names the
   * reward but not the salon, and this is a cross-salon history — a customer
   * on Glow+ collects at several. "20% off" with no salon beside it is not
   * something anyone can act on at a counter.
   *
   * It is the twin of the omission in [F60]: that one shipped the endpoint
   * with no screen; this one had the screen reading a payload missing the one
   * field the screen needed.
   */
  async history(userId: string) {
    const rows = await this.prisma.redemption.findMany({
      where: { userId },
      include: {
        rewardRule: {
          select: {
            name: true,
            rewardType: true,
            rewardValue: true,
            merchantId: true,
            merchant: { select: { businessName: true } },
          },
        },
      },
      orderBy: { redeemedAt: 'desc' },
    });

    // Flattened onto the row rather than left nested two levels down, so the
    // client reads `businessName` the same way it does everywhere else.
    return rows.map(({ rewardRule, ...rest }) => ({
      ...rest,
      businessName: rewardRule.merchant?.businessName ?? null,
      rewardRule: {
        name: rewardRule.name,
        rewardType: rewardRule.rewardType,
        rewardValue: rewardRule.rewardValue,
        merchantId: rewardRule.merchantId,
      },
    }));
  }

  /**
   * What this salon has had claimed, newest first, with who claimed it.
   *
   * [F60] — this shipped in T23 and **no client called it for two months**.
   * `POST /redemptions` writes a row and returns; it does not email the salon,
   * and the customer's confirmation is a toast that disappears. So until the
   * portal grew a Redemptions tab there was no surface anywhere in the product
   * on which a salon could learn that someone had claimed 20% off — the reward
   * was recorded and unclaimable, and the loyalty loop did not close at the
   * counter. Same shape as [F52] and [F55]: built, reachable, never called.
   */
  async historyForMerchant(merchantId: string) {
    const rows = await this.prisma.redemption.findMany({
      where: { rewardRule: { merchantId } },
      include: {
        user: { select: { name: true, email: true } },
        rewardRule: {
          // [F62] — `freeServiceStyleId` included so the counter is told which
          // service is free, not just that "a" service is.
          select: {
            name: true,
            rewardType: true,
            rewardValue: true,
            freeServiceStyleId: true,
          },
        },
      },
      orderBy: { redeemedAt: 'desc' },
    });

    const names = await resolveFreeServiceNames(
      this.prisma,
      rows.map((r) => r.rewardRule),
    );
    return rows.map((r) => ({
      ...r,
      rewardRule: { ...r.rewardRule, ...freeServiceFields(r.rewardRule, names) },
    }));
  }

  /**
   * Redeems one unlocked milestone. Re-derives eligibility from real Visit/
   * Redemption rows inside the transaction (never trusts client input beyond
   * which rule) so two rapid clicks can't both pass the same milestone: the
   * count of prior redemptions for oneTime rules, or of redemptions already
   * spent against the current unlockedCount for repeatable ones.
   */
  async redeem(userId: string, rewardRuleId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.rewardRule.findUnique({ where: { id: rewardRuleId } });
      if (!rule || !rule.active) throw new NotFoundException('Reward rule not found');

      const visits = await tx.visit.findMany({
        // `expired: false` — T25. Expired visits stay in history but stop
        // counting toward rewards, so every progress query filters them out.
        where: { userId, merchantId: rule.merchantId, expired: false, ...(rule.styleScopeId ? { styleId: rule.styleScopeId } : {}) },
      });
      const progress =
        rule.triggerType === 'VISIT_COUNT' ? visits.length : visits.reduce((sum, v) => sum + v.pointsEarned, 0);
      const unlockedCount = Math.floor(progress / rule.triggerValue);
      if (unlockedCount === 0) throw new BadRequestException('Not eligible for this reward yet');

      const redeemedCount = await tx.redemption.count({ where: { userId, rewardRuleId } });
      if (rule.oneTime && redeemedCount > 0) {
        throw new BadRequestException('This reward has already been redeemed');
      }
      if (!rule.oneTime && redeemedCount >= unlockedCount) {
        throw new BadRequestException('Already redeemed at this milestone — keep visiting to unlock the next one');
      }

      return tx.redemption.create({
        data: { userId, rewardRuleId },
        include: { rewardRule: { select: { name: true, rewardType: true, rewardValue: true } } },
      });
    });
  }

  private async progressFor(userId: string, rule: { id: string; merchantId: string; triggerType: string; triggerValue: number; styleScopeId: string | null; oneTime: boolean; name: string; rewardType: string; rewardValue: number }) {
    const visits = await this.prisma.visit.findMany({
      // `expired: false` — T25. Expired visits stay in history but stop
        // counting toward rewards, so every progress query filters them out.
        where: { userId, merchantId: rule.merchantId, expired: false, ...(rule.styleScopeId ? { styleId: rule.styleScopeId } : {}) },
    });
    const progress =
      rule.triggerType === 'VISIT_COUNT' ? visits.length : visits.reduce((sum, v) => sum + v.pointsEarned, 0);
    const unlockedCount = Math.floor(progress / rule.triggerValue);
    const redeemedCount = await this.prisma.redemption.count({ where: { userId, rewardRuleId: rule.id } });

    const eligible = rule.oneTime ? unlockedCount > 0 && redeemedCount === 0 : redeemedCount < unlockedCount;
    const remainder = progress % rule.triggerValue;

    return {
      ruleId: rule.id,
      name: rule.name,
      triggerType: rule.triggerType,
      triggerValue: rule.triggerValue,
      rewardType: rule.rewardType,
      rewardValue: rule.rewardValue,
      oneTime: rule.oneTime,
      progress,
      remaining: rule.triggerValue - remainder,
      eligible,
    };
  }
}
