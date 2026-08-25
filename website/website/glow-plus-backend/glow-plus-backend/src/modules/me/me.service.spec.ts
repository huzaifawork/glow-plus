/**
 * Tests for MeService — `GET /me/rewards`  (T42)
 *
 * Two things are worth pinning down here, and they are different in kind.
 *
 * 1. **The response shape is a published contract.** The React Native app's
 *    `DEMO_REWARDS` constant was written against this endpoint before it
 *    existed, with the stated promise that turning DEMO_MODE off needs no
 *    screen changes. A renamed or dropped field is a broken client, not a
 *    refactor, so the field names are asserted explicitly.
 * 2. **The progress maths must agree with RedemptionsService.** If they drift,
 *    a customer sees an enabled Redeem button that `POST /redemptions` then
 *    refuses — the eligibility rules are therefore tested directly, including
 *    the T25 expired-visit exclusion.
 */
import { Test } from '@nestjs/testing';
import { MeService } from './me.service';
import { PrismaService } from '../../prisma/prisma.service';

const M1 = 'merchant-1';
const M2 = 'merchant-2';
const STYLE_HAIR = 'style-hair';
const STYLE_NAIL = 'style-nail';

let seq = 0;

function aVisit(over: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: 'v' + seq,
    merchantId: M1,
    styleId: STYLE_HAIR,
    pointsEarned: 50,
    // Descending, because the service relies on Prisma's orderBy — each new
    // fixture is older than the last, mirroring `orderBy: { visitDate: desc }`.
    visitDate: new Date(Date.now() - seq * 86400000),
    expired: false,
    style: { name: 'Balayage', type: 'HAIR' },
    ...over,
  };
}

function aRule(over: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    merchantId: M1,
    name: '5 Visits = 15% Off',
    triggerType: 'VISIT_COUNT',
    triggerValue: 5,
    styleScopeId: null,
    rewardType: 'PERCENT_OFF',
    rewardValue: 15,
    // [F62] — a real RewardRule row always carries this column; it is null on
    // every rule that is not a FREE_SERVICE.
    freeServiceStyleId: null,
    oneTime: false,
    ...over,
  };
}

