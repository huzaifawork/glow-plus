/**
 * Tests for the public-visibility rule  (T48) [F47]
 *
 * The rule itself is four lines. What these pin is that **four routes agree on
 * it**, three of which are reachable without an account — so a disagreement is
 * not an inconsistency, it is a customer being shown something the next
 * request refuses.
 *
 * That was the actual defect. `GET /styles/public/:merchantId` had the rule
 * from T44; `GET /bookings/availability`, `POST /bookings` and
 * `GET /business-hours/:merchantId` did not, so a salon suspended for
 * non-payment kept **accepting bookings** through the public API while its own
 * menu 404'd. Proved by disabling the rule against the running API and
 * watching a booking row get written for a SUSPENDED merchant.
 *
 * The four call sites are asserted here rather than only in each service's own
 * spec, because the failure mode is *drift between them* — a per-service test
 * passes happily while two services answer differently.
 */
import { NotFoundException } from '@nestjs/common';
import { assertMerchantVisible } from './merchant-visibility';

const prismaWith = (status: string | null) => ({
  merchant: {
    findUnique: jest.fn().mockResolvedValue(status === null ? null : { status }),
  },
});

describe('assertMerchantVisible (T48 [F47])', () => {
  it('lets an ACTIVE merchant through', async () => {
    await expect(assertMerchantVisible(prismaWith('ACTIVE') as any, 'm_1')).resolves.toBeUndefined();
  });

  // The three that were serving customers before T48.
  it.each(['SUSPENDED', 'PENDING', 'CANCELLED'])('refuses a %s merchant', async (status) => {
    await expect(assertMerchantVisible(prismaWith(status) as any, 'm_1')).rejects.toThrow(NotFoundException);
  });

  it('refuses a merchant that does not exist', async () => {
    await expect(assertMerchantVisible(prismaWith(null) as any, 'nope')).rejects.toThrow(NotFoundException);
  });

  it('says the same thing for missing and not-visible', async () => {
    // One message per route for both cases, so "no such salon" and "that salon
    // is suspended" are not distinguishable from outside.
    const gone = await assertMerchantVisible(prismaWith(null) as any, 'x').catch((e) => e.message);
    const suspended = await assertMerchantVisible(prismaWith('SUSPENDED') as any, 'x').catch((e) => e.message);

    expect(gone).toBe(suspended);
    expect(gone).toBe('Merchant not found');
  });

  it('lets a call site supply a clearer message without splitting the two cases', async () => {
    const msg = 'This salon is not currently accepting bookings';
    const gone = await assertMerchantVisible(prismaWith(null) as any, 'x', msg).catch((e) => e.message);
    const suspended = await assertMerchantVisible(prismaWith('SUSPENDED') as any, 'x', msg).catch((e) => e.message);

    expect(gone).toBe(msg);
    expect(suspended).toBe(msg);
  });

  it('selects the status ONLY', async () => {
    const prisma = prismaWith('ACTIVE');

    await assertMerchantVisible(prisma as any, 'm_1');

    // This runs on unauthenticated routes. An `include`, or a select that grew
    // a field, publishes every salon's bcrypt hash to the open internet [F31].
    expect(prisma.merchant.findUnique).toHaveBeenCalledWith({
      where: { id: 'm_1' },
      select: { status: true },
    });
  });
});

/**
 * Every public salon-scoped route asks the question, and asks it FIRST.
 *
 * "First" is not a detail: if the style lookup ran ahead of it, a suspended
 * salon would answer 404 for a bad style id and 200 for a good one, which
 * leaks its existence and its catalogue to exactly the caller it is hidden
 * from.
 */
describe('the four public salon-scoped routes all apply it (T48)', () => {
  const read = (path: string) =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('fs').readFileSync(require('path').join(__dirname, '..', path), 'utf8');

  it.each([
    ['the public menu', 'modules/styles/styles.service.ts', 'listPublicForMerchant'],
    ['availability', 'modules/bookings/availability.service.ts', 'getAvailableSlots'],
    ['booking creation', 'modules/bookings/bookings.service.ts', 'async create'],
    ['opening hours', 'modules/business-hours/business-hours.service.ts', 'async get'],
  ])('%s calls assertMerchantVisible', (_label, file, method) => {
    const src = read(file);

    expect(src).toContain('assertMerchantVisible');

    // ...and before it touches anything else in that method.
    const body = src.slice(src.indexOf(method));
    const check = body.indexOf('assertMerchantVisible');
    const firstQuery = body.indexOf('this.prisma.');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(firstQuery);
  });
});
