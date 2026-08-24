import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RedemptionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active reward rules at one merchant, with this consumer's progress and
   *  whether a redeemable milestone is currently available. */
  async available(userId: string, merchantId: string) {
    const rules = await this.prisma.rewardRule.findMany({ where: { merchantId, active: true } });
    return Promise.all(rules.map((rule) => this.progressFor(userId, rule)));
  }

  async history(userId: string) {
    return this.prisma.redemption.findMany({
      where: { userId },
      include: { rewardRule: { select: { name: true, rewardType: true, rewardValue: true, merchantId: true } } },
      orderBy: { redeemedAt: 'desc' },
    });
  }

  async historyForMerchant(merchantId: string) {
    return this.prisma.redemption.findMany({
      where: { rewardRule: { merchantId } },
      include: {
        user: { select: { name: true, email: true } },
        rewardRule: { select: { name: true, rewardType: true, rewardValue: true } },
      },
      orderBy: { redeemedAt: 'desc' },
    });
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
        where: { userId, merchantId: rule.merchantId, ...(rule.styleScopeId ? { styleId: rule.styleScopeId } : {}) },
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
      where: { userId, merchantId: rule.merchantId, ...(rule.styleScopeId ? { styleId: rule.styleScopeId } : {}) },
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
