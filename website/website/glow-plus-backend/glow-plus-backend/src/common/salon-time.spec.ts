import {
  SALON_TIMEZONE,
  dayOfWeekFor,
  isValidDateISO,
  salonWallTimeToInstant,
} from './salon-time';

/**
 * [F57] — the bug these exist to pin.
 *
 * `availability.service.ts` used `d.setHours(9, 0)` to resolve "09:00", which
 * reads the **Node process's** timezone. It was invisible on a developer
 * machine and changed meaning on deploy, because Vercel runs UTC. Every
 * assertion below is written against a fixed IANA zone, so it fails the same
 * way no matter what TZ the test runner happens to be in — which is the whole
 * property the old code lacked.
 */
describe('salon-time [F57]', () => {
  const TORONTO = 'America/Toronto';

  describe('salonWallTimeToInstant', () => {
    it('resolves a wall-clock time against the salon zone, not the process zone', () => {
      // 2026-08-26 is EDT (UTC-4), so 09:00 local is 13:00Z.
      expect(salonWallTimeToInstant('2026-08-26', '09:00', TORONTO).toISOString()).toBe(
        '2026-08-26T13:00:00.000Z',
      );
    });

    it('tracks the DST offset change rather than a fixed one', () => {
      // Same wall-clock time, six weeks apart, either side of the November
      // transition: EDT (UTC-4) then EST (UTC-5). A hardcoded offset — or a
      // process running in a fixed-offset zone — gets one of these wrong.
      expect(salonWallTimeToInstant('2026-10-15', '09:00', TORONTO).toISOString()).toBe(
        '2026-10-15T13:00:00.000Z',
      );
      expect(salonWallTimeToInstant('2026-12-15', '09:00', TORONTO).toISOString()).toBe(
        '2026-12-15T14:00:00.000Z',
      );
    });

    it('is correct on the day the clocks go forward', () => {
      // 2026-03-08: 02:00 EST jumps to 03:00 EDT. A salon opening at 09:00
      // that morning is already on EDT, so 13:00Z — this is the case the
      // single-pass version of the conversion lands an hour out on.
      expect(salonWallTimeToInstant('2026-03-08', '09:00', TORONTO).toISOString()).toBe(
        '2026-03-08T13:00:00.000Z',
      );
    });

    it('is correct on the day the clocks go back', () => {
      // 2026-11-01: 02:00 EDT falls back to 01:00 EST. 09:00 is after the
      // transition, so EST, so 14:00Z.
      expect(salonWallTimeToInstant('2026-11-01', '09:00', TORONTO).toISOString()).toBe(
        '2026-11-01T14:00:00.000Z',
      );
    });

    it('treats UTC as a zone like any other', () => {
      expect(salonWallTimeToInstant('2026-08-26', '09:00', 'UTC').toISOString()).toBe(
        '2026-08-26T09:00:00.000Z',
      );
    });

    it('handles midnight and end-of-day without rolling the date', () => {
      expect(salonWallTimeToInstant('2026-08-26', '00:00', TORONTO).toISOString()).toBe(
        '2026-08-26T04:00:00.000Z',
      );
      expect(salonWallTimeToInstant('2026-08-26', '23:30', TORONTO).toISOString()).toBe(
        '2026-08-27T03:30:00.000Z',
      );
    });

    it('defaults to the configured salon timezone', () => {
      expect(salonWallTimeToInstant('2026-08-26', '09:00').toISOString()).toBe(
        salonWallTimeToInstant('2026-08-26', '09:00', SALON_TIMEZONE).toISOString(),
      );
    });
  });

  describe('dayOfWeekFor', () => {
    it('matches BusinessHours.dayOfWeek, 0 = Sunday', () => {
      expect(dayOfWeekFor('2026-08-30')).toBe(0); // Sunday
      expect(dayOfWeekFor('2026-08-26')).toBe(3); // Wednesday
      expect(dayOfWeekFor('2026-08-29')).toBe(6); // Saturday
    });

    it('is not shifted by the process timezone', () => {
      // The old `new Date(dateISO + 'T00:00:00').getDay()` parsed local, so a
      // process east of UTC could resolve a date to the previous weekday and
      // read the wrong salon-hours row entirely.
      expect(dayOfWeekFor('2026-01-01')).toBe(4); // Thursday
    });
  });

  describe('isValidDateISO', () => {
    it('accepts a real calendar date', () => {
      expect(isValidDateISO('2026-08-26')).toBe(true);
      expect(isValidDateISO('2028-02-29')).toBe(true); // leap year
    });

    it('rejects malformed input and dates that do not exist', () => {
      for (const bad of ['', 'tomorrow', '2026-8-26', '26-08-2026', '2026-13-01', '2026-02-30', '2027-02-29']) {
        expect(isValidDateISO(bad)).toBe(false);
      }
    });
  });
});
