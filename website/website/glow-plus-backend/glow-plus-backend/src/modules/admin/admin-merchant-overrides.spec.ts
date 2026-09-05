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
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { MerchantsService } from '../merchants/merchants.service';
import { EmailVerificationService } from '../auth/email-verification.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RequireAdminGuard } from '../../common/guards/require-admin.guard';

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
