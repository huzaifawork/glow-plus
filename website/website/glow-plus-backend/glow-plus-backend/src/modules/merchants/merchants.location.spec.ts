/**
 * Where a salon is, and how it gets there  (M2)
 *
 * M1 built the columns, the API and the portal form; M2 is about the data
 * actually arriving. Two mechanisms carry that, and both are pinned here:
 *
 *   1. **The address is captured at signup**, so no salon can exist without a
 *      city ever again. Covered by `MerchantSignupDto` in
 *      `common/input-validation.spec.ts` and by the write asserted below.
 *   2. **Coordinates are derived from that address**, so distance sorting has
 *      numbers to work with without anyone copying them out of Google Maps.
 *
 * The failure this guards against is quiet in exactly the way the original
 * bug was: everything still returns 200, the salon is created, the portal
 * looks right — and the row has `city: null`, so the app's city filter and
 * "Nearest" sort silently have nothing to show.
 */
import { Test } from '@nestjs/testing';
import { MerchantsService } from './merchants.service';
import { PrismaService } from '../../prisma/prisma.service';
import * as geocode from '../../common/geocode';

const MERCHANT_ID = 'merchant-1';

/** A row as MERCHANT_PUBLIC_SELECT returns it, with no location set. */
function unlocated(over: Record<string, unknown> = {}) {
  return {
    id: MERCHANT_ID,
    businessName: 'Glow Salon',
    addressLine: null,
    city: null,
    region: null,
    postalCode: null,
    latitude: null,
    longitude: null,
    logoUpdatedAt: null,
    ...over,
  };
}

describe('MerchantsService.updateLocation  (M2)', () => {
  const merchantUpdate = jest.fn();
  let service: MerchantsService;
  let geocodeSpy: jest.SpyInstance;

  beforeEach(async () => {
    merchantUpdate.mockReset();
    geocodeSpy = jest.spyOn(geocode, 'geocodeAddress').mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        MerchantsService,
        { provide: PrismaService, useValue: { merchant: { update: merchantUpdate } } },
      ],
    }).compile();
    service = moduleRef.get(MerchantsService);
  });

  afterEach(() => geocodeSpy.mockRestore());

  it('derives coordinates from an address the salon just saved', async () => {
    merchantUpdate.mockResolvedValueOnce(
      unlocated({ addressLine: '12 King St', city: 'Toronto' }),
    );
    merchantUpdate.mockResolvedValueOnce({});
    geocodeSpy.mockResolvedValue({ latitude: 43.6487, longitude: -79.3817 });

    const result = await service.updateLocation(MERCHANT_ID, {
      addressLine: '12 King St',
      city: 'Toronto',
    });

    // Written to the row...
    expect(merchantUpdate).toHaveBeenCalledTimes(2);
    expect(merchantUpdate.mock.calls[1][0]).toMatchObject({
      where: { id: MERCHANT_ID },
      data: { latitude: 43.6487, longitude: -79.3817 },
    });
    // ...and reflected in what the portal is handed back, so the form does not
    // show blank coordinates until the next reload.
    expect(result).toMatchObject({ latitude: 43.6487, longitude: -79.3817 });
  });

  /**
   * A salon that typed its own numbers has said something more precise than an
   * address. Re-geocoding over the top would quietly move a pin the owner
   * placed on purpose.
   */
  it('never overwrites coordinates the salon entered itself', async () => {
    merchantUpdate.mockResolvedValueOnce(
      unlocated({ addressLine: '12 King St', city: 'Toronto', latitude: 1, longitude: 2 }),
    );

    const result = await service.updateLocation(MERCHANT_ID, {
      latitude: 1,
      longitude: 2,
      addressLine: '12 King St',
      city: 'Toronto',
    });

    expect(geocodeSpy).not.toHaveBeenCalled();
    expect(merchantUpdate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ latitude: 1, longitude: 2 });
  });

  /**
   * The behaviour that has to survive a geocoder outage: the address is still
   * saved, the caller still gets a 200, and the salon is simply unplaced —
   * which is a state the schema, the API and both clients already handle.
   */
  it('still saves the address when the geocoder answers nothing', async () => {
    merchantUpdate.mockResolvedValueOnce(unlocated({ city: 'Nowhere' }));
    geocodeSpy.mockResolvedValue(null);

    const result = await service.updateLocation(MERCHANT_ID, { city: 'Nowhere' });

    expect(merchantUpdate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ city: 'Nowhere', latitude: null, longitude: null });
  });

  it('does not fail the save when the coordinate write itself throws', async () => {
    merchantUpdate.mockResolvedValueOnce(unlocated({ city: 'Toronto' }));
    merchantUpdate.mockRejectedValueOnce(new Error('row vanished'));
    geocodeSpy.mockResolvedValue({ latitude: 43.6, longitude: -79.4 });

    await expect(service.updateLocation(MERCHANT_ID, { city: 'Toronto' })).resolves.toMatchObject({
      city: 'Toronto',
    });
  });

  /** M1's paired-coordinate rule, unchanged by M2 and easy to break. */
  it('still refuses a half-set coordinate pair', async () => {
    await expect(service.updateLocation(MERCHANT_ID, { latitude: 43.6 })).rejects.toThrow(
      /together/i,
    );
    expect(merchantUpdate).not.toHaveBeenCalled();
  });

  it('clears a field sent as null and leaves an absent one alone', async () => {
    merchantUpdate.mockResolvedValueOnce(unlocated());

    await service.updateLocation(MERCHANT_ID, { city: null });

    expect(merchantUpdate.mock.calls[0][0].data).toEqual({ city: null });
  });

  it('stores an all-whitespace value as null, not as a blank city', async () => {
    merchantUpdate.mockResolvedValueOnce(unlocated());

    await service.updateLocation(MERCHANT_ID, { city: '   ' });

    // A directory that groups salons by city must not grow a "  " city.
    expect(merchantUpdate.mock.calls[0][0].data).toEqual({ city: null });
  });
});

