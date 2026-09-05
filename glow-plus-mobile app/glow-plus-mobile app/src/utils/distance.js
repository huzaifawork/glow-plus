/**
 * Distance from the user to a salon  (R3.6 – R3.9)
 *
 * ⚠️ **This runs on the device and only on the device.**
 *
 * NF6: *"The user's precise location must not be stored on the backend or
 * shared with any salon — it is used only, on-device, to sort and filter the
 * salon list the user already has permission to see."*
 *
 * That is why this file exists at all. The obvious implementation of "sort
 * salons by distance" is a `?near=lat,lng` query parameter — and it is
 * forbidden, because it puts the customer's coordinates in a server log, a
 * proxy log and a database query plan. The server publishes the SALONS'
 * coordinates (which are public information — they are shop addresses), the
 * app fetches the same directory everyone else gets, and the arithmetic
 * happens here.
 *
 * **There is deliberately no function in this file that sends a location
 * anywhere.** If a future change needs server-side distance, it needs a
 * decision about NF6 first, not a helper here.
 */

const EARTH_RADIUS_KM = 6371;

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in kilometres.
 *
 * Haversine rather than an equirectangular approximation: the approximation is
 * faster and wrong by several percent at the latitudes this platform operates
 * in (Toronto is 43°N), which is enough to reorder two salons that are close
 * together — the exact case where a user would notice.
 *
 * The cost is irrelevant: this runs over at most a page of salons, once per
 * location update, not per frame.
 */
export function distanceKm(from, to) {
  if (!hasCoordinates(from) || !hasCoordinates(to)) return null;

  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * A salon with only one of the two coordinates is treated as having neither.
 *
 * The database refuses that state (`Merchant_coordinates_paired`), but a client
 * that trusted a constraint it cannot see would place such a salon on the
 * equator and sort it to the top of a list in Toronto.
 */
export function hasCoordinates(point) {
  return (
    point != null &&
    typeof point.latitude === 'number' &&
    typeof point.longitude === 'number' &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude)
  );
}

/** "450 m" / "2.4 km" / "18 km" — precision that drops off with distance, as it should. */
export function formatDistance(km) {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 100) * 10} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/**
 * Annotate a salon list with distance, without reordering it.
 *
 * Separate from the sort so a caller can show distances on an
 * alphabetically-ordered list — which is exactly what R3.9 requires when the
 * user has declined location but the list is still fully usable.
 */
export function withDistance(salons, origin) {
  if (!hasCoordinates(origin)) return salons.map((s) => ({ ...s, distanceKm: null }));
  return salons.map((salon) => ({ ...salon, distanceKm: distanceKm(origin, salon) }));
}

/**
 * The dependency note, enforced  (spec §4.3.2)
 *
 * > *"A salon that has not provided a location **cannot be included in
 * > distance-sorted results**, and the app must handle that gracefully rather
 * > than assuming every salon has one."*
 *
 * Two halves, and they are separated on purpose:
 *
 *   · **"cannot be included"** is this function. When the list is sorted by
 *     distance, a salon with no coordinates is not in it.
 *   · **"gracefully"** is the caller's job, and it is not satisfied by simply
 *     dropping rows. `DiscoverScreen` says how many salons are not shown and
 *     why, and Nearest is one tap from off — so nothing disappears silently
 *     and every salon is always reachable.
 *
 * ⚠️ An earlier reading kept these salons and sorted them to the END. That was
 * defensible as "graceful" but it contradicted the sentence above in plain
 * words — they WERE included in distance-sorted results. Do not restore it.
 *
 * Expects rows that have already been through `withDistance`.
 */
export function excludeUnlocated(salons) {
  return salons.filter((salon) => salon.distanceKm != null);
}

/**
 * R3.7 — sort by distance from the user.
 *
 * Callers pass a list that `excludeUnlocated` has already been through, so in
 * practice nothing here has a null distance. The null handling below stays
 * anyway, and stays defensive rather than meaningful: a comparator that
 * returns NaN produces an arbitrary order that still *looks* sorted, which is
 * the hardest kind of ordering bug to see. Sorting an unlocated salon last is
 * the safest thing to do with a row that should not have reached this point.
 */
export function sortByDistance(salons) {
  return [...salons].sort((a, b) => {
    const da = a.distanceKm;
    const db = b.distanceKm;
    if (da == null && db == null) return a.businessName.localeCompare(b.businessName);
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });
}
