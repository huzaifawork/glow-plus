import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface RewardRuleLike {
  id: string;
  triggerType: string;
  triggerValue: number;
  styleScopeId: string | null;
  oneTime: boolean;
}

@Injectable()
export class RewardRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(rule: RewardRuleLike, userId: string, merchantId: string) {
    const visits = await this.prisma.visit.findMany({
      where: {
        userId,
        merchantId,
        // T25: expired points no longer count toward a reward trigger.
        expired: false,
        ...(rule.styleScopeId ? { styleId: rule.styleScopeId } : {}),
      },
    });

    const progress =
      rule.triggerType === 'VISIT_COUNT'
        ? visits.length
        : visits.reduce((sum: number, v: { pointsEarned: number }) => sum + v.pointsEarned, 0);

    const remainder = progress % rule.triggerValue;
    const unlockedCount = Math.floor(progress / rule.triggerValue);

    if (rule.oneTime) {
      const alreadyRedeemed = await this.prisma.redemption.count({ where: { userId, rewardRuleId: rule.id } });
      return { progress, remaining: rule.triggerValue - remainder, unlocked: unlockedCount > 0 && alreadyRedeemed === 0 };
    }

    return { progress, remaining: rule.triggerValue - remainder, unlocked: progress > 0 && remainder === 0 };
  }
}
