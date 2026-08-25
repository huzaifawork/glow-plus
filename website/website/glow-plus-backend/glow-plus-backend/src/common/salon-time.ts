/**
 * Wall-clock time in the salon's timezone  [F57]
 *
 * `BusinessHours.openTime` is the string "09:00". It is a **wall-clock** time —
 * what the sign on the door says — and it means nothing without a timezone.
 *
 * Before this file, `availability.service.ts` resolved it with
 * `d.setHours(9, 0)`, which uses **the Node process's** timezone. That is a
 * bug you cannot see locally and that changes meaning the moment you deploy:
 * a developer machine in Asia/Karachi turned "09:00" into 04:00Z, while Vercel
 * — which runs UTC — turns the same row into 09:00Z. A Toronto salon that set
 * 9am-6pm would have had customers offered slots from 5am to 2pm local.
 *
 * Note this is NOT about where Postgres lives. `timestamptz` stores absolute
 * instants, so the Supabase region is irrelevant; the offending conversion
 * happens in Node, before any value reaches the database.
 *
 * `bookings.service.ts` needs no equivalent: it parses `dto.startTime`, a real
 * ISO instant carrying its own offset, and derives `endTime` by arithmetic.
 * Only the hours→slots conversion ever interprets a bare "HH:MM".
 *
 * ── Scope, deliberately ────────────────────────────────────────────────────
 * One platform-wide timezone, from the environment. Every salon on the
 * platform is assumed to be in it. The correct end state is a `timezone`
 * column on Merchant, and this signature is shaped for exactly that: each
 * function already takes `tz` as its last parameter, so per-merchant support
 * later is `merchant.timezone ?? SALON_TIMEZONE` at the call sites and no
 * change here at all.
 */

/**
 * The timezone every salon's opening hours are written in.
 *
 * Defaults to America/Toronto rather than UTC on purpose: an unset variable
 * should degrade to the country the platform actually sells in (prices are in
 * CAD), not to a value that is silently wrong for every real salon. Override
 * with `SALON_TIMEZONE` for a deployment serving another region.
 */
export const SALON_TIMEZONE = process.env.SALON_TIMEZONE || 'America/Toronto';

/**
 * How far `tz` is from UTC at a given instant, in milliseconds.
 *
 * Derived from `Intl` rather than a lookup table so that DST, and any future
 * change to a zone's rules, come from the platform's own tz database. Positive
 * east of Greenwich; America/Toronto returns -4h in summer, -5h in winter.
 */
function offsetMsAt(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const at: Record<string, string> = {};
  for (const { type, value } of parts) at[type] = value;

  const wallAsUtc = Date.UTC(
    Number(at.year),
    Number(at.month) - 1,
    Number(at.day),
    // Some ICU builds render midnight as "24" under hour12:false.
    Number(at.hour) % 24,
    Number(at.minute),
    Number(at.second),
  );
  return wallAsUtc - instant.getTime();
}

/**
 * "2026-08-26" + "09:00" in `tz` → the absolute instant that names.
 *
 * Two passes, and the second is not redundant. The offset to subtract depends
 * on the instant, but the instant is what we are solving for — so the first
 * pass guesses using the offset near the naive timestamp and the second
 * re-reads the offset at the answer. Without it, every wall-clock time on a
 * DST-transition day lands an hour out.
 */
export function salonWallTimeToInstant(dateISO: string, hhmm: string, tz: string = SALON_TIMEZONE): Date {
  const [year, month, day] = dateISO.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);

  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstPass = new Date(naive - offsetMsAt(new Date(naive), tz));
  return new Date(naive - offsetMsAt(firstPass, tz));
}

/**
 * The day of the week "2026-08-26" names. 0 = Sunday, matching
 * `BusinessHours.dayOfWeek` and `Date.prototype.getDay`.
 *
 * Parsed as UTC, which makes it timezone-independent: a calendar date is the
 * same weekday everywhere. The old `new Date(dateISO + 'T00:00:00').getDay()`
 * parsed in the process's zone, so a request could resolve to the wrong day
 * entirely — and therefore to the wrong salon's-hours row.
 */
export function dayOfWeekFor(dateISO: string): number {
  const [year, month, day] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** True if `dateISO` is a real YYYY-MM-DD calendar date. */
export function isValidDateISO(dateISO: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return false;
  const [year, month, day] = dateISO.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
  );
}
