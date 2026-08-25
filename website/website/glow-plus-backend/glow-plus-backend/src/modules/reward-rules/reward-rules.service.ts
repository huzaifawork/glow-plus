import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { freeServiceFields, resolveFreeServiceNames } from '../../common/free-service';
import {
  CreateRewardRuleDto,
  REWARD_VALUE_BOUNDS,
  RewardTypeDto,
  UpdateRewardRuleDto,
} from './dto';

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

  /* ========================================================================
     CRUD  (T37)

     Until now this service had exactly one method — evaluate() — and the
     module declared no `controllers` at all, so there was no way for a salon
     to create, read or change a reward rule over HTTP. Rules could only ever
     be seeded. That is the hole T37 names, and it is also why [F30]'s dead
     paywall registration for `reward-rules/(.*)` matched nothing: there were
     no reward-rules routes for it to miss.
     ======================================================================== */

  /**
   * The merchant's own rules, including inactive ones.
   *
   * Deliberately not filtered to `active: true` — this is the management
   * view, and a deactivated rule the owner cannot see is a rule they cannot
   * turn back on. The consumer-facing paths (`/me/rewards`, `POST /visits`)
   * do their own `active: true` filtering.
   */
  async list(merchantId: string) {
    const rules = await this.prisma.rewardRule.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
      include: {
        styleScope: { select: { id: true, name: true, type: true } },
      },
    });
    // [F62] — `styleScope` gets an `include` because it is a real relation;
    // `freeServiceStyleId` cannot, because it is a bare `String?` with no
    // foreign key. Resolved by hand so the salon's own rules list can say
    // "Free Deep Tissue Massage" rather than just "Free service".
    const names = await resolveFreeServiceNames(this.prisma, rules);
    return rules.map((rule) => ({ ...rule, ...freeServiceFields(rule, names) }));
  }

  async create(merchantId: string, dto: CreateRewardRuleDto) {
    const styleScopeId = await this.resolveStyleId(merchantId, dto.styleScopeId, 'styleScopeId');
    const { rewardValue, freeServiceStyleId } = await this.normaliseReward(merchantId, dto.rewardType, dto);

    return this.prisma.rewardRule.create({
      data: {
        merchantId,
        name: dto.name,
        triggerType: dto.triggerType,
        triggerValue: dto.triggerValue,
        styleScopeId,
        rewardType: dto.rewardType,
        rewardValue,
        freeServiceStyleId,
        oneTime: dto.oneTime ?? false,
      },
      include: { styleScope: { select: { id: true, name: true, type: true } } },
    });
  }

  async update(merchantId: string, ruleId: string, dto: UpdateRewardRuleDto) {
    const existing = await this.assertOwnership(merchantId, ruleId);

    // A PATCH may change the reward TYPE without resending the value, or the
    // value without resending the type. Either way the pair has to be
    // validated together against what the row will actually hold afterwards,
    // not against the half of it that happens to be in the body.
    const rewardType = (dto.rewardType ?? existing.rewardType) as RewardTypeDto;
    const touchesReward =
      dto.rewardType !== undefined ||
      dto.rewardValue !== undefined ||
      dto.freeServiceStyleId !== undefined;

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.triggerType !== undefined) data.triggerType = dto.triggerType;
    if (dto.triggerValue !== undefined) data.triggerValue = dto.triggerValue;

    if (dto.styleScopeId !== undefined) {
      data.styleScopeId = await this.resolveStyleId(merchantId, dto.styleScopeId, 'styleScopeId');
    }

    if (touchesReward) {
      const merged = await this.normaliseReward(merchantId, rewardType, {
        rewardValue: dto.rewardValue ?? existing.rewardValue,
        freeServiceStyleId:
          dto.freeServiceStyleId !== undefined ? dto.freeServiceStyleId : existing.freeServiceStyleId,
      });
      data.rewardType = rewardType;
      data.rewardValue = merged.rewardValue;
      data.freeServiceStyleId = merged.freeServiceStyleId;
    }

    if (dto.oneTime !== undefined) data.oneTime = dto.oneTime;

    return this.prisma.rewardRule.update({
      where: { id: ruleId },
      data,
      include: { styleScope: { select: { id: true, name: true, type: true } } },
    });
  }

  /**
   * Deactivating is the only "delete" a reward rule gets, on purpose.
   *
   * `Redemption` rows carry a `rewardRuleId` foreign key, so a rule a customer
   * has already redeemed against cannot be removed without either orphaning or
   * erasing that history — and the redemption history is what stops the
   * double-redemption check in T23 from being re-derivable. Toggling `active`
   * takes the rule off the customer's screen and out of `POST /visits`'s
   * evaluation loop, which is what "remove this offer" actually means to a
   * salon, and it is reversible.
   */
  async setActive(merchantId: string, ruleId: string, active: boolean) {
    await this.assertOwnership(merchantId, ruleId);
    return this.prisma.rewardRule.update({
      where: { id: ruleId },
      data: { active },
      include: { styleScope: { select: { id: true, name: true, type: true } } },
    });
  }

  /* ---------------------------------------------------------------------- */

  /**
   * The bounds class-validator could not express.
   *
   * `rewardValue` means something different per `rewardType`, so a single set
   * of decorators on the property cannot be right for all three: 100 is the
   * entire discount for PERCENT_OFF and one dollar for FLAT_DISCOUNT. Checking
   * here also keeps the FREE_SERVICE style-ownership lookup — which needs the
   * database — beside the rules that depend on it.
   *
   * The PERCENT_OFF ceiling is the one that matters commercially: without it a
   * salon can save a rule at 500% off, and nothing downstream would question
   * it.
   */
  private async normaliseReward(
    merchantId: string,
    rewardType: RewardTypeDto | string,
    input: { rewardValue?: number | null; freeServiceStyleId?: string | null },
  ): Promise<{ rewardValue: number; freeServiceStyleId: string | null }> {
    if (rewardType === RewardTypeDto.FREE_SERVICE) {
      const styleId = await this.resolveStyleId(merchantId, input.freeServiceStyleId, 'freeServiceStyleId');
      if (!styleId) {
        throw new BadRequestException('freeServiceStyleId is required when rewardType is FREE_SERVICE');
      }
      // rewardValue carries no meaning for a free service — the reward IS the
      // style. Stored as 0 rather than left to whatever the caller sent, so
      // the column never holds a number a reader could mistake for a discount.
      return { rewardValue: 0, freeServiceStyleId: styleId };
    }

    const value = input.rewardValue;
    if (value === undefined || value === null) {
      throw new BadRequestException(`rewardValue is required when rewardType is ${rewardType}`);
    }

    if (rewardType === RewardTypeDto.PERCENT_OFF) {
      if (value < 1 || value > REWARD_VALUE_BOUNDS.MAX_PERCENT) {
        throw new BadRequestException('A percentage discount must be between 1 and 100');
      }
    } else if (value < 1) {
      throw new BadRequestException('A flat discount must be at least 1 cent');
    }

    return { rewardValue: value, freeServiceStyleId: null };
  }

  /**
   * Resolves an optional style reference, refusing one that belongs to another
   * salon. Without this check a merchant could scope their own reward rule to
   * a competitor's style id — the row would save, and `evaluate()` would then
   * filter visits by a style this merchant never performs, so the rule could
   * never unlock. Same class of cross-tenant leak as [F29], reached through a
   * foreign key instead of a missing role guard.
   */
  private async resolveStyleId(
    merchantId: string,
    styleId: string | null | undefined,
    field: string,
  ): Promise<string | null> {
    if (styleId === undefined || styleId === null || styleId === '') return null;

    const style = await this.prisma.style.findUnique({
      where: { id: styleId },
      select: { merchantId: true },
    });
    if (!style || style.merchantId !== merchantId) {
      throw new BadRequestException(`${field} does not name one of your styles`);
    }
    return styleId;
  }

  private async assertOwnership(merchantId: string, ruleId: string) {
    const rule = await this.prisma.rewardRule.findUnique({ where: { id: ruleId } });
    if (!rule) throw new NotFoundException('Reward rule not found');
    if (rule.merchantId !== merchantId) throw new ForbiddenException('Not your reward rule');
    return rule;
  }
}
