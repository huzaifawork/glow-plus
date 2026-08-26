/**
 * Tests for the public salon directory — `GET /merchants`  (T43)
 *
 * Three things are pinned here, and they fail in different ways.
 *
 * 1. **The list is a published contract.** The RN app's `fetchSalons` maps
 *    over the response (`BookScreen.js:29`), so the body must stay a bare
 *    array and must keep carrying `id` and `businessName`. That is asserted
 *    on the controller, not just the service — the header-setting handler is
 *    exactly where a `passthrough: false` slip would swallow the body.
 * 2. **ACTIVE-only is a visibility rule, not a nicety.** If the filter is
 *    ever dropped, a suspended salon is back in the directory taking
 *    bookings. Asserted on the `where` Prisma is actually handed, because a
 *    fixture list can be "correct" while the query that produced it is not.
 * 3. **The founding count must agree with signup.** `foundingSpots()` and
 *    `OnboardingService.signup` read the same counter through the same cap;
 *    if they drift, the landing page advertises a spot the next signup
 *    refuses [F42].
 */
import { Test } from '@nestjs/testing';
import { MerchantsService } from './merchants.service';
import { MerchantsController } from './merchants.controller';
import { OnboardingService } from './onboarding.service';
import { MerchantAuthService } from './merchant-auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FOUNDING_MEMBER_CAP } from './founding';
import { DEFAULT_MERCHANT_PAGE, MAX_MERCHANT_PAGE } from './public-merchants-query.dto';
import { LISTABLE_MERCHANT_WHERE } from '../../common/salon-listable';

const M1 = 'merchant-1';
const M2 = 'merchant-2';

function aMerchant(over: Record<string, unknown> = {}) {
  return { id: M1, businessName: 'Glow Salon', foundingMember: false, ...over };
}

describe('MerchantsService.listPublic', () => {
  const merchantFindMany = jest.fn();
  const merchantCount = jest.fn();
  const styleFindMany = jest.fn();
  let service: MerchantsService;

  beforeEach(async () => {
    merchantFindMany.mockReset().mockResolvedValue([aMerchant()]);
    merchantCount.mockReset().mockResolvedValue(1);
    styleFindMany.mockReset().mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        MerchantsService,
        {
          provide: PrismaService,
          useValue: {
            merchant: { findMany: merchantFindMany, count: merchantCount },
            style: { findMany: styleFindMany },
            // listPublic batches the page and its total into one
            // $transaction; the mock resolves the array of promises the same
            // way Prisma does, so the service's destructuring is real.
            $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(MerchantsService);
  });

  it('lists only ACTIVE merchants, alphabetically', async () => {
    await service.listPublic();
    const args = merchantFindMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ status: 'ACTIVE' });
    expect(args.orderBy).toEqual({ businessName: 'asc' });
  });

  it('never selects passwordHash or stripeCustomerId', async () => {
    await service.listPublic();
    // [F31] — this endpoint is unauthenticated, so an accidental `include`
    // here publishes every salon's bcrypt hash to the open internet.
    expect(merchantFindMany.mock.calls[0][0].select).toEqual({
      id: true,
      businessName: true,
      foundingMember: true,
    });
  });

  it('keeps the id/businessName fields the RN client maps over', async () => {
    const { items } = await service.listPublic();
    expect(items[0]).toMatchObject({ id: M1, businessName: 'Glow Salon' });
  });

  it('folds a merchant active styles into a count and distinct types', async () => {
    merchantFindMany.mockResolvedValue([aMerchant(), aMerchant({ id: M2, businessName: 'Nail Bar' })]);
    styleFindMany.mockResolvedValue([
      { merchantId: M1, type: 'HAIR' },
      { merchantId: M1, type: 'HAIR' },
      { merchantId: M1, type: 'SPA' },
      { merchantId: M2, type: 'NAIL' },
    ]);

    const { items } = await service.listPublic();
    expect(items[0]).toMatchObject({ styleCount: 3, styleTypes: ['HAIR', 'SPA'] });
    expect(items[1]).toMatchObject({ styleCount: 1, styleTypes: ['NAIL'] });
  });

  it('reports zero styles rather than omitting a salon with an empty menu', async () => {
    // The website renders "Menu coming soon" for this case; dropping the row
    // instead would hide a live salon from the directory entirely.
    const { items } = await service.listPublic();
    expect(items[0]).toMatchObject({ styleCount: 0, styleTypes: [] });
  });

  it('only counts ACTIVE styles, scoped to the merchants on this page', async () => {
    merchantFindMany.mockResolvedValue([aMerchant()]);
    await service.listPublic();
    expect(styleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { merchantId: { in: [M1] }, active: true } }),
    );
  });

  it('skips the style query entirely when the page is empty', async () => {
    merchantFindMany.mockResolvedValue([]);
    const { items, total } = await service.listPublic();
    expect(items).toEqual([]);
    expect(total).toBe(1);
    // `merchantId: { in: [] }` would be a pointless round trip on every
    // search that matches nothing — the most common search there is.
    expect(styleFindMany).not.toHaveBeenCalled();
  });

  it('defaults to one page and honours limit/offset', async () => {
    await service.listPublic();
    expect(merchantFindMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: DEFAULT_MERCHANT_PAGE });

    await service.listPublic({ limit: 10, offset: 20 });
    expect(merchantFindMany.mock.calls[1][0]).toMatchObject({ skip: 20, take: 10 });
  });

  it('searches business names case-insensitively', async () => {
    await service.listPublic({ q: 'glow' });
    expect(merchantFindMany.mock.calls[0][0].where).toMatchObject({
      status: 'ACTIVE',
      businessName: { contains: 'glow', mode: 'insensitive' },
    });
  });

  it('treats a blank or whitespace-only q as no filter', async () => {
    // A cleared search box submits ''. `contains: ''` matches everything in
    // Postgres, so this is not about the results being wrong but about not
    // sending a filter that means nothing — and about `   ` not becoming a
    // search for three spaces, which matches nothing at all.
    for (const q of ['', '   ']) {
      merchantFindMany.mockClear();
      await service.listPublic({ q });
      // [F74] — the baseline `where` is now approved AND on a plan. This test
      // is about the SEARCH term, so it asserts the baseline is unchanged and
      // that no `businessName` filter was added, rather than restating the
      // whole visibility rule (which merchant-visibility.spec.ts owns).
      const where = merchantFindMany.mock.calls[0][0].where;
      expect(where).toEqual(LISTABLE_MERCHANT_WHERE);
      expect(where.businessName).toBeUndefined();
    }
  });

  it('counts the filtered directory, not the whole platform', async () => {
    merchantCount.mockResolvedValue(7);
    const { total } = await service.listPublic({ q: 'glow', limit: 2 });
    expect(total).toBe(7);
    expect(merchantCount.mock.calls[0][0].where).toMatchObject({
      status: 'ACTIVE',
      businessName: { contains: 'glow', mode: 'insensitive' },
    });
  });
});