describe('MerchantsService.deriveCoordinates  (M2)', () => {
  const merchantUpdate = jest.fn();
  let service: MerchantsService;
  let geocodeSpy: jest.SpyInstance;

  beforeEach(async () => {
    merchantUpdate.mockReset().mockResolvedValue({});
    geocodeSpy = jest.spyOn(geocode, 'geocodeAddress').mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        MerchantsService,
        { provide: PrismaService, useValue: { merchant: { update: merchantUpdate } } },
      ],
    }).compile();
    service = moduleRef.get(MerchantsService);
  });

  afterEach(() => geocodeSpy.mockRestore());

  it('is a no-op for a salon that already has a pin', async () => {
    await expect(
      service.deriveCoordinates(unlocated({ city: 'Toronto', latitude: 1, longitude: 2 })),
    ).resolves.toBeNull();

    expect(geocodeSpy).not.toHaveBeenCalled();
    expect(merchantUpdate).not.toHaveBeenCalled();
  });

  it('passes the salon its whole address, not just the city', async () => {
    geocodeSpy.mockResolvedValue({ latitude: 1, longitude: 2 });

    await service.deriveCoordinates(
      unlocated({
        addressLine: '12 King St',
        city: 'Toronto',
        region: 'Ontario',
        postalCode: 'M5H 1A1',
      }),
    );

    expect(geocodeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        addressLine: '12 King St',
        city: 'Toronto',
        region: 'Ontario',
        postalCode: 'M5H 1A1',
      }),
    );
  });

  it('writes nothing when the address cannot be placed', async () => {
    geocodeSpy.mockResolvedValue(null);

    await expect(service.deriveCoordinates(unlocated({ city: 'Nowhere' }))).resolves.toBeNull();
    expect(merchantUpdate).not.toHaveBeenCalled();
  });
});
