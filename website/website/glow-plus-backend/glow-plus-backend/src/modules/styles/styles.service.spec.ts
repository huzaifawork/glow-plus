/**
 * Tests for a salon's public menu — `GET /styles/public/:merchantId`  (T44)
 *
 * Four things are pinned here, and they fail in different ways.
 *
 * 1. **The five fields are a published contract.** `fetchSalonStyles`
 *    (`client.js:157`) feeds `BookScreen.js`, which renders
 *    `st.name · st.durationMinutes` and books `st.id`. The body must stay a
 *    bare array carrying those names. Asserted on the *controller* as well as
 *    the service, because the header-setting handler is exactly where a
 *    `passthrough: false` slip would swallow the body entirely.
 * 2. **The two visibility rules — ACTIVE merchant, active style — are the
 *    whole reason this route exists separately from `list()`.** Asserted on
 *    the `where` Prisma is actually handed, because a fixture can be right
 *    while the query that produced it is not.
 * 3. **The menu must agree with the directory's `styleCount`.** T43 counts
 *    `active: true` rows; if this route ever used a different rule, a salon
 *    card would advertise "3 styles" and the menu behind it would show two.
 * 4. **The select is an allow-list.** Style holds nothing secret today, which
 *    is precisely the state in which an `include` gets added to an
 *    unauthenticated route without anyone noticing [F31].
 */
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StylesService, STYLE_PUBLIC_SELECT } from './styles.service';
import { StylesController } from './styles.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_STYLE_PAGE, MAX_STYLE_PAGE } from './public-styles.dto';

const MID = 'merchant-1';

function aStyle(over: Record<string, unknown> = {}) {
  return {
    id: 'style-1',
    name: 'Balayage',
    type: 'HAIR',
    pointsPerVisit: 50,
    durationMinutes: 90,
    ...over,
  };
}

