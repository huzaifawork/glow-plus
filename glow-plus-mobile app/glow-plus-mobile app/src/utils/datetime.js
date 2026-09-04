/**
 * Dates and times, written the way a customer reads them.
 *
 * ⚠️ **One timezone, and it is the salon's, not the phone's.**
 *
 * This mirrors the website's `SALON_TIMEZONE` and the backend's
 * `common/salon-time.ts`, and the reason is the platform's [F63]: the server
 * resolves "09:00" against the SALON's zone and returns real UTC instants, and
 * a client that renders those with the device's zone shows a Toronto salon's
 * 9am appointment as 6pm to someone whose phone is set to Karachi. The two
 * halves of one feature then disagree about what "9am" means.
 *
 * A phone is far more likely to be in a different timezone than a browser is —
 * people travel with them — so this matters more here than it did on the web.
 *
 * The value must track the backend's `SALON_TIMEZONE`. Both default to
 * `America/Toronto`, the country the platform sells in, and both are
 * overridable by configuration. Changing one without the other reintroduces
 * exactly the bug this avoids.
 */
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const SALON_TIMEZONE =
  process.env.EXPO_PUBLIC_SALON_TIMEZONE || extra.salonTimezone || 'America/Toronto';

const opts = (o) => ({ timeZone: SALON_TIMEZONE, ...o });

/**
 * `YYYY-MM-DD` for an instant, in the SALON's zone.
 *
 * Not `toISOString().slice(0, 10)` — that is the UTC date, which is a day out
 * for every evening appointment west of Greenwich. `en-CA` is used because its
 * short date format IS `YYYY-MM-DD`, so this needs no reassembly.
 */
export function toDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', opts({ year: 'numeric', month: '2-digit', day: '2-digit' })).format(
    date,
  );
}

/** Today, in the salon's zone — the default selected date everywhere. */
export function todayKey() {
  return toDateKey(new Date());
}

/** `YYYY-MM-DD` plus N days. String in, string out, so no zone can creep in. */
export function addDays(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number);
  // UTC arithmetic on a date-only value: the point is calendar addition, and
  // doing it in local time makes the day before a DST change 23 hours long.
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(
    next.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** Midday UTC for a date key — a safe instant to format a bare date from. */
function noonOf(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  // Noon, not midnight: midnight UTC is the previous evening in the Americas,
  // so a date formatted from it shows the wrong weekday.
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function formatTime(iso) {
  return new Intl.DateTimeFormat('en-CA', opts({ hour: 'numeric', minute: '2-digit' })).format(
    new Date(iso),
  );
}

export function formatDate(iso) {
  return new Intl.DateTimeFormat('en-CA', opts({ weekday: 'short', day: 'numeric', month: 'short' })).format(
    new Date(iso),
  );
}

export function formatDateTime(iso) {
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

export function formatLongDate(iso) {
  return new Intl.DateTimeFormat('en-CA', opts({ weekday: 'long', day: 'numeric', month: 'long' })).format(
    new Date(iso),
  );
}

/** Parts for the horizontal date strip: `{ weekday: 'Mon', day: '8', month: 'Sep' }`. */
export function dateStripParts(dateKey) {
  const at = noonOf(dateKey);
  return {
    weekday: new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', weekday: 'short' }).format(at),
    day: new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', day: 'numeric' }).format(at),
    month: new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', month: 'short' }).format(at),
  };
}

/** "Today" / "Tomorrow" / "Sat, 12 Sep" — for a heading above the slot grid. */
export function describeDateKey(dateKey) {
  const today = todayKey();
  if (dateKey === today) return 'Today';
  if (dateKey === addDays(today, 1)) return 'Tomorrow';
  const at = noonOf(dateKey);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(at);
}

/**
 * "3 days ago", "in 2 hours" — for a visit list and an upcoming appointment.
 *
 * Hand-rolled rather than `Intl.RelativeTimeFormat`, which is missing from
 * React Native's Hermes ICU build on Android in this SDK. A screen crashing on
 * one platform for a nicety is a bad trade.
 */
export function relativeTime(iso) {
  const then = new Date(iso).getTime();
  const deltaMs = then - Date.now();
  const future = deltaMs > 0;
  const abs = Math.abs(deltaMs);

  // Tested against the RAW gap, not against the rounded minutes:
  // Math.round(30s) is 1, so a 30-second-old visit would read '1 min ago'
  // while the clock still said the same minute.
  if (abs < 60000) return 'just now';

  const minutes = Math.round(abs / 60000);
  if (minutes < 60) return future ? `in ${minutes} min` : `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return future ? `in ${hours} hr` : `${hours} hr ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return future ? `in ${days} day${days === 1 ? '' : 's'}` : `${days} day${days === 1 ? '' : 's'} ago`;

  const weeks = Math.round(days / 7);
  if (weeks < 5) return future ? `in ${weeks} wk` : `${weeks} wk ago`;

  const months = Math.round(days / 30);
  if (months < 12) return future ? `in ${months} mo` : `${months} mo ago`;

  const years = Math.round(days / 365);
  return future ? `in ${years} yr` : `${years} yr ago`;
}

export function isPast(iso) {
  return new Date(iso).getTime() < Date.now();
}

/** Minutes as "45 min" / "1h" / "1h 30m" — a duration a person can scan. */
export function formatDuration(minutes) {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** The next N date keys starting today — the booking screen's date strip. */
export function upcomingDateKeys(count = 21, from = todayKey()) {
  return Array.from({ length: count }, (_, i) => addDays(from, i));
}

/**
 * The hour of the day an instant falls in, IN THE SALON'S TIMEZONE.
 *
 * Exists because `new Date(iso).getHours()` is the DEVICE's timezone, and the
 * slot grid groups times into Morning / Afternoon / Evening while the chip
 * beside them is labelled with `formatTime`, which uses the salon's. On a phone
 * set to another country the two disagree, and a slot printed as "2:30 PM"
 * appears under "Evening".
 *
 * Returns 0-23. `hourCycle: 'h23'` rather than `hour12: false`, because some
 * ICU builds render midnight as "24" under the latter.
 */
export function salonHourOf(iso) {
  const hour = new Intl.DateTimeFormat('en-CA', {
    timeZone: SALON_TIMEZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
  return Number(hour) % 24;
}
