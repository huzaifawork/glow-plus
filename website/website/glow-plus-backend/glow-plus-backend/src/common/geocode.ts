/**
 * Turning a salon's address into map coordinates  (M1 — mobile spec R3.6-R3.10)
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * The app sorts salons by distance, and distance needs `latitude`/`longitude`
 * on the Merchant row. Until now the ONLY way those numbers arrived was a
 * salon owner opening Google Maps, right-clicking their own pin and typing two
 * decimals into a form. That is a real instruction a real person has to
 * follow, once, correctly — and the observable result on production was that
 * every live salon had `latitude: null`. A feature that depends on a manual
 * step nobody performs is a feature that does not work.
 *
 * So the address the salon already types is geocoded for them, and the manual
 * pair stays as an override for the cases this cannot resolve.
 *
 * ── Why Nominatim ─────────────────────────────────────────────────────────
 * Google, Mapbox and HERE all mean an API key: a new secret in the Vercel
 * dashboard, a new way for a deploy to be silently misconfigured, and a bill.
 * Nominatim (OpenStreetMap) needs none of those. The trade is accuracy and a
 * usage policy — see below — and the trade is acceptable because a wrong-by-
 * 100m salon pin still sorts correctly against salons in other suburbs, and
 * because the override field is right there when it does not.
 *
 * ── The usage policy, honoured deliberately ───────────────────────────────
 * https://operations.osmfoundation.org/policies/nominatim/ asks for:
 *
 *   - an identifying `User-Agent` naming the application and a contact  →
 *     built from APP_URL below, so a deployment identifies itself as itself.
 *   - at most one request per second  →  a geocode happens on salon SIGNUP and
 *     on a salon EDITING ITS ADDRESS. Both are human-rate events measured in
 *     tens per day, not per second. There is deliberately no in-process rate
 *     limiter, because on Vercel each request is its own process and a
 *     limiter there would be a comforting no-op rather than a control.
 *   - no bulk geocoding  →  nothing in this codebase loops over addresses.
 *
 * ── Failure is normal and must stay cheap ─────────────────────────────────
 * Every caller treats a `null` as "no coordinates yet", which is a state the
 * schema, the API and both clients already handle (a salon with no coordinates
 * is simply absent from distance-sorted results). So this function NEVER
 * throws: a Nominatim outage must not fail a salon's signup, and a nonsense
 * address must not block someone saving the rest of their profile.
 */

/** Past this, give up and let the salon keep their coordinates blank.
 *  Short on purpose: this sits inside a request a human is waiting on. */
const TIMEOUT_MS = 4_000;

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

export type GeocodableAddress = {
  addressLine?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
};

export type Coordinates = { latitude: number; longitude: number };

/**
 * The one-line address string sent to the geocoder.
 *
 * Exported and pure so it can be tested without a network: the query is the
 * part that can be wrong in a way nobody notices (an undefined stringified
 * into the middle of an address still returns *a* result, just the wrong one).
 */
export function buildGeocodeQuery(address: GeocodableAddress): string | null {
  const parts = [address.addressLine, address.city, address.region, address.postalCode]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0);

  // A postal code alone is geocodable; a street number alone is not, and
  // neither is a region on its own — both resolve to somewhere confidently
  // wrong. Requiring a city or a postal code is what keeps "12" from
  // becoming a pin in another country.
  const hasAnchor = Boolean(address.city?.trim() || address.postalCode?.trim());
  if (!hasAnchor || parts.length === 0) return null;

  return parts.join(', ');
}

/** The policy's identifying User-Agent, built from this deployment's own URL. */
function userAgent(): string {
  const app = process.env.APP_URL?.trim() || 'https://www.glowplusmember.com';
  return `GlowPlus/1.0 (+${app})`;
}

/**
 * Best-effort coordinates for an address. `null` whenever anything at all goes
 * wrong — no address, geocoding switched off, a timeout, a non-200, a body
 * that is not what we expect, or no match.
 */
export async function geocodeAddress(address: GeocodableAddress): Promise<Coordinates | null> {
  // The escape hatch. Set in jest.setup.ts so no unit test can reach the
  // network, and available to an operator who wants the manual fields back.
  if (process.env.GEOCODER_DISABLED === 'true') return null;

  const q = buildGeocodeQuery(address);
  if (!q) return null;

  try {
    const url = `${ENDPOINT}?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent(), Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const body: unknown = await res.json();
    if (!Array.isArray(body) || body.length === 0) return null;

    const first = body[0] as { lat?: unknown; lon?: unknown };
    const latitude = Number(first.lat);
    const longitude = Number(first.lon);

    // Nominatim returns lat/lon as STRINGS, and a malformed one becomes NaN
    // rather than an error. NaN would pass a bare `typeof === 'number'` check
    // and be written to a Float column as null-ish nonsense, so the range
    // test below is doing real work, not defensive decoration.
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

    return { latitude, longitude };
  } catch {
    // Timeout, DNS failure, malformed JSON — all the same answer to the
    // caller: no coordinates this time, try again next save.
    return null;
  }
}
