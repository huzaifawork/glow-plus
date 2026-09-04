/**
 * Distance and distance-sorting  (R3.6 – R3.9, NF6)
 *
 * The two things worth pinning here are the two the spec calls out explicitly
 * and that are easy to get wrong in a way nobody notices:
 *
 *  · a salon with **no registered location** must be handled gracefully, not
 *    dropped and not sorted to the front (the dependency note under 4.3.2);
 *  · the app must be **fully usable with no location at all** (R3.9).
 */
import {
  distanceKm,
  formatDistance,
  hasCoordinates,
  sortByDistance,
  withDistance,
} from '../src/utils/distance';

const TORONTO = { latitude: 43.6532, longitude: -79.3832 };

const salon = (name, latitude, longitude) => ({ businessName: name, latitude, longitude });

describe('distanceKm', () => {
  it('measures a known distance to within a percent', () => {
    // Toronto → Montreal is ~504 km great-circle. A wrong earth radius or a
    // missing degrees-to-radians conversion misses this by an order of
    // magnitude, which is exactly the kind of bug that still "looks sorted".
    const montreal = { latitude: 45.5019, longitude: -73.5674 };
    const km = distanceKm(TORONTO, montreal);
    expect(km).toBeGreaterThan(495);
    expect(km).toBeLessThan(515);
  });

  it('is zero for the same point, and symmetric', () => {
    expect(distanceKm(TORONTO, TORONTO)).toBeCloseTo(0, 6);
    const other = { latitude: 43.7, longitude: -79.4 };
    expect(distanceKm(TORONTO, other)).toBeCloseTo(distanceKm(other, TORONTO), 9);
  });

  it('returns null rather than NaN when either point has no coordinates', () => {
    // NaN would propagate into the sort comparator and produce an arbitrary
    // order, which is much harder to spot than a missing distance.
    expect(distanceKm(TORONTO, salon('No location', null, null))).toBeNull();
    expect(distanceKm(null, TORONTO)).toBeNull();
  });
});

describe('hasCoordinates', () => {
  it('rejects a half-set coordinate', () => {
    // The database refuses this too, but a client that trusted a constraint it
    // cannot see would put the salon on the prime meridian.
    expect(hasCoordinates({ latitude: 43.6, longitude: null })).toBe(false);
    expect(hasCoordinates({ latitude: null, longitude: -79.4 })).toBe(false);
  });

  it('rejects non-finite values', () => {
    expect(hasCoordinates({ latitude: NaN, longitude: 0 })).toBe(false);
    expect(hasCoordinates({ latitude: Infinity, longitude: 0 })).toBe(false);
  });

  it('accepts a real pair, including exact zeroes', () => {
    // (0, 0) is a real place. A truthiness check would reject it.
    expect(hasCoordinates({ latitude: 0, longitude: 0 })).toBe(true);
  });
});

describe('withDistance — R3.9, the no-permission path', () => {
  it('annotates every salon with null when there is no origin', () => {
    // The list must still be complete and usable. Losing salons because the
    // user declined location would be exactly what R3.9 forbids.
    const salons = [salon('A', 43.6, -79.4), salon('B', null, null)];
    const out = withDistance(salons, null);
    expect(out).toHaveLength(2);
    expect(out.every((s) => s.distanceKm === null)).toBe(true);
  });

  it('leaves the original order alone', () => {
    const salons = [salon('Z', 43.9, -79.9), salon('A', 43.6, -79.4)];
    expect(withDistance(salons, TORONTO).map((s) => s.businessName)).toEqual(['Z', 'A']);
  });
});

describe('sortByDistance — R3.7, and the dependency note', () => {
  it('puts the nearest salon first', () => {
    const list = withDistance(
      [salon('Far', 44.5, -79.4), salon('Near', 43.66, -79.39), salon('Middle', 43.9, -79.4)],
      TORONTO,
    );
    expect(sortByDistance(list).map((s) => s.businessName)).toEqual(['Near', 'Middle', 'Far']);
  });

  it('keeps salons with NO location, at the END', () => {
    // *"A salon that has not provided a location cannot be included in
    // distance-sorted results, and the app must handle that gracefully rather
    // than assuming every salon has one."*
    //
    // Dropping it hides a real, bookable salon. Treating a missing coordinate
    // as 0 puts it first, off the coast of Africa. Last, still present, is the
    // graceful reading.
    const list = withDistance(
      [salon('Nowhere', null, null), salon('Near', 43.66, -79.39)],
      TORONTO,
    );
    const sorted = sortByDistance(list);
    expect(sorted).toHaveLength(2);
    expect(sorted.map((s) => s.businessName)).toEqual(['Near', 'Nowhere']);
  });

  it('falls back to alphabetical among salons that all lack a location', () => {
    const list = withDistance([salon('Zeta', null, null), salon('Alpha', null, null)], TORONTO);
    expect(sortByDistance(list).map((s) => s.businessName)).toEqual(['Alpha', 'Zeta']);
  });

  it('does not mutate the array it was given', () => {
    // The screen memoises off the fetched list; sorting in place would make a
    // re-render produce a different order from the same data.
    const list = withDistance([salon('B', 44, -79), salon('A', 43.66, -79.39)], TORONTO);
    const before = list.map((s) => s.businessName);
    sortByDistance(list);
    expect(list.map((s) => s.businessName)).toEqual(before);
  });
});

describe('formatDistance', () => {
  it('uses metres under a kilometre and rounds to something believable', () => {
    // "437.2 m" claims a precision a phone GPS does not have.
    expect(formatDistance(0.44)).toBe('440 m');
    expect(formatDistance(0.05)).toBe('50 m');
  });

  it('uses one decimal place up to 10 km, and whole numbers beyond', () => {
    expect(formatDistance(2.44)).toBe('2.4 km');
    expect(formatDistance(18.4)).toBe('18 km');
  });

  it('returns null for a missing distance, so the badge renders nothing', () => {
    expect(formatDistance(null)).toBeNull();
    expect(formatDistance(undefined)).toBeNull();
    expect(formatDistance(NaN)).toBeNull();
  });
});
