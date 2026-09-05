import { buildGeocodeQuery, geocodeAddress } from './geocode';

/**
 * M2 — the geocoder, tested without touching the network.
 *
 * Two halves, and only one of them can be tested honestly here. The query
 * builder is pure and is where the interesting mistakes live: an address
 * assembled with a stray `undefined` or a lone street number still returns *a*
 * result from Nominatim, just a confidently wrong one, and nothing downstream
 * would ever flag it. The HTTP half is covered by asserting the two things
 * that must hold regardless of what the service answers — the kill switch
 * works, and a bad response can never become coordinates.
 */
describe('buildGeocodeQuery', () => {
  it('joins the parts a geocoder can actually use', () => {
    expect(
      buildGeocodeQuery({
        addressLine: '12 King Street West',
        city: 'Toronto',
        region: 'Ontario',
        postalCode: 'M5H 1A1',
      }),
    ).toBe('12 King Street West, Toronto, Ontario, M5H 1A1');
  });

  it('trims, and drops the fields the salon left blank', () => {
    expect(buildGeocodeQuery({ addressLine: '  12 King St  ', city: 'Toronto', region: '  ' })).toBe(
      '12 King St, Toronto',
    );
  });

  it('accepts a city on its own — a salon may not have typed a street', () => {
    expect(buildGeocodeQuery({ city: 'Toronto' })).toBe('Toronto');
  });

  it('accepts a postal code on its own', () => {
    expect(buildGeocodeQuery({ postalCode: 'M5H 1A1' })).toBe('M5H 1A1');
  });

  /**
   * The anchor rule. "12" geocodes to a house number somewhere on Earth and
   * "Ontario" to the middle of a province — both would place a salon
   * confidently in the wrong spot, which is worse than leaving it unplaced,
   * because an unplaced salon is a state every client already handles.
   */
  it('refuses a street line with no city or postal code', () => {
    expect(buildGeocodeQuery({ addressLine: '12' })).toBeNull();
  });

  it('refuses a region on its own', () => {
    expect(buildGeocodeQuery({ region: 'Ontario' })).toBeNull();
  });

  it('refuses an empty address', () => {
    expect(buildGeocodeQuery({})).toBeNull();
    expect(buildGeocodeQuery({ addressLine: null, city: null })).toBeNull();
  });
});

describe('geocodeAddress', () => {
  const address = { addressLine: '12 King Street West', city: 'Toronto' };
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    process.env.GEOCODER_DISABLED = 'true';
  });

  /** jest.setup.ts sets this, which is what keeps the whole suite offline. */
  it('returns null and makes no request when disabled', async () => {
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;

    await expect(geocodeAddress(address)).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('never calls the service for an address it cannot anchor', async () => {
    process.env.GEOCODER_DISABLED = 'false';
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;

    await expect(geocodeAddress({ addressLine: '12' })).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('reads coordinates out of a well-formed answer', async () => {
    process.env.GEOCODER_DISABLED = 'false';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      // Nominatim sends these as STRINGS, which is why the parse is explicit.
      json: async () => [{ lat: '43.6487', lon: '-79.3817' }],
    }) as unknown as typeof fetch;

    await expect(geocodeAddress(address)).resolves.toEqual({
      latitude: 43.6487,
      longitude: -79.3817,
    });
  });

  it('identifies itself, as the Nominatim usage policy requires', async () => {
    process.env.GEOCODER_DISABLED = 'false';
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = spy as unknown as typeof fetch;

    await geocodeAddress(address);

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('nominatim.openstreetmap.org');
    expect(String(url)).toContain(encodeURIComponent('12 King Street West, Toronto'));
    expect(init.headers['User-Agent']).toMatch(/^GlowPlus\//);
  });

  it.each([
    ['no match', { ok: true, json: async () => [] }],
    ['a non-200', { ok: false, json: async () => [{ lat: '1', lon: '1' }] }],
    ['a body that is not an array', { ok: true, json: async () => ({ lat: '1', lon: '1' }) }],
    ['coordinates that are not numbers', { ok: true, json: async () => [{ lat: 'x', lon: 'y' }] }],
    ['an out-of-range latitude', { ok: true, json: async () => [{ lat: '910', lon: '0' }] }],
  ])('returns null for %s', async (_label, response) => {
    process.env.GEOCODER_DISABLED = 'false';
    global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch;

    await expect(geocodeAddress(address)).resolves.toBeNull();
  });

  /**
   * The one that matters most in production: a geocoder outage must degrade
   * to "no coordinates yet", never to a failed signup.
   */
  it('swallows a network failure rather than throwing at its caller', async () => {
    process.env.GEOCODER_DISABLED = 'false';
    global.fetch = jest.fn().mockRejectedValue(new Error('ETIMEDOUT')) as unknown as typeof fetch;

    await expect(geocodeAddress(address)).resolves.toBeNull();
  });
});
