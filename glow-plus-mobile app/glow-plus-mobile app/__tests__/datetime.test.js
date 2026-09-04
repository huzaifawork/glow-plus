/**
 * Dates and times.
 *
 * The whole file exists because of one platform bug worth not repeating
 * ([F63]): the server resolves a salon's "09:00" against the SALON's timezone
 * and returns real UTC instants, and a client that renders those in the
 * DEVICE's timezone shows a Toronto salon's 9am appointment as 6pm to someone
 * whose phone is set to Karachi. On a phone — which people travel with — that
 * is far more likely than it ever was in a browser.
 *
 * So the tests below run under a deliberately hostile device timezone and
 * assert the app still speaks the salon's.
 */
import {
  addDays,
  describeDateKey,
  formatDuration,
  relativeTime,
  toDateKey,
  todayKey,
  upcomingDateKeys,
} from '../src/utils/datetime';

describe('toDateKey — the salon’s calendar day, not the device’s', () => {
  it('uses the salon timezone even when the device is on the other side of the world', () => {
    // 2026-09-05T02:00Z is still the EVENING of 4 September in Toronto. A
    // client using `toISOString().slice(0, 10)` would file this appointment
    // under the wrong day, and the date strip would highlight the wrong cell.
    expect(toDateKey(new Date('2026-09-05T02:00:00.000Z'))).toBe('2026-09-04');
  });

  it('rolls over at the salon’s midnight', () => {
    // 04:00Z in September is 00:00 EDT.
    expect(toDateKey(new Date('2026-09-05T03:59:00.000Z'))).toBe('2026-09-04');
    expect(toDateKey(new Date('2026-09-05T04:01:00.000Z'))).toBe('2026-09-05');
  });

  it('always produces a YYYY-MM-DD key, zero-padded', () => {
    expect(toDateKey(new Date('2026-01-05T18:00:00.000Z'))).toBe('2026-01-05');
    expect(toDateKey(new Date('2026-12-31T18:00:00.000Z'))).toBe('2026-12-31');
  });
});

describe('addDays — calendar arithmetic, not 24-hour arithmetic', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('crosses a year boundary and goes backwards', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('adds a day across a DST transition', () => {
    // 8 March 2026 is the US/Canada spring-forward. The day is 23 hours long,
    // so millisecond arithmetic on a local-midnight Date lands on the same
    // calendar day and the strip shows the same date twice.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    // ...and the autumn fall-back, which is the 25-hour day.
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });
});

describe('describeDateKey', () => {
  it('says Today and Tomorrow', () => {
    const today = todayKey();
    expect(describeDateKey(today)).toBe('Today');
    expect(describeDateKey(addDays(today, 1))).toBe('Tomorrow');
  });

  it('names the weekday for anything further out', () => {
    const later = addDays(todayKey(), 5);
    const label = describeDateKey(later);
    expect(label).not.toBe('Today');
    expect(label).not.toBe('Tomorrow');
    // e.g. "Sat, 12 Sep" — a weekday and a number, in some order.
    expect(label).toMatch(/[A-Za-z]{3}/);
    expect(label).toMatch(/\d/);
  });

  it('names the correct weekday for a fixed date', () => {
    // Formatting a bare date from local midnight instead of noon shifts it a
    // day west of Greenwich — the classic off-by-one weekday bug.
    //
    // The date is deliberately DECADES away, not next week. An earlier version
    // of this test used 2026-09-05 and passed until the day it became
    // "Tomorrow", at which point it failed while the code was perfectly
    // correct. A test whose result depends on when it is run is a test that
    // will eventually lie about the thing it is guarding.
    //
    // The expected weekdays come from Python's datetime, i.e. an
    // implementation that shares no code with the one under test — asserting
    // against Intl here would only prove Intl agrees with itself.
    expect(describeDateKey('2099-01-05')).toMatch(/Mon/); // a Monday
    expect(describeDateKey('2099-01-07')).toMatch(/Wed/); // a Wednesday
  });
});

describe('upcomingDateKeys — the booking date strip', () => {
  it('starts at today and runs forward without gaps', () => {
    const keys = upcomingDateKeys(14);
    expect(keys).toHaveLength(14);
    expect(keys[0]).toBe(todayKey());
    for (let i = 1; i < keys.length; i += 1) {
      expect(keys[i]).toBe(addDays(keys[i - 1], 1));
    }
  });

  it('never offers a date in the past', () => {
    // A strip that starts yesterday offers a booking the server will refuse.
    expect(upcomingDateKeys(7).every((k) => k >= todayKey())).toBe(true);
  });
});

describe('relativeTime', () => {
  it('reads forwards for the future and backwards for the past', () => {
    expect(relativeTime(new Date(Date.now() + 2 * 3600_000).toISOString())).toMatch(/^in /);
    expect(relativeTime(new Date(Date.now() - 2 * 3600_000).toISOString())).toMatch(/ago$/);
  });

  it('steps through units as the gap grows', () => {
    const ago = (ms) => relativeTime(new Date(Date.now() - ms).toISOString());
    expect(ago(30_000)).toBe('just now');
    expect(ago(5 * 60_000)).toBe('5 min ago');
    expect(ago(3 * 3600_000)).toBe('3 hr ago');
    expect(ago(3 * 86_400_000)).toBe('3 days ago');
    expect(ago(21 * 86_400_000)).toBe('3 wk ago');
    expect(ago(120 * 86_400_000)).toBe('4 mo ago');
    expect(ago(800 * 86_400_000)).toBe('2 yr ago');
  });

  it('says "1 day" and not "1 days"', () => {
    expect(relativeTime(new Date(Date.now() - 86_400_000).toISOString())).toBe('1 day ago');
  });
});

describe('formatDuration', () => {
  it('reads as a person would say it', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(90)).toBe('1h 30m');
    expect(formatDuration(120)).toBe('2h');
  });

  it('renders nothing for a missing duration rather than "0 min"', () => {
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(undefined)).toBe('');
  });
});
