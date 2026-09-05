/**
 * Salon signup writes the salon's address  (M2)
 *
 * The bug this closes was not a crash. `POST /merchants/signup` took three
 * fields, wrote three fields, returned 201, and every salon it created had
 * `city: null` — which meant the mobile app's city filter and its "Nearest"
 * sort had nothing to filter or sort. Nothing anywhere reported a problem.
 *
 * So what is asserted here is the WRITE, not the response: that the address
 * reaches Prisma, that a blank optional field is stored as null rather than as
 * an empty string, and that a geocoder outage cannot fail a signup that has
 * already taken a Stripe customer and a database row.
 */

// Hoisted above the import of the service under test, because
// `onboarding.service.ts` constructs its Stripe client at module scope. Without
// this the constructor runs for real and `customers.create` reaches the
// network — the same reason `e2e.spec.ts` creates its merchant row directly.
const customerCreate = jest.fn();
jest.mock('stripe', () => ({
  __esModule: true,
  default: class {
    customers = { create: customerCreate };
  },
}));

import { Test } from '@nestjs/testing';
import { OnboardingService } from './onboarding.service';
import { MerchantsService } from './merchants.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailVerificationService } from '../auth/email-verification.service';

const SIGNUP = {
  businessName: 'Glow Salon',
  email: 'salon@example.com',
  password: 'Password123!',
  addressLine: '12 King Street West',
  city: 'Toronto',
};

describe('OnboardingService.signup  (M2)', () => {
  const merchantCreate = jest.fn();
  const merchantFindUnique = jest.fn();
  const merchantCount = jest.fn();
  const sendVerificationEmail = jest.fn();
  const deriveCoordinates = jest.fn();
  let service: OnboardingService;

  beforeEach(async () => {
    customerCreate.mockReset().mockResolvedValue({ id: 'cus_test' });
    merchantFindUnique.mockReset().mockResolvedValue(null);
    merchantCount.mockReset().mockResolvedValue(0);
    sendVerificationEmail.mockReset().mockResolvedValue(undefined);
    deriveCoordinates.mockReset().mockResolvedValue(null);
    merchantCreate.mockReset().mockImplementation(({ data }) =>
      Promise.resolve({ id: 'merchant-1', status: 'PENDING', ...data }),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        OnboardingService,
        {
          provide: PrismaService,
          useValue: {
            merchant: {
              create: merchantCreate,
              findUnique: merchantFindUnique,
              count: merchantCount,
            },
          },
        },
        { provide: EmailVerificationService, useValue: { sendVerificationEmail } },
        { provide: MerchantsService, useValue: { deriveCoordinates } },
      ],
    }).compile();
    service = moduleRef.get(OnboardingService);
  });

  it('writes the address and city onto the new salon', async () => {
    await service.signup(SIGNUP);

    expect(merchantCreate.mock.calls[0][0].data).toMatchObject({
      businessName: 'Glow Salon',
      addressLine: '12 King Street West',
      city: 'Toronto',
    });
  });

  it('trims what the signup form sent', async () => {
    await service.signup({ ...SIGNUP, addressLine: '  12 King St  ', city: ' Toronto ' });

    expect(merchantCreate.mock.calls[0][0].data).toMatchObject({
      addressLine: '12 King St',
      city: 'Toronto',
    });
  });

  it('stores an omitted region and postal code as null, not as a blank string', async () => {
    await service.signup({ ...SIGNUP, region: '   ' });

    expect(merchantCreate.mock.calls[0][0].data).toMatchObject({
      region: null,
      postalCode: null,
    });
  });

  it('never lets the signup route set a map pin directly', async () => {
    // Coordinates are DERIVED. This route is unauthenticated, and one that
    // writes a pin for an anonymous caller writes a pin for anyone.
    await service.signup({ ...SIGNUP, latitude: 1, longitude: 2 } as never);

    const data = merchantCreate.mock.calls[0][0].data;
    expect(data.latitude).toBeUndefined();
    expect(data.longitude).toBeUndefined();
  });

  it('places the salon on the map from the address it just gave', async () => {
    deriveCoordinates.mockResolvedValue({ latitude: 43.6487, longitude: -79.3817 });

    const result = await service.signup(SIGNUP);

    expect(deriveCoordinates).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'merchant-1', city: 'Toronto' }),
    );
    expect(result).toMatchObject({ located: true });
  });

  it('reports an unplaced salon rather than pretending it was placed', async () => {
    deriveCoordinates.mockResolvedValue(null);

    await expect(service.signup(SIGNUP)).resolves.toMatchObject({ located: false });
  });

  /**
   * The one that matters in production. By the time geocoding runs, the signup
   * has already created a Stripe customer and a database row — so a failure
   * here must never become a failed signup with an orphan behind it. Same
   * guarantee the verification email above it has had since [F27].
   */
  it('still succeeds when geocoding blows up entirely', async () => {
    deriveCoordinates.mockRejectedValue(new Error('ETIMEDOUT'));

    await expect(service.signup(SIGNUP)).resolves.toMatchObject({
      id: 'merchant-1',
      located: false,
    });
  });
});
