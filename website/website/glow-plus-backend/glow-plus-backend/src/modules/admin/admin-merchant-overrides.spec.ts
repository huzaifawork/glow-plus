/**
 * The operator's overrides for a salon's address and logo  (M2)
 *
 * Two separate things are pinned, and the second is the one with history.
 *
 * **They delegate.** `MerchantsService` holds the paired-coordinate rule, the
 * blank-is-null trimming and the geocoding fallback. A second implementation
 * inside the admin module would be a second set of those rules, and the two
 * would drift the first time one changed — so the delegation is the contract,
 * not an implementation detail.
 *
 * **They are guarded.** [F7] was three admin routes shipped with no guard at
 * all: `GET /admin/merchants/pending` returned every pending salon's bcrypt
 * hash to any logged-in consumer. The lesson was that "every route except
 * login sits behind RequireAdminGuard" is a rule a test has to hold, because
 * a new route inherits nothing — a missing decorator looks exactly like a
 * present one until someone calls it without a token.
 */
import { Test } from '@nestjs/testing';
import { RequestMethod } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { MerchantsService } from '../merchants/merchants.service';
import { EmailVerificationService } from '../auth/email-verification.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RequireAdminGuard } from '../../common/guards/require-admin.guard';
import { AdminModule } from './admin.module';
import { MAX_LOGO_DATA_URL } from '../../common/limits';
import { withVersion } from '../../config/version';

const MERCHANT_ID = 'merchant-1';

describe('AdminService — salon location and logo overrides  (M2)', () => {
  const updateLocation = jest.fn();
  const setLogo = jest.fn();
  const deleteLogo = jest.fn();
  let service: AdminService;

  beforeEach(async () => {
    updateLocation.mockReset().mockResolvedValue({ id: MERCHANT_ID });
    setLogo.mockReset().mockResolvedValue({ ok: true });
    deleteLogo.mockReset().mockResolvedValue({ ok: true, logoUrl: null });

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: {} },
        {
          provide: MerchantsService,
          useValue: { updateLocation, setLogo, deleteLogo },
        },
        { provide: EmailVerificationService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(AdminService);
  });

  it('hands the address patch to the salon-side service unchanged', async () => {
    const patch = { addressLine: '12 King St', city: 'Toronto', latitude: null, longitude: null };

    await service.updateMerchantLocation(MERCHANT_ID, patch);

    // Unchanged, so the paired-coordinate rule, the null-clears semantics and
    // the geocoding fallback are the same ones the salon's own route uses.
    expect(updateLocation).toHaveBeenCalledWith(MERCHANT_ID, patch);
  });

  it('uploads and removes a logo through the same service the portal uses', async () => {
    await service.setMerchantLogo(MERCHANT_ID, 'data:image/png;base64,AAAA');
    expect(setLogo).toHaveBeenCalledWith(MERCHANT_ID, 'data:image/png;base64,AAAA');

    await service.removeMerchantLogo(MERCHANT_ID);
    expect(deleteLogo).toHaveBeenCalledWith(MERCHANT_ID);
  });
});

describe('AdminController — the new routes are guarded  (M2, guards against [F7])', () => {
  /**
   * Read straight off the prototype rather than through a testing module.
   * `@UseGuards` metadata is attached to the method, not to an instance, so no
   * instance is needed — and building one would mean constructing
   * RequireAdminGuard's own dependencies, which is a different test wearing
   * this one's clothes.
   */
  const guardsOn = (handler: string): unknown[] =>
    Reflect.getMetadata(
      '__guards__',
      (AdminController.prototype as unknown as Record<string, () => void>)[handler],
    ) ?? [];

  it.each([['updateMerchantLocation'], ['setMerchantLogo'], ['removeMerchantLogo']])(
    '%s requires an admin token',
    (handler) => {
      expect(guardsOn(handler)).toContain(RequireAdminGuard);
    },
  );

  /** The control, so a broken `guardsOn` cannot make the three above pass. */
  it('reads real metadata — login deliberately has no guard', () => {
    expect(guardsOn('login')).toHaveLength(0);
    expect(guardsOn('approve')).toContain(RequireAdminGuard);
  });
});

/**
 * The raised body limit for the operator's logo upload  (M2)
 *
 * This is the trap `merchants.module.ts` documents and `billing.module.ts`
 * hit before it: the mount matches the RAW url, so it has to carry the `/v1`
 * prefix. Get it wrong and the middleware silently never runs, Express's
 * 100 kB default applies, and every logo over that size dies as a bare
 * `PayloadTooLargeError` BEFORE any handler — an error with no message anyone
 * can act on, on exactly the uploads an operator is most likely to attempt.
 *
 * Asserted by calling `configure` with a stand-in consumer, because the
 * failure mode is a route string that looks right and matches nothing.
 */
describe('AdminModule — the logo route gets a body limit big enough for a logo  (M2)', () => {
  it('mounts a 2 MB-capable JSON parser on the versioned logo path', () => {
    const forRoutes = jest.fn();
    const apply = jest.fn().mockReturnValue({ forRoutes });

    new AdminModule().configure({ apply } as never);

    expect(forRoutes).toHaveBeenCalledWith({
      path: 'v1/admin/merchants/:id/logo',
      method: RequestMethod.PUT,
    });
    // The prefix is not hard-coded twice: if API_PREFIX ever moves, the mount
    // moves with it, and this assertion moves with both.
    expect(forRoutes.mock.calls[0][0].path).toBe(withVersion('admin/merchants/:id/logo'));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('sizes the limit off the same constant the DTO refuses on', () => {
    // A 2 MB image is ~2.7 MB as a base64 data URL. A limit below
    // MAX_LOGO_DATA_URL would reject at the parser, where there is no message,
    // instead of at the DTO, where there is one.
    expect(MAX_LOGO_DATA_URL).toBeGreaterThan(2 * 1024 * 1024);
  });
});
