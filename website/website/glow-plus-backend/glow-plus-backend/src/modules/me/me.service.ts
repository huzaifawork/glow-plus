import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** How many visits each salon block carries back. The prototype's dashboard
 *  sliced its "Recent visits" list at 5, and the RN app's demo payload shows 3
 *  — 5 is the larger of the two, so neither client has to ask for more. */
const RECENT_VISITS_PER_MERCHANT = 5;

/**
 * `GET /me/rewards`  (T42)
 *
 * One call that answers everything a signed-in consumer's home screen asks:
 * where have I been, how many points do I hold there, how close am I to each
 * reward, and what did I last have done.
 *
 * **The shape is not ours to choose.** The React Native app already ships a
 * `DEMO_REWARDS` constant written against this endpoint
 * (`glow-plus-mobile app/src/api/client.js:44-91`) with the comment "mirrors
 * the exact shape of GET /me/rewards from the backend, so swapping DEMO_MODE
 * off requires no changes to any screen". Every field it names is produced
 * here under the same name: `totalPoints`, and per merchant `merchantId`,
 * `businessName`, `points`, `rewards[{ ruleId, name, triggerType,
 * triggerValue, progress, remaining, rewardType, rewardValue }]` and
 * `recentVisits[{ id, styleName, styleType, pointsEarned, visitDate }]`.
 *
 * Three fields are *added* on top of that set — `oneTime` and `eligible` on a
 * reward, `expired` on a visit. Additive fields are invisible to a client that
 * doesn't read them, and they save the website a second round trip per salon
 * to `GET /redemptions/available?merchantId=` purely to decide whether to
 * enable a Redeem button.
 *
 * Progress maths is deliberately identical to `RedemptionsService.progressFor`
 * — same `expired: false` filter (T25 [F8]), same `styleScopeId` narrowing,
 * same `progress % triggerValue` remainder, same oneTime/repeatable
 * eligibility rule. If the two ever disagreed, a customer would see a Redeem
 * button that `POST /redemptions` then refuses.
 */
@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async rewards(userId: string) {
    const visits = await this.prisma.visit.findMany({
      where: { userId },
      select: {
        id: true,
        merchantId: true,
        styleId: true,
        pointsEarned: true,
        visitDate: true,
        expired: true,
        style: { select: { name: true, type: true } },
      },
      orderBy: { visitDate: 'desc' },
    });

    // Ordered by most-recently-visited because `visits` is sorted desc — the
    // salon you were at last week belongs at the top of the list.
    const merchantIds = [...new Set(visits.map((v) => v.merchantId))];
    if (merchantIds.length === 0) return { totalPoints: 0, merchants: [] };

    const [merchants, rules, redemptions] = await Promise.all([
      this.prisma.merchant.findMany({
        where: { id: { in: merchantIds } },
        select: { id: true, businessName: true },
      }),
      this.prisma.rewardRule.findMany({ where: { merchantId: { in: merchantIds }, active: true } }),
      // Counted in JS rather than a groupBy: this is a handful of rows per
      // consumer, and one query keeps the redemption count and the progress
      // maths reading from the same snapshot.
      this.prisma.redemption.findMany({ where: { userId }, select: { rewardRuleId: true } }),
    ]);

    const nameOf = new Map(merchants.map((m) => [m.id, m.businessName]));
    const redeemedCountOf = new Map<string, number>();
    for (const r of redemptions) {
      redeemedCountOf.set(r.rewardRuleId, (redeemedCountOf.get(r.rewardRuleId) ?? 0) + 1);
    }

    const blocks = merchantIds.map((merchantId) => {
      const mine = visits.filter((v) => v.merchantId === merchantId);
      // Expired visits stay in history but stop counting (T25) — so points and
      // every reward progress read from `active`, `recentVisits` from `mine`.
      const active = mine.filter((v) => !v.expired);

      const rewards = rules
        .filter((rule) => rule.merchantId === merchantId)
        .map((rule) => {
          const scoped = rule.styleScopeId
            ? active.filter((v) => v.styleId === rule.styleScopeId)
            : active;
          const progress =
            rule.triggerType === 'VISIT_COUNT'
              ? scoped.length
              : scoped.reduce((sum, v) => sum + v.pointsEarned, 0);
          const unlockedCount = Math.floor(progress / rule.triggerValue);
          const redeemedCount = redeemedCountOf.get(rule.id) ?? 0;

          return {
            ruleId: rule.id,
            name: rule.name,
            triggerType: rule.triggerType,
            triggerValue: rule.triggerValue,
            progress,
            remaining: rule.triggerValue - (progress % rule.triggerValue),
            rewardType: rule.rewardType,
            rewardValue: rule.rewardValue,
            oneTime: rule.oneTime,
            eligible: rule.oneTime ? unlockedCount > 0 && redeemedCount === 0 : redeemedCount < unlockedCount,
          };
        });

      return {
        merchantId,
        businessName: nameOf.get(merchantId) ?? 'Unknown salon',
        points: active.reduce((sum, v) => sum + v.pointsEarned, 0),
        rewards,
        recentVisits: mine.slice(0, RECENT_VISITS_PER_MERCHANT).map((v) => ({
          id: v.id,
          styleName: v.style.name,
          styleType: v.style.type,
          pointsEarned: v.pointsEarned,
          visitDate: v.visitDate,
          expired: v.expired,
        })),
      };
    });

    return {
      totalPoints: blocks.reduce((sum, b) => sum + b.points, 0),
      merchants: blocks,
    };
  }
}