describe('MeService.rewards', () => {
  const visitFindMany = jest.fn();
  const merchantFindMany = jest.fn();
  const ruleFindMany = jest.fn();
  const redemptionFindMany = jest.fn();
  const styleFindMany = jest.fn();
  let service: MeService;

  beforeEach(async () => {
    seq = 0;
    visitFindMany.mockReset().mockResolvedValue([]);
    merchantFindMany.mockReset().mockResolvedValue([
      { id: M1, businessName: 'Glow Salon' },
      { id: M2, businessName: 'Polished Nail Bar' },
    ]);
    ruleFindMany.mockReset().mockResolvedValue([]);
    redemptionFindMany.mockReset().mockResolvedValue([]);
    styleFindMany.mockReset().mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        MeService,
        {
          provide: PrismaService,
          useValue: {
            visit: { findMany: visitFindMany },
            merchant: { findMany: merchantFindMany },
            rewardRule: { findMany: ruleFindMany },
            redemption: { findMany: redemptionFindMany },
            style: { findMany: styleFindMany },
          },
        },
      ],
    }).compile();
    service = moduleRef.get(MeService);
  });

  it('returns the RN client contract field-for-field', async () => {
    visitFindMany.mockResolvedValue([aVisit()]);
    ruleFindMany.mockResolvedValue([aRule()]);

    const res = await service.rewards('user-1');

    expect(Object.keys(res).sort()).toEqual(['merchants', 'totalPoints']);
    expect(res.merchants[0]).toEqual(
      expect.objectContaining({ merchantId: M1, businessName: 'Glow Salon', points: 50 }),
    );
    expect(res.merchants[0].rewards[0]).toEqual({
      ruleId: 'rule-1',
      name: '5 Visits = 15% Off',
      triggerType: 'VISIT_COUNT',
      triggerValue: 5,
      progress: 1,
      remaining: 4,
      rewardType: 'PERCENT_OFF',
      rewardValue: 15,
      // Additive beyond the RN shape — see the service docblock.
      oneTime: false,
      eligible: false,
      // [F62] — present on EVERY reward, null unless it is a FREE_SERVICE, so
      // a client can read them without first branching on rewardType.
      freeServiceStyleId: null,
      freeServiceName: null,
    });
    expect(res.merchants[0].recentVisits[0]).toEqual({
      id: 'v1',
      styleName: 'Balayage',
      styleType: 'HAIR',
      pointsEarned: 50,
      visitDate: expect.any(Date),
      expired: false,
    });
  });

  it('answers an empty history without querying anything else', async () => {
    const res = await service.rewards('user-1');
    expect(res).toEqual({ totalPoints: 0, merchants: [] });
    expect(merchantFindMany).not.toHaveBeenCalled();
    expect(ruleFindMany).not.toHaveBeenCalled();
  });

  it('scopes the visit query to the calling consumer', async () => {
    await service.rewards('user-1');
    expect(visitFindMany.mock.calls[0][0].where).toEqual({ userId: 'user-1' });
  });

  it('excludes expired visits from points and progress but keeps them in history (T25)', async () => {
    visitFindMany.mockResolvedValue([aVisit(), aVisit({ expired: true }), aVisit({ expired: true })]);
    ruleFindMany.mockResolvedValue([aRule()]);

    const block = (await service.rewards('user-1')).merchants[0];

    expect(block.points).toBe(50); // one active visit, not three
    expect(block.rewards[0].progress).toBe(1);
    expect(block.recentVisits).toHaveLength(3);
    expect(block.recentVisits.filter((v) => v.expired)).toHaveLength(2);
  });

  it('narrows progress to styleScopeId when a rule is style-scoped', async () => {
    visitFindMany.mockResolvedValue([
      aVisit(),
      aVisit({ styleId: STYLE_NAIL, style: { name: 'Gel', type: 'NAIL' } }),
      aVisit({ styleId: STYLE_NAIL, style: { name: 'Gel', type: 'NAIL' } }),
    ]);
    ruleFindMany.mockResolvedValue([
      aRule({ id: 'any', styleScopeId: null }),
      aRule({ id: 'nails-only', styleScopeId: STYLE_NAIL }),
    ]);

    const rewards = (await service.rewards('user-1')).merchants[0].rewards;
    const byId = new Map(rewards.map((r) => [r.ruleId, r]));
    expect(byId.get('any')?.progress).toBe(3);
    expect(byId.get('nails-only')?.progress).toBe(2);
  });

  it('sums points for POINTS_THRESHOLD and counts visits for VISIT_COUNT', async () => {
    visitFindMany.mockResolvedValue([aVisit(), aVisit()]);
    ruleFindMany.mockResolvedValue([
      aRule({ id: 'count', triggerType: 'VISIT_COUNT', triggerValue: 5 }),
      aRule({ id: 'points', triggerType: 'POINTS_THRESHOLD', triggerValue: 200 }),
    ]);

    const rewards = (await service.rewards('user-1')).merchants[0].rewards;
    const byId = new Map(rewards.map((r) => [r.ruleId, r]));
    expect(byId.get('count')?.progress).toBe(2);
    expect(byId.get('points')?.progress).toBe(100);
    expect(byId.get('points')?.remaining).toBe(100);
  });

  it('marks a oneTime reward ineligible once it has been redeemed', async () => {
    const five = Array.from({ length: 5 }, () => aVisit());
    visitFindMany.mockResolvedValue(five);
    ruleFindMany.mockResolvedValue([aRule({ oneTime: true })]);

    const unredeemed = await service.rewards('user-1');
    expect(unredeemed.merchants[0].rewards[0].eligible).toBe(true);

    redemptionFindMany.mockResolvedValue([{ rewardRuleId: 'rule-1' }]);
    const redeemed = await service.rewards('user-1');
    expect(redeemed.merchants[0].rewards[0].eligible).toBe(false);
  });

  it('re-locks a repeatable reward until the next milestone is reached', async () => {
    // 10 visits against a 5-visit rule = 2 milestones unlocked.
    visitFindMany.mockResolvedValue(Array.from({ length: 10 }, () => aVisit()));
    ruleFindMany.mockResolvedValue([aRule({ oneTime: false })]);

    redemptionFindMany.mockResolvedValue([{ rewardRuleId: 'rule-1' }]);
    const oneSpent = await service.rewards('user-1');
    expect(oneSpent.merchants[0].rewards[0].eligible).toBe(true); // 1 < 2

    redemptionFindMany.mockResolvedValue([{ rewardRuleId: 'rule-1' }, { rewardRuleId: 'rule-1' }]);
    const bothSpent = await service.rewards('user-1');
    expect(bothSpent.merchants[0].rewards[0].eligible).toBe(false); // 2 < 2 is false
  });

  it('reports remaining as a full cycle on an exact milestone, matching RedemptionsService', async () => {
    visitFindMany.mockResolvedValue(Array.from({ length: 5 }, () => aVisit()));
    ruleFindMany.mockResolvedValue([aRule()]);

    // 5 % 5 === 0, so `triggerValue - 0` — the same arithmetic
    // RedemptionsService.progressFor uses, and what the live API returns.
    const res = await service.rewards('user-1');
    expect(res.merchants[0].rewards[0].remaining).toBe(5);
  });

  it('caps recentVisits per salon and orders salons most-recently-visited first', async () => {
    visitFindMany.mockResolvedValue([
      aVisit({ merchantId: M2, styleId: STYLE_NAIL, style: { name: 'Gel', type: 'NAIL' } }),
      ...Array.from({ length: 7 }, () => aVisit({ merchantId: M1 })),
    ]);

    const res = await service.rewards('user-1');
    expect(res.merchants.map((m) => m.merchantId)).toEqual([M2, M1]);
    expect(res.merchants[1].recentVisits).toHaveLength(5);
  });

  it('totals points across every salon', async () => {
    visitFindMany.mockResolvedValue([
      aVisit({ merchantId: M1, pointsEarned: 50 }),
      aVisit({ merchantId: M2, pointsEarned: 35 }),
      aVisit({ merchantId: M2, pointsEarned: 35, expired: true }),
    ]);

    expect((await service.rewards('user-1')).totalPoints).toBe(85);
  });

  it('does not invent a salon name when the merchant row is missing', async () => {
    visitFindMany.mockResolvedValue([aVisit({ merchantId: 'ghost' })]);
    merchantFindMany.mockResolvedValue([]);

    expect((await service.rewards('user-1')).merchants[0].businessName).toBe('Unknown salon');
  });
});