describe('StylesService.listPublicForMerchant', () => {
  const merchantFindUnique = jest.fn();
  const styleFindMany = jest.fn();
  const styleCount = jest.fn();
  let service: StylesService;

  beforeEach(async () => {
    merchantFindUnique.mockReset().mockResolvedValue({ status: 'ACTIVE' });
    styleFindMany.mockReset().mockResolvedValue([aStyle()]);
    styleCount.mockReset().mockResolvedValue(1);

    const moduleRef = await Test.createTestingModule({
      providers: [
        StylesService,
        {
          provide: PrismaService,
          useValue: {
            merchant: { findUnique: merchantFindUnique },
            style: { findMany: styleFindMany, count: styleCount },
            // The page and its total are batched into one $transaction; the
            // mock resolves the array of promises the way Prisma does, so
            // the service's destructuring is exercised for real.
            $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(StylesService);
  });

  it('404s for a merchant that does not exist', async () => {
    merchantFindUnique.mockResolvedValue(null);
    await expect(service.listPublicForMerchant(MID)).rejects.toBeInstanceOf(NotFoundException);
    expect(styleFindMany).not.toHaveBeenCalled();
  });

  it.each(['PENDING', 'SUSPENDED', 'CANCELLED'])(
    '404s rather than returning an empty menu for a %s merchant',
    async (status) => {
      // 404, not `[]`: "this salon has no services yet" and "this salon is
      // not open to customers" must not look identical to the caller.
      merchantFindUnique.mockResolvedValue({ status });
      await expect(service.listPublicForMerchant(MID)).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  it('never reads the merchant row beyond its status', async () => {
    await service.listPublicForMerchant(MID);
    expect(merchantFindUnique).toHaveBeenCalledWith({
      where: { id: MID },
      select: { status: true },
    });
  });

  it('lists only active styles for that one merchant, oldest first', async () => {
    await service.listPublicForMerchant(MID);
    const args = styleFindMany.mock.calls[0][0];
    // The same rule T43's directory counts on. If these two disagree, a
    // salon card advertises a style count its own menu cannot show.
    expect(args.where).toEqual({ merchantId: MID, active: true });
    expect(args.orderBy).toEqual({ createdAt: 'asc' });
  });

  it('counts with the same where as the page', async () => {
    // Otherwise X-Total-Count is the merchant's whole catalogue, retired
    // styles included, and a caller pages towards rows that never arrive.
    await service.listPublicForMerchant(MID);
    expect(styleCount).toHaveBeenCalledWith({ where: { merchantId: MID, active: true } });
  });

  it('selects an explicit allow-list and nothing else', async () => {
    await service.listPublicForMerchant(MID);
    expect(styleFindMany.mock.calls[0][0].select).toEqual(STYLE_PUBLIC_SELECT);
    // Spelled out rather than only compared to the constant, so that
    // widening the constant fails here instead of passing silently.
    expect(STYLE_PUBLIC_SELECT).toEqual({
      id: true,
      name: true,
      type: true,
      pointsPerVisit: true,
      durationMinutes: true,
    });
  });

  it('keeps every field BookScreen renders and books on', async () => {
    const { items } = await service.listPublicForMerchant(MID);
    expect(items[0]).toMatchObject({
      id: 'style-1',
      name: 'Balayage',
      type: 'HAIR',
      pointsPerVisit: 50,
      durationMinutes: 90,
    });
  });

  it('defaults to one page and honours limit/offset', async () => {
    await service.listPublicForMerchant(MID);
    expect(styleFindMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: DEFAULT_STYLE_PAGE });

    await service.listPublicForMerchant(MID, { limit: 2, offset: 4 });
    expect(styleFindMany.mock.calls[1][0]).toMatchObject({ skip: 4, take: 2 });
  });

  it('reports the unpaged total even when the page is smaller', async () => {
    styleCount.mockResolvedValue(9);
    styleFindMany.mockResolvedValue([aStyle()]);
    const { items, total } = await service.listPublicForMerchant(MID, { limit: 1 });
    expect(items).toHaveLength(1);
    expect(total).toBe(9);
  });

  it('returns an empty menu for a live salon with no styles yet', async () => {
    // Not a 404: the salon is open, it just has nothing on the menu, and
    // both clients render "No bookable services yet" for exactly this.
    styleFindMany.mockResolvedValue([]);
    styleCount.mockResolvedValue(0);
    await expect(service.listPublicForMerchant(MID)).resolves.toEqual({ items: [], total: 0 });
  });
});

describe('StylesController — GET /styles/public/:merchantId', () => {
  const listPublicForMerchant = jest.fn();
  let controller: StylesController;
  let res: { setHeader: jest.Mock };

  beforeEach(async () => {
    listPublicForMerchant.mockReset().mockResolvedValue({ items: [aStyle()], total: 3 });
    res = { setHeader: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [StylesController],
      providers: [
        { provide: StylesService, useValue: { listPublicForMerchant } },
        // Not used by the public route, but the controller's merchant routes
        // declare RequireActiveSubscriptionGuard and Nest instantiates every
        // guard on the controller when the module compiles.
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();
    controller = moduleRef.get(StylesController);
  });

  it('returns a bare array, not a { items, total } envelope', async () => {
    // `setStyleList(await fetchSalonStyles(...))` then `styleList.map(...)`
    // — an envelope here breaks Order 2 on the day it ships.
    const body = await controller.listPublic({ merchantId: MID }, {}, res as never);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({ id: 'style-1', durationMinutes: 90 });
  });

  it('puts the total in X-Total-Count and sets no other header', async () => {
    await controller.listPublic({ merchantId: MID }, {}, res as never);
    expect(res.setHeader).toHaveBeenCalledWith('X-Total-Count', '3');
    // Exposure is CORS' job, in config/security.ts. Setting
    // `Access-Control-Expose-Headers` here would REPLACE the rate-limit
    // headers that list exists to make readable, not add to them — the bug
    // T44 found and fixed. One call, and it is this one.
    expect(res.setHeader).toHaveBeenCalledTimes(1);
  });

  it('passes the validated param and query straight through', async () => {
    await controller.listPublic({ merchantId: MID }, { limit: 5, offset: 10 }, res as never);
    expect(listPublicForMerchant).toHaveBeenCalledWith(MID, { limit: 5, offset: 10 });
  });
});

describe('PublicStylesQueryDto', () => {
  it('caps the page size an anonymous caller can ask for', () => {
    // `?limit=1000000` on an unauthenticated route is a free way to make the
    // server build an unbounded response.
    expect(MAX_STYLE_PAGE).toBeLessThanOrEqual(200);
    expect(DEFAULT_STYLE_PAGE).toBeLessThanOrEqual(MAX_STYLE_PAGE);
  });
});
