/**
 * Tests for the reward-rules CRUD  (T37)
 *
 * `evaluate()` — the one method this service had before T37 — is already
 * covered indirectly through `me.service.spec.ts`, which asserts the same
 * progress maths from the consumer side. What is new and untested is the write
 * path, and the parts of it worth pinning down are the ones a reader cannot
 * infer from the response shape:
 *
 * 1. **`rewardValue` means something different per `rewardType`.** A single
 *    set of class-validator decorators cannot express that, so the bounds live
 *    in the service and are only ever enforced here. 100 is the whole discount
 *    for PERCENT_OFF and one dollar for FLAT_DISCOUNT.
 * 2. **A PATCH must validate the row it will PRODUCE, not the half of it in
 *    the body.** Switching `rewardType` without resending `rewardValue` is the
 *    case that silently saves nonsense if the merge is done wrong.
 * 3. **Cross-tenant style references.** `styleScopeId` and
 *    `freeServiceStyleId` are foreign keys a caller supplies by id, which is
 *    the [F29] problem reached through a column instead of a missing guard.
 */
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RewardRulesService } from './reward-rules.service';
import { RewardTypeDto, TriggerTypeDto } from './dto';
import { PrismaService } from '../../prisma/prisma.service';

const MINE = 'merchant-mine';
const THEIRS = 'merchant-theirs';
const MY_STYLE = 'style-mine';
const THEIR_STYLE = 'style-theirs';

function aRule(over: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    merchantId: MINE,
    name: '5 Visits = 15% Off',
    triggerType: 'VISIT_COUNT',
    triggerValue: 5,
    styleScopeId: null,
    rewardType: 'PERCENT_OFF',
    rewardValue: 15,
    freeServiceStyleId: null,
    oneTime: false,
    active: true,
    ...over,
  };
}