describe('MerchantsService.foundingSpots', () => {
  const merchantCount = jest.fn();
  let service: MerchantsService;

  beforeEach(async () => {
    merchantCount.mockReset().mockResolvedValue(0);
    const moduleRef = await Test.createTestingModule({
      providers: [
        MerchantsService,
        {
          provide: PrismaService,
          useValue: { merchant: { count: merchantCount }, style: { findMany: jest.fn() } },
        },
      ],
    }).compile();
    service = moduleRef.get(MerchantsService);
  });

  it('reports the whole cap free on an empty platform', async () => {
    expect(await service.foundingSpots()).toEqual({
      cap: FOUNDING_MEMBER_CAP,
      taken: 0,
      left: FOUNDING_MEMBER_CAP,
    });
  });

  it('counts every merchant row, whatever its status', async () => {
    // OnboardingService gates the badge on an unfiltered `merchant.count()`,
    // so a PENDING salon has already taken a spot. Filtering to ACTIVE here
    // would advertise spots that signup then refuses.
    merchantCount.mockResolvedValue(12);
    expect(await service.foundingSpots()).toMatchObject({ taken: 12, left: FOUNDING_MEMBER_CAP - 12 });
    expect(merchantCount).toHaveBeenCalledWith();
  });

  it('never goes negative once the platform outgrows the cap', async () => {
    merchantCount.mockResolvedValue(FOUNDING_MEMBER_CAP + 9);
    expect(await service.foundingSpots()).toEqual({
      cap: FOUNDING_MEMBER_CAP,
      taken: FOUNDING_MEMBER_CAP,
      left: 0,
    });
  });

  it('flips to zero left on exactly the row that stops earning the badge', async () => {
    // signup does `count < CAP`, so the CAP-th row (count === CAP - 1) is the
    // last founding member and the next one is not. The boundary is asserted
    // because an off-by-one here shows the public page one free spot that
    // does not exist.
    merchantCount.mockResolvedValue(FOUNDING_MEMBER_CAP - 1);
    expect((await service.foundingSpots()).left).toBe(1);
    merchantCount.mockResolvedValue(FOUNDING_MEMBER_CAP);
    expect((await service.foundingSpots()).left).toBe(0);
  });
});

describe('MerchantsController — GET /merchants', () => {
  const listPublic = jest.fn();
  let controller: MerchantsController;
  let res: { setHeader: jest.Mock };

  beforeEach(async () => {
    listPublic.mockReset().mockResolvedValue({ items: [aMerchant()], total: 3 });
    res = { setHeader: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [MerchantsController],
      providers: [
        { provide: MerchantsService, useValue: { listPublic, foundingSpots: jest.fn() } },
        { provide: OnboardingService, useValue: {} },
        { provide: MerchantAuthService, useValue: {} },
      ],
    }).compile();
    controller = moduleRef.get(MerchantsController);
  });

  it('returns a bare array, not a { items, total } envelope', async () => {
    // The RN app does `setSalons(await fetchSalons())` and maps the result.
    // An envelope here breaks Order 2 on the day it ships.
    const body = await controller.list({}, res as never);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({ id: M1 });
  });

  it('puts the total in X-Total-Count and sets no other header', async () => {
    await controller.list({}, res as never);
    expect(res.setHeader).toHaveBeenCalledWith('X-Total-Count', '3');
    // Exposure is CORS' job, in config/security.ts. Setting
    // `Access-Control-Expose-Headers` here would REPLACE the rate-limit
    // headers that list exists to make readable, not add to them — the bug
    // T44 found and fixed. One call, and it is this one.
    expect(res.setHeader).toHaveBeenCalledTimes(1);
  });

  it('passes the validated query straight through', async () => {
    await controller.list({ q: 'glow', limit: 5, offset: 10 }, res as never);
    expect(listPublic).toHaveBeenCalledWith({ q: 'glow', limit: 5, offset: 10 });
  });
});

describe('PublicMerchantsQueryDto', () => {
  it('caps the page size an anonymous caller can ask for', () => {
    // `?limit=1000000` on an unauthenticated route is a free way to make the
    // server build an unbounded response.
    expect(MAX_MERCHANT_PAGE).toBeLessThanOrEqual(100);
    expect(DEFAULT_MERCHANT_PAGE).toBeLessThanOrEqual(MAX_MERCHANT_PAGE);
  });
});