describe('RewardRulesService — CRUD (T37)', () => {
  const ruleFindMany = jest.fn();
  const ruleFindUnique = jest.fn();
  const ruleCreate = jest.fn();
  const ruleUpdate = jest.fn();
  const styleFindUnique = jest.fn();
  let service: RewardRulesService;

  const baseCreate = {
    name: 'New Rule',
    triggerType: TriggerTypeDto.VISIT_COUNT,
    triggerValue: 5,
    rewardType: RewardTypeDto.PERCENT_OFF,
    rewardValue: 10,
  };

  beforeEach(async () => {
    ruleFindMany.mockReset().mockResolvedValue([]);
    ruleFindUnique.mockReset().mockResolvedValue(aRule());
    ruleCreate.mockReset().mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data }));
    ruleUpdate.mockReset().mockImplementation(({ data }) => Promise.resolve({ id: 'rule-1', ...data }));
    // Only MY_STYLE belongs to MINE; THEIR_STYLE exists but is another salon's.
    styleFindUnique.mockReset().mockImplementation(({ where }) => {
      if (where.id === MY_STYLE) return Promise.resolve({ merchantId: MINE });
      if (where.id === THEIR_STYLE) return Promise.resolve({ merchantId: THEIRS });
      return Promise.resolve(null);
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        RewardRulesService,
        {
          provide: PrismaService,
          useValue: {
            rewardRule: {
              findMany: ruleFindMany,
              findUnique: ruleFindUnique,
              create: ruleCreate,
              update: ruleUpdate,
            },
            style: { findUnique: styleFindUnique },
          },
        },
      ],
    }).compile();
    service = moduleRef.get(RewardRulesService);
  });

  /* ---------------------------------------------------------------- list */

  it('lists inactive rules too — this is the management view', async () => {
    await service.list(MINE);
    expect(ruleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { merchantId: MINE } }),
    );
    // The absence of `active: true` is the assertion: a deactivated rule the
    // owner cannot see is a rule they cannot turn back on.
    expect(ruleFindMany.mock.calls[0][0].where).not.toHaveProperty('active');
  });

  /* -------------------------------------------------------------- create */

  it('creates a rule scoped to the merchant’s own style', async () => {
    const res = await service.create(MINE, { ...baseCreate, styleScopeId: MY_STYLE });
    expect(res).toEqual(expect.objectContaining({ merchantId: MINE, styleScopeId: MY_STYLE }));
  });

  it('defaults oneTime to false rather than undefined', async () => {
    await service.create(MINE, baseCreate);
    expect(ruleCreate.mock.calls[0][0].data.oneTime).toBe(false);
  });

  it('treats an empty-string styleScopeId as "any style"', async () => {
    // The portal's scope <select> uses "" for its "Any style" option, so this
    // is the value the form actually sends, not a hypothetical.
    await service.create(MINE, { ...baseCreate, styleScopeId: '' });
    expect(ruleCreate.mock.calls[0][0].data.styleScopeId).toBeNull();
  });

  it('refuses a percentage discount over 100', async () => {
    await expect(service.create(MINE, { ...baseCreate, rewardValue: 500 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses a percentage discount of 0', async () => {
    await expect(service.create(MINE, { ...baseCreate, rewardValue: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('allows 100 as a flat discount — one dollar, not a whole discount', async () => {
    // The same number the PERCENT_OFF case caps at is unremarkable in cents.
    // This is why the bound cannot live on the DTO property.
    await service.create(MINE, {
      ...baseCreate,
      rewardType: RewardTypeDto.FLAT_DISCOUNT,
      rewardValue: 100,
    });
    expect(ruleCreate.mock.calls[0][0].data.rewardValue).toBe(100);
  });

  it('refuses a reward with no rewardValue when one is required', async () => {
    const { rewardValue, ...noValue } = baseCreate;
    await expect(service.create(MINE, noValue)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires freeServiceStyleId when the reward is FREE_SERVICE', async () => {
    await expect(
      service.create(MINE, { ...baseCreate, rewardType: RewardTypeDto.FREE_SERVICE }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('zeroes rewardValue for FREE_SERVICE so the column cannot read as a discount', async () => {
    await service.create(MINE, {
      ...baseCreate,
      rewardType: RewardTypeDto.FREE_SERVICE,
      rewardValue: 9999, // sent by the caller, and meaningless for this type
      freeServiceStyleId: MY_STYLE,
    });
    expect(ruleCreate.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ rewardValue: 0, freeServiceStyleId: MY_STYLE }),
    );
  });

  it('refuses a styleScopeId belonging to another salon', async () => {
    await expect(
      service.create(MINE, { ...baseCreate, styleScopeId: THEIR_STYLE }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses giving away another salon’s style as a free service', async () => {
    await expect(
      service.create(MINE, {
        ...baseCreate,
        rewardType: RewardTypeDto.FREE_SERVICE,
        freeServiceStyleId: THEIR_STYLE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /* -------------------------------------------------------------- update */

  it('renames without being forced to resend the economics', async () => {
    // T29 found the inverse of this on Style: a PATCH carrying only `name` was
    // refused with an error about a field the caller never sent.
    await service.update(MINE, 'rule-1', { name: 'Renamed' });
    expect(ruleUpdate.mock.calls[0][0].data).toEqual({ name: 'Renamed' });
  });

  it('validates a rewardType switch against the value already on the row', async () => {
    // Row holds FREE_SERVICE/0. Switching to PERCENT_OFF alone would inherit
    // that 0 — a 0% discount that saves silently if the merge is done wrong.
    ruleFindUnique.mockResolvedValue(
      aRule({ rewardType: 'FREE_SERVICE', rewardValue: 0, freeServiceStyleId: MY_STYLE }),
    );
    await expect(
      service.update(MINE, 'rule-1', { rewardType: RewardTypeDto.PERCENT_OFF }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a rewardValue change that keeps the row’s existing type', async () => {
    ruleFindUnique.mockResolvedValue(aRule({ rewardType: 'FLAT_DISCOUNT', rewardValue: 2000 }));
    await service.update(MINE, 'rule-1', { rewardValue: 2500 });
    expect(ruleUpdate.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ rewardType: 'FLAT_DISCOUNT', rewardValue: 2500 }),
    );
  });

  it('clears the scope back to "any style" when styleScopeId is null', async () => {
    await service.update(MINE, 'rule-1', { styleScopeId: null });
    expect(ruleUpdate.mock.calls[0][0].data.styleScopeId).toBeNull();
  });

  it('leaves the scope alone when styleScopeId is absent from the body', async () => {
    await service.update(MINE, 'rule-1', { name: 'Renamed' });
    expect(ruleUpdate.mock.calls[0][0].data).not.toHaveProperty('styleScopeId');
  });

  /* ------------------------------------------------------- ownership */

  it('404s on a rule that does not exist', async () => {
    ruleFindUnique.mockResolvedValue(null);
    await expect(service.update(MINE, 'nope', { name: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('403s on another salon’s rule rather than editing it', async () => {
    ruleFindUnique.mockResolvedValue(aRule({ merchantId: THEIRS }));
    await expect(service.update(MINE, 'rule-1', { name: 'stolen' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('checks ownership before deactivating, not after', async () => {
    ruleFindUnique.mockResolvedValue(aRule({ merchantId: THEIRS }));
    await expect(service.setActive(MINE, 'rule-1', false)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(ruleUpdate).not.toHaveBeenCalled();
  });

  it('toggles active in both directions', async () => {
    await service.setActive(MINE, 'rule-1', false);
    expect(ruleUpdate.mock.calls[0][0].data).toEqual({ active: false });
    await service.setActive(MINE, 'rule-1', true);
    expect(ruleUpdate.mock.calls[1][0].data).toEqual({ active: true });
  });
});
